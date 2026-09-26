import type { ConsolidatedTemplate } from "@/lib/templates/group";
import { bodyCharInfo, priceForSegments } from "@/lib/sms/charCount";

/**
 * カード・詳細パネルの表示用ヘルパー（クライアント側）。
 * データはすでにサーバ側で絞り込み・マスク済みのものを受け取るだけなので、
 * ここでは表示形式の整形だけを行う。
 * 元実装: docs/mockups/ui-mock.html の bodyExcerpt / renderTitleWithFallback /
 * bodyCharLabel / bodyPriceLabel / statusPillClass
 */

export function bodyExcerpt(text: string, len: number): string {
  const flat = text.replace(/\n/g, " ／ ");
  return flat.length > len ? `${flat.slice(0, len)}…` : flat;
}

export interface TitleInfo {
  text: string;
  /** テンプレート名が無く、自動生成した見出しかどうか */
  isAuto: boolean;
}

/** テンプレート名があればそれを、無ければ「利用シーン｜本文冒頭」の形で自動生成する */
export function titleFor(t: ConsolidatedTemplate, len: number): TitleInfo {
  if (t.templateName) return { text: t.templateName, isAuto: false };
  const scenePart = t.scene || "未分類";
  return { text: `${scenePart}｜${bodyExcerpt(t.body, len)}`, isAuto: true };
}

export function companyLabel(t: { company: string | null; clientId: string }): string {
  return t.company ?? `クライアントID ${t.clientId}`;
}

export function bodyCharLabel(t: ConsolidatedTemplate): string {
  const info = bodyCharInfo(t.smsType, t.body);
  if (info.segments) return `${info.total}文字・${info.segments}通`;
  if (info.overLimit) return `${info.total}文字（上限超過）`;
  return `${info.total}文字`;
}

export function bodyPriceLabel(t: ConsolidatedTemplate): string {
  const info = bodyCharInfo(t.smsType, t.body);
  if (info.overLimit || !info.segments) return "—";
  return `${priceForSegments(info.segments)}円/件`;
}

export function sendCountLabel(t: ConsolidatedTemplate): string {
  if (t.sendCount <= 0) return "送信実績なし";
  return `${t.sendCount.toLocaleString("ja-JP")}通`;
}

export type StatusTone = "ok" | "warn" | "neutral";

export function statusTone(status: string): StatusTone {
  if (status === "使用中") return "ok";
  if (status === "停止") return "warn";
  return "neutral";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * URL文字列を http/https のときだけリンクにする（それ以外はプレーンテキストとして扱う。
 * javascript: 等のスキームでのXSSを避けるため）
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
