/**
 * Parser for kw_data_google_ads_search_volume
 */

function formatMonthly(monthlySearches: any): Record<string, number> | undefined {
  if (!monthlySearches) return undefined;

  // .ai endpoint returns already-simplified {"YYYY-MM": volume} map
  if (typeof monthlySearches === 'object' && !Array.isArray(monthlySearches)) {
    return Object.keys(monthlySearches).length > 0 ? monthlySearches : undefined;
  }

  // Full endpoint returns [{year, month, search_volume}] array
  if (!Array.isArray(monthlySearches)) return undefined;
  const result: Record<string, number> = {};
  for (const entry of monthlySearches) {
    if (entry && entry.year != null && entry.month != null) {
      const key = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
      result[key] = entry.search_volume ?? 0;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function parseSearchVolume(item: any): any {
  if (!item) return null;

  if (!item.search_volume) {
    return { kw: item.keyword, vol: 0 };
  }

  const result: any = {
    kw: item.keyword,
    vol: item.search_volume,
  };

  if (item.cpc != null) result.cpc = item.cpc;
  // Google Ads endpoint uses "competition" (string: HIGH/MEDIUM/LOW), not "competition_level"
  if (item.competition) result.comp = item.competition;

  const monthly = formatMonthly(item.monthly_searches);
  if (monthly) result.monthly = monthly;

  return result;
}

export { formatMonthly };
