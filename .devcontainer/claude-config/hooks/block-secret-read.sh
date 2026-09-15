#!/bin/bash
# PreToolUse hook: 秘密ファイルへの読み取り / 持ち出し Bash コマンドをブロック
# exit 0 = 許可, exit 2 = ブロック（ユーザーに理由表示）
#
# 背景:
#   - settings.json の Read(**/.env) 等 deny は Read ツール限定で、
#     Bash 経由 (cat/grep/head/tail/less/awk/sed 等) は素通りしてしまう
#   - python -c "print(open('.env').read())" のような汎用スクリプト経由バイパスも存在
#   - base64/source/入力リダイレクト/別名コピーなど検出回避の抜け道が多い
#   - 本フックで Bash 側の抜け道を構造的に塞ぐ
#
# 検出する操作（秘密ファイルが絡む場合）:
#   1. 読み取り系コマンド (cat/grep/sed/base64/openssl/dd/xxd/strings 等)
#   2. 汎用スクリプト経由 (python -c / node -e / sh -c / awk / php -r 等)
#   3. source / . による環境変数展開
#   4. 入力リダイレクト ( < secret ) / コマンド置換 ( $(<secret) )
#   5. 別名コピー・アーカイブによる持ち出し (cp/mv/tar/zip/scp/rsync 等)
#   6. 書き込み系リダイレクト ( > secret / >> secret )
#
# 対象（秘密ファイル）:
#   - .env / .env.<name>（.env.example, .env.sample, .env.template は除外）
#   - .npmrc / .netrc / .pypirc / .git-credentials / .dockercfg / .docker/config.json
#   - *service-account*.json / application_default_credentials.json
#   - terraform.tfstate / terraform.tfstate.backup
#   - .kube/config / .aws/credentials / .aws/config / .config/gcloud
#   - .ssh/id_* / id_rsa / id_ed25519 / id_ecdsa / id_dsa / .gnupg/
#   - *.pem / *.key / *.p12 / *.pfx / *.jks / *.keystore / *.ovpn
#   - *credentials*
#
# 誤検知対策:
#   - git commit の HEREDOC 本文（<<EOF ... EOF）は検査対象から除外する。
#     コミットメッセージに ".env を修正" のような文字列があってもブロックしない。

set -euo pipefail

INPUT=$(cat)

# JSON から tool_name と command を抽出
if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
  # jq 不在: command の部分抽出は引用符 / 改行 / エスケープで途中切断し、
  # 危険な部分文字列を見逃して fail-open するため採用しない。JSON 全体を
  # 検査対象に倒して fail-safe とする（誤検知は増えるが見逃さない）。
  TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"$//' || true)
  COMMAND="$INPUT"
fi

# Bash 以外は対象外（jq 不在時は TOOL_NAME 判定が緩いが、その場合 COMMAND=INPUT 全体で
# 検査するため Bash 以外でも安全側=検査する方向に倒れる）
if [ "$TOOL_NAME" != "Bash" ] && [ -n "$TOOL_NAME" ]; then
  exit 0
fi

# --- HEREDOC 本文を検査対象から除外（コミットメッセージ誤検知対策）---
# `<<EOF ... EOF` / `<<'EOF' ... EOF` の本文と終端デリミタ行を削除する。
# これにより git commit のメッセージ本文に .env 等の文字列があっても発火しない。
# HEREDOC 外（&& cat .env 等）の秘密参照は SCAN_CMD に残るので引き続き検出する。
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

# 改行をまたぐバイパス（cat \n .env / git push \n --force 等）対策:
# 検査前に改行・CR を空白へ正規化する（grep は行単位評価のため、改行で分割された
# 危険コマンドを見逃すのを防ぐ）。
SCAN_CMD=$(printf '%s' "$SCAN_CMD" | tr '\n\r' '  ')

