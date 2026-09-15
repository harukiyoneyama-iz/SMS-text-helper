# Claude Code グローバル設定セットアップ（Windows PowerShell）
# 使い方: powershell -ExecutionPolicy Bypass -File claude-config\setup.ps1
#
# このスクリプトは以下を ~/.claude/ に配置します：
#   - CLAUDE.md（全体指示書）
#   - rules/*.md（コーディングスタイル等のルール）
#   - hooks/*.sh（防御フック群: 依存追加 / 秘密読取 / 破壊操作 / ホスト導入・開発開始のブロック）
#   - settings.json（Windows host 向け host-safe 権限・セキュリティ設定）
#
# 前提（重要）:
#   - 実開発は VS Code 拡張の Claude Code + Dev Container の中で行う（必須ルート）
#   - Claude Desktop / Windows ホストは会話・検索・案内用途。ホストでの install / dev / run はしない
#   - Windows host では sandbox.failIfUnavailable=true（fail-closed sandbox）を入れない（起動不能になるため）

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ClaudeDir = Join-Path $env:USERPROFILE ".claude"
$HooksPath = Join-Path $ClaudeDir "hooks"
$GitBashCommand = Get-Command bash.exe -ErrorAction SilentlyContinue | Where-Object {
    $_.Source -match '[\\/]Git[\\/].*bash\.exe$'
} | Select-Object -First 1
$GitBashCandidates = @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe",
    (Join-Path $env:ProgramFiles "Git\bin\bash.exe")
) | Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace($_) }
$GitBashPath = if ($GitBashCommand) { $GitBashCommand.Source } else { $GitBashCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1 }
$GitleaksCommand = Get-Command gitleaks -ErrorAction SilentlyContinue

Write-Host "========================================"
Write-Host "  Claude Code グローバル設定セットアップ"
Write-Host "  配置先: $ClaudeDir"
Write-Host "========================================"
Write-Host ""

# --- prerequisites ---
if (-not $GitBashPath) {
    Write-Host "[ERROR] Git Bash (bash.exe) が見つかりません"
    Write-Host "        Windows では hook 実行に Git Bash が必須です。未導入だと fail-open になります。"
    Write-Host "        Git for Windows をインストール後、再度 setup.ps1 を実行してください。"
    exit 1
}
Write-Host "[OK]   Git Bash を確認しました: $GitBashPath"

if (-not $GitleaksCommand) {
    Write-Host "[ERROR] gitleaks が見つかりません"
    Write-Host "        commit/push 前の秘密情報スキャンを fail-closed にするため必須です。"
    Write-Host "        例: winget install --id Gitleaks.Gitleaks -e --source winget （コンテナ内なら同梱済み）"
    Write-Host "        導入後、'gitleaks version' が通ることを確認して再実行してください。"
    exit 1
}
Write-Host "[OK]   gitleaks を確認しました: $($GitleaksCommand.Source)"
Write-Host ""

# ディレクトリ作成
New-Item -ItemType Directory -Force -Path (Join-Path $ClaudeDir "rules") | Out-Null
New-Item -ItemType Directory -Force -Path $HooksPath | Out-Null

# --- CLAUDE.md ---
# 2026-05-15 改修: 既存があっても「差分検出 + 警告」で設定ドリフトを可視化
$ClaudeMd = Join-Path $ClaudeDir "CLAUDE.md"
$ClaudeMdSrc = Join-Path $ScriptDir "CLAUDE.md"
if (Test-Path $ClaudeMd) {
    $srcHash = (Get-FileHash $ClaudeMdSrc -Algorithm MD5).Hash
    $dstHash = (Get-FileHash $ClaudeMd -Algorithm MD5).Hash
    if ($srcHash -eq $dstHash) {
        Write-Host "[OK]   CLAUDE.md は配布元と一致しています"
    } else {
        Write-Host "[WARN] CLAUDE.md は配布元と差分があります"
        Write-Host "       配布元: $ClaudeMdSrc"
        Write-Host "       現在:   $ClaudeMd"
        Write-Host "       差分確認: Compare-Object (Get-Content '$ClaudeMd') (Get-Content '$ClaudeMdSrc')"
        Write-Host "       強制上書き: Copy-Item '$ClaudeMdSrc' '$ClaudeMd' -Force"
        Write-Host "       （個別カスタマイズがある場合は手動マージ）"
    }
} else {
    Copy-Item $ClaudeMdSrc $ClaudeMd
    Write-Host "[OK]   CLAUDE.md を配置しました"
}

# --- rules/*.md ---
$RulesUpdated = 0
Get-ChildItem (Join-Path $ScriptDir "rules\*.md") | ForEach-Object {
    $dest = Join-Path (Join-Path $ClaudeDir "rules") $_.Name
    if (Test-Path $dest) {
        $srcHash = (Get-FileHash $_.FullName -Algorithm MD5).Hash
        $dstHash = (Get-FileHash $dest -Algorithm MD5).Hash
        if ($srcHash -ne $dstHash) {
            Copy-Item $_.FullName $dest -Force
            Write-Host "[UPDATE] rules/$($_.Name) を更新しました"
            $RulesUpdated++
        }
    } else {
        Copy-Item $_.FullName $dest
        Write-Host "[OK]     rules/$($_.Name) を配置しました"
        $RulesUpdated++
    }
}
if ($RulesUpdated -eq 0) {
    Write-Host "[SKIP] rules/ は全て最新です"
}

