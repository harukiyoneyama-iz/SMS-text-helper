## 変更の概要

<!-- 何を、なぜ変えたか -->

## このプロジェクトの Security Level

<!-- cat .security-level の値に合わせてチェック -->
- [ ] L1（社内・PII なし）
- [ ] L3（PII あり / 社外公開 / 金銭）

## 再トリアージ判定

以下のいずれかが本 PR の差分に含まれますか？

- [ ] 新規 API 接続（`.env` に新規 KEY 追加 / OAuth scope 追加）
- [ ] 外部送信先追加（Slack webhook / Twilio / Stripe / SendGrid / AWS SES 等）
- [ ] 書込権限の追加（read-only → write）
- [ ] DB スキーマ変更（テーブル追加 / カラム追加）

→ いずれか該当する場合: **`/triage` 再実施 → `docs/triage-record.md` 更新済み** : [ ]

## L3 案件チェック（L3 の場合のみ）

- [ ] `docs/engineer-consultation.md` が存在し、必須 6 項目（対象データ / 外部送信先 / 必要権限 / 想定事故 / 許可範囲 / 有効期限）が埋まっている
- [ ] 有効期限内である
- [ ] 「許可範囲」を超える変更でない（超える場合は再相談・再承認済み）
- [ ] `/security-review` を実施、結果を本 PR コメントに貼った
- [ ] Blocker は 0 件

## `/security-review` 結果サマリ

<!-- 実施した場合は数字を記入。詳細は別コメントに貼る -->

- Blocker:
- Major:
- Minor:

## 例外申告（あれば）

<!-- 一時的に許す例外。期限と理由を必ず記載。無期限例外は禁止 -->

- [ ] なし
- [ ] あり:
  - 期限: YYYY-MM-DD
  - 理由・対応予定:
