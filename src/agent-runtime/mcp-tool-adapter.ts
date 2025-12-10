/**
 * MCP Tool Adapter
 *
 * Adapter class for communicating with MCP (Model Context Protocol) servers.
 * Provides unified interface for all Agents to interact with MCP servers.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * MCP Tool Result
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Tool Definition
 */
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Connection State
 */
interface ConnectionState {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
  connected: boolean;
  lastActivity: Date;
  retryCount: number;
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * MCP Config File Structure
 */
interface MCPConfigFile {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
      disabled?: boolean;
      description?: string;
    }
  >;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * MCP Tool Adapter Class
 *
 * Provides connection pooling, retry logic, and unified interface
 * for all Agents to communicate with MCP servers.
 */
export class MCPToolAdapter {
  private connections: Map<string, ConnectionState> = new Map();
  private retryConfig: RetryConfig;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      const existing = this.connections.get(config.name)!;
      if (existing.connected) {
        return; // Already connected
      }
      // Clean up existing disconnected connection
      await this.disconnect(config.name);
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    const client = new Client(
      {
        name: 'god-agent',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    this.connections.set(config.name, {
      client,
      transport,
      config,
      connected: true,
      lastActivity: new Date(),
      retryCount: 0,
    });
  }

  /**
   * Connect to an MCP server with retry logic
   */
  async connectWithRetry(config: MCPServerConfig): Promise<void> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        await this.connect(config);
        return;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(
            delay * this.retryConfig.backoffMultiplier,
            this.retryConfig.maxDelayMs
          );
        }
      }
    }

    throw new Error(
      `Failed to connect to ${config.name} after ${this.retryConfig.maxRetries + 1} attempts: ${lastError?.message}`
    );
  }

  /**
   * Call a tool on an MCP server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      return { success: false, error: `Server ${serverName} not connected` };
    }

    if (!connection.connected) {
      return { success: false, error: `Server ${serverName} is disconnected` };
    }

    try {
      connection.lastActivity = new Date();
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });
      connection.retryCount = 0;
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Call a tool with retry logic
   */
  async callToolWithRetry(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    let lastError: string | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const result = await this.callTool(serverName, toolName, args);

      if (result.success) {
        return result;
      }

      lastError = result.error;

      // Check if error is retryable
      if (!this.isRetryableError(result.error)) {
        return result;
      }

      // Try to reconnect if connection was lost
      const connection = this.connections.get(serverName);
      if (connection && !connection.connected) {
        try {
          await this.connect(connection.config);
        } catch {
          // Ignore reconnection errors, will retry on next attempt
        }
      }

      if (attempt < this.retryConfig.maxRetries) {
        await this.sleep(delay);
        delay = Math.min(
          delay * this.retryConfig.backoffMultiplier,
          this.retryConfig.maxDelayMs
        );
      }
    }

    return {
      success: false,
      error: `Failed after ${this.retryConfig.maxRetries + 1} attempts: ${lastError}`,
    };
  }

  /**
   * List available tools on an MCP server
   */
  async listTools(serverName: string): Promise<MCPToolDefinition[]> {
    const connection = this.connections.get(serverName);
    if (!connection || !connection.connected) {
      return [];
    }

    try {
      connection.lastActivity = new Date();
      const result = await connection.client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as MCPToolDefinition['inputSchema'],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get all available tools across all connected servers
   */
  async listAllTools(): Promise<Map<string, MCPToolDefinition[]>> {
    const allTools = new Map<string, MCPToolDefinition[]>();

    for (const [serverName] of this.connections) {
      const tools = await this.listTools(serverName);
      allTools.set(serverName, tools);
    }

    return allTools;
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (connection) {
      try {
        await connection.client.close();
      } catch {
        // Ignore close errors
      }
      this.connections.delete(serverName);
    }
  }

  /**
   * Disconnect from all MCP servers
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.connections.keys());
    await Promise.all(serverNames.map((name) => this.disconnect(name)));
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverName: string): boolean {
    const connection = this.connections.get(serverName);
    return connection?.connected ?? false;
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, state]) => state.connected)
      .map(([name]) => name);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): Map<
    string,
    {
      connected: boolean;
      lastActivity: Date;
      retryCount: number;
    }
  > {
    const stats = new Map<
      string,
      {
        connected: boolean;
        lastActivity: Date;
        retryCount: number;
      }
    >();

    for (const [name, state] of this.connections) {
      stats.set(name, {
        connected: state.connected,
        lastActivity: state.lastActivity,
        retryCount: state.retryCount,
      });
    }

    return stats;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error?: string): boolean {
    if (!error) return false;

    const retryablePatterns = [
      /timeout/i,
      /connection.*refused/i,
      /ECONNRESET/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /network/i,
      /unavailable/i,
    ];

    return retryablePatterns.some((pattern) => pattern.test(error));
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Load MCP configuration from file
 *
 * @param configPath Path to .claude/mcp.json
 * @returns Array of MCP server configurations
 */
export async function loadMCPConfig(
  configPath: string
): Promise<MCPServerConfig[]> {
  const absolutePath = path.resolve(configPath);
  const content = await fs.readFile(absolutePath, 'utf-8');
  const config: MCPConfigFile = JSON.parse(content);

  return Object.entries(config.mcpServers)
    .filter(([, server]) => !server.disabled)
    .map(([name, server]) => ({
      name,
      command: server.command,
      args: server.args,
      env: resolveEnvVariables(server.env),
    }));
}

/**
 * Resolve environment variables in config
 */
function resolveEnvVariables(
  env?: Record<string, string>
): Record<string, string> | undefined {
  if (!env) return undefined;

  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Replace ${VAR_NAME} with actual environment variable
    resolved[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] || '';
    });
  }

  return resolved;
}

/**
 * Create MCP Tool Adapter with servers from config file
 *
 * @param configPath Path to .claude/mcp.json
 * @param retryConfig Optional retry configuration
 * @returns Configured MCPToolAdapter instance
 */
export async function createMCPToolAdapter(
  configPath: string,
  retryConfig?: Partial<RetryConfig>
): Promise<MCPToolAdapter> {
  const adapter = new MCPToolAdapter(retryConfig);
  const configs = await loadMCPConfig(configPath);

  // Connect to all servers in parallel
  await Promise.allSettled(
    configs.map((config) => adapter.connectWithRetry(config))
  );

  return adapter;
}
