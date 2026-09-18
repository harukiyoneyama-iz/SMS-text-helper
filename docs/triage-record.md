# トリアージ記録

## 日時
2026-09-15

## 回答者
harukiyoneyama-iz

## 質問への回答
- Q1. 個人を特定できる情報を取り扱う？ → はい
  - 該当した項目: 個人情報や社内機密にアクセスできる API キー（read-only でも該当）— BigQuery `gnote_jty_prod` データセットは顧客の送信履歴・個人情報を含むテーブル（`nskn_customers` 等）を含み、impersonation で付与されるサービスアカウントの読み取り権限がデータセット単位になる可能性があるため
- Q2. 社外の人（お客様）が直接使う？ → いいえ（社内のプランナー・ディレクターのみ、Phase 1は米山さん個人のローカル利用）
- Q3. お金が絡む？ → いいえ

## 判定
.security-level = 3

## 次のアクション（L3 の場合のみ）
- [ ] Slack #ai-jigyobu-engineer-consult で相談
- [ ] docs/engineer-consultation.md を作成・必須 6 項目埋め
- [ ] 上記が揃ってから開発開始

## 再トリアージが必要な変更
以下が PR に含まれる場合は `/triage` を再実施:
- 新規 API 接続（.env に新規 KEY / OAuth scope 追加）
- 外部送信先追加（Slack webhook / Twilio / Stripe / SendGrid / AWS SES 等）
- 書込権限の追加（read-only → write）
- DB スキーマ変更（テーブル追加 / カラム追加）
