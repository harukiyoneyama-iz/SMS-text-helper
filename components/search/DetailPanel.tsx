import type { ConsolidatedTemplate } from "@/lib/templates/group";
import {
  bodyCharLabel,
  companyLabel,
  formatDate,
  formatDateTime,
  isSafeHttpUrl,
  sendCountLabel,
} from "@/lib/client/format";

interface DetailPanelProps {
  t: ConsolidatedTemplate;
  selected: boolean;
  onClose: () => void;
  onToggleSelect: () => void;
  onCopyBody: () => void;
}

function UrlCell({ value }: { value: string | null }) {
  if (!value) return <span>—</span>;
  if (!isSafeHttpUrl(value)) return <span>{value}</span>;
  return (
    <a href={value} target="_blank" rel="noreferrer" className="break-all underline">
      {value}
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-[var(--border)] align-top">
      <th className="w-32 py-1.5 pr-2 text-left text-xs font-normal text-[var(--text-sub)]">
        {label}
      </th>
      <td className="py-1.5 text-sm">{children}</td>
    </tr>
  );
}

export function DetailPanel({ t, selected, onClose, onToggleSelect, onCopyBody }: DetailPanelProps) {
  return (
    <aside className="fixed right-0 top-0 z-30 h-full w-full overflow-y-auto border-l border-[var(--border)] bg-[var(--panel)] p-4 shadow-lg md:w-[420px]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">文例の詳細</h2>
        <button type="button" onClick={onClose} className="text-sm text-[var(--text-sub)]" aria-label="閉じる">
          ✕
        </button>
      </div>

      <p className="whitespace-pre-wrap rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
        {t.body}
      </p>
      <p className="mt-1 text-xs text-[var(--text-sub)]">{bodyCharLabel(t)}</p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCopyBody}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          この文面だけコピー
        </button>
        <button
          type="button"
          onClick={onToggleSelect}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
        >
          {selected ? "選択を解除" : "＋ 文章案に追加"}
        </button>
      </div>

      <h3 className="mb-1 mt-4 text-xs font-bold text-[var(--text-sub)]">設定内容</h3>
      <table className="w-full">
        <tbody>
          <Row label="会社名">{companyLabel(t)}</Row>
          <Row label="差込む電話番号">{t.reservedTel ?? "—"}</Row>
          <Row label="差込むURL">
            <UrlCell value={t.reservedUrl} />
          </Row>
          <Row label="入庫予約用URL">
            <UrlCell value={t.nykReservedUrl} />
          </Row>
          <Row label="配信の種類">{t.deliveryType}</Row>
          <Row label="予約済みを除く">{t.excludeReserved ? "はい" : "いいえ"}</Row>
          <Row label="コールリスト登録者のみ">{t.callListOnly ? "はい" : "いいえ"}</Row>
          <Row label="SMSの型">{t.smsType}</Row>
          <Row label="フランチャイズ">{t.franchise || "—"}</Row>
          <Row label="利用シーン">{t.scene || "未設定"}</Row>
          <Row label="商材 / 目的">
            {t.product || "未設定"} / {t.purpose || "未設定"}
          </Row>
          <Row label="顧客区分">{t.customerType || "—"}</Row>
          <Row label="アプローチ段階">{t.stage || "—"}</Row>
          <Row label="文面の状態">{t.lifecycle === "retired" ? "使用中止" : "使用中"}</Row>
        </tbody>
      </table>

      <h3 className="mb-1 mt-4 text-xs font-bold text-[var(--text-sub)]">実績・履歴</h3>
      <table className="w-full">
        <tbody>
          <Row label="配信状態">{t.status}</Row>
          <Row label="送信通数">{sendCountLabel(t)}</Row>
          <Row label="送信バッチ数">{t.batchCount.toLocaleString("ja-JP")}</Row>
          <Row label="初回送信日時">{formatDateTime(t.firstSentAt)}</Row>
          <Row label="最終送信日時">{formatDateTime(t.lastSentAt)}</Row>
          <Row label="作成者">{t.createdBy}</Row>
          <Row label="最終更新者">{t.modifiedBy}</Row>
          <Row label="作成日">{formatDate(t.created)}</Row>
          <Row label="最終更新日">{formatDate(t.modified)}</Row>
        </tbody>
      </table>
    </aside>
  );
}
