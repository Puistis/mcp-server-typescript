/**
 * Parser for kw_data_google_ads_search_volume
 */

/**
 * Convert monthly_searches to a plain integer array (newest month first).
 * Handles both .ai format ({"YYYY-MM": vol} map) and full endpoint format
 * ([{year, month, search_volume}] array). Returns null if no data.
 */
function formatMonthly(monthlySearches: any): number[] | null {
  if (!monthlySearches) return null;

  // .ai endpoint returns already-simplified {"YYYY-MM": volume} map
  if (typeof monthlySearches === 'object' && !Array.isArray(monthlySearches)) {
    const keys = Object.keys(monthlySearches);
    if (keys.length === 0) return null;
    return keys.sort().reverse().map(k => monthlySearches[k]);
  }

  // Full endpoint returns [{year, month, search_volume}] array
  if (!Array.isArray(monthlySearches) || monthlySearches.length === 0) return null;
  return monthlySearches
    .filter((e: any) => e && e.year != null && e.month != null)
    .sort((a: any, b: any) => b.year - a.year || b.month - a.month)
    .map((e: any) => e.search_volume ?? 0);
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
  if (monthly && monthly.length > 0) result.monthly = monthly;

  return result;
}

export { formatMonthly };
