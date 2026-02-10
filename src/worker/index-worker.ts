import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { DataForSEOClient, DataForSEOConfig } from '../core/client/dataforseo.client.js';
import { EnabledModulesSchema } from '../core/config/modules.config.js';
import { BaseModule, ToolDefinition } from '../core/modules/base.module.js';
import { ModuleLoaderService } from '../core/utils/module-loader.js';
import { CacheService } from '../core/cache/cache-service.js';
import { CacheModule } from '../core/modules/cache/cache.module.js';
import { createCacheWrappedHandler } from '../core/cache/cache-middleware.js';
import { version, name } from './version.worker.js';

/**
 * DataForSEO MCP Server for Cloudflare Workers
 *
 * This server provides MCP (Model Context Protocol) access to DataForSEO APIs
 * through a Cloudflare Worker runtime using the agents/mcp pattern.
 */

// Server metadata
const SERVER_NAME = `${name} (Worker)`;
const SERVER_VERSION = version;
globalThis.__PACKAGE_VERSION__ = version;
globalThis.__PACKAGE_NAME__ = name;
/**
 * DataForSEO MCP Agent for Cloudflare Workers
 */
export class DataForSEOMcpAgent extends McpAgent {
  server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  constructor(ctx: DurableObjectState, protected env: Env){
    super(ctx, env);
  }

  async init() {
    const workerEnv = this.env || (globalThis as any).workerEnv;
    if (!workerEnv) {
      throw new Error(`Worker environment not available`);
    }

    // Initialize DataForSEO client
    const dataForSEOConfig: DataForSEOConfig = {
      username: workerEnv.DATAFORSEO_USERNAME || "",
      password: workerEnv.DATAFORSEO_PASSWORD || "",
    };

    const dataForSEOClient = new DataForSEOClient(dataForSEOConfig);

    // Parse enabled modules from environment
    const enabledModules = EnabledModulesSchema.parse(workerEnv.ENABLED_MODULES);

    // Initialize and load modules
    const modules: BaseModule[] = ModuleLoaderService.loadModules(dataForSEOClient, enabledModules);

    // Initialize D1 cache if binding exists
    const db = (workerEnv as any).SEO_CACHE_DB;
    let cacheService: CacheService | null = null;

    if (db) {
      cacheService = new CacheService(db);
      // Lightweight connectivity check — tables must exist via migrations
      try {
        await cacheService.verifyConnection();
      } catch (e) {
        console.error('D1 cache connectivity check failed (tables may not exist yet):', e);
        // Continue anyway — cache tools will return errors but won't block other tools
      }
    }

    // Register tools from all modules
    modules.forEach(module => {
      const tools = module.getTools();
      Object.entries(tools).forEach(([name, tool]) => {
        const typedTool = tool as ToolDefinition;
        const schema = z.object(typedTool.params);

        // Wrap handler with cache middleware if D1 is available
        const handler = cacheService
          ? createCacheWrappedHandler(name, typedTool.handler, cacheService)
          : typedTool.handler;

        this.server.tool(
          name,
          schema.shape,
          handler
        );
      });
    });

    // Register cache tools if D1 binding exists
    if (db) {
      try {
        const cacheModule = new CacheModule(db);
        const cacheTools = cacheModule.getTools();
        for (const [toolName, tool] of Object.entries(cacheTools)) {
          try {
            const typedTool = tool as ToolDefinition;
            this.server.tool(
              toolName,
              typedTool.description,
              typedTool.params,
              typedTool.handler
            );
            console.error(`Registered cache tool: ${toolName}`);
          } catch (e) {
            console.error(`Failed to register cache tool ${toolName}:`, e);
          }
        }
      } catch (e) {
        console.error('Failed to initialize cache module:', e);
      }
    }
  }
}

/**
 * Creates a JSON-RPC error response
 */
function createErrorResponse(code: number, message: string): Response {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  }), {
    status: code === -32001 ? 401 : 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Store environment in global context for McpAgent access
    (globalThis as any).workerEnv = env;

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        server: SERVER_NAME,
        version: SERVER_VERSION,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Shared secret authentication for MCP endpoints
    // Routes: /mcp/{token}, /sse/{token}, /sse/{token}/message
    const mcpMatch = url.pathname.match(/^\/(mcp|http|sse)\/([^/]+)(\/message)?$/);
    if (mcpMatch) {
      const [, route, token, messageSuffix] = mcpMatch;
      if (!env.SHARED_SECRET || token !== env.SHARED_SECRET) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Check if credentials are configured
      if (!env.DATAFORSEO_USERNAME || !env.DATAFORSEO_PASSWORD) {
        return createErrorResponse(-32001, "DataForSEO credentials not configured in worker environment variables");
      }

      // Rewrite the URL to strip the token so the handler sees the original path
      const cleanPath = route === "sse" && messageSuffix ? "/sse/message" : `/${route}`;
      const rewrittenUrl = new URL(cleanPath, url.origin);
      rewrittenUrl.search = url.search;
      const rewrittenRequest = new Request(rewrittenUrl.toString(), request);

      if (route === "sse") {
        return DataForSEOMcpAgent.serveSSE("/sse").fetch(rewrittenRequest, env, ctx);
      }
      // mcp or http
      return DataForSEOMcpAgent.serve("/mcp").fetch(rewrittenRequest, env, ctx);
    }

    // Reject bare /mcp, /sse, /http without a token
    if (["/mcp", "/http", "/sse", "/sse/message"].includes(url.pathname)) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