# --- 秘密パスらしきトークンを抽出（SCAN_CMD ベース）---
# まず .env 系
ENV_TOKENS=$(echo "$SCAN_CMD" | grep -oE '(^|[[:space:]/=:"'"'"'<])\.env(\.[a-zA-Z0-9_-]+)?' | sed -E 's/^[[:space:]/=:"'"'"'<]//' || true)

# .env.example / .env.sample / .env.template は除外
ENV_SUSPICIOUS=$(echo "$ENV_TOKENS" | grep -vE '^\.env\.(example|sample|template)$' || true)

# 他の秘密ファイル: トークン全体を抽出（specific path / 拡張子で判定し、単語マッチによる
# 誤検知を避ける。例: `rg "credentials" src/` や `cat docs/credentials-guide.md` は許可、
# `cat my-credentials.json` や `cat ~/.aws/credentials` は検出する）
OTHER_SECRET_REGEX='(\.npmrc|\.netrc|\.pypirc|\.git-credentials|\.dockercfg|\.docker/config\.json|service-account[^[:space:]"'"'"']*\.json|application_default_credentials\.json|terraform\.tfstate(\.backup)?|\.kube/config|\.aws/(credentials|config)|\.ssh/id_[a-z0-9]+|\.ssh/[^[:space:]"'"'"']*\.pem|(^|[[:space:]/=:"'"'"'<])id_(rsa|dsa|ecdsa|ed25519)|\.gnupg/|[^[:space:]"'"'"']+\.(pem|key|p12|pfx|jks|keystore|ovpn)|[^[:space:]"'"'"']*credentials\.(json|ya?ml|toml|txt|env|conf|cfg|ini|sh)|[^[:space:]"'"'"']*\.credentials($|[^[:alnum:]_-]))'
OTHER_SECRETS=$(echo "$SCAN_CMD" | grep -oE "$OTHER_SECRET_REGEX" | sed -E 's/^[[:space:]/=:"'"'"'<]//' || true)

# .env も他秘密ファイルも見当たらないなら通す
if [ -z "$ENV_SUSPICIOUS" ] && [ -z "$OTHER_SECRETS" ]; then
  exit 0
fi

# 検出した秘密ファイル一覧（表示用）
DETECTED=$(printf "%s\n%s" "$ENV_SUSPICIOUS" "$OTHER_SECRETS" | grep -v '^$' | sort -u | tr '\n' ' ' || true)

# 共通のブロック処理
deny() {
  {
    echo "⛔ $1"
    echo ""
    echo "コマンド: $COMMAND"
    echo "検出された秘密パス: $DETECTED"
    echo ""
    echo "$2"
  } >&2
  exit 2
}

# --- 1. 読み取り系コマンド検出 ---
READER_REGEX='\b(cat|tac|grep|egrep|fgrep|rg|ag|ack|head|tail|less|more|most|pg|sed|awk|gawk|nawk|nl|cut|sort|uniq|xxd|od|hexdump|hd|strings|file|column|paste|tr|wc|tee|split|csplit|expand|unexpand|fold|fmt|pr|join|comm|diff|cmp|bat|batcat|vi|vim|view|nano|emacs|dd|base64|base32|basenc|uuencode|openssl|xargs|read|mapfile|readarray|jq|yq|envsubst)\b'

if echo "$SCAN_CMD" | grep -qE "$READER_REGEX"; then
  deny "秘密ファイルの内容を出力する操作はブロックされました" \
"これらのファイルには秘密情報（API キー、トークン、DB パスワード、証明書等）が含まれます。
代替手段:
  - 存在確認のみ: ls -la <path>
  - キーの構造を見たいなら: 対応する .env.example / .sample / .template を読む
  - 値が必要ならユーザー本人に直接尋ねる"
fi

# --- 1b. git show / git cat-file 経由（履歴から秘密を取り出す）---
if echo "$SCAN_CMD" | grep -qE 'git[[:space:]]+(show|cat-file)\b'; then
  deny "git 経由での秘密ファイル参照はブロックされました" \
