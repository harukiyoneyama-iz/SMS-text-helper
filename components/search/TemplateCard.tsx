import type { ConsolidatedTemplate } from "@/lib/templates/group";
import {
  bodyCharLabel,
  bodyPriceLabel,
  companyLabel,
  sendCountLabel,
  statusTone,
  titleFor,
} from "@/lib/client/format";

interface TemplateCardProps {
  t: ConsolidatedTemplate;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onToggleExpand: () => void;
}

const TONE_CLASS: Record<string, string> = {
  ok: "bg-[var(--ok-bg)] text-[var(--ok-text)]",
  warn: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
  neutral: "bg-[var(--status-unknown-bg)] text-[var(--text-sub)]",
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-xs text-[var(--text)]">
      {children}
    </span>
  );
}

export function TemplateCard({
  t,
  selected,
  expanded,
  onToggleSelect,
  onOpenDetail,
  onToggleExpand,
}: TemplateCardProps) {
  const title = titleFor(t, 18);

  return (
    <div
      className={`flex gap-3 rounded-lg border p-4 ${
        selected ? "border-[var(--pick-border)] bg-[var(--pick-bg)]" : "border-[var(--border)] bg-[var(--panel)]"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 shrink-0"
        checked={selected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label="文章案に追加"
      />
      <div
        className="flex-1 cursor-pointer"
        onClick={onOpenDetail}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpenDetail();
        }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">
            {title.text}
            {title.isAuto && (
              <span className="ml-1 rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[10px] text-[var(--text-sub)]">
                自動生成・未保存
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-[var(--accent)]">{bodyPriceLabel(t)}</span>
            <span className="text-[var(--text-sub)]">{bodyCharLabel(t)}</span>
            {t.status !== "不明" && (
              <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASS[statusTone(t.status)]}`}>
                {t.status}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--text-sub)]">{companyLabel(t)} ・ {sendCountLabel(t)}</p>

        <div className="mt-2 flex flex-wrap gap-1">
          <Tag>{t.scene || "未分類"}</Tag>
          {t.timing && <Tag>{t.timing}</Tag>}
          {t.franchise && <Tag>{t.franchise}</Tag>}
          <Tag>{t.smsType}</Tag>
          {t.customerType && <Tag>{t.customerType}</Tag>}
          {t.stage && <Tag>{t.stage}</Tag>}
          {t.lifecycle === "retired" && <Tag>使用中止</Tag>}
          {t.isPersonal && <Tag>個人宛</Tag>}
          {t.isTest && <Tag>テスト用</Tag>}
        </div>

        <p className="mt-2 whitespace-pre-wrap text-sm">{t.body}</p>

        {t.variantCount > 1 && (
          <div className="mt-2">
            <button
              type="button"
              className="text-xs text-[var(--accent)] underline"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {expanded ? "店舗一覧を閉じる" : `＋他${t.variantCount - 1}店舗`}
            </button>
            {expanded && (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-sub)]">
                    <th className="py-1 pr-2">クライアントID</th>
                    <th className="py-1 pr-2">会社名</th>
                    <th className="py-1 pr-2">差込む電話番号</th>
                  </tr>
                </thead>
                <tbody>
                  {[t, ...t.variants].map((v) => (
                    <tr key={v.id} className="border-t border-[var(--border)]">
                      <td className="py-1 pr-2">{v.clientId}</td>
                      <td className="py-1 pr-2">{companyLabel(v)}</td>
                      <td className="py-1 pr-2">{v.reservedTel ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
