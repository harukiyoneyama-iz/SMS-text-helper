import { NextResponse } from "next/server";
import { loadTemplates, TemplatesFileNotFoundError } from "@/lib/templates/load";
import { applyMask } from "@/lib/mask";
import { toBool } from "@/lib/templates/query";

const ID_PATTERN = /^\d+$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "id が不正です" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const masked = toBool(searchParams.get("masked"), true);
  // 一覧（GET /api/templates）の既定の除外と同じ規則にする。
  // これが無いと、一覧では隠している個人宛・使用中止・テスト用の文例が
  // id を直接指定するだけで見えてしまう（2026-09-26 code-review 指摘）
  const includeRetired = toBool(searchParams.get("includeRetired"), false);
  const includePersonal = toBool(searchParams.get("includePersonal"), false);
  const includeTest = toBool(searchParams.get("includeTest"), false);

  let loaded;
  try {
    loaded = loadTemplates();
  } catch (err) {
    if (err instanceof TemplatesFileNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const template = loaded.templates.find((t) => t.id === id);
  if (!template) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  if (!includeRetired && template.lifecycle === "retired") {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  if (!includePersonal && template.isPersonal) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }
  if (!includeTest && template.isTest) {
    return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  }

  return NextResponse.json({
    item: masked ? applyMask(template) : template,
    masked,
  });
}
