/**
 * 文字数・通数・料金の計算。
 * 元実装: docs/mockups/ui-mock.html の countChars / countSegments / priceForSegments /
 * bodyCharInfo。数式の出典は社内の申請書（『【配信文章設定】…』）。
 * docs/DEVELOPMENT_PLAN.md §⑤「文字数・通数・料金の仕様」参照
 */

export type SmsType = "テキスト" | "入庫連動" | "リマインド";
type MappedType = "text" | "nyuko" | "reminder";

// ［SMS】配信料金表: 70文字まで1通25円、以降66文字ごとに+1通+10円、660文字(10通)が上限
export const MAX_SEGMENTS = 10;
export const MAX_CHARS = 660;
export const BASE_PRICE = 25;
export const PRICE_STEP = 10;
export const SEGMENT_STEP = 66;

// 入庫予約URLは末尾に固定挿入され、常に36文字としてカウントされる（【SMS】入庫連動シート）
export const NYUKO_URL_CHARS = 36;

// 【SMS】リマインドシートの置換表（置換元→実際に配信される文字数）
export const REPLACE_VARS: { token: string; label: string; chars: number }[] = [
  { token: "@customer_name@", label: "お客様名", chars: 15 },
  { token: "@shop_name@", label: "店舗名/工場名", chars: 11 },
  { token: "@work_name@", label: "作業種別名", chars: 11 },
  { token: "@visit_date@", label: "来店日時", chars: 12 },
  { token: "@reserve_change_url@", label: "予約変更URL", chars: 20 },
];

// 日本語の差し込みタグ（sms-corpus.md「差し込みタグと文字数」より）。
// 申請書の数式そのものは変えず、実配信時の見込み文字数を「補助表示」として出すために使う
export const INSERT_TAGS: {
  token: string;
  label: string;
  setChars: number;
  realChars: number | null;
}[] = [
  { token: "@顧客名@", label: "顧客名", setChars: 5, realChars: null },
  { token: "@顧客担当者@", label: "顧客担当者", setChars: 7, realChars: null },
  { token: "@顧客管理店舗名@", label: "顧客管理店舗名", setChars: 9, realChars: null },
  { token: "@車名@", label: "車名", setChars: 4, realChars: null },
  { token: "@メーカー名@", label: "メーカー名", setChars: 7, realChars: null },
  { token: "@初年度登録年@", label: "初年度登録年", setChars: 8, realChars: 8 },
  { token: "@ナンバー@", label: "ナンバー", setChars: 6, realChars: 16 },
  { token: "@車両担当者@", label: "車両担当者", setChars: 7, realChars: null },
  { token: "@車両管理店舗名@", label: "車両管理店舗名", setChars: 9, realChars: null },
  { token: "@車検満了日@", label: "車検満了日", setChars: 7, realChars: 11 },
  { token: "@保険満了日@", label: "保険満了日", setChars: 7, realChars: 11 },
  { token: "@コーティング満了日@", label: "コーティング満了日", setChars: 11, realChars: 11 },
  { token: "@入庫予約リンク（短縮URLで21文字）@", label: "入庫予約リンク", setChars: 22, realChars: 21 },
  { token: "@入庫予約リンク@", label: "入庫予約リンク", setChars: 12, realChars: 21 },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mappedType(smsType: SmsType): MappedType {
  if (smsType === "入庫連動") return "nyuko";
  if (smsType === "リマインド") return "reminder";
  return "text";
}

export interface CharCountResult {
  newlineCount: number;
  urlChars: number;
  usedVars: { token: string; count: number; chars: number }[];
  total: number;
}

/**
 * テキスト／入庫連動: LEN(CLEAN(本文)) + 改行数×2（入庫連動のみ +36）
 * リマインド: 置換後の文字数、改行は1文字
 */
export function countChars(text: string, type: MappedType): CharCountResult {
  const pureLen = text.length;
  const cleanLen = text.replace(/\n/g, "").length;
  const newlineCount = pureLen - cleanLen;

  if (type === "reminder") {
    let replaceDiff = 0;
    const usedVars: { token: string; count: number; chars: number }[] = [];
    for (const rv of REPLACE_VARS) {
      const matches = text.match(new RegExp(escapeRegExp(rv.token), "g"));
      if (matches) {
        replaceDiff += matches.length * (rv.chars - rv.token.length);
        usedVars.push({ token: rv.token, count: matches.length, chars: rv.chars });
      }
    }
    const total = cleanLen + replaceDiff + newlineCount * 1;
    return { newlineCount, urlChars: 0, usedVars, total };
  }

  const urlChars = type === "nyuko" ? NYUKO_URL_CHARS : 0;
  const total = cleanLen + newlineCount * 2 + urlChars;
  return { newlineCount, urlChars, usedVars: [], total };
}

/** ROUNDUP(IF(文字数<=70, 1, 文字数/66), 0) */
export function countSegments(total: number): number {
  if (total <= 0) return 0;
  if (total <= 70) return 1;
  return Math.ceil(total / SEGMENT_STEP);
}

export function priceForSegments(segments: number): number {
  if (segments <= 0) return 0;
  return BASE_PRICE + (segments - 1) * PRICE_STEP;
}

export interface BodyCharInfo {
  total: number;
  segments: number;
  overLimit: boolean;
}

/**
 * 一覧カード・詳細パネル・②文章案で「この文面は何文字/何通か」を出すための共通計算。
 * 参照フィールド: smsType, body
 */
export function bodyCharInfo(smsType: SmsType, body: string): BodyCharInfo {
  const mt = mappedType(smsType);
  const c = countChars(body, mt);
  const isReminder = mt === "reminder";
  const overLimitChars = !isReminder && c.total > MAX_CHARS;
  const overReminder = isReminder && c.total > 70;
  const segments = overLimitChars
    ? 0
    : isReminder
      ? overReminder
        ? 0
        : 1
      : countSegments(c.total);
  return { total: c.total, segments, overLimit: overLimitChars || overReminder };
}

export function bodyCharLabel(smsType: SmsType, body: string): string {
  const info = bodyCharInfo(smsType, body);
  if (info.segments) return `${info.total}文字・${info.segments}通`;
  if (info.overLimit) return `${info.total}文字（上限超過）`;
  return `${info.total}文字`;
}

export function bodyPriceLabel(smsType: SmsType, body: string): string {
  const info = bodyCharInfo(smsType, body);
  if (info.overLimit || !info.segments) return "—";
  return `${priceForSegments(info.segments)}円/件`;
}

export interface InsertTagRealDiff {
  used: { token: string; count: number; realChars: number | null }[];
  diff: number;
  hasUnknown: boolean;
}

/**
 * 主表示（申請書の数式どおり）は変えず、日本語タグが含まれる場合だけ
 * 「実配信時はこう変わる見込み」を副表示として計算する。
 * realChars が無いタグ（顧客データ参照系）は差分不明のため計算対象から外す
 */
export function insertTagRealDiff(text: string): InsertTagRealDiff {
  const used: { token: string; count: number; realChars: number | null }[] = [];
  let diff = 0;
  let hasUnknown = false;

  for (const tag of INSERT_TAGS) {
    const matches = text.match(new RegExp(escapeRegExp(tag.token), "g"));
    if (!matches) continue;
    if (tag.realChars == null) {
      hasUnknown = true;
      used.push({ token: tag.token, count: matches.length, realChars: null });
      continue;
    }
    diff += (tag.realChars - tag.token.length) * matches.length;
    used.push({ token: tag.token, count: matches.length, realChars: tag.realChars });
  }

  return { used, diff, hasUnknown };
}
