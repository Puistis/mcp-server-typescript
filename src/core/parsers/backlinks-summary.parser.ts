/**
 * Parser for backlinks_summary
 */

export function parseBacklinksSummary(item: any): any {
  if (!item) return null;

  const result: any = {
    target: item.target,
  };

  if (item.backlinks != null) result.backlinks = item.backlinks;
  // "dofollow" does not exist at summary level — referring_pages_nofollow is available instead
  if (item.referring_domains != null) result.ref_domains = item.referring_domains;
  if (item.referring_domains_nofollow != null) result.ref_domains_nofollow = item.referring_domains_nofollow;
  if (item.rank != null) result.rank = item.rank;
  if (item.broken_backlinks != null) result.broken_backlinks = item.broken_backlinks;
  if (item.referring_ips != null) result.referring_ips = item.referring_ips;

  return result;
}
