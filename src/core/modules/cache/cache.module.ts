/**
 * Cache Module — provides MCP tools for querying the local keyword cache.
 * These tools query ONLY the D1 cache and never make external API calls.
 */

import { z } from 'zod';
import { ToolDefinition } from '../base.module.js';
import { PromptDefinition } from '../prompt-definition.js';
import { CacheService, D1Database } from '../../cache/cache-service.js';

export class CacheModule {
  private cacheService: CacheService;

  constructor(db: D1Database) {
    this.cacheService = new CacheService(db);
  }

  getCacheService(): CacheService {
    return this.cacheService;
  }

  getTools(): Record<string, ToolDefinition> {
    return {
      cache_search: {
        description: 'Search previously fetched keyword data from the local cache without making any API calls. Useful for retrieving data that was fetched in earlier conversations.',
        params: {
          keywords: z.array(z.string()).optional().describe('Search by exact keywords'),
          keyword_like: z.string().optional().describe('Partial match search (SQL LIKE)'),
          min_volume: z.number().optional().describe('Filter by minimum search volume'),
          max_volume: z.number().optional().describe('Filter by maximum search volume'),
          competition: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().describe('Filter by competition level'),
          intent: z.enum(['informational', 'commercial', 'transactional', 'navigational']).optional().describe('Filter by search intent'),
          location: z.string().optional().describe('Filter by location'),
          language: z.string().optional().describe('Filter by language code'),
          domain: z.string().optional().describe('Search keyword_rankings for a specific domain'),
          sort_by: z.enum(['volume', 'cpc', 'difficulty', 'fetched_at']).default('volume').describe('Sort field'),
          sort_order: z.enum(['asc', 'desc']).default('desc').describe('Sort order'),
          limit: z.number().min(1).max(500).default(50).describe('Maximum results to return'),
        },
        handler: async (params: any) => {
          try {
            // If domain is specified, search rankings instead
            if (params.domain) {
              const results = await this.cacheService.searchRankings({
                domain: params.domain,
                location: params.location,
                language: params.language,
                limit: params.limit,
              });
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ count: results.length, items: results }, null, 2),
                }],
              };
            }

            const results = await this.cacheService.searchKeywords({
              keywords: params.keywords,
              keyword_like: params.keyword_like,
              min_volume: params.min_volume,
              max_volume: params.max_volume,
              competition: params.competition,
              intent: params.intent,
              location: params.location,
              language: params.language,
              sort_by: params.sort_by,
              sort_order: params.sort_order,
              limit: params.limit,
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ count: results.length, items: results }, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }],
            };
          }
        },
      },

      cache_stats: {
        description: 'Show a summary of all data stored in the keyword cache, including total keywords, locations, languages, and top keywords by volume.',
        params: {},
        handler: async () => {
          try {
            const stats = await this.cacheService.getStats();
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(stats, null, 2),
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }],
            };
          }
        },
      },

      cache_export: {
        description: 'Export keyword data from cache in JSON or CSV format.',
        params: {
          format: z.enum(['json', 'csv']).default('json').describe('Export format'),
          min_volume: z.number().optional().describe('Filter by minimum search volume'),
          location: z.string().optional().describe('Filter by location'),
          language: z.string().optional().describe('Filter by language code'),
          keyword_like: z.string().optional().describe('Partial match filter'),
          limit: z.number().min(1).max(1000).default(100).describe('Maximum results to export'),
        },
        handler: async (params: any) => {
          try {
            const data = await this.cacheService.exportKeywords({
              format: params.format,
              min_volume: params.min_volume,
              location: params.location,
              language: params.language,
              keyword_like: params.keyword_like,
              limit: params.limit,
            });

            const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            return {
              content: [{
                type: 'text',
                text,
              }],
            };
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }],
            };
          }
        },
      },
    };
  }

  getPrompts(): Record<string, PromptDefinition> {
    return {};
  }
}
