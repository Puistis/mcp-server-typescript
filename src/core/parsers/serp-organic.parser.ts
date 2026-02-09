/**
 * Parser for serp_organic_live_advanced
 */

export function parseSerpOrganic(item: any): any {
  if (!item) return null;

  const result: any = {};

  if (item.rank_group != null) result.pos = item.rank_group;
  if (item.type) result.type = item.type;
  if (item.url) result.url = item.url;
  if (item.title) result.title = item.title;
  if (item.description) result.desc = item.description;
  if (item.domain) result.domain = item.domain;

  return result;
}
