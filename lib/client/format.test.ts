import { describe, expect, it } from "vitest";
import { bodyExcerpt, titleFor, isSafeHttpUrl } from "./format";
import { classify } from "@/lib/taxonomy/classify";
import type { BaseTemplate } from "@/lib/templates/schema";
import type { ConsolidatedTemplate } from "@/lib/templates/group";

function base(overrides: Partial<BaseTemplate> = {}): BaseTemplate {
  return {
    id: "1",
    clientId: "100",
    company: "サンプル自動車株式会社",
    templateName: "車検誘致SMS",
    body: "車検の時期が近づいてまいりました。",
    status: "使用中",
    deliveryType: "定型",
    manryouMonthDiff: 0,
    reservedTel: null,
    reservedUrl: null,
    nykReservedUrl: null,
    excludeReserved: false,
    callListOnly: false,
    usesPlaceholder: false,
    bodyLength: 20,
    createdBy: "u_1",
    modifiedBy: "u_2",
    created: "2020-01-01T00:00:00",
    modified: "2020-02-01T00:00:00",
    sendCount: 100,
    batchCount: 1,
    firstSentAt: null,
    lastSentAt: null,
    ...overrides,
  };
}

function consolidated(overrides: Partial<BaseTemplate> = {}): ConsolidatedTemplate {
  return { ...classify(base(overrides)), variantCount: 1, variants: [] };
}

describe("bodyExcerpt", () => {
  it("改行を「／」に置き換える", () => {
    expect(bodyExcerpt("あいう\nえお", 20)).toBe("あいう ／ えお");
  });

  it("長さを超えたら省略する", () => {
    expect(bodyExcerpt("あいうえお", 3)).toBe("あいう…");
  });
});

describe("titleFor", () => {
  it("テンプレート名があればそれを使う", () => {
    const t = consolidated({ templateName: "車検誘致SMS" });
    expect(titleFor(t, 18)).toEqual({ text: "車検誘致SMS", isAuto: false });
  });

  it("テンプレート名が無ければ「利用シーン｜本文冒頭」を自動生成する", () => {
    const t = consolidated({ templateName: null, body: "オイル交換はお済みですか" });
    const info = titleFor(t, 10);
    expect(info.isAuto).toBe(true);
    expect(info.text.startsWith("オイル交換｜")).toBe(true);
  });

  it("シーンも未分類なら「未分類｜本文冒頭」にする", () => {
    const t = consolidated({ templateName: null, body: "abc" });
    expect(titleFor(t, 10).text.startsWith("未分類｜")).toBe(true);
  });
});

describe("isSafeHttpUrl", () => {
  it("http/https は安全", () => {
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
  });
  it("javascript: スキームは安全ではない", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
  });
  it("URLとして不正な文字列は安全ではない", () => {
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});
