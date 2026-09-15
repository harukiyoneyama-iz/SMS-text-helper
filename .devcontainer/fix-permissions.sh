#!/bin/bash
# /usr/local/bin/fix-permissions.sh
#
# DevContainer 起動時に Named Volume 配下の所有権を補正する。
#
# 背景:
#   - Named Volume `claude-session-env-project-template-webapp` は一度作られると
#     mount 時に image data の initial copy をしない。
#   - 古いユーザー（例: developer）で作られた Volume が残ったまま
#     新 Dockerfile（USER node）でビルドすると所有権がずれて EACCES になる。
#
# 設計（2026-05-13 Codex レビューによる確定）:
#   - root として実行される前提（sudoers で NOPASSWD 許可）
#   - 対象は Named Volume 配下のみ。workspace bind / memory bind は触らない
#     （Linux/Mac でホスト所有権を書き換える副作用回避のため）
#   - 実書き込み probe で「本当に書けるか」確認（test -w は Windows 9p で
#     不正確なことがあるため）
#   - 失敗時は exit 1 で起動を止める（waitFor: postStartCommand と組み合わせて
#     非エンジニアでも問題に気付けるように）
#
# 参考:
#   - feedback_claude_home_isolation.md（uid mismatch 落とし穴）
set -euo pipefail

PROJECT_NAME="${1:-}"
if [ -z "$PROJECT_NAME" ]; then
  echo "[fix-permissions] FATAL: PROJECT_NAME 引数が必要です" >&2
  echo "  使い方: sudo /usr/local/bin/fix-permissions.sh <project-name>" >&2
  exit 1
fi

# 対象は原則 Named Volume 配下のみ
# - session-env: claude-session-env-project-template-webapp Volume
# - codex-home: codex-home-project-template-webapp Volume (2026-05-18 追加)
# - workspace: Docker named volume の場合のみ補正。Windows bind らしき fs は触らない。
# - .ssh: SSH config の StrictModes 対策。内容は表示しない。
# 注: memory bind は対象外（副作用大）
TARGETS=(
  "/home/node/.claude/session-env"
  "/home/node/.codex"
)

probe_writable() {
  local t="$1"
  local probe="$t/.fix-perms-probe-$$"
  # node ユーザーとして書き込み試行（root probe では権限問題を検出できない）
  runuser -u node -- bash -c "touch '$probe' && rm '$probe'" 2>/dev/null
}

ensure_git_ssh_aliases() {
  local workspace_dir="$1"
  local ssh_dir="$2"
  local config="$ssh_dir/config"

  [ -d "$workspace_dir/.git" ] || return 0

  mkdir -p "$ssh_dir"
  if [ ! -e "$config" ]; then
    install -o node -g node -m 600 /dev/null "$config"
  fi

  # read-only bind の config は直せない。fail-fast 診断は後段の ssh -G に任せる。
  [ -w "$config" ] || return 0

  local hosts
  hosts=$(git -C "$workspace_dir" remote -v 2>/dev/null \
    | awk '{print $2}' \
    | sed -nE 's#^[^@]+@([^:/]+)[:/].*#\1#p' \
    | sort -u)

  local host
  while IFS= read -r host; do
    [ -n "$host" ] || continue
    case "$host" in
      github.com|ssh.github.com)
        continue
        ;;
      github-*|github_*)
        if ! grep -qE "^[[:space:]]*Host[[:space:]]+$host([[:space:]]|\$)" "$config" 2>/dev/null; then
          {
            echo ""
            echo "# Managed by fix-permissions.sh for project remote alias"
            echo "Host $host"
            echo "  HostName github.com"
            echo "  User git"
            echo "  AddKeysToAgent no"
            echo "  StrictHostKeyChecking accept-new"
          } >> "$config"
          echo "[fix-permissions] added SSH host alias: $host -> github.com"
        fi
        ;;
    esac
  done <<< "$hosts"
}

