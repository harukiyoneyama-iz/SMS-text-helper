#!/bin/bash
# Claude Code グローバル設定セットアップ（Mac / Linux / Git Bash on Windows）
# 使い方: bash claude-config/setup.sh
#
# このスクリプトは以下を ~/.claude/ に配置します：
#   - CLAUDE.md（全体指示書）
#   - rules/*.md（コーディングスタイル等のルール）
#   - hooks/*.sh（防御フック群: 依存追加 / 秘密読取 / 破壊操作 / ホスト導入・開発開始のブロック）
#   - settings.json（実行環境別の権限・セキュリティ設定）
#
# 前提（重要）:
#   - 実開発は VS Code 拡張の Claude Code + Dev Container の中で行う（必須ルート）
#   - Claude Desktop / Windows ホストは会話・検索・案内用途。ホストでの install / dev / run はしない
#   - Linux/macOS/WSL/devcontainer では sandbox 優先。使えない環境では permissions/hooks で危険操作を止める

set -euo pipefail

# --- 引数 ---
# --force / --update: 既存ファイル（CLAUDE.md, settings.json）も version 一致を問わず必ず上書き
# 通常実行: 既存はスキップ or 差分警告
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force|--update) FORCE=true ;;
    *) echo "[WARN] 不明な引数を無視: $arg" >&2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# OS判定（$HOME は Mac/Linux/Git Bash 共通で使える）
CLAUDE_DIR="$HOME/.claude"

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
  # Windows Git Bash: settings.json 内のパスは / 区切りに変換
  HOOKS_PATH=$(cygpath -m "$CLAUDE_DIR/hooks" 2>/dev/null || echo "$CLAUDE_DIR/hooks")
  SETTINGS_TEMPLATE="$SCRIPT_DIR/settings.windows.json"
  SETTINGS_LABEL="Windows host"
else
  HOOKS_PATH="$CLAUDE_DIR/hooks"
  SETTINGS_TEMPLATE="$SCRIPT_DIR/settings.json"
  SETTINGS_LABEL="sandbox-capable"
fi

echo "========================================"
echo "  Claude Code グローバル設定セットアップ"
echo "  配置先: $CLAUDE_DIR"
echo "========================================"
echo ""

# --- prerequisites ---
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]]; then
  echo "[OK]   Git Bash 上で実行しています"
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "[ERROR] gitleaks が見つかりません"
  echo "        commit/push 前の秘密情報スキャンを fail-closed にするため必須です。"
  echo "        導入例:"
  echo "          Windows: winget install --id Gitleaks.Gitleaks -e --source winget"
  echo "          Mac:     brew install gitleaks"
  echo "          Linux:   GitHub Releases のバイナリを PATH に配置"
  echo "        導入後、'gitleaks version' を確認してから再実行してください。"
  exit 1
fi
echo "[OK]   gitleaks を確認しました: $(command -v gitleaks)"
echo ""

# ディレクトリ作成
mkdir -p "$CLAUDE_DIR/rules"
mkdir -p "$CLAUDE_DIR/hooks"

