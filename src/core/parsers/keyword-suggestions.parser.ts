/**
 * Parser for dataforseo_labs_google_keyword_suggestions, keyword_ideas, related_keywords
 */

import { formatMonthly } from './search-volume.parser.js';

export function parseKeywordSuggestions(item: any): any {
  if (!item) return null;

  const ki = item.keyword_info || {};
  const kp = item.keyword_properties || {};
  const si = item.search_intent_info || {};

  const result: any = {
    kw: item.keyword,
    vol: ki.search_volume ?? 0,
  };

  if (result.vol === 0 && !ki.cpc && !ki.competition_level) {
    return { kw: item.keyword, vol: 0 };
  }

  if (ki.cpc != null) result.cpc = ki.cpc;
  if (ki.competition_level) result.comp = ki.competition_level;
  if (si.main_intent) result.intent = si.main_intent;

  const monthly = formatMonthly(ki.monthly_searches);
  if (monthly && monthly.length > 0) result.monthly = monthly;

  if (kp.keyword_difficulty != null) result.kd = kp.keyword_difficulty;

  return result;
}
