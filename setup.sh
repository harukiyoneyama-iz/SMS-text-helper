#!/bin/bash
# WSL2 で clone した直後に実行する初回セットアップ補助
#
# 使い方（WSL2 Ubuntu のターミナルで、clone したプロジェクトのルートにて）:
#   bash setup.sh
#
# やること:
#   - Claude のメモリ用ディレクトリ（~/.claude-memory/<proj>）を用意
#     （devcontainer.json の memory bind 先。無くても Docker が作るが、明示しておく）
#   - 次にやる手順を案内
#
# 注: VS Code 拡張(claude-code)は devcontainer.json の customizations.vscode.extensions
#     経由で Marketplace から自動 install・自動更新される（VSIX 手動配布は廃止）。
set -euo pipefail

PROJECT="$(basename "$PWD")"
echo "[setup] $PROJECT の初回セットアップ"

# memory bind 先（人間が読む用のメモリ置き場）を WSL HOME に用意
mkdir -p "$HOME/.claude-memory/$PROJECT"
echo "[setup] ✓ ~/.claude-memory/$PROJECT を用意しました"

# pre-commit/pre-push の gitleaks フックを有効化する。
# core.hooksPath は clone では伝播しないため、fresh clone 直後は必ず未設定になる
# （未設定だと npm run verify:secrets が fail し、秘密スキャンも効かない）。
if [ -d .githooks ]; then
  git config core.hooksPath .githooks 2>/dev/null \
    && echo "[setup] ✓ git hooks を有効化しました (.githooks)" || true
fi

# WSL2 上にいるかの軽い確認（/mnt/c 配下だと bind mount = 遅い構成の可能性）
case "$PWD" in
  /mnt/c/*)
    echo "[setup] ⚠️  このフォルダは Windows 共有(/mnt/c)上です。"
    echo "        freeze を避けるため ~/projects/ に clone し直すことを強く推奨します。"
    echo "        詳細: guideline/WSL2_SETUP_GUIDE.md"
    ;;
esac

cat <<'EOF'

次の手順:
  1. VS Code で開く:        code .
  2. Reopen in Container:   左下「><」→「Reopen in Container」
  3. コンテナ内で依存:       npm ci   （pnpm なら pnpm install --frozen-lockfile）
  4. Claude Code:           右側の「CLAUDE CODE」パネルを開いてサインイン（認証は各自）
                            ※ ターミナルで claude と打つ必要はありません

動作確認（コンテナ内）:
  time git status   # 1秒前後なら WSL2 が効いている
  code --list-extensions | grep -i claude   # claude-code 拡張が入っているか確認
                                            # → 右側「CLAUDE CODE」パネルで話しかけて返事が来ればOK

詳細: guideline/WSL2_SETUP_GUIDE.md
EOF
