/**
 * Parser for dataforseo_labs_google_domain_rank_overview
 */

export function parseDomainRankOverview(item: any): any {
  if (!item) return null;

  const result: any = {
    target: item.target,
  };

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

  // Parse paid metrics (minimal)
  const paid = item.metrics?.paid;
  if (paid) {
    const p: any = {};
    if (paid.count != null) p.count = paid.count;
    if (paid.etv != null) p.etv = paid.etv;
    result.paid = p;
  }

  return result;
}
