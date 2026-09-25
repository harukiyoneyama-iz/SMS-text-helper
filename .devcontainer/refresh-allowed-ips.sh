#!/bin/bash
# ============================================================
# 許可ドメインIPの定期再解決（ipset 追従）
#
# ⚠️ このスクリプトは guideline テンプレート由来ではない本プロジェクト固有の追加。
#    sync-template.sh --apply で削除される可能性があるため、実行後は復元すること
#    （docs/DEVELOPMENT_PLAN.md §④ 参照）。
#
# 背景（2026-09-25 実測）:
#   Google API 系のホスト名は TTL 数十〜200秒程度で IP がローテーションし、
#   /24 すらまたぐ（例: oauth2.googleapis.com が 192.178.230.95 → 192.178.226.95 に移動）。
#   init-firewall.sh は起動時に dig した1点しか ipset に入れないため、
#   時間が経つと実際の接続先IPが許可リストに無く "No route to host" になる。
#   このスクリプトは許可ドメインのリストを広げず、既存ドメインのIP追従だけを解決する。
#
# 4モード構成:
#   --start     node実行。自身を切り離して --supervise を常駐起動し、即 return する
#               （postStartCommand をブロックしないため）
#   --supervise node実行。60秒ごとに `sudo -n $0 --once` を呼ぶ常駐ループ。
#               ログ・死活記録・多重起動防止（flock）を担当
#   --once      root実行（sudoers 経由）。DNSを引いて ipset に追加するだけで即終了
#   --status    node実行。常駐プロセスの生死・最終成功時刻・許可IP数を表示
#
# root特権を持つ時間を「追加だけ」の数百ミリ秒に限定するため、
# 常駐ループ自体はnode権限で動かし、ipset書き込みだけ sudoers 経由でrootに委ねる設計。
# sudoers 側は "--once" という引数まで固定してあるため、この経路から任意コマンドの
# root実行はできない（詳細は Dockerfile 側のコメント参照）。
# ============================================================

set -uo pipefail
# 注: set -e はあえて使わない。sudo の非0終了や ipset test の失敗でループごと
#     死ぬのを避けるため（常駐プロセスを絶対に落とさないのがこのスクリプトの原則）。

DOMAINS_FILE=/usr/local/lib/devcontainer-firewall/allowed-domains.sh
LOG_DIR_CANDIDATES=(/var/log/devcontainer-firewall "$HOME/.cache/devcontainer-firewall")
INTERVAL="${FIREWALL_REFRESH_INTERVAL:-60}"

# 数値検証 + 下限ガード。
# 2026-09-25 code-review 指摘: 非数値（例: FIREWALL_REFRESH_INTERVAL=abc）だと
# `[ "$INTERVAL" -lt 10 ]` がエラーを2>/dev/nullで握りつぶすだけでINTERVALはそのまま残り、
# 後段の算術展開 `$(( INTERVAL - elapsed ))` が set -u 下で "unbound variable" として
# supervise ループごと即死する（実機で再現確認済み）。この機能が防ぎたいはずの
# "気づかれないまま追従が止まる" を自ら引き起こすため、ここで数値以外を弾く。
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -lt 10 ]; then
  INTERVAL=60
fi

resolve_log_dir() {
  for d in "${LOG_DIR_CANDIDATES[@]}"; do
    mkdir -p "$d" 2>/dev/null
    if [ -w "$d" ]; then
      echo "$d"
      return 0
    fi
  done
  # 最後の砦。ここまで来ることは通常ない
  echo "/tmp"
}

LOG_DIR="$(resolve_log_dir)"
LOG_FILE="$LOG_DIR/refresh.log"
STATUS_FILE="$LOG_DIR/status"
LOCK_FILE="$LOG_DIR/refresh.lock"

now_utc() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

log_line() {
  echo "$(now_utc) $*" >> "$LOG_FILE"
  # 2MBを超えたら末尾1000行だけ残す（logrotate非依存の自己トリム）
  if [ -f "$LOG_FILE" ]; then
    local size
    size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
    if [ "$size" -gt 2097152 ] 2>/dev/null; then
      tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
  fi
}

write_status() {
  # key=value のハートビート。毎サイクル上書き
  cat > "$STATUS_FILE" <<EOF
pid=$1
started_at=$2
last_run=$3
last_ok=$4
last_rc=$5
consecutive_fail=$6
ipset_entries=$7
interval=$INTERVAL
EOF
}

# ============================================================
# --once : root専用。DNSを引いてipsetに追加するだけ
# ============================================================
mode_once() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "[firewall-refresh] FATAL: --once は root 専用です" >&2
    exit 2
  fi
  # sudoers側でも引数固定しているが、ここでも防御を二重化する
  if [ "$#" -ne 0 ]; then
    echo "[firewall-refresh] FATAL: --once は追加引数を受け付けません" >&2
    exit 2
  fi

  if [ ! -r "$DOMAINS_FILE" ]; then
    echo "[firewall-refresh] FATAL: $DOMAINS_FILE が読めません" >&2
    exit 4
  fi
  # shellcheck source=/dev/null
  source "$DOMAINS_FILE"
  if ! declare -p REQUIRED_DOMAINS >/dev/null 2>&1; then
    echo "[firewall-refresh] FATAL: 許可ドメイン定義が壊れています" >&2
    exit 4
  fi

  if ! ipset list -n allowed-domains >/dev/null 2>&1; then
    # init-firewall.sh がまだ実行されていない/実行中の一瞬の窓。
    # 異常ではないので黙って終了する（呼び出し側=--superviseが専用の終了コードで判別する）
    exit 3
  fi

  local ok=0 fail=0 new=0 add_fail=0
  local all_domains=("${REQUIRED_DOMAINS[@]}" "${OPTIONAL_DOMAINS[@]:-}")

  for domain in "${all_domains[@]}"; do
    [ -z "$domain" ] && continue
    local ips
    ips=$(dig +noall +answer +time=2 +tries=1 A "$domain" 2>/dev/null | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
      fail=$((fail + 1))
      continue
    fi
    ok=$((ok + 1))
    while read -r ip; do
      [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]] || continue
      # 既存要素かどうかを事前確認してから追加する（-existは既存でも成功するため差分が取れない）
      if ! ipset test allowed-domains "${ip}/32" >/dev/null 2>&1; then
        # 2026-09-25 code-review 指摘: 以前はここが失敗しても fail に計上されず、
        # DNS さえ引ければ "cycle ok" として報告されていた（IPが実際には許可リストに
        # 入っていないのに --status は正常と表示する、という監視の盲点だった）。
        if ipset add allowed-domains "${ip}/32" -exist 2>/dev/null; then
          new=$((new + 1))
        else
          add_fail=$((add_fail + 1))
        fi
      fi
    done <<< "$ips"
  done

  local entries
  entries=$(ipset list -t allowed-domains 2>/dev/null | awk -F': ' '/Number of entries/ {print $2}')
  entries="${entries:-0}"

  echo "cycle ok: domains=${#all_domains[@]} ok=$ok fail=$fail new=$new add_fail=$add_fail entries=$entries"

  if [ "$add_fail" -gt 0 ]; then
    # dig は成功したが ipset への反映に失敗したケース。exit 0 のまま埋もれさせない。
    echo "cycle warn: ipset add に${add_fail}件失敗しました（容量上限 or 一時的なカーネル側エラーの可能性）" >&2
  fi

  if [ "$ok" -eq 0 ]; then
    exit 5
  fi
  exit 0
}

