#!/bin/bash
# PreToolUse hook: パッケージインストールの host/container 境界 + 既知パッケージ検証
# exit 0 = 許可, exit 2 = ブロック（ユーザーに理由表示）
#
# stdin から JSON が渡される: { "tool_name": "Bash", "tool_input": { "command": "..." } }
#
# 2026-05-15 拡張 (Phase 6-b):
#   - ホスト側でのパッケージインストールは即時 deny
#   - DevContainer 内では従来の既知パッケージ検査を継続

set -euo pipefail

# stdin から tool_input を読み取る
INPUT=$(cat)

# jq があれば使う。なければ grep + sed でパース（Mac/Windows Git Bash 対応）
if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
  # jq 不在: 部分抽出は引用符 / 改行 / エスケープで途中切断し install コマンドを
  # 見逃して fail-open するため、JSON 全体を検査対象に倒す（パッケージ名抽出の精度は
  # 落ちるが、未知パッケージ検査は検出増=安全側に倒れる）。
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//' || true)
  COMMAND="$INPUT"
fi

# Bash ツール以外は無視（jq 不在で TOOL_NAME 不明な場合は COMMAND=INPUT 全体で検査）
if [ "$TOOL_NAME" != "Bash" ] && [ -n "$TOOL_NAME" ]; then
  exit 0
fi

# ============================================================
# Host/Container 境界判定とホスト側 install 拒否
# ============================================================
# DevContainer 内か判定: /.dockerenv の有無で判別
# （Linux container 一般、Docker Desktop / Rancher Desktop / Podman 全部対応）
IS_HOST=true
if [ -f /.dockerenv ] || grep -q "docker\|lxc\|containerd" /proc/1/cgroup 2>/dev/null; then
  IS_HOST=false
fi

# ホスト側でのパッケージマネージャ依存追加コマンド検出
PKG_INSTALL_REGEX='(^|\&\&|;|\|)[[:space:]]*(npm[[:space:]]+(install|i|add)|pnpm[[:space:]]+(install|i|add)|yarn[[:space:]]+add|pip[[:space:]]+install|pip3[[:space:]]+install|pipx[[:space:]]+install|uv[[:space:]]+add|poetry[[:space:]]+add)\b'

if [ "$IS_HOST" = true ]; then
  if echo "$COMMAND" | grep -qE "$PKG_INSTALL_REGEX"; then
    {
      echo "🚫 ホスト側でのパッケージインストールは禁止されています"
      echo ""
      echo "コマンド: $COMMAND"
      echo ""
      echo "根拠: CLAUDE.md「作業場所のルール」"
      echo "  ホスト側で npm install / pnpm add / yarn add / pip install /"
      echo "  pipx install / uv add / poetry add 等の依存追加は禁止"
      echo "  （settings.json で deny = 完全ブロック、本 hook で二重保護）"
      echo ""
      echo "正しい手順（依存追加は開発用コンテナの中で行います）:"
      echo "  1. VS Code で対象プロジェクトのフォルダを開く"
      echo "  2. Ctrl+Shift+P → 'Dev Containers: Reopen in Container' を実行"
      echo "  3. コンテナ起動後、コンテナ内のターミナルで同じコマンドを実行"
      echo ""
      echo "なぜ?"
      echo "  - ホスト本体に依存パッケージを増やさない（サプライチェーン攻撃対策）"
      echo "  - プロジェクトごとに環境を分離"
      echo "  - 全社統一の環境（DevContainer）で動作確認"
    } >&2
    exit 2
  fi
fi

