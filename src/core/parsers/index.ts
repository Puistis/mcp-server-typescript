/**
 * Response Parser Module
 *
 * Strips unnecessary fields from DataForSEO API responses before returning to MCP clients.
 * Each tool has its own parser that maps verbose field names to short tokens.
 * Language and location agnostic.
 */

import { parseSearchVolume } from './search-volume.parser.js';
import { parseKeywordSuggestions } from './keyword-suggestions.parser.js';
import { parseRankedKeywords } from './ranked-keywords.parser.js';
import { parseCompetitorsDomain } from './competitors-domain.parser.js';
import { parseDomainRankOverview } from './domain-rank-overview.parser.js';
import { parseBacklinksSummary } from './backlinks-summary.parser.js';
import { parseBacklinksBacklinks } from './backlinks-backlinks.parser.js';
import { parseSerpOrganic } from './serp-organic.parser.js';
import { parseOnPage } from './on-page.parser.js';
import { parseLighthouse } from './lighthouse.parser.js';

export type ItemParser = (item: any) => any;

const parsers: Record<string, ItemParser> = {
  'kw_data_google_ads_search_volume': parseSearchVolume,
  'dataforseo_labs_google_keyword_suggestions': parseKeywordSuggestions,
  'dataforseo_labs_google_keyword_ideas': parseKeywordSuggestions,
  'dataforseo_labs_google_related_keywords': parseKeywordSuggestions,
  'dataforseo_labs_google_ranked_keywords': parseRankedKeywords,
  'dataforseo_labs_google_competitors_domain': parseCompetitorsDomain,
  'dataforseo_labs_google_domain_rank_overview': parseDomainRankOverview,
  'backlinks_summary': parseBacklinksSummary,
  'backlinks_backlinks': parseBacklinksBacklinks,
  'serp_organic_live_advanced': parseSerpOrganic,
  'on_page_instant_pages': parseOnPage,
  'on_page_content_parsing': parseOnPage,
  'on_page_lighthouse': parseLighthouse,
};

/**
 * Parse a DataForSEO API response, stripping unnecessary fields.
 * Error responses pass through unmodified.
 */
export function parseResponse(toolName: string, rawResponse: any): any {
  // Never parse error responses
  if (rawResponse?.status_code && rawResponse.status_code !== 20000) {
    return rawResponse;
  }

  const parser = parsers[toolName];
  if (!parser) return rawResponse; // No parser = no transformation

  const items = rawResponse?.items || [];
  if (!Array.isArray(items) || items.length === 0) return rawResponse;

  const parsed = items.map((item: any) => parser(item)).filter((item: any) => item != null);

  return {
    status: rawResponse.status_code,
    count: parsed.length,
    items: parsed,
  };
}

/**
 * Check if a parser exists for a given tool name.
 */
export function hasParser(toolName: string): boolean {
  return toolName in parsers;
}
