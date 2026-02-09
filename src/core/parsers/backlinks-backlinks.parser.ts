/**
 * Parser for backlinks_backlinks
 */

export function parseBacklinksBacklinks(item: any): any {
  if (!item) return null;

  const result: any = {};

  if (item.url_from) result.url_from = item.url_from;
  if (item.url_to) result.url_to = item.url_to;
  if (item.anchor != null) result.anchor = item.anchor;
  if (item.dofollow != null) result.dofollow = item.dofollow;
  if (item.rank != null) result.rank = item.rank;
  if (item.domain_from_rank != null) result.domain_from_rank = item.domain_from_rank;
  if (item.first_seen) result.first_seen = item.first_seen;
  if (item.is_lost != null) result.is_lost = item.is_lost;

  return result;
}
