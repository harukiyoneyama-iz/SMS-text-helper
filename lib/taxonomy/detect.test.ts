import { describe, expect, it } from "vitest";
import { detectLifecycle, detectPersonal } from "./detect";

describe("detectLifecycle", () => {
  it("名前が無ければ active", () => {
    expect(detectLifecycle(null)).toBe("active");
  });

  it("先頭に【使用不可】が付いていれば retired", () => {
    expect(detectLifecycle("【使用不可】車検誘致SMS")).toBe("retired");
  });

  it("末尾に※使用しないが付いていれば retired", () => {
    expect(detectLifecycle("車検誘致SMS※使用しない")).toBe("retired");
  });

  it("通常のテンプレート名は active", () => {
    expect(detectLifecycle("車検誘致SMS")).toBe("active");
  });
});

describe("detectPersonal", () => {
  it("名前が無ければ false", () => {
    expect(detectPersonal(null)).toBe(false);
  });

  it("末尾が「○○様」なら個人宛とみなす", () => {
    expect(detectPersonal("鈴木様")).toBe(true);
  });

  it("前に接頭辞が付いていても検知する（2026-09-25 code-review 対応と同じ規則）", () => {
    expect(detectPersonal("見積提示_鈴木様")).toBe(true);
  });

  it("「お客様」「皆様」等の一般的な敬称では誤検知しない", () => {
    expect(detectPersonal("お客様への一斉配信")).toBe(false);
    expect(detectPersonal("皆様へのお知らせ")).toBe(false);
  });

  it("末尾以外に「様」が出現しても個人名とはみなさない", () => {
    expect(detectPersonal("鈴木様向けキャンペーン案内")).toBe(false);
  });
});
