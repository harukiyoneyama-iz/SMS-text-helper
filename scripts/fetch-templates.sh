#!/bin/bash
# ============================================================
# BigQuery からテンプレート一覧を取得し、ローカルキャッシュ（data/）に落とす
#
# 設計（docs/DEVELOPMENT_PLAN.md §⑤ 構成 参照）:
#   Phase 1 は BigQuery を毎回叩かない。このスクリプトで SQL を1本流して
#   JSON に落とし、アプリはそのJSONを読むだけにする。
#
# 認証: gcloud auth login（本人アカウント）のみ。ADCやimpersonationは使わない
#   （2026-09-25 内田さん回答: なりすまし用サービスアカウントは不要）。
# クライアント: @google-cloud/bigquery は追加せず、gcloud 同梱の bq コマンドで完結させる
#   （依存を増やさず、サプライチェーンリスクもゼロにするための判断。
#    docs/DEVELOPMENT_PLAN.md §③ 参照）。
#
# ビュー構成（2026-09-25 bq ls で確認済み。docs/DEVELOPMENT_PLAN.md §④⑤ 更新済み）:
#   vw_sms_templates       文面・設定内容（本体）
#   vw_sms_template_usage  テンプレート別の送信実績（send_count 等）
#   vw_sms_deliveries      配信設定（未使用。Phase 1 の一覧には不要）
#   vw_sms_delivery_batches 配信バッチ（未使用）
#   vw_sms_send_results    送信結果（未使用）
#
# クエリ設計:
#   vw_sms_templates（全テンプレート、送信履歴の有無に関わらず）を主とし、
#   vw_sms_template_usage を template_id で LEFT JOIN する。
#   INNER JOIN にすると送信実績が0件のテンプレート（11,010件中 6,963件だけが
#   送信実績あり = 差分 4,047件）が一覧から消えてしまうため、LEFT JOIN で残す。
#
#   has_platelike（ナンバーらしき記載、22件）は docs/DEVELOPMENT_PLAN.md §④ の
#   方針どおり既定で除外する。ここでは「アプリ側で毎回フィルタする」のではなく
#   「そもそもローカルキャッシュに含めない」を選んだ。理由: data/ 配下は実データの
#   PIIキャッシュであり、除外対象を含めないほうが漏洩時の被害を小さくできるため。
# ============================================================

set -euo pipefail

PROJECT_ID="gnote-analytics"
DATASET="gnote_sms_catalog"
LOCATION="asia-northeast1"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data"
OUT_FILE="$OUT_DIR/templates.json"

if ! command -v bq >/dev/null 2>&1; then
  echo "[fetch-templates] FATAL: bq コマンドが見つかりません（gcloud の再ビルドが必要な可能性があります）" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

read -r -d '' QUERY <<SQL || true
SELECT
  t.template_id,
  t.client_id,
  t.client_name,
  t.template_name,
  t.message_body,
  t.status_label,
  t.delivery_type_label,
  t.manryou_month_diff,
  t.reserved_tel,
  t.reserved_url,
  t.nyk_reserved_url,
  t.exclude_reserved,
  t.list_registered_only,
  t.uses_placeholder,
  t.body_length,
  t.created_by_name,
  t.modified_by_name,
  t.created_at,
  t.updated_at,
  IFNULL(u.send_count, 0) AS send_count,
  IFNULL(u.batch_count, 0) AS batch_count,
  u.first_sent_at,
  u.last_sent_at
FROM \`${PROJECT_ID}.${DATASET}.vw_sms_templates\` AS t
LEFT JOIN \`${PROJECT_ID}.${DATASET}.vw_sms_template_usage\` AS u
  ON t.template_id = u.template_id
WHERE t.has_platelike IS NOT TRUE
ORDER BY send_count DESC
SQL

echo "[fetch-templates] 対象: ${PROJECT_ID}:${DATASET}（${LOCATION}）"
echo "[fetch-templates] dry-run でスキャン量を確認します..."
bq --location="$LOCATION" query --use_legacy_sql=false --dry_run "$QUERY"

echo
read -r -p "[fetch-templates] 上記のスキャン量で本実行してよろしいですか？ (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "[fetch-templates] 中止しました。"
  exit 1
fi

echo "[fetch-templates] 本実行します..."
bq --location="$LOCATION" query --use_legacy_sql=false --format=json --max_rows=20000 "$QUERY" > "$OUT_FILE"

count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT_FILE','utf8')).length)" 2>/dev/null || echo "不明")
echo "[fetch-templates] 完了: $OUT_FILE（${count}件）"
echo "[fetch-templates] このファイルは .gitignore で除外済みです（git管理対象外・実データのためコミット厳禁）"