is_probably_host_bind_fs() {
  local target="$1"
  local fs_type
  fs_type=$(stat -f -c %T "$target" 2>/dev/null || echo "unknown")
  case "$fs_type" in
    9p|cifs|smb*|fuseblk|fuse.*|osxfs|vboxsf|prl_fs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

failed=0
for target in "${TARGETS[@]}"; do
  # ディレクトリが無ければ作成
  if [ ! -d "$target" ]; then
    mkdir -p "$target"
  fi

  # 既に node ユーザーから書ければ何もしない（Linux/Mac で no-op）
  if probe_writable "$target"; then
    echo "[fix-permissions] OK (writable): $target"
    continue
  fi

  # 書けない → 所有権を node:node に補正
  echo "[fix-permissions] FIXING ownership: $target"
  echo "  before: $(ls -ld "$target")"
  chown -R node:node "$target"

  # 補正後に再 probe
  if probe_writable "$target"; then
    echo "[fix-permissions] FIXED: $target"
    echo "  after:  $(ls -ld "$target")"
  else
    failed=$((failed + 1))
    {
      echo "[fix-permissions] WARN: still not writable after chown"
      echo "  target: $target"
      echo "  owner:  $(ls -ld "$target")"
      echo "  diagnose:"
      echo "    docker exec -u root <container> bash -c 'id; ls -ld $target; runuser -u node -- touch $target/.probe'"
    } >&2
  fi
done

# workspace named volume が root-owned だと git / editor / package manager が詰まる。
# Windows bind mount らしき filesystem ではホスト所有権を壊さないよう chown しない。
WORKSPACE_DIR="/workspace/$PROJECT_NAME"
if [ -d "$WORKSPACE_DIR" ]; then
  if probe_writable "$WORKSPACE_DIR"; then
    echo "[fix-permissions] OK (writable): $WORKSPACE_DIR"
  elif is_probably_host_bind_fs "$WORKSPACE_DIR"; then
    echo "[fix-permissions] WARN: workspace is not writable but looks like a host bind mount, skipping chown: $WORKSPACE_DIR" >&2
  else
    echo "[fix-permissions] FIXING ownership: $WORKSPACE_DIR"
    echo "  before: $(ls -ld "$WORKSPACE_DIR")"
    chown -R node:node "$WORKSPACE_DIR"
    if probe_writable "$WORKSPACE_DIR"; then
      echo "[fix-permissions] FIXED: $WORKSPACE_DIR"
      echo "  after:  $(ls -ld "$WORKSPACE_DIR")"
    else
      failed=$((failed + 1))
      echo "[fix-permissions] WARN: workspace still not writable after chown: $WORKSPACE_DIR" >&2
    fi
  fi
fi

# OpenSSH は ~/.ssh/config が group/world writable、または所有者不正だと即停止する。
# Windows/Dev Container の mount・copy 経由で崩れやすいので起動時に正規化する。
SSH_DIR="/home/node/.ssh"
ensure_git_ssh_aliases "$WORKSPACE_DIR" "$SSH_DIR"
if [ -d "$SSH_DIR" ]; then
  echo "[fix-permissions] FIXING ssh permissions: $SSH_DIR"
  chown -R node:node "$SSH_DIR" 2>/dev/null || true
  chmod 700 "$SSH_DIR" 2>/dev/null || true
  [ -f "$SSH_DIR/config" ] && chmod 600 "$SSH_DIR/config" 2>/dev/null || true
  [ -f "$SSH_DIR/known_hosts" ] && chmod 644 "$SSH_DIR/known_hosts" 2>/dev/null || true
  [ -f "$SSH_DIR/authorized_keys" ] && chmod 600 "$SSH_DIR/authorized_keys" 2>/dev/null || true
  find "$SSH_DIR" -type f -name "*.pub" -exec chmod 644 {} \; 2>/dev/null || true
  find "$SSH_DIR" -type f \( -name "id_*" -o -name "*.pem" -o -name "*.key" \) ! -name "*.pub" -exec chmod 600 {} \; 2>/dev/null || true

  if command -v ssh >/dev/null 2>&1; then
    if runuser -u node -- ssh -G github.com >/dev/null 2>&1; then
      echo "[fix-permissions] OK (ssh config accepted)"
    else
      failed=$((failed + 1))
      {
        echo "[fix-permissions] WARN: ssh config is still rejected by OpenSSH"
        echo "  likely cause: ~/.ssh/config is a read-only bind mount with host-side permissions"
        echo "  fix: remove .ssh/config and .ssh/known_hosts mounts from devcontainer.json"
        echo "       then use VS Code Dev Containers ssh-agent forwarding"
        echo "  diagnose:"
        echo "    ls -ld /home/node/.ssh"
        echo "    ls -l /home/node/.ssh/config"
      } >&2
    fi
  fi
fi

if [ "$failed" -gt 0 ]; then
  echo "[fix-permissions] FATAL: $failed target(s) still not writable. Container start aborted." >&2
  exit 1
fi

# git safe.directory（workspace を Docker named volume にした場合の dubious ownership 回避）
# Dockerfile 側の safe.directory '/workspace/*' は trailing-glob で git 2.45+ 前提のため、
# Debian bookworm の git 2.39 では効かない（/workspace/<proj> にマッチしない）。
# PROJECT_NAME が判明しているここで完全一致パスを登録し、git バージョンに依存せず確実に回避する。
if ! git config --system --get-all safe.directory 2>/dev/null | grep -qx "/workspace/$PROJECT_NAME"; then
  git config --system --add safe.directory "/workspace/$PROJECT_NAME"
  echo "[fix-permissions] git safe.directory 登録: /workspace/$PROJECT_NAME"
fi

echo "[fix-permissions] done"
