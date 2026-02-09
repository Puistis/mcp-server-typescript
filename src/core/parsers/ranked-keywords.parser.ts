/**
 * Parser for dataforseo_labs_google_ranked_keywords
 */

import { formatMonthly } from './search-volume.parser.js';

export function parseRankedKeywords(item: any): any {
  if (!item) return null;

  // ranked_keywords nests keyword data under keyword_data
  const kd = item.keyword_data || {};
  const ki = kd.keyword_info || {};
  const si = kd.search_intent_info || {};
  const serp = item.ranked_serp_element?.serp_item || {};

  const result: any = {
    kw: kd.keyword || item.keyword,
    vol: ki.search_volume ?? 0,
  };

  if (ki.cpc != null) result.cpc = ki.cpc;
  if (ki.competition_level) result.comp = ki.competition_level;
  if (si.main_intent) result.intent = si.main_intent;

  if (serp.rank_group != null) result.pos = serp.rank_group;
  if (serp.type) result.type = serp.type;
  if (serp.url) result.url = serp.url;
  if (serp.etv != null) result.etv = serp.etv;

  const monthly = formatMonthly(ki.monthly_searches);
  if (monthly) result.monthly = monthly;

  return result;
}