# ============================================================
# --supervise : node実行の常駐ループ
# ============================================================
mode_supervise() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "[firewall-refresh] already running (lock held). exiting quietly."
    exit 0
  fi

  local pid=$$
  local started_at
  started_at="$(now_utc)"
  local consecutive_fail=0
  local last_ok="-"
  local last_rc="-"
  local entries="-"

  trap 'write_status "$pid" "$started_at" "$(now_utc)" "$last_ok" "stopped" "$consecutive_fail" "$entries"; log_line "supervise stopped (signal)"; exit 0' TERM INT

  log_line "supervise started (pid=$pid, interval=${INTERVAL}s)"
  write_status "$pid" "$started_at" "-" "$last_ok" "$last_rc" "$consecutive_fail" "$entries"

  local warned_uninitialized=0

  while true; do
    local cycle_start
    cycle_start=$(date +%s)

    local out rc
    # 2026-09-25 code-review 指摘: 許可ドメインは約39件、1件あたり dig +time=2 なので
    # 全滅した場合の理論上限は 39*2s=78s。旧 timeout 45 だと劣化ネットワーク下で
    # 後半のドメイン（OPTIONAL_DOMAINS末尾）が毎サイクル強制終了され再解決されない
    # 状態になり得たため、理論上限に余裕を持たせた100秒に引き上げる。
    out=$(timeout 100 sudo -n /usr/local/bin/refresh-allowed-ips.sh --once 2>&1)
    rc=$?

    case "$rc" in
      0)
        consecutive_fail=0
        last_ok="$(now_utc)"
        last_rc=0
        warned_uninitialized=0
        entries=$(echo "$out" | grep -oE 'entries=[0-9]+' | cut -d= -f2)
        log_line "$out"
        ;;
      3)
        # ipset未作成（init-firewall.sh実行前/実行中の一瞬）。異常ではないので初回のみログ
        if [ "$warned_uninitialized" -eq 0 ]; then
          log_line "firewall未初期化のため待機中（init-firewall.sh の完了を待っています）"
          warned_uninitialized=1
        fi
        last_rc=3
        ;;
      *)
        consecutive_fail=$((consecutive_fail + 1))
        last_rc=$rc
        # 毎サイクルは出さず、5回連続失敗した時だけERRORを記録（ログ汚染防止）
        if [ "$((consecutive_fail % 5))" -eq 0 ]; then
          log_line "ERROR: refresh --once failed rc=$rc (連続${consecutive_fail}回) out=$out"
        fi
        ;;
    esac

    write_status "$pid" "$started_at" "$(now_utc)" "$last_ok" "$last_rc" "$consecutive_fail" "${entries:-0}"

    local elapsed=$(( $(date +%s) - cycle_start ))
    local sleep_for=$(( INTERVAL - elapsed ))
    [ "$sleep_for" -lt 1 ] && sleep_for=1
    sleep "$sleep_for"
  done
}

# ============================================================
# --start : node実行。デーモン化して即returnする
# ============================================================
mode_start() {
  # postStartCommand は /bin/sh(dash) で解釈されるため、デーモン化はここ(bash)で行う。
  # fd を確実に切らないと親(postStartCommand)がstdoutを握ったままになり
  # VS Codeが完了待ちでhangする（実運用で最も踏みやすい落とし穴）。
  mkdir -p "$LOG_DIR" 2>/dev/null
  setsid nohup /usr/local/bin/refresh-allowed-ips.sh --supervise \
    </dev/null >>"$LOG_FILE" 2>&1 &
  disown 2>/dev/null || true
  echo "[firewall-refresh] started (log: $LOG_FILE)"
  exit 0
}

# ============================================================
# --status : node実行。人間向けの死活確認
# ============================================================
mode_status() {
  if [ ! -f "$STATUS_FILE" ]; then
    echo "[firewall-refresh] 未起動です（コンテナが起動直後の可能性があります）"
    exit 1
  fi

  # shellcheck source=/dev/null
  source "$STATUS_FILE"

  local alive="no"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    alive="yes"
  fi

  if [ "$alive" = "no" ]; then
    echo "[firewall-refresh] ⚠ 停止しています。コンテナを再起動してください"
    echo "  （VS Code 左下 → Reopen in Container / Rebuild は不要。コンテナの再起動だけで復旧します）"
    exit 1
  fi

  local last_ok_epoch now_epoch age_sec
  if [ -n "${last_ok:-}" ] && [ "${last_ok}" != "-" ]; then
    last_ok_epoch=$(date -u -d "$last_ok" +%s 2>/dev/null || echo 0)
    now_epoch=$(date -u +%s)
    age_sec=$((now_epoch - last_ok_epoch))
  else
    age_sec=-1
  fi

  if [ "$age_sec" -ge 0 ] && [ "$age_sec" -lt $((interval * 3)) ]; then
    echo "[firewall-refresh] 稼働中 (pid $pid)  最終成功: ${age_sec}秒前  許可IP数: ${ipset_entries:-不明}  間隔: ${interval:-$INTERVAL}秒"
    exit 0
  else
    echo "[firewall-refresh] ⚠ プロセスは生きていますが、最近成功していません（最終成功: ${last_ok:-不明}）"
    echo "  ログを確認してください: $LOG_FILE"
    exit 1
  fi
}

case "${1:-}" in
  --once)
    shift
    mode_once "$@"
    ;;
  --supervise)
    mode_supervise
    ;;
  --start)
    mode_start
    ;;
  --status)
    mode_status
    ;;
  *)
    echo "使い方: $0 --start | --supervise | --once | --status" >&2
    exit 2
    ;;
esac
