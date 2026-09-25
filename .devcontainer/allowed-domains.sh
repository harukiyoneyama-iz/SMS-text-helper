# ============================================================
# 許可ドメイン定義（データのみ。副作用のあるコードを書かないこと）
#
# ⚠️ このファイルは guideline テンプレート由来ではない本プロジェクト固有の追加。
#    init-firewall.sh と refresh-allowed-ips.sh（どちらも root で source する）の
#    二重管理を避けるために切り出した。sync-template.sh --apply を実行すると
#    init-firewall.sh 側の配列がインライン定義に巻き戻るため、実行後は復元すること
#    （docs/DEVELOPMENT_PLAN.md §④ の復元チェックリスト参照）。
#
# root が source する前提のため、パーミッションは 0444 root:root で固定する
# （Dockerfile 側で chmod 済み）。node から書き換えられないことが前提。
# ============================================================

# 必須ドメイン（解決失敗時はコンテナ起動を中断）
REQUIRED_DOMAINS=(
  "registry.npmjs.org"            # npm パッケージ取得
  "api.anthropic.com"             # Claude Code API
  # 本プロジェクト（SMS文例検索ツール）の中核。繋がらなければ何もできないため必須扱いにする。
  # 認証に使う oauth2.googleapis.com / accounts.google.com は OPTIONAL 側に既出。
  "bigquery.googleapis.com"       # BigQuery API（gnote_sms_catalog のビュー参照）
  # 2026-09-25: なりすまし用サービスアカウント（impersonation）は不要になった
  # （内田さん回答。米山さん本人のアカウントに直接権限が付与されている）。
  # iamcredentials.googleapis.com はこの用途専用のエンドポイントのため削除。
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
