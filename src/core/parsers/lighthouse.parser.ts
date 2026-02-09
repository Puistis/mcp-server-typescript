/**
 * Parser for on_page_lighthouse
 *
 * Keeps only scores and critical audit results (failed/warnings).
 * Removes passed audits, timing, config, environment, etc.
 */

export function parseLighthouse(item: any): any {
  if (!item) return null;

  const result: any = {};

  if (item.url) result.url = item.url;

  // Extract category scores
  const categories = item.categories;
  if (categories) {
    const scores: any = {};
    if (categories.performance?.score != null) scores.performance = Math.round(categories.performance.score * 100);
    if (categories.accessibility?.score != null) scores.accessibility = Math.round(categories.accessibility.score * 100);
    if (categories['best-practices']?.score != null) scores.best_practices = Math.round(categories['best-practices'].score * 100);
    if (categories.seo?.score != null) scores.seo = Math.round(categories.seo.score * 100);
    result.scores = scores;
  }

  // Extract audit summary and failed audits
  const audits = item.audits;
  if (audits && typeof audits === 'object') {
    let passed = 0;
    let failed = 0;
    let warnings = 0;
    const failedAudits: any[] = [];

    for (const [key, audit] of Object.entries(audits) as [string, any][]) {
      if (!audit || audit.score === undefined) continue;

      if (audit.score === 1 || audit.score === null) {
        passed++;
      } else if (audit.score === 0) {
        failed++;
        failedAudits.push({
          id: key,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue,
        });
      } else {
        warnings++;
        failedAudits.push({
          id: key,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue,
        });
      }
    }

    result.audits_summary = { passed, failed, warnings };
    if (failedAudits.length > 0) result.failed_audits = failedAudits;
  }

  return result;
}
