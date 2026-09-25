# トリアージ記録

## 日時
2026-09-15

## 回答者
harukiyoneyama-iz

## 質問への回答
- Q1. 個人を特定できる情報を取り扱う？ → はい
  - 該当した項目: 個人情報や社内機密にアクセスできる API キー（read-only でも該当）— BigQuery のビュー（`gnote-analytics.gnote_sms_catalog`）本文中に電話番号2,784件・ナンバーらしき記載22件が未マスクで含まれる（`docs/DEVELOPMENT_PLAN.md` §④参照）ため
  - **2026-09-25 更新**: 当初はimpersonationで付与されるサービスアカウントの読み取り権限がデータセット単位になる可能性を理由としていたが、内田さん回答によりimpersonation自体が不要になった。権限モデルは本人アカウントへの直接付与かつビュー5本への閲覧権限のみに**限定される**ため、この観点のリスクはむしろ縮小している。ただし本文中の未マスクPIIは残るため、L3判定自体は維持する
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
