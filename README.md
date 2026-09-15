# プロジェクトテンプレート（.devcontainer 同梱）

このリポジトリは **テンプレート** です。ここで直接開発するのではなく、
自分のプロジェクトの「ひな形」として使います。

## 使い方（新しいプロジェクトを始める人）

1. GitHub 上部の緑ボタン **「Use this template」→「Create a new repository」** で
   自分のリポジトリを作成（private 推奨）。作ったリポジトリは**自分のアカウントの下**にできます。
2. 自分のリポジトリのページで緑の **「Code」ボタン → HTTPS** の URL をコピーし、
   WSL2 の Ubuntu で `~/projects` に clone:
   ```
   cd ~/projects
   git clone <コピーした自分のリポジトリのURL>
   cd <作った名前>
   ```
   （`<...>` は山カッコごと自分のものに置き換えます）
3. 初回セットアップ（拡張の取得など）:
   ```
   bash setup.sh
   ```
4. VS Code で開いてコンテナで再オープン:
   ```
   code .
   ```
   左下「><」→ **Reopen in Container** → 右側の「CLAUDE CODE」パネルで開発。

`.devcontainer` は同梱済みなので「DevContainer を入れる」作業は不要です。
コンテナ名・ボリューム名は clone したフォルダ名に自動で合います。

詳細は guideline の `SETUP_WORKSHOP.html`「② 日常業務 → 次のステップ」を参照。
