import {
  CUSTOMER_SEGMENTS,
  FRANCHISE_GROUPS,
  PRODUCTS,
  PURPOSES,
  SMS_TYPES,
  STAGES,
  UNSET,
  priceLabelForSegments,
  type FacetCounts,
  type Filters,
} from "./types";
import { CheckboxGroup } from "./CheckboxGroup";

interface FilterSidebarProps {
  filters: Filters;
  facets: FacetCounts | null;
  onChangeArray: (key: keyof Filters, value: string) => void;
  onChangePriceTier: (segments: number) => void;
  onChangeToggle: (key: keyof Filters) => void;
  onResetFilters: () => void;
}

const EMPTY_COUNTS: Record<string, number> = {};

export function FilterSidebar({
  filters,
  facets,
  onChangeArray,
  onChangePriceTier,
  onChangeToggle,
  onResetFilters,
}: FilterSidebarProps) {
  const priceTierValues = Object.keys(facets?.priceTiers ?? EMPTY_COUNTS)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <aside className="w-full shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 md:sticky md:top-[78px] md:w-[240px]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold">絞り込み</span>
        <button type="button" className="text-xs text-[var(--accent)] underline" onClick={onResetFilters}>
          すべて解除
        </button>
      </div>

      <CheckboxGroup
        title="商材"
        values={PRODUCTS}
        selected={filters.products}
        counts={facets?.products ?? EMPTY_COUNTS}
        onToggle={(v) => onChangeArray("products", v)}
        unsetLabel="未設定"
        unsetValue={UNSET}
      />
      <CheckboxGroup
        title="目的"
        values={PURPOSES}
        selected={filters.purposes}
        counts={facets?.purposes ?? EMPTY_COUNTS}
        onToggle={(v) => onChangeArray("purposes", v)}
        unsetLabel="未設定"
        unsetValue={UNSET}
      />
      <CheckboxGroup
        title="SMSの型"
        values={[...SMS_TYPES]}
        selected={filters.smsTypes}
        counts={facets?.smsTypes ?? EMPTY_COUNTS}
        onToggle={(v) => onChangeArray("smsTypes", v)}
      />
      <CheckboxGroup
        title="顧客区分"
        values={CUSTOMER_SEGMENTS}
        selected={filters.customerSegments}
        counts={facets?.customerSegments ?? EMPTY_COUNTS}
        onToggle={(v) => onChangeArray("customerSegments", v)}
      />

      <div className="mb-4">
        <div className="mb-1 text-xs font-bold text-[var(--text-sub)]">金額</div>
        <div className="flex flex-col gap-1">
          {priceTierValues.length === 0 && (
            <p className="text-xs text-[var(--text-sub)]">該当データがありません</p>
          )}
          {priceTierValues.map((segments) => (
            <label key={segments} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.priceTiers.includes(segments)}
                onChange={() => onChangePriceTier(segments)}
              />
              {priceLabelForSegments(segments)}{" "}
              <span className="text-xs">({facets?.priceTiers[String(segments)] ?? 0})</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-bold text-[var(--text-sub)]">フランチャイズ</div>
        {FRANCHISE_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="mb-1 text-xs text-[var(--text-sub)]">{group.label}</div>
            <div className="flex flex-col gap-1">
              {group.options.map((v) => {
                const count = facets?.franchises[v] ?? 0;
                return (
                  <label
                    key={v}
                    className={`flex items-center gap-2 text-sm ${count === 0 ? "text-[var(--text-sub)]" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.franchises.includes(v)}
                      onChange={() => onChangeArray("franchises", v)}
                    />
                    {v} <span className="text-xs">({count})</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <CheckboxGroup
        title="アプローチ段階"
        values={STAGES}
        selected={filters.stages}
        counts={facets?.stages ?? EMPTY_COUNTS}
        onToggle={(v) => onChangeArray("stages", v)}
      />

      <div className="mb-2">
        <div className="mb-1 text-xs font-bold text-[var(--text-sub)]">表示に含める・まとめ方</div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.includeRetired}
              onChange={() => onChangeToggle("includeRetired")}
            />
            使用中止の文面（【使用不可】）も表示する
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.includePersonal}
              onChange={() => onChangeToggle("includePersonal")}
            />
            個人宛の文例も表示する
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.includeTest}
              onChange={() => onChangeToggle("includeTest")}
            />
            テスト用の文例も表示する
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.consolidate}
              onChange={() => onChangeToggle("consolidate")}
            />
            店舗違いをまとめる
          </label>
        </div>
      </div>
    </aside>
  );
}
