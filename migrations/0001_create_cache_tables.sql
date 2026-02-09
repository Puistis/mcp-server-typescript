-- Migration: Create keyword cache tables for SEO-MCP server
-- These tables store fetched keyword data for instant retrieval without API calls.
-- All tables are language and location agnostic.

CREATE TABLE IF NOT EXISTS keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  language TEXT NOT NULL,
  search_volume INTEGER DEFAULT 0,
  cpc REAL,
  competition TEXT,
  intent TEXT,
  keyword_difficulty INTEGER,
  monthly_searches TEXT, -- JSON string: {"2025-12": 70, ...}
  source TEXT NOT NULL, -- 'google_ads' | 'keyword_suggestions' | 'keyword_ideas' | 'related_keywords'
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(keyword, location, language)
);

CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_keywords_volume ON keywords(search_volume DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_fetched ON keywords(fetched_at);
CREATE INDEX IF NOT EXISTS idx_keywords_expires ON keywords(expires_at);
CREATE INDEX IF NOT EXISTS idx_keywords_location_language ON keywords(location, language);

CREATE TABLE IF NOT EXISTS keyword_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  domain TEXT NOT NULL,
  position INTEGER,
  url TEXT,
  serp_type TEXT, -- 'organic' | 'paid' | 'featured_snippet'
  etv REAL,
  location TEXT NOT NULL,
  language TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(keyword, domain, location, language)
);

CREATE INDEX IF NOT EXISTS idx_rankings_domain ON keyword_rankings(domain);
CREATE INDEX IF NOT EXISTS idx_rankings_keyword ON keyword_rankings(keyword);
CREATE INDEX IF NOT EXISTS idx_rankings_location_language ON keyword_rankings(location, language);

CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  organic_keywords INTEGER,
  organic_etv REAL,
  paid_keywords INTEGER,
  paid_etv REAL,
  backlinks INTEGER,
  referring_domains INTEGER,
  domain_rank REAL,
  location TEXT NOT NULL,
  language TEXT NOT NULL,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(domain, location, language)
);

CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_location_language ON domains(location, language);

CREATE TABLE IF NOT EXISTS search_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name TEXT NOT NULL,
  query_params TEXT NOT NULL, -- JSON: full request parameters
  result_count INTEGER,
  cache_hit BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
