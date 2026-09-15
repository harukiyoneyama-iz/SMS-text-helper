#!/bin/bash
# ============================================================
# ネットワークファイアウォール（iptables + ipset）
#
# ベース: anthropics/claude-code/.devcontainer/init-firewall.sh
# カスタマイズ: guidelineプロジェクト独自の許可ドメインを追加
#
# 仕組み:
#   - default-deny（全アウトバウンドをブロック）
#   - ipset ホワイトリストに一致するIPのみ許可
#   - カーネルレベル（L3/L4）で制御するため、
#     http_proxy 環境変数に依存しない（旧Squid方式の弱点を解消）
#
# 前提:
#   - docker-compose.yml で cap_add: [NET_ADMIN, NET_RAW, SETUID, SETGID]
#   - コンテナ内で sudo 実行（sudoers で本スクリプトのみ許可）
#   - 必要パッケージ: iptables, ipset, iproute2, dnsutils, aggregate, jq, curl
# ============================================================

set -euo pipefail
IFS=$'\n\t'

# === Docker内部DNS NATルールを保存（flush前） ===
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# === iptables フラッシュ ===
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# === Docker DNS NATルールを復元 ===
if [ -n "$DOCKER_DNS_RULES" ]; then
  echo "[firewall] Restoring Docker DNS rules..."
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
  echo "[firewall] No Docker DNS rules to restore"
fi

# === 基本許可（DNS, SSH, localhost） ===
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT  -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# === ipset 作成 ===
ipset create allowed-domains hash:net

