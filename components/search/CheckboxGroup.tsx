interface CheckboxGroupProps {
  title: string;
  values: string[];
  selected: string[];
  counts: Record<string, number>;
  onToggle: (value: string) => void;
  unsetLabel?: string;
  unsetValue?: string;
}

/** サイドバーのチェックボックス群。0件でも選択肢は消さない（未分類も件数で正直に見せる方針） */
export function CheckboxGroup({
  title,
  values,
  selected,
  counts,
  onToggle,
  unsetLabel,
  unsetValue,
}: CheckboxGroupProps) {
  const options = unsetLabel && unsetValue ? [...values, unsetValue] : values;
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs font-bold text-[var(--text-sub)]">{title}</div>
      <div className="flex flex-col gap-1">
        {options.map((v) => {
          const count = counts[v] ?? 0;
          const label = v === unsetValue ? unsetLabel! : v;
          return (
            <label
              key={v}
              className={`flex items-center gap-2 text-sm ${count === 0 ? "text-[var(--text-sub)]" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() => onToggle(v)}
              />
              {label} <span className="text-xs">({count})</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
