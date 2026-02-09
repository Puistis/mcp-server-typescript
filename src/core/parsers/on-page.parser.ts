/**
 * Parser for on_page_instant_pages and on_page_content_parsing
 *
 * Light-touch parsing: only removes clearly unnecessary fields.
 * Content is inherently needed so we don't strip aggressively.
 */

export function parseOnPage(item: any): any {
  if (!item) return null;

  // Shallow clone to avoid mutating original
  const result = { ...item };

  // Remove specified unnecessary fields
  delete result.status_code;
  delete result.size;
  delete result.encoded_size;
  delete result.total_dom_size;
  delete result.custom_js_response;
  delete result.resource_errors;
  delete result.broken_resources;

  return result;
}
