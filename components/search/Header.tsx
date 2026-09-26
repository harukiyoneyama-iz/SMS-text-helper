import { formatDateTime } from "@/lib/client/format";

interface HeaderProps {
  fetchedAt: string | null;
  masked: boolean;
  onToggleMasked: () => void;
}

/**
 * ヘッダー。データ取得日時は「画面を描画した時刻」ではなく
 * data/templates.json の更新日時（= BigQuery から取得した日時）を出す
 * （docs/DEVELOPMENT_PLAN.md §⑥「最終更新日時を常時表示」）
 */
export function Header({ fetchedAt, masked, onToggleMasked }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--panel)]">
      <div className="bg-[var(--real-data-bg)] px-4 py-1 text-center text-xs text-white">
        ⚠ 実データを扱っています。伏せモードがONでも、②文章案の編集欄は伏せられません
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="text-lg font-bold">SMS文例検索ツール</h1>
          <p className="text-xs text-[var(--text-sub)]">
            データ取得日時: {fetchedAt ? formatDateTime(fetchedAt) : "—"}
          </p>
        </div>
        <nav className="flex items-center gap-2 text-sm" aria-label="ステップ">
          <span className="rounded-full bg-[var(--accent)] px-3 py-1 font-bold text-white">
            ① 文例をさがす
          </span>
          <span
            className="cursor-not-allowed rounded-full bg-[var(--chip-bg)] px-3 py-1 text-[var(--text-sub)]"
            title="準備中（次の区切りで実装します）"
          >
            ② 文章案をつくる
          </span>
          <span
            className="cursor-not-allowed rounded-full bg-[var(--chip-bg)] px-3 py-1 text-[var(--text-sub)]"
            title="準備中（次の区切りで実装します）"
          >
            ③ 依頼文を出す
          </span>
        </nav>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={masked} onChange={onToggleMasked} />
          伏せモード
        </label>
      </div>
      {masked && (
        <div className="bg-[var(--mask-bg)] px-4 py-1 text-center text-xs text-white">
          伏せモードON: 会社名・店舗名・電話番号・URLを伏せて表示しています
        </div>
      )}
    </header>
  );
}
