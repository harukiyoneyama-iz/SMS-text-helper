import type { Filters } from "./types";

export function buildQueryString(filters: Filters, page: number): string {
  const sp = new URLSearchParams();
  if (filters.q.trim()) sp.set("q", filters.q.trim());
  for (const v of filters.products) sp.append("products", v);
  for (const v of filters.purposes) sp.append("purposes", v);
  for (const v of filters.smsTypes) sp.append("smsTypes", v);
  for (const v of filters.customerSegments) sp.append("customerSegments", v);
  for (const v of filters.franchises) sp.append("franchises", v);
  for (const v of filters.stages) sp.append("stages", v);
  for (const v of filters.priceTiers) sp.append("priceTiers", String(v));
  sp.set("includeRetired", filters.includeRetired ? "1" : "0");
  sp.set("includePersonal", filters.includePersonal ? "1" : "0");
  sp.set("includeTest", filters.includeTest ? "1" : "0");
  sp.set("consolidate", filters.consolidate ? "1" : "0");
  sp.set("sort", filters.sort);
  sp.set("masked", filters.masked ? "1" : "0");
  sp.set("page", String(page));
  return sp.toString();
}