# === GitHub IPレンジ（動的取得 + aggregate で統合） ===
echo "[firewall] Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta || echo "")
if [ -n "$gh_ranges" ] && echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null 2>&1; then
  if command -v aggregate >/dev/null 2>&1; then
    while read -r cidr; do
      if [[ "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        ipset add allowed-domains "$cidr" -exist
      fi
    done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)
  else
    while read -r cidr; do
      if [[ "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        ipset add allowed-domains "$cidr" -exist
      fi
    done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]')
  fi
  echo "[firewall] GitHub CIDRs added"
else
  echo "[firewall] WARN: GitHub meta fetch failed, falling back to DNS resolution"
  for domain in "github.com" "api.github.com" "raw.githubusercontent.com"; do
    for ip in $(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}'); do
      ipset add allowed-domains "${ip}/32" -exist
    done
  done
fi

# === 許可ドメイン解決 ===
# 必須ドメイン（解決失敗時はコンテナ起動を中断）
REQUIRED_DOMAINS=(
  "registry.npmjs.org"            # npm パッケージ取得
  "api.anthropic.com"             # Claude Code API
)

# 公式デフォルト + guideline追加ドメイン（解決失敗時は警告のみ）
OPTIONAL_DOMAINS=(
  # 公式デフォルト
  "sentry.io"                     # テレメトリー
  "statsig.anthropic.com"         # テレメトリー
  "statsig.com"                   # テレメトリー
  "marketplace.visualstudio.com"  # VS Code拡張
  "vscode.blob.core.windows.net"  # VS Code拡張（旧CDN、互換のため残置）
  "update.code.visualstudio.com"  # VS Code更新
  # 拡張バイナリ配信CDN（publisher別ホスト）。claude-code 拡張は 2026-07-10 に VSIX 固定配布を
  # 廃止し Marketplace 経由の install + 自動更新に移行したため、拡張本体の DL 経路を許可する。
  # テンプレ標準の他拡張（prettier / eslint / docker）の自動更新も同経路のため併せて許可。
  # 注: ipset は起動時のDNS解決IPのみ許可のため、CDN側のIP変動時は次回 postStart で追従する。
  "anthropic.gallerycdn.vsassets.io"      # claude-code
  "esbenp.gallerycdn.vsassets.io"         # prettier
  "dbaeumer.gallerycdn.vsassets.io"       # eslint
  "ms-azuretools.gallerycdn.vsassets.io"  # docker
  # VS Code Server 配信CDN（現行）: クライアント側 VS Code が自動更新されると、attach 時に
  # 新バージョンの vscode-server をコンテナ内へ DL する。ここを許可しないと
  # 「初回は動いたのに後日 Reopen in Container が hang/失敗する」再現困難な詰まりになる。
  "vscode.download.prss.microsoft.com"
  "main.vscode-cdn.net"           # VS Code Server 配信CDN（保険。公式が併用するホスト）

  # guideline追加: Anthropic / Claude
  "www.npmjs.com"                 # npm Webサイト
  "claude.ai"                     # Claude Web
  "www.claude.ai"                 # Claude Web
  "downloads.claude.ai"           # Claude Code native installer / update
  "platform.claude.com"           # Claude Platform（v2.1.96+必須）
  "console.anthropic.com"         # Anthropic Console

  # guideline追加: OpenAI（Codex CLI / IDE 拡張用、2026-05-18 拡充）
  "api.openai.com"            # API 呼び出し
  "auth.openai.com"           # OAuth ログイン（token_exchange）
  "platform.openai.com"       # Codex CLI 各種エンドポイント
  "chatgpt.com"               # ChatGPT 拡張連携
  "cdn.openai.com"            # 静的リソース
  "openaiapi-site.azureedge.net"  # CDN

  # guideline追加: Google APIs（GASプロジェクト・clasp用）
  "googleapis.com"
  "www.googleapis.com"
  "oauth2.googleapis.com"
  "script.googleapis.com"
  "accounts.google.com"

  # guideline追加: Kintone（社内システム連携で高頻度に使用、2026-07-17 supportcenter-task-manage 起点）
  # REST API は自社サブドメイン直下。認証まわりで accounts.cybozu.com を使うケースにも備えて許可
  "interzone.cybozu.com"
  "accounts.cybozu.com"

  # guideline追加: PyPI（Pythonプロジェクト用）
  "pypi.org"
  "files.pythonhosted.org"

  # guideline追加: Playwright（ブラウザ自動化、Chrome for Testing バイナリDL）
  "cdn.playwright.dev"
  "playwright.download.prss.microsoft.com"
  "storage.googleapis.com"
)

resolve_domain() {
  local domain="$1"
  local ips
  ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
  if [ -z "$ips" ]; then
    return 1
  fi
  while read -r ip; do
    if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
      ipset add allowed-domains "${ip}/32" -exist
    fi
  done < <(echo "$ips")
  return 0
}

# 必須ドメインの解決（失敗 = 即中断）
for domain in "${REQUIRED_DOMAINS[@]}"; do
  if ! resolve_domain "$domain"; then
    echo "[firewall] ERROR: Failed to resolve required domain: $domain"
    exit 1
  fi
done

# オプショナルドメインの解決（失敗 = 警告のみ）
for domain in "${OPTIONAL_DOMAINS[@]}"; do
  if ! resolve_domain "$domain"; then
    echo "[firewall] WARN: Failed to resolve $domain (skipping)"
  fi
done

echo "[firewall] Domain resolution complete"

# === ホストネットワーク許可 ===
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -n "$HOST_IP" ]; then
  HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
  iptables -A INPUT  -s "$HOST_NETWORK" -j ACCEPT
  iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
  echo "[firewall] Host network: $HOST_NETWORK"
else
  echo "[firewall] WARN: Could not detect host IP"
fi

# === デフォルトポリシー DROP ===
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# === ESTABLISHED/RELATED 許可 ===
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# === ipset ホワイトリストへのOUTPUT許可 ===
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# === それ以外は即時REJECT ===
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

echo "[firewall] Configuration complete"

# === 検証 ===
echo "[firewall] Verifying..."

if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
  echo "[firewall] ERROR: Reached example.com — firewall is NOT working"
  exit 1
fi
echo "[firewall] OK: example.com blocked"

if ! curl --connect-timeout 5 https://registry.npmjs.org/ >/dev/null 2>&1; then
  echo "[firewall] ERROR: Cannot reach registry.npmjs.org"
  exit 1
fi
echo "[firewall] OK: registry.npmjs.org reachable"

echo "[firewall] Verification passed — network restrictions active"
