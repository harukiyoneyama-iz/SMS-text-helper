FROM node:20-slim

# ============================================================
# T08: supply chain 対策 — インストールバージョンを固定
# 更新時は以下リリースページで最新版を確認し ARG の値を変更すること:
#   Claude Code: https://github.com/anthropics/claude-code/releases
#   Codex CLI:   https://github.com/openai/codex/releases
# ビルド時に上書きする場合: docker build --build-arg CODEX_VERSION=x.y.z ...
# ============================================================
ARG CODEX_VERSION=0.133.0
ARG CLAUDE_CODE_VERSION=2.1.191

WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init git curl sudo ca-certificates openssh-client \
    iptables ipset iproute2 dnsutils aggregate jq \
    bubblewrap socat strace \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@${CODEX_VERSION}

# bubblewrap (bwrap) と socat: 使える環境で Claude Code の sandbox を有効化するため同梱（必須ではない）。
# settings.json は failIfUnavailable=false（fail-OPEN）: WSL2 は非特権 user namespace で bwrap 初期化に
# 失敗しうるため、sandbox 不可でも permissions/hooks 下で起動を継続する。
# ⚠️ failIfUnavailable=true（fail-closed）にしないこと: WSL2 で拡張の Bash が全拒否され起動不能になる
#    （過去のフリート障害 commit 40fb3a5）。単一ソースは manifest.yml / claude-config/settings.json。

# ============================================================
# gitleaks（秘密情報スキャナ）をコンテナに同梱
# 理由: .githooks/pre-commit・pre-push は gitleaks 未導入なら commit/push を止める fail-closed。
#       実開発と commit は Dev Container 内で行う正式運用のため、コンテナにも gitleaks が必須。
#       無いと利用者が --no-verify を常用 → secret scan が事実上無効化される。
# supply chain 対策: バージョン + sha256 を固定（version pin だけでは不十分。Codex レビュー反映）。
#   更新時は https://github.com/gitleaks/gitleaks/releases の
#   gitleaks_<ver>_checksums.txt から linux_x64 / linux_arm64 の sha256 を更新すること。
# 取得は build 時のため runtime の init-firewall(default-deny)の影響は受けない。
# ============================================================
ARG GITLEAKS_VERSION=8.30.1
ARG GITLEAKS_SHA256_X64=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
ARG GITLEAKS_SHA256_ARM64=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080
RUN set -eu; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  gl_arch="x64";   gl_sha="${GITLEAKS_SHA256_X64}";; \
      aarch64) gl_arch="arm64"; gl_sha="${GITLEAKS_SHA256_ARM64}";; \
      *) echo "unsupported arch for gitleaks: $arch"; exit 1;; \
    esac; \
    curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${gl_arch}.tar.gz" -o /tmp/gitleaks.tar.gz; \
    echo "${gl_sha}  /tmp/gitleaks.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks; \
    rm -f /tmp/gitleaks.tar.gz; \
    chmod +x /usr/local/bin/gitleaks; \
    gitleaks version

EXPOSE 3000

# ネットワークファイアウォール
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh \
    && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall \
    && chmod 0440 /etc/sudoers.d/node-firewall

# 起動時の所有権補正（Named Volume の stale ownership 対策）
# 詳細は feedback_claude_home_isolation.md 参照
COPY fix-permissions.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/fix-permissions.sh \
    && echo "node ALL=(root) NOPASSWD: /usr/local/bin/fix-permissions.sh" > /etc/sudoers.d/node-fix-permissions \
    && chmod 0440 /etc/sudoers.d/node-fix-permissions

