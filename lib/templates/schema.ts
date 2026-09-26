import { z } from "zod";

/**
 * BigQuery（`bq query --format=json`）から落とした生データの形。
 * bq の出力仕様により、値はすべて文字列（または null）で入っている。
 * 参照: scripts/fetch-templates.sh のクエリ、docs/DEVELOPMENT_PLAN.md §⑤
 */
const rawTemplateSchema = z.object({
  template_id: z.string(),
  client_id: z.string(),
  client_name: z.string().nullable(),
  template_name: z.string().nullable(),
  message_body: z.string(),
  status_label: z.string(),
  delivery_type_label: z.string(),
  manryou_month_diff: z.string(),
  reserved_tel: z.string().nullable(),
  reserved_url: z.string().nullable(),
  nyk_reserved_url: z.string().nullable(),
  exclude_reserved: z.string(),
  list_registered_only: z.string(),
  uses_placeholder: z.string(),
  body_length: z.string(),
  created_by_name: z.string(),
  modified_by_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  send_count: z.string(),
  batch_count: z.string(),
  first_sent_at: z.string().nullable(),
  last_sent_at: z.string().nullable(),
});

export const rawTemplatesFileSchema = z.array(z.unknown());

/** アプリ内部で使う、型変換済みのテンプレート。フィールド名は docs/mockups/ui-mock.html に合わせる */
export interface BaseTemplate {
  id: string;
  clientId: string;
  company: string | null;
  templateName: string | null;
  body: string;
  status: string;
  deliveryType: string;
  manryouMonthDiff: number;
  reservedTel: string | null;
  reservedUrl: string | null;
  nykReservedUrl: string | null;
  excludeReserved: boolean;
  callListOnly: boolean;
  usesPlaceholder: boolean;
  bodyLength: number;
  createdBy: string;
  modifiedBy: string;
  created: string;
  modified: string;
  sendCount: number;
  batchCount: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
}

function nullIfEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : value;
}

function toBool(value: string): boolean {
  return value === "true";
}

function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

export interface ParseResult {
  templates: BaseTemplate[];
  /** zod 検証に失敗して除外した行数（隠さずに画面へ出す） */
  invalidCount: number;
}

/**
 * BigQuery から落とした生データ（unknown[]）を検証し、型変換する。
 * 1行単位で検証するので、一部の行が壊れていても全体は読み込める。
 */
export function parseTemplates(raw: unknown): ParseResult {
  const list = rawTemplatesFileSchema.parse(raw);
  const templates: BaseTemplate[] = [];
  let invalidCount = 0;

  for (const item of list) {
    const result = rawTemplateSchema.safeParse(item);
    if (!result.success) {
      invalidCount += 1;
      continue;
    }
    const r = result.data;
    templates.push({
      id: r.template_id,
      clientId: r.client_id,
      company: nullIfEmpty(r.client_name),
      templateName: nullIfEmpty(r.template_name),
      body: r.message_body,
      status: r.status_label,
      deliveryType: r.delivery_type_label,
      manryouMonthDiff: toInt(r.manryou_month_diff),
      reservedTel: nullIfEmpty(r.reserved_tel),
      reservedUrl: nullIfEmpty(r.reserved_url),
      nykReservedUrl: nullIfEmpty(r.nyk_reserved_url),
      excludeReserved: toBool(r.exclude_reserved),
      callListOnly: toBool(r.list_registered_only),
      usesPlaceholder: toBool(r.uses_placeholder),
      bodyLength: toInt(r.body_length),
      createdBy: r.created_by_name,
      modifiedBy: r.modified_by_name,
      created: r.created_at,
      modified: r.updated_at,
      sendCount: toInt(r.send_count),
      batchCount: toInt(r.batch_count),
      firstSentAt: nullIfEmpty(r.first_sent_at),
      lastSentAt: nullIfEmpty(r.last_sent_at),
    });
  }

  return { templates, invalidCount };
}
