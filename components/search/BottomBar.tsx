interface BottomBarProps {
  selectedCount: number;
}

/** ②文章案づくりは次の区切りで実装するため、ボタンは押せない状態で用意しておく */
export function BottomBar({ selectedCount }: BottomBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between bg-[var(--bottom-bar-bg)] px-4 py-3 text-white">
      <span className="text-sm">{selectedCount}件を選択中</span>
      <button
        type="button"
        disabled
        title="準備中（次の区切りで実装します）"
        className="cursor-not-allowed rounded bg-white/20 px-4 py-1.5 text-sm"
      >
        文章案をつくる →
      </button>
    </div>
  );
}
