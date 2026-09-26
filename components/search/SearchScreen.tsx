"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsolidatedTemplate, Filters, TemplatesApiResponse } from "./types";
import { DEFAULT_FILTERS } from "./types";
import { buildQueryString } from "./buildQuery";
import { Header } from "./Header";
import { FilterSidebar } from "./FilterSidebar";
import { TemplateCard } from "./TemplateCard";
import { DetailPanel } from "./DetailPanel";
import { BottomBar } from "./BottomBar";

type Status = "loading" | "loading_more" | "ready" | "error" | "not_found";

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function SearchScreen() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [qDraft, setQDraft] = useState("");
  // ページ番号は描画に使わない（さらに表示ボタンの内部カウンタ）ため ref で持つ。
  // state にすると「フィルタが変わったら1ページ目に戻す」effect内でのsetStateが
  // カスケードレンダリングの警告(react-hooks/set-state-in-effect)になるため
  const pageRef = useRef(1);
  // 直近に発行したリクエストの通し番号。フィルタ変更直後に「さらに表示」を押す等で
  // リクエストが前後すると、遅れて届いた古いレスポンスが新しい結果を上書きしてしまう
  // （2026-09-26 code-review 指摘）。番号が最新のものと一致するレスポンスだけ反映する
  const requestIdRef = useRef(0);
  const [items, setItems] = useState<ConsolidatedTemplate[]>([]);
  const [meta, setMeta] = useState<Omit<TemplatesApiResponse, "items"> | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const myRequestId = ++requestIdRef.current;
      setStatus(append ? "loading_more" : "loading");
      try {
        const qs = buildQueryString(filters, pageNum);
        const res = await fetch(`/api/templates?${qs}`);
        if (myRequestId !== requestIdRef.current) return; // 後続のリクエストに追い抜かれた

        if (res.status === 503) {
          const body = await res.json();
          setStatus("not_found");
          setErrorMessage(body.error ?? "データが見つかりません");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "取得に失敗しました" }));
          setStatus("error");
          setErrorMessage(body.error ?? "取得に失敗しました");
          return;
        }
        const data: TemplatesApiResponse = await res.json();
        if (myRequestId !== requestIdRef.current) return;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setMeta(data);
        setStatus("ready");
      } catch {
        if (myRequestId !== requestIdRef.current) return;
        setStatus("error");
        setErrorMessage("通信エラーが発生しました。ページを再読み込みしてください");
      }
    },
    [filters],
  );

  // キーワードは入力のたびに叩かず、300ms止まってから確定する
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === qDraft ? prev : { ...prev, q: qDraft }));
    }, 300);
    return () => clearTimeout(timer);
  }, [qDraft]);

  // フィルタが変わったら1ページ目から取り直す。
  // fetchPage は非同期でサーバのデータと同期する処理そのもの（Reactの外部システムとの同期）
  // であり、react-hooks/set-state-in-effect が想定する「エフェクト内で直接setStateする」
  // パターンとは異なるため、このルールに限り無効化する
  useEffect(() => {
    pageRef.current = 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(1, false);
  }, [fetchPage]);

  function updateArrayFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({
      ...prev,
      [key]: toggleInArray(prev[key] as string[], value),
    }));
  }

  function updatePriceTier(segments: number) {
    setFilters((prev) => ({
      ...prev,
      priceTiers: toggleInArray(prev.priceTiers, segments),
    }));
  }

  function updateToggle(key: keyof Filters) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetFilters() {
    setFilters((prev) => ({ ...DEFAULT_FILTERS, masked: prev.masked }));
    setQDraft("");
  }

  function loadMore() {
    pageRef.current += 1;
    void fetchPage(pageRef.current, true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const detailItem = items.find((i) => i.id === detailId) ?? null;

  function copyBody(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {
      // クリップボードが使えない環境では黙って諦める（コピー操作自体は必須機能ではないため）
    });
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-20">
      <Header
        fetchedAt={meta?.fetchedAt ?? null}
        masked={filters.masked}
        onToggleMasked={() => updateToggle("masked")}
      />

      {status === "not_found" && (
        <div className="mx-auto max-w-[600px] p-8 text-center">
          <p className="mb-4 text-sm">{errorMessage}</p>
          <code className="rounded bg-[var(--chip-bg)] px-2 py-1 text-sm">pnpm fetch:templates</code>
          <p className="mt-4 text-xs text-[var(--text-sub)]">
            を実行してテンプレート一覧を取得してから、このページを再読み込みしてください。
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="mx-auto max-w-[600px] p-8 text-center text-sm text-[var(--warn-text)]">
          {errorMessage}
        </div>
      )}

      {status !== "not_found" && status !== "error" && (
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:flex-row">
          <FilterSidebar
            filters={filters}
            facets={meta?.facets ?? null}
            onChangeArray={updateArrayFilter}
            onChangePriceTier={updatePriceTier}
            onChangeToggle={updateToggle}
            onResetFilters={resetFilters}
          />

          <main className="min-w-0 flex-1">
            <input
              type="search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="キーワード（本文・テンプレート名）"
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm"
            />

            <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-sub)]">
              <span>
                {meta
                  ? `${meta.matchedCount}件表示中（母数${meta.poolCount}件・全${meta.totalCount}件）`
                  : "読み込み中..."}
                {meta && meta.invalidCount > 0 && (
                  <span className="ml-2 text-[var(--warn-text)]">
                    ⚠ 形式が不正で除外: {meta.invalidCount}件
                  </span>
                )}
              </span>
              <select
                value={filters.sort}
                onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as Filters["sort"] }))}
                className="rounded border border-[var(--border)] px-2 py-1"
              >
                <option value="sent">よく送られている順</option>
                <option value="new">新しい順</option>
              </select>
            </div>

            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <TemplateCard
                  key={item.id}
                  t={item}
                  selected={selectedIds.has(item.id)}
                  expanded={expandedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onOpenDetail={() => setDetailId(item.id)}
                  onToggleExpand={() => toggleExpand(item.id)}
                />
              ))}
            </div>

            {status === "loading" && (
              <p className="py-6 text-center text-sm text-[var(--text-sub)]">読み込み中...</p>
            )}
            {status === "ready" && items.length === 0 && (
              <p className="py-6 text-center text-sm text-[var(--text-sub)]">
                該当する文例が見つかりませんでした。絞り込みを見直してください。
              </p>
            )}
            {meta?.hasMore && status !== "loading" && (
              <div className="py-4 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={status === "loading_more"}
                  className="rounded border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
                >
                  {status === "loading_more" ? "読み込み中..." : "さらに表示"}
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {detailItem && (
        <DetailPanel
          t={detailItem}
          selected={selectedIds.has(detailItem.id)}
          onClose={() => setDetailId(null)}
          onToggleSelect={() => toggleSelect(detailItem.id)}
          onCopyBody={() => copyBody(detailItem.body)}
        />
      )}

      <BottomBar selectedCount={selectedIds.size} />
    </div>
  );
}
