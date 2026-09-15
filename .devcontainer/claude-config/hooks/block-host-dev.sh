#!/bin/bash
# PreToolUse hook: Windows ホスト本体での「環境改変」「実開発開始」をブロックする
# exit 0 = 許可, exit 2 = ブロック（ユーザーに理由表示）
#
# 背景:
#   - 正式な開発ルートは VS Code 拡張の Claude Code + Dev Container（開発用コンテナ）。
#   - Claude Desktop / Windows ホストは「会話・検索・案内」用途に限定する。
#   - ホスト本体にソフトを入れたり、ホストで実開発を始める行為は被害がホストへ
#     直接及ぶため止める（ランサムウェア / パッケージ汚染の被害をコンテナ内に閉じ込める）。
#   - settings.windows.json の deny（前方一致）と二重化し、こちらは「ホストか否か」を
#     判定したうえで初心者向けの導線つきメッセージを返す（deny だけでは理由が伝わらない）。
#
# 検出する操作（ホスト側でのみ・コンテナ内では通す）:
#   1. ホスト用パッケージマネージャでのソフト導入（winget / choco / scoop）
#   2. ホストでの実開発開始（npm run dev / pnpm dev / yarn dev / node / python / docker run / docker compose up）
#
# 設計方針:
#   - パッケージ依存追加（npm install / pip install 等）は validate-package-install.sh が担当。
#     本フックは「ホスト環境そのものの改変」と「ホストでの実行開始」を担当する（責務分離）。
#   - コンテナ内（/.dockerenv あり）では一切ブロックしない＝正式な開発フローを壊さない。

set -euo pipefail

INPUT=$(cat)

# JSON から tool_name と command を抽出（jq があれば使う。無ければ fail-safe に全体検査）
if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//' || true)
  COMMAND="$INPUT"
fi

# Bash 以外は対象外（jq 不在で TOOL_NAME 不明な場合は COMMAND=INPUT 全体で検査）
if [ "$TOOL_NAME" != "Bash" ] && [ -n "$TOOL_NAME" ]; then
  exit 0
fi

# ============================================================
# Host / Container 判定
# ============================================================
# DevContainer（Linux コンテナ）内かどうかを判定。コンテナ内なら開発を止めない。
IS_HOST=true
if [ -f /.dockerenv ] || grep -q "docker\|lxc\|containerd" /proc/1/cgroup 2>/dev/null; then
  IS_HOST=false
fi

# コンテナ内では正式な開発フローを通す
if [ "$IS_HOST" = false ]; then
  exit 0
fi

# 改行をまたぐバイパス対策（検査前に改行・CR を空白へ正規化）
SCAN_CMD=$(printf '%s' "$COMMAND" | tr '\n\r' '  ')

# ブロック時の共通メッセージ（初心者向けに「理由」と「次の行動」を短く）
deny() {
  {
    echo "🚫 $1"
    echo ""
    echo "コマンド: $COMMAND"
    echo ""
    echo "理由: $2"
    echo ""
    echo "正しい手順（実開発は開発用コンテナの中で行います）:"
    echo "  1. VS Code で対象プロジェクトのフォルダを開く"
    echo "  2. Ctrl+Shift+P → 'Dev Containers: Reopen in Container' を実行"
    echo "  3. コンテナ起動後、コンテナ内のターミナルで同じコマンドを実行"
    echo ""
    echo "Claude Desktop / Windows 本体は『会話・検索・案内』用です。"
  } >&2
  exit 2
}

# ============================================================
# 1. ホスト用パッケージマネージャでのソフト導入
# ============================================================
# winget / choco(latey) / scoop でのインストール・更新はホスト本体を改変するため止める。
# （gitleaks / Docker Desktop 等の定番ツール導入は「人間が PowerShell で行う」運用。
#   Claude がホストへソフトを入れる行為自体を止める。）
HOST_PKGMGR_REGEX='(^|[;&|])[[:space:]]*(winget[[:space:]]+(install|upgrade|add)|choco(latey)?[[:space:]]+(install|upgrade)|scoop[[:space:]]+(install|update|bucket))\b'
if echo "$SCAN_CMD" | grep -qiE "$HOST_PKGMGR_REGEX"; then
  deny "Windows ホスト本体へのソフト導入はブロックされました" \
"ホスト本体に何かを入れる行為は、被害（ランサムウェア・汚染パッケージ）がホストに直接及ぶため止めています。gitleaks / Docker などの定番ツールは、利用者ご自身が PowerShell で導入してください。"
fi

# ============================================================
# 2. ホストでの実開発開始
# ============================================================
# npm run dev / pnpm dev / yarn dev、node / python の実行、docker run / docker compose up を止める。
# 注: --version / -v / --help のような確認用フラグは止めない（Step 0 の前提チェック用）。
#     npm install 等の依存追加は validate-package-install.sh が担当（ここでは扱わない）。
DEV_START_REGEX='(^|[;&|])[[:space:]]*('\
'npm[[:space:]]+(run[[:space:]]+)?(dev|start|serve)|'\
'pnpm[[:space:]]+(run[[:space:]]+)?(dev|start|serve)|'\
'yarn[[:space:]]+(run[[:space:]]+)?(dev|start|serve)|'\
'node[[:space:]]+(-e\b|--eval\b|[^-[:space:]])|node[[:space:]]*$|'\
'(python3?|py)[[:space:]]+(-[cm]\b|[^-[:space:]])|'\
'docker[[:space:]]+run\b|'\
'docker[[:space:]]+compose[[:space:]]+up\b|'\
'docker-compose[[:space:]]+up\b'\
')'
if echo "$SCAN_CMD" | grep -qE "$DEV_START_REGEX"; then
  deny "Windows ホストでの開発・アプリ起動はブロックされました" \
"実開発（dev サーバ起動・node / python 実行・コンテナ起動）はホストではなく開発用コンテナの中で行います。被害をコンテナ内に閉じ込めるための運用です。"
fi

exit 0