# --- CLAUDE.md ---
# 2026-05-15 改修: 既存があっても「差分検出 + 警告」で設定ドリフトを可視化
# --force/--update 時は差分があれば自動上書き（canary 更新運用向け）
if [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
  if diff -q "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" >/dev/null 2>&1; then
    echo "[OK]   CLAUDE.md は配布元と一致しています"
  elif [ "$FORCE" = true ]; then
    cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    echo "[UPDATE] CLAUDE.md を上書きしました (--force)"
  else
    echo "[WARN] CLAUDE.md は配布元と差分があります"
    echo "       配布元: $SCRIPT_DIR/CLAUDE.md"
    echo "       現在:   $CLAUDE_DIR/CLAUDE.md"
    echo "       差分確認: diff -u \"$CLAUDE_DIR/CLAUDE.md\" \"$SCRIPT_DIR/CLAUDE.md\""
    echo "       自動上書き: bash claude-config/setup.sh --force"
  fi
else
  cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
  echo "[OK]   CLAUDE.md を配置しました"
fi

# --- rules/*.md ---
RULES_UPDATED=0
for rule in "$SCRIPT_DIR"/rules/*.md; do
  filename=$(basename "$rule")
  if [ -f "$CLAUDE_DIR/rules/$filename" ]; then
    # 差分がある場合のみ更新
    if ! diff -q "$rule" "$CLAUDE_DIR/rules/$filename" >/dev/null 2>&1; then
      cp "$rule" "$CLAUDE_DIR/rules/$filename"
      echo "[UPDATE] rules/$filename を更新しました"
      RULES_UPDATED=$((RULES_UPDATED + 1))
    fi
  else
    cp "$rule" "$CLAUDE_DIR/rules/$filename"
    echo "[OK]     rules/$filename を配置しました"
    RULES_UPDATED=$((RULES_UPDATED + 1))
  fi
done
if [ $RULES_UPDATED -eq 0 ]; then
  echo "[SKIP] rules/ は全て最新です"
fi

# --- hooks ---
# 全 hook を配布対象に（block-secret-read.sh / validate-package-install.sh 等）
for hook_src in "$SCRIPT_DIR"/hooks/*.sh; do
  hook_name=$(basename "$hook_src")
  cp "$hook_src" "$CLAUDE_DIR/hooks/$hook_name"
  chmod +x "$CLAUDE_DIR/hooks/$hook_name"
  echo "[OK]   hooks/$hook_name を配置しました"
done

# --- scripts（監査スクリプト） / templates/manifest.yml ---
# 配布元は guideline リポジトリの scripts/ と templates/。
# プロジェクトの .devcontainer/claude-config/ 配下には存在しないため、無ければスキップする
# （audit-projects.sh / manifest.yml は guideline 専用ツールで、各プロジェクトに必須ではない）。
# 注: 以前は無条件 cp で、set -e により settings.json 適用前に中断するバグがあった（2026-06-29 修正）。
if [ -f "$SCRIPT_DIR/../scripts/audit-projects.sh" ]; then
  mkdir -p "$CLAUDE_DIR/scripts"
  cp "$SCRIPT_DIR/../scripts/audit-projects.sh" "$CLAUDE_DIR/scripts/audit-projects.sh"
  chmod +x "$CLAUDE_DIR/scripts/audit-projects.sh"
  echo "[OK]   scripts/audit-projects.sh を配置しました"
else
  echo "[SKIP] audit-projects.sh は配布対象外（guideline リポジトリ専用）"
fi

if [ -f "$SCRIPT_DIR/../templates/manifest.yml" ]; then
  mkdir -p "$CLAUDE_DIR/templates"
  cp "$SCRIPT_DIR/../templates/manifest.yml" "$CLAUDE_DIR/templates/manifest.yml"
  echo "[OK]   templates/manifest.yml を配置しました"
fi

# --- settings.json ---
# 実行環境に応じて template を切り替える。
# --force は version に関係なく必ず上書きする（2026-06-29 修正: 以前は version 一致だと
# --force でも上書きしないバグがあり、内容変更が version 据え置きだと反映されなかった）。
if [ ! -f "$CLAUDE_DIR/settings.json" ] || [ "$FORCE" = true ]; then
  sed "s|{{HOOKS_DIR}}|$HOOKS_PATH|g" "$SETTINGS_TEMPLATE" > "$CLAUDE_DIR/settings.json"
  if [ "$FORCE" = true ]; then
    echo "[UPDATE] settings.json を上書きしました (--force, $SETTINGS_LABEL)"
  else
    echo "[OK]   settings.json を配置しました ($SETTINGS_LABEL)"
  fi
else
  # 既存があり --force でない: version を比較して差分があれば警告のみ
  if command -v jq >/dev/null 2>&1; then
    SRC_VERSION=$(jq -r '._version // "unknown"' "$SETTINGS_TEMPLATE" 2>/dev/null)
    DST_VERSION=$(jq -r '._version // "unknown"' "$CLAUDE_DIR/settings.json" 2>/dev/null)
  else
    SRC_VERSION=$(grep -o '"_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SETTINGS_TEMPLATE" | sed 's/.*: *"//;s/"$//' || echo "unknown")
    DST_VERSION=$(grep -o '"_version"[[:space:]]*:[[:space:]]*"[^"]*"' "$CLAUDE_DIR/settings.json" | sed 's/.*: *"//;s/"$//' || echo "unknown")
  fi
  if [ "$SRC_VERSION" = "$DST_VERSION" ]; then
    echo "[OK]   settings.json は $SETTINGS_LABEL 配布元と同じ version ($SRC_VERSION)"
  else
    echo "[WARN] settings.json の version が異なります（配布元: $SRC_VERSION / 現在: $DST_VERSION）"
    echo "       上書き: bash claude-config/setup.sh --force"
  fi
fi

echo ""
echo "========================================"
echo "  セットアップ完了"
echo ""
echo "  次のステップ:"
echo "  1. Windows host は host-safe settings、Linux/macOS/WSL は sandbox settings が入っています"
echo "  2. 実開発は VS Code 拡張 + Dev Container の中で行ってください（Reopen in Container）"
echo "     Windows ホストでの install / dev / run は止まります（会話・検索・案内は可）"
echo "  3. Claude Code を再起動して設定反映を確認"
echo "========================================"
