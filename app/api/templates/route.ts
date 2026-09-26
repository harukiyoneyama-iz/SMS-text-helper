import { NextResponse } from "next/server";
import { z } from "zod";
import { loadTemplates, TemplatesFileNotFoundError } from "@/lib/templates/load";
import { parseTemplatesQuery, queryTemplates } from "@/lib/templates/query";
import { applyMaskToConsolidated } from "@/lib/templates/group";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let query;
  try {
    query = parseTemplatesQuery(searchParams);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "クエリパラメータが不正です", issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  let loaded;
  try {
    loaded = loadTemplates();
  } catch (err) {
    if (err instanceof TemplatesFileNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const result = queryTemplates(loaded.templates, query);
  const items = query.masked ? result.items.map(applyMaskToConsolidated) : result.items;

  return NextResponse.json({
    items,
    matchedCount: result.matchedCount,
    poolCount: result.poolCount,
    totalCount: loaded.templates.length,
    facets: result.facets,
    page: result.page,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
    fetchedAt: loaded.fetchedAt,
    invalidCount: loaded.invalidCount,
    masked: query.masked,
  });
}
