/**
 * Cache Service for Cloudflare D1
 *
 * Provides cache check → fetch → store flow for keyword data.
 * Supports bulk query optimization: fetches only missing keywords from API.
 * All operations are language and location agnostic.
 */

/** TTL constants in days */
const TTL = {
  KEYWORD_DATA: 30,
  RANKINGS: 7,
  DOMAIN_OVERVIEW: 7,
  BACKLINKS: 7,
  SERP: 1,
  ONPAGE: 1,
  TRENDS: 1,
} as const;

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
};

type D1PreparedStatement = {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
};

type D1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: any;
};

type D1ExecResult = {
  count: number;
  duration: number;
};

function expiresAt(ttlDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + ttlDays);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

export interface CachedKeyword {
  keyword: string;
  location: string;
  language: string;
  search_volume: number;
  cpc: number | null;
  competition: string | null;
  intent: string | null;
  keyword_difficulty: number | null;
  monthly_searches: string | null;
  source: string;
  fetched_at: string;
  expires_at: string;
}

export class CacheService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ─── Keyword Cache ─────────────────────────────────────────────

  /**
   * Get cached keywords that are not expired.
   */
  async getCachedKeywords(keywords: string[], location: string, language: string): Promise<Map<string, CachedKeyword>> {
    if (keywords.length === 0) return new Map();

    const placeholders = keywords.map(() => '?').join(',');
    const result = await this.db.prepare(
      `SELECT * FROM keywords
       WHERE keyword IN (${placeholders})
       AND location = ? AND language = ?
       AND expires_at > datetime('now')`
    ).bind(...keywords, location, language).all<CachedKeyword>();

    const map = new Map<string, CachedKeyword>();
    for (const row of result.results) {
      map.set(row.keyword, row);
    }
    return map;
  }

  /**
   * Upsert a keyword into the cache.
   */
  async upsertKeyword(
    keyword: string,
    location: string,
    language: string,
    data: {
      search_volume?: number;
      cpc?: number | null;
      competition?: string | null;
      intent?: string | null;
      keyword_difficulty?: number | null;
      monthly_searches?: any;
    },
    source: string
  ): Promise<void> {
    const monthlyJson = data.monthly_searches
      ? (typeof data.monthly_searches === 'string' ? data.monthly_searches : JSON.stringify(data.monthly_searches))
      : null;

    await this.db.prepare(
      `INSERT INTO keywords (keyword, location, language, search_volume, cpc, competition, intent, keyword_difficulty, monthly_searches, source, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(keyword, location, language) DO UPDATE SET
         search_volume = excluded.search_volume,
         cpc = excluded.cpc,
         competition = excluded.competition,
         intent = excluded.intent,
         keyword_difficulty = excluded.keyword_difficulty,
         monthly_searches = excluded.monthly_searches,
         source = excluded.source,
         fetched_at = datetime('now'),
         expires_at = excluded.expires_at`
    ).bind(
      keyword,
      location,
      language,
      data.search_volume ?? 0,
      data.cpc ?? null,
      data.competition ?? null,
      data.intent ?? null,
      data.keyword_difficulty ?? null,
      monthlyJson,
      source,
      expiresAt(TTL.KEYWORD_DATA)
    ).run();
  }

  /**
   * Batch upsert parsed keyword items into the cache.
   */
  async upsertKeywordBatch(
    items: any[],
    location: string,
    language: string,
    source: string
  ): Promise<void> {
    const statements = items.map(item => {
      const kw = item.kw || item.keyword;
      if (!kw) return null;

      const monthlyJson = item.monthly ? JSON.stringify(item.monthly) : null;

      return this.db.prepare(
        `INSERT INTO keywords (keyword, location, language, search_volume, cpc, competition, intent, keyword_difficulty, monthly_searches, source, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
         ON CONFLICT(keyword, location, language) DO UPDATE SET
           search_volume = excluded.search_volume,
           cpc = excluded.cpc,
           competition = excluded.competition,
           intent = excluded.intent,
           keyword_difficulty = excluded.keyword_difficulty,
           monthly_searches = excluded.monthly_searches,
           source = excluded.source,
           fetched_at = datetime('now'),
           expires_at = excluded.expires_at`
      ).bind(
        kw,
        location,
        language,
        item.vol ?? item.search_volume ?? 0,
        item.cpc ?? null,
        item.comp ?? item.competition ?? null,
        item.intent ?? null,
        item.kd ?? item.keyword_difficulty ?? null,
        monthlyJson,
        source,
        expiresAt(TTL.KEYWORD_DATA)
      );
    }).filter(Boolean) as D1PreparedStatement[];

    if (statements.length > 0) {
      // D1 batch supports up to ~100 statements, chunk if needed
      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        await this.db.batch(statements.slice(i, i + CHUNK_SIZE));
      }
    }
  }

  // ─── Keyword Rankings Cache ────────────────────────────────────

  async upsertRankingBatch(
    items: any[],
    domain: string,
    location: string,
    language: string
  ): Promise<void> {
    const statements = items.map(item => {
      const kw = item.kw || item.keyword;
      if (!kw) return null;

      return this.db.prepare(
        `INSERT INTO keyword_rankings (keyword, domain, position, url, serp_type, etv, location, language, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
         ON CONFLICT(keyword, domain, location, language) DO UPDATE SET
           position = excluded.position,
           url = excluded.url,
           serp_type = excluded.serp_type,
           etv = excluded.etv,
           fetched_at = datetime('now'),
           expires_at = excluded.expires_at`
      ).bind(
        kw,
        domain,
        item.pos ?? item.position ?? null,
        item.url ?? null,
        item.type ?? item.serp_type ?? 'organic',
        item.etv ?? null,
        location,
        language,
        expiresAt(TTL.RANKINGS)
      );
    }).filter(Boolean) as D1PreparedStatement[];

    if (statements.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        await this.db.batch(statements.slice(i, i + CHUNK_SIZE));
      }
    }
  }

  // ─── Domain Cache ──────────────────────────────────────────────

  async upsertDomain(
    domain: string,
    location: string,
    language: string,
    data: any
  ): Promise<void> {
    const organic = data.organic || {};
    const paid = data.paid || {};

    await this.db.prepare(
      `INSERT INTO domains (domain, organic_keywords, organic_etv, paid_keywords, paid_etv, backlinks, referring_domains, domain_rank, location, language, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(domain, location, language) DO UPDATE SET
         organic_keywords = excluded.organic_keywords,
         organic_etv = excluded.organic_etv,
         paid_keywords = excluded.paid_keywords,
         paid_etv = excluded.paid_etv,
         backlinks = excluded.backlinks,
         referring_domains = excluded.referring_domains,
         domain_rank = excluded.domain_rank,
         fetched_at = datetime('now'),
         expires_at = excluded.expires_at`
    ).bind(
      domain,
      organic.count ?? null,
      organic.etv ?? null,
      paid.count ?? null,
      paid.etv ?? null,
      data.backlinks ?? null,
      data.ref_domains ?? data.referring_domains ?? null,
      data.rank ?? data.domain_rank ?? null,
      location,
      language,
      expiresAt(TTL.DOMAIN_OVERVIEW)
    ).run();
  }

  // ─── Search Logs ───────────────────────────────────────────────

  async logSearch(toolName: string, queryParams: any, resultCount: number, cacheHit: boolean): Promise<void> {
    await this.db.prepare(
      `INSERT INTO search_logs (tool_name, query_params, result_count, cache_hit, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(
      toolName,
      JSON.stringify(queryParams),
      resultCount,
      cacheHit ? 1 : 0
    ).run();
  }

  // ─── Cache Search Queries ──────────────────────────────────────

  async searchKeywords(params: {
    keywords?: string[];
    keyword_like?: string;
    min_volume?: number;
    max_volume?: number;
    competition?: string;
    intent?: string;
    location?: string;
    language?: string;
    sort_by?: string;
    sort_order?: string;
    limit?: number;
  }): Promise<any[]> {
    const conditions: string[] = ["expires_at > datetime('now')"];
    const bindings: any[] = [];

    if (params.keywords && params.keywords.length > 0) {
      const placeholders = params.keywords.map(() => '?').join(',');
      conditions.push(`keyword IN (${placeholders})`);
      bindings.push(...params.keywords);
    }
    if (params.keyword_like) {
      conditions.push('keyword LIKE ?');
      bindings.push(`%${params.keyword_like}%`);
    }
    if (params.min_volume != null) {
      conditions.push('search_volume >= ?');
      bindings.push(params.min_volume);
    }
    if (params.max_volume != null) {
      conditions.push('search_volume <= ?');
      bindings.push(params.max_volume);
    }
    if (params.competition) {
      conditions.push('competition = ?');
      bindings.push(params.competition);
    }
    if (params.intent) {
      conditions.push('intent = ?');
      bindings.push(params.intent);
    }
    if (params.location) {
      conditions.push('location = ?');
      bindings.push(params.location);
    }
    if (params.language) {
      conditions.push('language = ?');
      bindings.push(params.language);
    }

    const sortColumn = {
      volume: 'search_volume',
      cpc: 'cpc',
      difficulty: 'keyword_difficulty',
      fetched_at: 'fetched_at',
    }[params.sort_by || 'volume'] || 'search_volume';

    const sortOrder = params.sort_order === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(params.limit || 50, 500);

    const query = `SELECT keyword AS kw, search_volume AS vol, cpc, competition AS comp, intent, keyword_difficulty AS kd, monthly_searches AS monthly, location, language
      FROM keywords
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ?`;

    bindings.push(limit);

    const result = await this.db.prepare(query).bind(...bindings).all();
    return result.results.map((row: any) => {
      if (row.monthly && typeof row.monthly === 'string') {
        try { row.monthly = JSON.parse(row.monthly); } catch { /* keep as string */ }
      }
      return row;
    });
  }

  async searchRankings(params: {
    domain: string;
    location?: string;
    language?: string;
    limit?: number;
  }): Promise<any[]> {
    const conditions: string[] = ["kr.expires_at > datetime('now')", 'kr.domain = ?'];
    const bindings: any[] = [params.domain];

    if (params.location) {
      conditions.push('kr.location = ?');
      bindings.push(params.location);
    }
    if (params.language) {
      conditions.push('kr.language = ?');
      bindings.push(params.language);
    }

    const limit = Math.min(params.limit || 50, 500);
    bindings.push(limit);

    const query = `SELECT k.keyword AS kw, k.search_volume AS vol, kr.position AS pos, kr.url
      FROM keyword_rankings kr
      LEFT JOIN keywords k ON kr.keyword = k.keyword AND kr.location = k.location AND kr.language = k.language
      WHERE ${conditions.join(' AND ')}
      ORDER BY kr.position ASC
      LIMIT ?`;

    const result = await this.db.prepare(query).bind(...bindings).all();
    return result.results;
  }

  // ─── Cache Stats ───────────────────────────────────────────────

  async getStats(): Promise<any> {
    const [total, withVolume, expired, locations, languages, oldest, newest, domainsCount, rankingsCount, topKeywords] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as c FROM keywords').first<{ c: number }>(),
      this.db.prepare('SELECT COUNT(*) as c FROM keywords WHERE search_volume > 0').first<{ c: number }>(),
      this.db.prepare("SELECT COUNT(*) as c FROM keywords WHERE expires_at <= datetime('now')").first<{ c: number }>(),
      this.db.prepare('SELECT DISTINCT location FROM keywords').all<{ location: string }>(),
      this.db.prepare('SELECT DISTINCT language FROM keywords').all<{ language: string }>(),
      this.db.prepare('SELECT MIN(fetched_at) as d FROM keywords').first<{ d: string | null }>(),
      this.db.prepare('SELECT MAX(fetched_at) as d FROM keywords').first<{ d: string | null }>(),
      this.db.prepare('SELECT COUNT(DISTINCT domain) as c FROM domains').first<{ c: number }>(),
      this.db.prepare('SELECT COUNT(*) as c FROM keyword_rankings').first<{ c: number }>(),
      this.db.prepare(
        "SELECT keyword AS kw, search_volume AS vol, location, language FROM keywords WHERE expires_at > datetime('now') ORDER BY search_volume DESC LIMIT 10"
      ).all<{ kw: string; vol: number; location: string; language: string }>(),
    ]);

    return {
      total_keywords: total?.c ?? 0,
      with_volume: withVolume?.c ?? 0,
      without_volume: (total?.c ?? 0) - (withVolume?.c ?? 0),
      locations: locations.results.map(r => r.location),
      languages: languages.results.map(r => r.language),
      oldest_entry: oldest?.d ?? null,
      newest_entry: newest?.d ?? null,
      expired_entries: expired?.c ?? 0,
      domains_tracked: domainsCount?.c ?? 0,
      rankings_stored: rankingsCount?.c ?? 0,
      top_keywords_by_volume: topKeywords.results,
    };
  }

  // ─── Cache Export ──────────────────────────────────────────────

  async exportKeywords(params: {
    format?: string;
    min_volume?: number;
    location?: string;
    language?: string;
    keyword_like?: string;
    limit?: number;
  }): Promise<any> {
    const conditions: string[] = ["expires_at > datetime('now')"];
    const bindings: any[] = [];

    if (params.min_volume != null) {
      conditions.push('search_volume >= ?');
      bindings.push(params.min_volume);
    }
    if (params.location) {
      conditions.push('location = ?');
      bindings.push(params.location);
    }
    if (params.language) {
      conditions.push('language = ?');
      bindings.push(params.language);
    }
    if (params.keyword_like) {
      conditions.push('keyword LIKE ?');
      bindings.push(`%${params.keyword_like}%`);
    }

    const limit = Math.min(params.limit || 100, 1000);
    bindings.push(limit);

    const query = `SELECT keyword, search_volume, cpc, competition, intent, keyword_difficulty, monthly_searches, location, language, fetched_at
      FROM keywords
      WHERE ${conditions.join(' AND ')}
      ORDER BY search_volume DESC
      LIMIT ?`;

    const result = await this.db.prepare(query).bind(...bindings).all<any>();

    if (params.format === 'csv') {
      const headers = 'keyword,search_volume,cpc,competition,intent,keyword_difficulty,location,language,fetched_at';
      const rows = result.results.map((r: any) =>
        `"${(r.keyword || '').replace(/"/g, '""')}",${r.search_volume ?? 0},${r.cpc ?? ''},${r.competition ?? ''},${r.intent ?? ''},${r.keyword_difficulty ?? ''},${r.location ?? ''},${r.language ?? ''},${r.fetched_at ?? ''}`
      );
      return headers + '\n' + rows.join('\n');
    }

    // JSON format
    return result.results.map((row: any) => {
      if (row.monthly_searches && typeof row.monthly_searches === 'string') {
        try { row.monthly_searches = JSON.parse(row.monthly_searches); } catch { /* keep as string */ }
      }
      return row;
    });
  }

  // ─── Cache Invalidation ──────────────────────────────────────────

  async clearCache(params: {
    table?: string;
    location?: string;
    language?: string;
    keyword_like?: string;
  }): Promise<{ deleted: number }> {
    const table = params.table || 'keywords';
    const allowed = ['keywords', 'keyword_rankings', 'domains', 'search_logs'];
    if (!allowed.includes(table)) {
      throw new Error(`Invalid table: ${table}. Must be one of: ${allowed.join(', ')}`);
    }

    if (table === 'search_logs') {
      const result = await this.db.prepare('DELETE FROM search_logs').run();
      return { deleted: result.meta?.changes ?? 0 };
    }

    const conditions: string[] = [];
    const bindings: any[] = [];

    if (params.location) {
      conditions.push('location = ?');
      bindings.push(params.location);
    }
    if (params.language) {
      conditions.push('language = ?');
      bindings.push(params.language);
    }
    if (params.keyword_like && table !== 'domains') {
      conditions.push('keyword LIKE ?');
      bindings.push(`%${params.keyword_like}%`);
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.prepare(`DELETE FROM ${table}${where}`).bind(...bindings).run();
    return { deleted: result.meta?.changes ?? 0 };
  }

  // ─── Verify DB Connection ───────────────────────────────────────

  /**
   * Lightweight check that the D1 binding is functional.
   * Tables should be created via migrations (dashboard or wrangler d1 execute),
   * NOT via exec() at runtime which can fail on production D1.
   */
  async verifyConnection(): Promise<void> {
    await this.db.prepare("SELECT 1").first();
  }
}
