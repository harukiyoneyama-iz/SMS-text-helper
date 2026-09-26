import { describe, expect, it } from "vitest";
import {
  bodyCharInfo,
  countChars,
  countSegments,
  insertTagRealDiff,
  priceForSegments,
} from "./charCount";

describe("countSegments", () => {
  it("70文字以下は1通", () => {
    expect(countSegments(70)).toBe(1);
    expect(countSegments(1)).toBe(1);
  });
  it("71文字は2通", () => {
    expect(countSegments(71)).toBe(2);
  });
  it("132文字は2通、133文字は3通", () => {
    expect(countSegments(132)).toBe(2);
    expect(countSegments(133)).toBe(3);
  });
  it("660文字は10通", () => {
    expect(countSegments(660)).toBe(10);
  });
  it("0以下は0通", () => {
    expect(countSegments(0)).toBe(0);
  });
});

describe("priceForSegments", () => {
  it("1通25円、以降66文字ごとに+10円", () => {
    expect(priceForSegments(1)).toBe(25);
    expect(priceForSegments(2)).toBe(35);
    expect(priceForSegments(10)).toBe(115);
  });
  it("0通は0円", () => {
    expect(priceForSegments(0)).toBe(0);
  });
});

describe("countChars", () => {
  it("テキスト型: 改行を除いた文字数 + 改行数×2", () => {
    const c = countChars("あいう\nえお", "text");
    // あいうえお(5) + 改行1つ×2
    expect(c.total).toBe(7);
  });

  it("入庫連動型: テキストと同じ計算式 + 36文字", () => {
    const c = countChars("あいう\nえお", "nyuko");
    expect(c.total).toBe(7 + 36);
  });

  it("リマインド型: 置換後の文字数、改行は1文字", () => {
    const c = countChars("@customer_name@様\nご来店ありがとうございました", "reminder");
    // @customer_name@(15文字分) + 様(1) + 改行1文字 + 「ご来店ありがとうございました」(14)
    expect(c.usedVars).toHaveLength(1);
    expect(c.usedVars[0]!.chars).toBe(15);
  });
});

describe("bodyCharInfo", () => {
  it("660文字を超えると上限超過（通数0）になる", () => {
    const longBody = "あ".repeat(661);
    const info = bodyCharInfo("テキスト", longBody);
    expect(info.overLimit).toBe(true);
    expect(info.segments).toBe(0);
  });

  it("入庫連動は+36文字が乗る", () => {
    const body = "あ".repeat(30);
    const info = bodyCharInfo("入庫連動", body);
    expect(info.total).toBe(30 + 36);
  });

  it("リマインドは70文字を超えると上限超過になる（リマインドは70文字までの配信のみ）", () => {
    const body = "あ".repeat(71);
    const info = bodyCharInfo("リマインド", body);
    expect(info.overLimit).toBe(true);
    expect(info.segments).toBe(0);
  });

  it("リマインドは70文字以下なら1通", () => {
    const body = "あ".repeat(70);
    const info = bodyCharInfo("リマインド", body);
    expect(info.segments).toBe(1);
  });
});

describe("insertTagRealDiff", () => {
  it("realChars が既知のタグは差分を計算する", () => {
    const { diff, used, hasUnknown } = insertTagRealDiff("車検満了日は@車検満了日@です");
    // @車検満了日@ は7文字、実際は11文字 → 差分+4
    expect(diff).toBe(4);
    expect(used).toHaveLength(1);
    expect(hasUnknown).toBe(false);
  });

  it("realChars が不明なタグ（顧客データ参照系）は hasUnknown にする", () => {
    const { hasUnknown, diff } = insertTagRealDiff("@顧客名@様");
    expect(hasUnknown).toBe(true);
    expect(diff).toBe(0);
  });

  it("タグが無ければ差分0", () => {
    const { diff, used, hasUnknown } = insertTagRealDiff("こんにちは");
    expect(diff).toBe(0);
    expect(used).toHaveLength(0);
    expect(hasUnknown).toBe(false);
  });
});
