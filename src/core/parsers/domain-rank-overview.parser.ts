/**
 * Parser for dataforseo_labs_google_domain_rank_overview
 */

export function parseDomainRankOverview(item: any, context?: any): any {
  if (!item) return null;

  const result: any = {};

  // .ai endpoint loses result-level target — fall back to request params
  const target = item.target || context?.target;
  if (target) result.target = target;

  // Parse organic metrics
  const organic = item.metrics?.organic;
  if (organic) {
    const o: any = {};
    if (organic.count != null) o.count = organic.count;
    if (organic.etv != null) o.etv = organic.etv;
    if (organic.pos_1 != null) o.pos_1 = organic.pos_1;
    if (organic.pos_2_3 != null) o.pos_2_3 = organic.pos_2_3;
    if (organic.pos_4_10 != null) o.pos_4_10 = organic.pos_4_10;
    if (organic.is_up != null) o.is_up = organic.is_up;
    if (organic.is_down != null) o.is_down = organic.is_down;
    if (organic.is_new != null) o.is_new = organic.is_new;
    result.organic = o;
  }

  // Always include paid metrics (default to zeros when absent)
  const paid = item.metrics?.paid;
  result.paid = {
    count: paid?.count ?? 0,
    etv: paid?.etv ?? 0,
  };

  return result;
}