# Claude Code 共通設定（CLAUDE.md / rules / hooks）を Named Volume に初期配布
# Volume が空の初回マウント時に image data が Volume にコピーされる仕組みを利用。
# 2 回目以降は Volume 側が優先されるため、管理対象（settings.json/CLAUDE.md/rules/hooks）は
# postStart の refresh-claude-config.sh が /opt/claude-config-dist（配布原本）から毎起動同期する
# （認証・履歴などの個人状態は触らない。volume rm 不要で設定更新が既存 volume に届く）
COPY claude-config /home/node/.claude
COPY claude-config /opt/claude-config-dist
COPY refresh-claude-config.sh /usr/local/bin/
# /home/node/.codex は Codex IDE 拡張 / CLI の認証保存先（codex-home Named Volume の mount 先）
# Volume mount 前に node 所有のディレクトリを用意しておかないと root 所有の空 dir になる
# hooks の chmod +x は必須: git index が 644 のままだと WSL2(ext4) からのビルドで 644 のまま
# volume に入り、PreToolUse hook が permission denied で silent fail（防御 4 hook の無効化）になる
RUN mkdir -p /home/node/.claude/session-env /home/node/.codex /home/node/.local/bin \
    && chmod +x /home/node/.claude/hooks/*.sh /opt/claude-config-dist/hooks/*.sh \
                /usr/local/bin/refresh-claude-config.sh \
    && chown -R node:node /home/node/.claude /home/node/.codex /home/node/.local /opt/claude-config-dist

# workspace named volume 化時の ownership fallback。移行スクリプト側で chown するのが本筋だが、
# 既存 volume / 手動移行の dubious ownership を /workspace 配下に限定して吸収する。
RUN git config --system --add safe.directory '/workspace/*'

USER node

# Claude Code は公式 native installer 経由でインストール（バージョン固定）
# （2026/02 以降 npm 版 @anthropic-ai/claude-code は deprecated）
# install.sh の -s -- <version> 引数でバージョンを固定できる（公式確認済み）
RUN curl -fsSL https://claude.ai/install.sh | bash -s -- ${CLAUDE_CODE_VERSION}

# build-time assertion: インストールされたバージョンを確認（supply chain 攻撃検知）
# PATH 設定の前後に依存しないよう、絶対パス /home/node/.local/bin/claude で検証する
# （PATH 未設定の段階で `claude` だけだと "claude: not found" で誤って失敗するため）
RUN /home/node/.local/bin/claude --version 2>&1 | grep -qF "${CLAUDE_CODE_VERSION}" \
    || { echo "⚠️  claude version mismatch (expected: ${CLAUDE_CODE_VERSION}, got: $(/home/node/.local/bin/claude --version 2>&1 | head -1))"; exit 1; }

# native installer の配置先を PATH に追加
ENV PATH="/home/node/.local/bin:${PATH}"

# corepack のダウンロード確認プロンプト [Y/n] を無効化（非エンジニア展開で対話停止を防ぐ）
# package.json の packageManager が Dockerfile pin と異なる版を指すと、corepack がその版を
# 取得しようとして対話確認を出し、リビルド（postCreate の pnpm install）が止まる。これを抑止する。
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# corepack: pnpm / yarn / pnpx の shim を node user 領域に展開
# 理由: corepack 自体は node 20 に同梱だが、enable せずに `pnpm` を叩くと command not found。
#       既定の /usr/local/bin は node user では書けないため、PATH に既に通っている
#       /home/node/.local/bin を --install-directory に指定する。
#       これによりコンテナに入った直後から `pnpm` / `yarn` / `pnpx` が直接使える。
#
# pnpm のバージョンは node 20 互換版に固定（要相談・supply chain ハードニング）:
#   - pnpm 11.x は Node 22.13+ 必須（node:sqlite 組み込み利用）→ node:20-slim と非互換
#   - corepack が引いてくる最新を放置すると、pnpm の major up でビルドが壊れる
#   - `corepack prepare pnpm@${PNPM_VERSION} --activate` で build 時に pin + cache
#   - 末尾の `pnpm --version` を build-time assertion 化（実行確認）。shim だけでは不十分（実際に動かないと意味なし）
# 更新時: https://github.com/pnpm/pnpm/releases で対応 Node version を確認してから ARG 値を変更
# 注: 取得は build 時のため runtime の init-firewall(default-deny)の影響を受けない
ARG PNPM_VERSION=10
RUN corepack enable --install-directory /home/node/.local/bin \
    && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && test -e /home/node/.local/bin/pnpm \
    && test -e /home/node/.local/bin/pnpx \
    && test -e /home/node/.local/bin/yarn \
    && pnpm --version

ENTRYPOINT ["dumb-init", "--"]
