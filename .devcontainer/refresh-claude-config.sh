#!/bin/bash
# refresh-claude-config.sh — claude-home Named Volume 内の「管理対象設定」を配布原本に同期する
#
# 背景:
#   claude-home volume は「空の初回マウント時」しか image (claude-config) からコピーされない。
#   そのため settings.json / hooks 等の更新が既存プロジェクトに届かず、届けるには
#   volume rm（= 認証・個人状態・セッション履歴の消失）が必要だった。
#   本スクリプトは postStartCommand で毎起動走り、管理対象ファイルだけを
#   /opt/claude-config-dist（Dockerfile が image に焼く配布原本）から idempotent に同期する。
#   これにより Rebuild だけで設定更新が既存 volume に届く（volume rm 不要）。
#
# 方針:
#   - 同期する（中央管理・volume 側のローカル編集は上書きされる）:
#       settings.json / CLAUDE.md / rules/* / hooks/*
#     ※ ここで同期する settings.json は「コンテナ用」（hook を絶対パス
#       /home/node/.claude/hooks/... で配線、sandbox 設定込み）。ホスト配布用の
#       guideline/claude-config/settings.json（{{HOOKS_DIR}} プレースホルダ + ホスト用 allow）
#       とは意図的に別物。リポジトリ側の同期（root claude-config → templates の同梱コピー）
#       では settings.json をコピーしてはいけない（CLAUDE.md / rules / setup.sh / setup.ps1 のみ）。
#       取り違え事故が volume に波及しないよう、下で {{HOOKS_DIR}} 残存を検査する（fail-safe）。
#   - 触らない（個人状態。上記以外のすべて）:
#       .credentials.json, settings.local.json, projects/, session-env/, statsig/, todos/,
#       shell-snapshots/, history 等
#   - 管理対象から削除されたファイルの掃除は行わない（安全側。必要になったら明示対応）
#   - 呼び出し側（postStartCommand）は `|| true` で失敗を許容する前提。ただし
#     防御 hook の実行ビット付与だけは最優先で行い、hook の silent fail
#     （permission denied → PreToolUse が素通り）を毎起動で自己修復する。
set -u

DIST="/opt/claude-config-dist"
TARGET="/home/node/.claude"

# 旧 image（配布原本なし）では何もしない
if [ ! -d "$DIST" ]; then
  echo "[refresh-claude-config] SKIP: $DIST がありません（旧 image。Rebuild で有効化されます）"
  exit 0
fi

# 1) 防御 hook の実行ビットを最初に自己修復（以降の同期が失敗してもここだけは通す）
chmod +x "$TARGET"/hooks/*.sh 2>/dev/null || true

updated=0
failed=0
sync_file() {
  local rel="$1" src dst
  src="$DIST/$rel"
  dst="$TARGET/$rel"
  [ -f "$src" ] || return 0
  if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
    mkdir -p "$(dirname "$dst")"
    if cp "$src" "$dst" 2>/dev/null; then
      echo "[refresh-claude-config]   updated: $rel"
      updated=$((updated + 1))
    else
      echo "[refresh-claude-config]   ⚠️ 更新失敗（書き込み不可）: $rel" >&2
      failed=$((failed + 1))
    fi
  fi
}

# 2) 管理対象ファイルの同期
# fail-safe: ホスト用 settings.json（{{HOOKS_DIR}} 未置換）が配布原本に紛れていたら同期しない。
# 同期すると hook のパス配線が壊れ、防御 4 hook が volume 側で無効化されるため。
if [ -f "$DIST/settings.json" ] && grep -q '{{HOOKS_DIR}}' "$DIST/settings.json"; then
  echo "[refresh-claude-config] ⚠️ 配布原本の settings.json にホスト用プレースホルダ {{HOOKS_DIR}} が残っています。" >&2
  echo "[refresh-claude-config]    ホスト用/コンテナ用の取り違えの可能性があるため settings.json は同期しません（管理者に連絡）。" >&2
else
  sync_file "settings.json"
fi
sync_file "CLAUDE.md"
for dir in rules hooks; do
  [ -d "$DIST/$dir" ] || continue
  for src in "$DIST/$dir"/*; do
    [ -f "$src" ] || continue
    sync_file "$dir/$(basename "$src")"
  done
done

# 3) 同期で新しく入った hook にも実行ビットを付与
chmod +x "$TARGET"/hooks/*.sh 2>/dev/null || true

if [ "$failed" -gt 0 ]; then
  echo "[refresh-claude-config] ⚠️ $failed 件の同期に失敗（fix-permissions の所有権補正後に再起動で解消される可能性）" >&2
elif [ "$updated" -gt 0 ]; then
  echo "[refresh-claude-config] ✓ 管理対象 $updated 件を配布原本に同期しました"
else
  echo "[refresh-claude-config] ✓ 管理対象は最新です"
fi
exit 0
