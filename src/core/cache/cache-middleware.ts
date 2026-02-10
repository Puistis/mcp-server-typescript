/**
 * Cache Middleware
 *
 * Wraps tool handlers to automatically store parsed results in the D1 cache.
 * Implements the cache check → fetch → store flow for supported tools.
 */

import { CacheService } from './cache-service.js';

/** Tool names that produce cacheable keyword data */
const KEYWORD_CACHE_TOOLS = new Set([
  'kw_data_google_ads_search_volume',
  'dataforseo_labs_google_keyword_suggestions',
  'dataforseo_labs_google_keyword_ideas',
  'dataforseo_labs_google_related_keywords',
]);

/** Tool names that produce cacheable ranking data */
const RANKING_CACHE_TOOLS = new Set([
  'dataforseo_labs_google_ranked_keywords',
]);

/** Tool names that produce cacheable domain data */
const DOMAIN_CACHE_TOOLS = new Set([
  'dataforseo_labs_google_domain_rank_overview',
]);

/** Map tool names to their cache source identifier */
const TOOL_SOURCE_MAP: Record<string, string> = {
  'kw_data_google_ads_search_volume': 'google_ads',
  'dataforseo_labs_google_keyword_suggestions': 'keyword_suggestions',
  'dataforseo_labs_google_keyword_ideas': 'keyword_ideas',
  'dataforseo_labs_google_related_keywords': 'related_keywords',
};

/**
 * Parse cached monthly_searches JSON into a sorted integer array (newest first).
 * Handles both new array format and legacy object format {"YYYY-MM": vol}.
 */
function parseCachedMonthly(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length > 0 ? parsed : null;
    if (typeof parsed === 'object' && parsed !== null) {
      const keys = Object.keys(parsed);
      if (keys.length === 0) return null;
      return keys.sort().reverse().map(k => parsed[k]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Creates a wrapped handler that caches results after the original handler runs.
 * For keyword search volume, implements bulk cache check (fetch only missing from API).
 */
export function createCacheWrappedHandler(
  toolName: string,
  originalHandler: (params: any) => Promise<any>,
  cacheService: CacheService
): (params: any) => Promise<any> {

  // Special handling for search volume: bulk cache check
  if (toolName === 'kw_data_google_ads_search_volume') {
    return createSearchVolumeCacheHandler(originalHandler, cacheService);
  }

  // For other tools: store results after fetch
  return async (params: any) => {
    const result = await originalHandler(params);

    // Try to cache the result in the background (don't block response)
    try {
      await cacheResult(toolName, params, result, cacheService);
    } catch (e) {
      console.error(`Cache store error for ${toolName}:`, e);
    }

    return result;
  };
}

/**
 * Search volume handler with bulk cache optimization:
 * 1. Check which keywords exist in cache
 * 2. Fetch ONLY missing keywords from API
 * 3. Store new results in cache
 * 4. Merge and return all results
 */
function createSearchVolumeCacheHandler(
  originalHandler: (params: any) => Promise<any>,
  cacheService: CacheService
): (params: any) => Promise<any> {

  return async (params: any) => {
    const keywords: string[] = params.keywords || [];
    const location = params.location_name || '';
    const language = params.language_code || '';

    if (keywords.length === 0) {
      return originalHandler(params);
    }

    // 1. Check cache
    let cachedMap: Map<string, any>;
    try {
      cachedMap = await cacheService.getCachedKeywords(keywords, location, language);
    } catch {
      // If cache check fails, fall through to API
      cachedMap = new Map();
    }

    const missing = keywords.filter(kw => !cachedMap.has(kw));

    // 2. If everything is cached, return from cache
    if (missing.length === 0) {
      const cachedItems = keywords.map(kw => {
        const c = cachedMap.get(kw);
        if (!c) return { kw, vol: 0 };
        const item: any = { kw: c.keyword, vol: c.search_volume };
        if (c.cpc != null) item.cpc = c.cpc;
        if (c.competition) item.comp = c.competition;
        const monthly = parseCachedMonthly(c.monthly_searches);
        if (monthly) item.monthly = monthly;
        return item;
      });

      // Log cache hit
      try {
        await cacheService.logSearch('kw_data_google_ads_search_volume', params, cachedItems.length, true);
      } catch { /* non-critical */ }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 20000, count: cachedItems.length, items: cachedItems }, null, 2),
        }],
      };
    }

    // 3. Fetch only missing keywords from API
    const fetchParams = { ...params, keywords: missing };
    const result = await originalHandler(fetchParams);

    // 4. Store fetched results in cache
    try {
      const parsed = extractParsedItems(result);
      if (parsed.length > 0) {
        await cacheService.upsertKeywordBatch(parsed, location, language, 'google_ads');
      }
    } catch (e) {
      console.error('Cache store error:', e);
    }

    // 5. If we had some cached results, merge them
    if (cachedMap.size > 0) {
      const fetchedItems = extractParsedItems(result);
      const fetchedMap = new Map(fetchedItems.map((item: any) => [item.kw, item]));

      const merged = keywords.map(kw => {
        if (fetchedMap.has(kw)) return fetchedMap.get(kw);
        const c = cachedMap.get(kw);
        if (!c) return { kw, vol: 0 };
        const item: any = { kw: c.keyword, vol: c.search_volume };
        if (c.cpc != null) item.cpc = c.cpc;
        if (c.competition) item.comp = c.competition;
        const monthly = parseCachedMonthly(c.monthly_searches);
        if (monthly) item.monthly = monthly;
        return item;
      });

      try {
        await cacheService.logSearch('kw_data_google_ads_search_volume', params, merged.length, false);
      } catch { /* non-critical */ }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ status: 20000, count: merged.length, items: merged }, null, 2),
        }],
      };
    }

    // Log cache miss
    try {
      const parsed = extractParsedItems(result);
      await cacheService.logSearch('kw_data_google_ads_search_volume', params, parsed.length, false);
    } catch { /* non-critical */ }

    return result;
  };
}

/**
 * Cache parsed result items based on tool type.
 */
async function cacheResult(
  toolName: string,
  params: any,
  result: any,
  cacheService: CacheService
): Promise<void> {
  const items = extractParsedItems(result);
  if (items.length === 0) return;

  const location = params.location_name || '';
  const language = params.language_code || '';

  if (KEYWORD_CACHE_TOOLS.has(toolName)) {
    const source = TOOL_SOURCE_MAP[toolName] || toolName;
    await cacheService.upsertKeywordBatch(items, location, language, source);

    await cacheService.logSearch(toolName, params, items.length, false);
  }

  if (RANKING_CACHE_TOOLS.has(toolName)) {
    const domain = params.target || '';
    // Cache both keyword data and ranking data
    await cacheService.upsertKeywordBatch(items, location, language, 'ranked_keywords');
    await cacheService.upsertRankingBatch(items, domain, location, language);

    await cacheService.logSearch(toolName, params, items.length, false);
  }

  if (DOMAIN_CACHE_TOOLS.has(toolName)) {
    // For domain rank overview, cache each item as a domain
    for (const item of items) {
      const target = item.target || params.target || '';
      if (target) {
        await cacheService.upsertDomain(target, location, language, item);
      }
    }

    await cacheService.logSearch(toolName, params, items.length, false);
  }
}

/**
 * Extract parsed items from an MCP tool response.
 */
function extractParsedItems(result: any): any[] {
  if (!result?.content?.[0]?.text) return [];
  try {
    const data = JSON.parse(result.content[0].text);
    return data.items || [];
  } catch {
    return [];
  }
}
