/**
 * Type declarations for Cloudflare Worker secrets.
 *
 * These are set via `wrangler secret put` or the Cloudflare dashboard,
 * NOT in wrangler.jsonc vars, so `wrangler types` does not generate them.
 * This file ensures TypeScript knows about these runtime env properties.
 */
declare namespace Cloudflare {
  interface Env {
    DATAFORSEO_USERNAME: string;
    DATAFORSEO_PASSWORD: string;
    SHARED_SECRET: string;
  }
}