# --- npm/pnpm install の検証 ---
# 2026-07-08: pnpm を settings.json の deny から外し(コンテナ内は pnpm 一本化)、
# 検証はこの hook 側に一本化。npm と同じロジックを流用する。
# 複合コマンド（&& や ; で連結）にも対応するため、先頭固定(^)ではなく全体を検索
if echo "$COMMAND" | grep -qE '(^|\&\&|;)[[:space:]]*(npm|pnpm)[[:space:]]+(install|i|add)\b'; then

  # devDependencies（-D, --save-dev）は軽めのチェック
  IS_DEV=false
  if echo "$COMMAND" | grep -qE '[[:space:]]+(-D|--save-dev)\b'; then
    IS_DEV=true
  fi

  # パッケージ名を抽出（npm/pnpm install <pkg1> <pkg2> ...）
  # 複合コマンドから install 部分だけを抽出し、フラグを除外
  NPM_CMD=$(echo "$COMMAND" | grep -oE '(^|\&\&|;)[[:space:]]*(npm|pnpm)[[:space:]]+(install|i|add)[[:space:]]+[^;&]*' | head -1)
  PACKAGES=$(echo "$NPM_CMD" | sed -E 's/^.*(npm|pnpm)\s+(install|i|add)\s+//' | tr ' ' '\n' | grep -v '^-' | grep -v '^$' || true)

  # パッケージ名なし（npm/pnpm install のみ）= package.json からの復元なので許可
  if [ -z "$PACKAGES" ]; then
    exit 0
  fi

  # 既知の安全パッケージリスト
  KNOWN_PACKAGES=(
    # React / Next.js
    "react" "react-dom" "next" "typescript" "@types/react" "@types/node"
    # スタイル
    "tailwindcss" "postcss" "autoprefixer" "@tailwindcss/forms"
    # バリデーション
    "zod"
    # サーバー
    "express" "express-session" "express-rate-limit" "dotenv" "helmet" "cors"
    # Google
    "googleapis" "google-auth-library" "@google-cloud/firestore"
    "@google-cloud/bigquery" "@google-cloud/connect-firestore" "@google/generative-ai"
    "@google/clasp"
    # ビルド / テスト
    "vite" "vitest" "jest" "jsdom" "axe-core" "playwright" "@playwright/test"
    # Lint / Format
    "eslint" "@eslint/js" "eslint-config-prettier" "prettier"
    # ツール
    "concurrently" "husky" "lint-staged" "nodemon" "ts-node"
    # Anthropic
    "@anthropic-ai/sdk"
  )

  UNKNOWN_PACKAGES=()
  for pkg in $PACKAGES; do
    # パッケージ名を正規化（バージョン指定を除去）
    # @scope/name@version → @scope/name, name@latest → name, name@^5 → name
    pkg_name=$(echo "$pkg" | sed -E 's/@([0-9^~><=]|latest|next|canary).*//')

    FOUND=false
    for known in "${KNOWN_PACKAGES[@]}"; do
      if [ "$pkg_name" = "$known" ]; then
        FOUND=true
        break
      fi
    done

    if [ "$FOUND" = false ]; then
      UNKNOWN_PACKAGES+=("$pkg_name")
    fi
  done

  # 未知パッケージがある場合はブロック
  if [ ${#UNKNOWN_PACKAGES[@]} -gt 0 ]; then
    UNKNOWN_LIST=$(printf ", %s" "${UNKNOWN_PACKAGES[@]}")
    UNKNOWN_LIST=${UNKNOWN_LIST:2}  # 先頭の ", " を除去

    echo "⚠️ 未知のパッケージを検出: ${UNKNOWN_LIST}" >&2
    echo "" >&2
    echo "既知パッケージリストに含まれていません。" >&2
    echo "安全を確認してからインストールしてください。" >&2
    echo "" >&2
    echo "確認手順:" >&2
    echo "  1. npmjs.com でパッケージ情報を確認" >&2
    echo "  2. 週間DL数、最終更新日、作者を確認" >&2
    echo "  3. 問題なければ validate-package-install.sh の KNOWN_PACKAGES に追加" >&2
    exit 2
  fi

  exit 0
fi

# --- pip install の検証 ---
if echo "$COMMAND" | grep -qE '(^|\&\&|;)[[:space:]]*pip[[:space:]]+install\b'; then
  # -r requirements.txt は許可
  if echo "$COMMAND" | grep -qE '[[:space:]]+-r[[:space:]]+'; then
    exit 0
  fi

  echo "⚠️ pip install を検出しました。" >&2
  echo "requirements.txt 経由でのインストール（pip install -r requirements.txt）を推奨します。" >&2
  exit 2
fi

# その他のコマンドは許可
exit 0
