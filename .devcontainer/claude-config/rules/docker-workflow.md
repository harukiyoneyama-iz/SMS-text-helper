# Docker / devcontainer ワークフロー

## devcontainer（必須ルート）

devcontainer を使うと、IDE（VS Code）と Claude Code 自体がコンテナ内で動作する。
ホスト PC のファイルシステムやコマンド実行から完全に隔離されるため、最も安全。

### 起動方法
1. VS Code でプロジェクトフォルダを開く
2. コマンドパレット → `Dev Containers: Reopen in Container`
3. 初回はビルドに数分かかる。以降はキャッシュされて高速

### テンプレート
`C:\CursorPJ\guideline\templates\` に配置:
- **GAS** → `templates/gas/`（.devcontainer/, Dockerfile, docker-compose.yml, .dockerignore）
- **Webapp** → `templates/webapp/`（上記 + .env.example）

各プロジェクトへの反映は `bash scripts/sync-template.sh <project> --apply` で行う。

## Docker 環境の提案タイミング

以下の場合に**ユーザーに確認してから**提案する（自動提案しない）:
- ユーザーが明示的に Docker / devcontainer に言及した場合
- ユーザーが「環境構築」「本番デプロイ」を意識した発言をした場合

簡単なスクリプト、プロトタイプ、ローカル完結するツールでは提案しない。

## セットアップ手順

1. GAS / Webアプリ を確認
2. `bash scripts/sync-template.sh <project> --apply` でテンプレを反映
3. VS Code で「Reopen in Container」
4. 詳細は `SETUP_GUIDE.md` / `ONBOARDING.md` を参照

## DevContainer から GitHub への git push 認証（OS別）

**原則**: コンテナ内に秘密鍵をマウントしない（エンジニア推奨）。
OS によって標準方式を分け、例外だけ SSH deploy key を使う。

### OS別の標準方式

| OS / IDE | 標準方式 | 状態 |
|---|---|---|
| Windows（VS Code / Cursor） | **HTTPS + Git Credential Manager (GCM)** | ✅ 標準採用 |
| Mac（VS Code / Cursor） | **SSH agent forwarding** | ✅ 標準採用 |
| Windows で repo 単位に権限分離が必要な場合 | **SSH agent forwarding + deploy key** | 例外採用 |

### なぜ Windows は HTTPS + GCM を標準にするか

Windows の ssh-agent は名前付きパイプ（`\\.\pipe\openssh-ssh-agent`）を使う。
Linux コンテナが期待する UNIX ソケットへ変換する必要があり、IDE / Dev Containers 拡張の実装差で不安定になりやすい。
HTTPS + GCM は Windows Credential Manager を使うため、AI 担当メンバーへ配る標準として説明・復旧・監査が容易。

詳細経緯: `~/.claude/projects/C--CursorPJ-guideline/memory/project_ssh_forwarding_issue.md`

### Windows での設定（HTTPS + GCM 標準）

#### 1. ホスト側 Git Credential Manager を確認

PowerShell で確認:

```powershell
git config --global credential.helper
```

期待値:

```text
manager
```

未設定なら Git for Windows / Git Credential Manager を入れ、GitHub へ一度サインインする。

#### 2. リポジトリ URL を HTTPS にする

ホストまたはコンテナ内のプロジェクトルートで確認:

```bash
git remote -v
```

SSH になっている新規配布プロジェクトは HTTPS に寄せる:

```bash
git remote set-url origin https://github.com/<org>/<repo>.git
```

#### 3. VS Code / Cursor の Git Credential Sharing で forward

- Dev Containers 拡張が Git Credential Helper をコンテナに共有する
- 初回 push 時に Windows 側 GCM が GitHub 認証を処理する
- 以降はコンテナ内 git がホストの GCM 経由で認証情報を取得する
- PAT を手で `.env` / `devcontainer.json` / コンテナ内ファイルへ書かない

コンテナ内確認:

```bash
git remote -v
git config --show-origin --get-all credential.helper
git push --dry-run origin HEAD
```

参考: [VS Code 公式 - Sharing Git credentials with your container](https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials)

### Mac での設定（SSH agent forwarding 標準）

#### 1. ホスト側 `~/.ssh/config`

```
Host github.com
    HostName github.com
    IdentityFile ~/.ssh/<your_key>
    User git
    UseKeychain yes        # Mac の Keychain からパスフレーズ自動取得
    AddKeysToAgent yes     # 起動時に ssh-agent へ自動登録
```

#### 2. 鍵を agent に登録（初回のみ）

```bash
ssh-add --apple-use-keychain ~/.ssh/<your_key>
```

#### 3. devcontainer 側

- `devcontainer.json` に `.ssh` のマウントを書かない（VS Code Dev Containers 拡張が自動で `SSH_AUTH_SOCK` を forward する）
- Dockerfile に `openssh-client` を含める（git の SSH 通信に必要）

参考: [VS Code 公式 - Sharing Git credentials with your container](https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials#_using-ssh-keys)

### Windows の例外: repo 単位に権限分離したい場合だけ SSH deploy key

次の条件に当てはまる場合だけ、Windows でも SSH agent forwarding + deploy key を使ってよい。

- repo ごとに push 権限を明確に分離したい
- GitHub Deploy keys の登録・ローテーションを管理できる
- ホスト側 `ssh-agent` に鍵を登録し、コンテナには秘密鍵を置かない
- `devcontainer.json` に `.ssh/config` / `known_hosts` / 秘密鍵を bind mount しない

ホスト PowerShell 例:

```powershell
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\<repo_deploy_key>
ssh-add -l
```

コンテナ内確認:

```bash
echo $SSH_AUTH_SOCK
ssh-add -l
ssh -T git@github.com
```

`Hi ... You've successfully authenticated, but GitHub does not provide shell access.` は成功。

### やってはいけないこと（共通）

- ❌ 秘密鍵（`id_rsa` 等）をコンテナにマウント
- ❌ PAT を `.env` や devcontainer.json に直書き
- ❌ 永続的な PAT（無期限）の使用
- ❌ 個人鍵を複数人で共有
- ❌ Windows 標準配布で repo ごとの SSH deploy key を増やす
