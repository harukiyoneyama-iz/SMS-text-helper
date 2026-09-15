# npm パッケージ一次スクリーニング

> **このルールの目的**: パッケージの安全性を保証するものではなく、
> **怪しいものを早めに炙り出す一次判定**として機能する。
> 最終判断は必ず人間（ユーザー）が行うこと。

## バージョン要件

- `min-release-age` は **npm 11.10+** で有効（npm 10.x では無視される）
- pnpm では `minimum-release-age=10080`（分単位）を `.npmrc` に記載する
- 推奨環境: Node.js 24.x + npm 11.x

## インストール前の必須フロー

npm install / npm i / pnpm install でパッケージを追加する前に、以下を**順番に**実施する。

### Step 1: 自動スクリーニング

```bash
npm run check-pkg -- <パッケージ名> [パッケージ名2] ...
```

結果の読み方:
- `[既知]` — 既知パッケージ。Step 2 の簡易確認のみで可
- `[低リスク]` — 数値基準を通過。Step 2 へ進む
- `[要確認]` — 警告あり。Step 2 を慎重に実施し、ユーザーに報告する

**`[要確認]` が出た場合はインストールを中止し、ユーザーに判断を仰ぐ。**

### Step 2: 手動確認（全パッケージ共通）

自動スクリーニングの結果に関わらず、以下を確認する:

1. **`npm audit`** — 既知の脆弱性がないか
   ```bash
   npm audit --dry-run
   ```
2. **CHANGELOG / リリースノート** — 直近バージョンに不審な変更がないか
   → GitHub の Releases ページを目視確認
3. **ロックファイル固定** — `package-lock.json` をコミットし、CI では `npm ci` を使用する

`[既知]` パッケージは上記の簡易確認のみで可。
それ以外は CHANGELOG の目視を必ず行う。

### Step 3: インストール実行

```bash
npm install <パッケージ名>
# 直後に再度確認
npm audit
```

## 自動スクリーニングの基準（目安）

以下は**目安であり、安全を保証する数値ではない**:

| チェック項目 | 目安 | 補足 |
|---|---|---|
| 週間DL数 | 100万以上 | 人気＝安全ではないが、監視の目が多い |
| 最終更新 | 1年以内 | 安定版は更新頻度が低い場合もある |
| GitHubリポジトリ | 存在する | ソースが公開されていること |
| 作者/組織 | 既知の組織・個人 | 実績のある作者かどうかの参考 |
| 依存数 | 15個以下 | サプライチェーンリスクの目安 |

## 既知パッケージリスト

以下は実績があり `[既知]` として扱うが、**完全免除ではない**。
`npm audit` と CHANGELOG 確認は省略しない:

- react, react-dom, next, typescript, zod, tailwindcss
- express, express-session, express-rate-limit, dotenv, helmet
- googleapis, google-auth-library, @google-cloud/firestore, @google-cloud/bigquery, @google-cloud/connect-firestore, @google/generative-ai
- vite, vitest, jest, jsdom, axe-core
- eslint, @eslint/js, eslint-config-prettier, prettier
- concurrently, husky, lint-staged

### 既知パッケージリストの更新

新パッケージを追加する場合:
1. `scripts/check-pkg.js` の `KNOWN_PACKAGES` を更新
2. このファイルの「既知パッケージリスト」も同期させる

## 怪しいと感じた場合

- **勝手にインストールしない**
- ユーザーに以下を報告する:
  - スクリーニング結果（DL数、更新日、作者）
  - 懸念点（DL数が少ない、作者不明、依存が多い等）
  - 代替パッケージの候補があれば併記
