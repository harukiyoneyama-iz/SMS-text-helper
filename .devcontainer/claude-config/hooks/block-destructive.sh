#!/bin/bash
# PreToolUse hook: 復旧困難な破壊的 Bash コマンドをブロック
# exit 0 = 許可, exit 2 = ブロック（ユーザーに理由表示）
#
# 背景:
#   - settings.json の deny（rm -rf * / git push --force * 等）は前方一致パターンで、
#     -fr / -r -f / --force-with-lease / 変数経由などの抜け道が残る
#   - 本フックで「意味ベース」で破壊的操作を検出し、deny を補強する
#   - AI は悪意なく暴走しうる前提（feedback_ai_agent_risk）。仕組みで止める
#
# 検出する操作:
#   1. 破壊的 git（push --force/-f/--force-with-lease, reset --hard, clean -f, branch -D,
#                  commit/push --no-verify, git -c core.hooksPath= バイパス）
#   2. 破壊的ファイル削除（rm -rf 系, find -delete/-exec rm, rsync --delete, shred/wipe, truncate -s 0）
#   3. 破壊的ディスク操作（mkfs, dd of=/dev/, > /dev/<disk>）
#   4. 破壊的権限（chmod 777 系）
#   5. 破壊的 SQL（DROP TABLE/DATABASE/SCHEMA, TRUNCATE）
#
# 誤検知対策:
#   - git commit の HEREDOC 本文と -m / -F のメッセージ引数は検査対象から除外する
#     （"git reset --hard を廃止" のようなコミットメッセージで誤発火しない）

set -euo pipefail

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
  # jq 不在: command の部分抽出は引用符 / 改行 / エスケープで途中切断し fail-open するため、
  # JSON 全体を検査対象に倒して fail-safe とする。
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//' || true)
  COMMAND="$INPUT"
fi

if [ "$TOOL_NAME" != "Bash" ] && [ -n "$TOOL_NAME" ]; then
  exit 0
fi