# --- hooks ---
# 全 hook を配布対象に（block-secret-read.sh / validate-package-install.sh 等）
Get-ChildItem (Join-Path $ScriptDir "hooks\*.sh") | ForEach-Object {
    $dest = Join-Path $HooksPath $_.Name
    Copy-Item $_.FullName $dest -Force
    Write-Host "[OK]   hooks/$($_.Name) を配置しました"
}

# --- scripts（監査スクリプト） ---
# 配布元はリポジトリの scripts/audit-projects.sh（単一ソース）
# guideline リポジトリ以外（各プロジェクトの .devcontainer/claude-config/ 配布版）から
# 実行された場合は存在しないため、ガードして SKIP する（setup.sh と同じ挙動）。
# ガードなしだと $ErrorActionPreference=Stop により Copy-Item が throw → ここで中断し、
# 後続の settings.json（deny ルール・hook 配線）が未配置の fail-open な中途半端状態になる。
$ScriptsDir = Join-Path $ClaudeDir "scripts"
New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null
$AuditSrc = Join-Path (Split-Path -Parent $ScriptDir) "scripts\audit-projects.sh"
if (Test-Path $AuditSrc) {
    Copy-Item $AuditSrc (Join-Path $ScriptsDir "audit-projects.sh") -Force
    Write-Host "[OK]   scripts/audit-projects.sh を配置しました"
} else {
    Write-Host "[SKIP] scripts/audit-projects.sh が見つかりません（guideline 外からの実行。監査はホストの guideline で行う）"
}

# --- templates/manifest.yml（監査スクリプトが参照） ---
$TemplatesDir = Join-Path $ClaudeDir "templates"
New-Item -ItemType Directory -Force -Path $TemplatesDir | Out-Null
$ManifestSrc = Join-Path (Split-Path -Parent $ScriptDir) "templates\manifest.yml"
if (Test-Path $ManifestSrc) {
    Copy-Item $ManifestSrc (Join-Path $TemplatesDir "manifest.yml") -Force
    Write-Host "[OK]   templates/manifest.yml を配置しました"
} else {
    Write-Host "[SKIP] templates/manifest.yml が見つかりません（guideline 外からの実行）"
}

# --- settings.json ---
# Windows host では sandbox が使えないため、settings.windows.json を配布する
$SettingsPath = Join-Path $ClaudeDir "settings.json"
$SettingsSrc = Join-Path $ScriptDir "settings.windows.json"
$RepairScript = Join-Path $ScriptDir "repair-windows-host-settings.ps1"
if (Test-Path $SettingsPath) {
    $srcContent = Get-Content $SettingsSrc -Raw | ConvertFrom-Json
    $dstContent = Get-Content $SettingsPath -Raw | ConvertFrom-Json
    $srcVersion = if ($srcContent.PSObject.Properties['_version']) { $srcContent._version } else { "unknown" }
    $dstVersion = if ($dstContent.PSObject.Properties['_version']) { $dstContent._version } else { "unknown" }

    if ($srcVersion -eq $dstVersion) {
        Write-Host "[OK]   settings.json は Windows host 配布元と同じ version ($srcVersion)"
    } else {
        Write-Host "[WARN] settings.json の version が古い可能性があります"
        Write-Host "       配布元 _version: $srcVersion"
        Write-Host "       現在  _version: $dstVersion"
        Write-Host "       Windows host 用の deny / hook / sandbox 互換設定が未反映の可能性があります"
        Write-Host ""
        Write-Host "       推奨対応:"
        Write-Host "         1. 個人設定を保持したまま修復:"
        Write-Host "            powershell -ExecutionPolicy Bypass -File `"$RepairScript`""
        Write-Host "         2. 完全上書き（個別カスタマイズ失う）:"
        Write-Host "         `$hooksDir = '$($HooksPath -replace '\\', '/')'"
        Write-Host "         `$content = (Get-Content '$SettingsSrc' -Raw) -replace '\{\{HOOKS_DIR\}\}', `$hooksDir"
        Write-Host "         [System.IO.File]::WriteAllText('$SettingsPath', `$content, (New-Object System.Text.UTF8Encoding `$false))"
    }
} else {
    $hooksDir = $HooksPath -replace '\\', '/'
    $content = Get-Content $SettingsSrc -Raw
    $content = $content -replace '\{\{HOOKS_DIR\}\}', $hooksDir
    # BOM なし UTF-8 で書き出す（PS5.1 の -Encoding UTF8 は BOM 付きなので不可）
    [System.IO.File]::WriteAllText($SettingsPath, $content, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "[OK]   settings.json を配置しました"
}

Write-Host ""
Write-Host "========================================"
Write-Host "  セットアップ完了"
Write-Host ""
Write-Host "  次のステップ:"
Write-Host "  1. Windows host で既存 settings.json がある場合は repair-windows-host-settings.ps1 を実行"
Write-Host "  2. 実開発は VS Code 拡張 + Dev Container の中で行う（Reopen in Container）"
Write-Host "     Claude Desktop / Windows 本体は会話・検索・案内用。install / dev / run は止まります"
Write-Host "  3. Claude Code を再起動して設定反映を確認"
Write-Host "========================================"
