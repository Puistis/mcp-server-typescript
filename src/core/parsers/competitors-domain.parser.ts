/**
 * Parser for dataforseo_labs_google_competitors_domain
 */

export function parseCompetitorsDomain(item: any): any {
  if (!item) return null;

  const result: any = {
    domain: item.domain,
  };

  if (item.avg_position != null) result.avg_pos = item.avg_position;
  if (item.sum_position != null) result.sum_pos = item.sum_position;
  if (item.intersections != null) result.intersections = item.intersections;
  if (item.full_domain_metrics != null) result.relevance = item.relevance;
  if (item.relevance != null) result.relevance = item.relevance;

  // Parse organic metrics
  const organic = item.metrics?.organic;
  if (organic) {
    const m: any = {};
    if (organic.count != null) m.count = organic.count;
    if (organic.etv != null) m.etv = organic.etv;
    if (organic.pos_1 != null) m.pos_1 = organic.pos_1;
    if (organic.pos_2_3 != null) m.pos_2_3 = organic.pos_2_3;
    if (organic.pos_4_10 != null) m.pos_4_10 = organic.pos_4_10;
    result.metrics = { organic: m };

    // Shorthand top-level fields from organic
    if (organic.etv != null) result.etv = organic.etv;
    if (organic.count != null) result.count = organic.count;
  }

  return result;
}