"git show <ref>:<path> / git cat-file -p <ref>:<path> で履歴から秘密を取り出す経路は禁止です。"
fi

# --- 2. 汎用スクリプト / インタプリタ経由 ---
# フラグ有無を問わずインタプリタ名で検出（python leak.py .env のように外部スクリプトへ
# 秘密パスを渡すバイパスも塞ぐ）。秘密パスが既に検出されている文脈でのみ到達する。
GENERIC_SCRIPT_REGEX='\b(python|python3|node|nodejs|ruby|perl|deno|bun|php)\b'
if echo "$SCAN_CMD" | grep -qE "$GENERIC_SCRIPT_REGEX"; then
  deny "スクリプト / インタプリタ経由での秘密ファイル参照はブロックされました" \
"python / node / ruby 等で秘密ファイルを読み出すバイパス（-c / -e や外部スクリプトへのパス渡しを含む）は禁止です。
正規の経路（dotenv / config パッケージ）はアプリ内コードから使ってください。"
fi

# --- 3. source / . による環境変数展開 ---
SOURCE_REGEX='(^|[;&|[:space:]])(source|\.)[[:space:]]+[^[:space:]]'
if echo "$SCAN_CMD" | grep -qE "$SOURCE_REGEX"; then
  deny "source / . による秘密ファイルの読み込みはブロックされました" \
"source .env のように環境変数へ展開してから漏らす経路は禁止です。
アプリ起動時の環境変数は DevContainer / 実行基盤側で注入してください。"
fi

# --- 4. 入力リダイレクト ( < secret ) / コマンド置換 ( \$(<secret) ) ---
# SCAN_CMD 中に秘密パスがあり、かつ入力リダイレクト記号が存在する場合
REDIR_IN_REGEX='(\$\([[:space:]]*<|(^|[^<])<)[[:space:]]*[^[:space:]<>|&;]*(\.env|\.pem|\.key|credentials|id_rsa|id_ed25519|\.npmrc|\.netrc)'
if echo "$SCAN_CMD" | grep -qE "$REDIR_IN_REGEX"; then
  deny "入力リダイレクト経由での秘密ファイル読み取りはブロックされました" \
"< file や \$(<file) で秘密ファイルを読み込む経路は禁止です。
存在確認のみなら ls -la <path> を使ってください。"
fi

# --- 5. 別名コピー・アーカイブによる持ち出し ---
# 秘密ファイルを cp/mv/tar/zip 等で別名・別形式にして cat 回避するのを防ぐ
COPY_REGEX='\b(cp|mv|tar|zip|gzip|bzip2|xz|7z|rsync|scp|sftp|install)\b'
if echo "$SCAN_CMD" | grep -qE "$COPY_REGEX"; then
  deny "秘密ファイルのコピー・持ち出し操作はブロックされました" \
"cp / mv / tar / scp 等で秘密ファイルを別名・別形式に移すと内容流出の準備になります。
意図的な編集なら Edit ツール経由で行ってください（差分が見えます）。"
fi

# --- 6. 書き込み系（リダイレクト >, >>）---
WRITE_TARGET_REGEX='(>|>>)[[:space:]]*[^|&;]*('"$OTHER_SECRET_REGEX"'|\.env(\.[a-zA-Z0-9_-]+)?)'
if echo "$SCAN_CMD" | grep -qE "$WRITE_TARGET_REGEX"; then
  # .env.example 等への書き込みは許可
  WRITE_NG=$(echo "$SCAN_CMD" | grep -oE "$WRITE_TARGET_REGEX" | grep -vE '\.env\.(example|sample|template)' || true)
  if [ -n "$WRITE_NG" ]; then
    deny "秘密ファイルへの書き込みはブロック対象です" \
"意図的な編集なら、Edit ツール経由で行ってください（差分が見えます）。"
  fi
fi

exit 0