# --- コミットメッセージを検査対象から除外 ---
# (1) HEREDOC 本文と終端デリミタ行を削除
if command -v awk >/dev/null 2>&1; then
  SCAN_CMD=$(printf '%s\n' "$COMMAND" | awk '
    BEGIN { indoc = 0 }
    {
      if (indoc == 1) {
        if ($0 ~ ("^[[:space:]]*" delim "[[:space:]]*$")) { indoc = 0 }
        next
      }
      line = $0
      if (match(line, /<<-?[[:space:]]*[\047"]?[A-Za-z_][A-Za-z0-9_]*[\047"]?/)) {
        tok = substr(line, RSTART, RLENGTH)
        gsub(/[<>\-[:space:]\047"]/, "", tok)
        delim = tok
        indoc = 1
        sub(/<<-?.*/, "", line)
        print line
        next
      }
      print line
    }')
else
  SCAN_CMD="$COMMAND"
fi
# (2) -m "..." / -m '...' / -F file のメッセージ引数を除去
SCAN_CMD=$(echo "$SCAN_CMD" | sed -E 's/-m[[:space:]]*"[^"]*"//g; s/-m[[:space:]]*'"'"'[^'"'"']*'"'"'//g; s/-F[[:space:]]+[^[:space:]]+//g')
# (3) 改行をまたぐバイパス（git push origin main \n --force 等）対策: 改行・CR を空白へ正規化
SCAN_CMD=$(printf '%s' "$SCAN_CMD" | tr '\n\r' '  ')

# 共通のブロック処理
deny() {
  {
    echo "⛔ $1"
    echo ""
    echo "コマンド: $COMMAND"
    echo ""
    echo "$2"
    echo ""
    echo "本当に必要な場合は、操作内容をユーザー本人に説明し、手動で実行してもらってください。"
  } >&2
  exit 2
}

# --- 1. 破壊的 git ---
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+push([[:space:]]+[^;&|]*)?[[:space:]]+(-f\b|--force\b|--force-with-lease)'; then
  deny "リモート履歴を破壊する force push はブロックされました" \
"git push --force / -f / --force-with-lease は他人のコミットを上書きし、復旧が困難です。
通常の push（git push origin <branch>）を使ってください。"
fi
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+reset[[:space:]]+([^;&|]*[[:space:]])?--hard'; then
  deny "未コミット変更を消す git reset --hard はブロックされました" \
"作業ツリーの変更が失われます。変更を退避するなら git stash を使ってください。"
fi
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'; then
  deny "未追跡ファイルを削除する git clean -f はブロックされました" \
"消えるファイルを確認するには git clean -n（dry-run）を使ってください。"
fi
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+branch[[:space:]]+([^;&|]*[[:space:]])?-D\b'; then
  deny "未マージのブランチを強制削除する git branch -D はブロックされました" \
"マージ済みの安全な削除は git branch -d（小文字）を使ってください。"
fi
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+(commit|push)([[:space:]]+[^;&|]*)?[[:space:]]+--no-verify'; then
  deny "git hook をスキップする --no-verify はブロックされました" \
"--no-verify は gitleaks による秘密情報スキャン等の防御層を無効化します。
hook を通してコミット / push してください。"
fi
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+-c[[:space:]]+core\.hooksPath'; then
  deny "git -c core.hooksPath= による hook バイパスはブロックされました" \
"core.hooksPath の一時上書きは防御層を迂回します。正規の hook パスを使ってください。"
fi

# --- 2. 破壊的ファイル削除 ---
if echo "$SCAN_CMD" | grep -qE '\brm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r[[:space:]]+-f|-f[[:space:]]+-r)'; then
  deny "再帰的かつ強制の rm -rf はブロックされました" \
"削除対象を ls で確認し、本当に必要なら個別に rm してください。"
fi
if echo "$SCAN_CMD" | grep -qE '\bfind\b[^;&|]*(-delete|-exec[[:space:]]+rm)'; then
  deny "find による一括削除（-delete / -exec rm）はブロックされました" \
"まず -print で対象を確認してください。"
fi
if echo "$SCAN_CMD" | grep -qE '\brsync\b[^;&|]*--delete'; then
  deny "rsync --delete はブロックされました" \
"--delete は宛先の余分なファイルを消します。--dry-run で差分を確認してください。"
fi
if echo "$SCAN_CMD" | grep -qE '\b(shred|wipe)\b'; then
  deny "復元不能な消去（shred / wipe）はブロックされました" \
"通常の削除で足りないか再検討してください。"
fi
if echo "$SCAN_CMD" | grep -qE '\btruncate[[:space:]]+-s[[:space:]]*0'; then
  deny "ファイルを空にする truncate -s 0 はブロックされました" \
"内容を残す必要がないか確認してください。"
fi

# --- 3. 破壊的ディスク操作 ---
if echo "$SCAN_CMD" | grep -qE '\bmkfs'; then
  deny "ファイルシステム作成（mkfs）はブロックされました" \
"ディスク全体を初期化します。対象デバイスを必ず確認してください。"
fi
if echo "$SCAN_CMD" | grep -qE '\bdd\b[^;&|]*of=/dev/'; then
  deny "デバイスへの dd 書き込みはブロックされました" \
"of=/dev/... はディスクを破壊します。対象を必ず確認してください。"
fi
if echo "$SCAN_CMD" | grep -qE '>[[:space:]]*/dev/(sd|nvme|disk|hd)'; then
  deny "ブロックデバイスへの直接書き込みはブロックされました" \
"対象デバイスを必ず確認してください。"
fi

# --- 4. 破壊的権限 ---
if echo "$SCAN_CMD" | grep -qE '\bchmod[[:space:]]+(-R[[:space:]]+)?0?777\b'; then
  deny "全権限を与える chmod 777 はブロックされました" \
"必要最小限の権限（例: 644 / 755）を指定してください。"
fi

# --- 5. 破壊的 SQL ---
if echo "$SCAN_CMD" | grep -qiE 'drop[[:space:]]+(table|database|schema)\b'; then
  deny "テーブル/DB を削除する DROP はブロックされました" \
"本番データを失う恐れがあります。マイグレーション手順に従ってください。"
fi
if echo "$SCAN_CMD" | grep -qiE 'truncate[[:space:]]+table\b'; then
  deny "テーブルを空にする TRUNCATE はブロックされました" \
"本番データを失う恐れがあります。意図を確認してください。"
fi

exit 0
