/**
 * MCP Tool Adapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MCPToolAdapter,
  MCPServerConfig,
  loadMCPConfig,
  RetryConfig,
} from '../mcp-tool-adapter.js';

// Create mock functions
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockCallTool = vi
  .fn()
  .mockResolvedValue({ content: [{ text: 'result' }] });
const mockListTools = vi.fn().mockResolvedValue({
  tools: [
    {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: { arg1: { type: 'string' } },
        required: ['arg1'],
      },
    },
  ],
});

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    callTool: mockCallTool,
    listTools: mockListTools,
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test.js'],
            env: { API_KEY: '${API_KEY}' },
          },
          'disabled-server': {
            command: 'node',
            args: ['disabled.js'],
            disabled: true,
          },
        },
      })
    ),
  },
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['test.js'],
          env: { API_KEY: '${API_KEY}' },
        },
        'disabled-server': {
          command: 'node',
          args: ['disabled.js'],
          disabled: true,
        },
      },
    })
  ),
}));

describe('MCPToolAdapter', () => {
  let adapter: MCPToolAdapter;
  const testConfig: MCPServerConfig = {
    name: 'test-server',
    command: 'node',
    args: ['test.js'],
    env: { API_KEY: 'test-key' },
  };

  beforeEach(() => {
    adapter = new MCPToolAdapter();
    // Reset all mocks to default behavior
    mockConnect.mockReset().mockResolvedValue(undefined);
    mockClose.mockReset().mockResolvedValue(undefined);
    mockCallTool
      .mockReset()
      .mockResolvedValue({ content: [{ text: 'result' }] });
    mockListTools.mockReset().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: { arg1: { type: 'string' } },
            required: ['arg1'],
          },
        },
      ],
    });
  });

  afterEach(async () => {
    await adapter.disconnectAll();
  });

  describe('constructor', () => {
    it('should create instance with default retry config', () => {
      const adapter = new MCPToolAdapter();
      expect(adapter).toBeInstanceOf(MCPToolAdapter);
    });

    it('should create instance with custom retry config', () => {
      const customConfig: Partial<RetryConfig> = {
        maxRetries: 5,
        initialDelayMs: 500,
      };
      const adapter = new MCPToolAdapter(customConfig);
      expect(adapter).toBeInstanceOf(MCPToolAdapter);
    });
  });

  describe('connect', () => {
    it('should connect to an MCP server', async () => {
      await adapter.connect(testConfig);
      expect(adapter.isConnected('test-server')).toBe(true);
    });

    it('should not create duplicate connections', async () => {
      await adapter.connect(testConfig);
      await adapter.connect(testConfig);
      expect(adapter.getConnectedServers()).toHaveLength(1);
    });

    it('should handle connection errors', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

      const adapter = new MCPToolAdapter();
      await expect(adapter.connect(testConfig)).rejects.toThrow(
        'Connection failed'
      );
    });
  });

  describe('connectWithRetry', () => {
    it('should retry on connection failure', async () => {
      let attempts = 0;
      mockConnect.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Connection failed');
        }
      });

      const adapter = new MCPToolAdapter({
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });

      await adapter.connectWithRetry(testConfig);
      expect(attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      const adapter = new MCPToolAdapter({
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });

      await expect(adapter.connectWithRetry(testConfig)).rejects.toThrow(
        /Failed to connect.*after 3 attempts/
      );
    });
  });

  describe('callTool', () => {
    it('should call a tool on connected server', async () => {
      await adapter.connect(testConfig);
      const result = await adapter.callTool('test-server', 'test_tool', {
        arg1: 'value',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return error for non-connected server', async () => {
      const result = await adapter.callTool('non-existent', 'test_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('not connected');
    });

    it('should handle tool call errors', async () => {
      mockCallTool.mockRejectedValue(new Error('Tool call failed'));

      const adapter = new MCPToolAdapter();
      await adapter.connect(testConfig);

      const result = await adapter.callTool('test-server', 'test_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool call failed');
    });
  });

  describe('callToolWithRetry', () => {
    it('should retry on retryable errors', async () => {
      let attempts = 0;
      mockCallTool.mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ETIMEDOUT');
        }
        return { content: [{ text: 'success' }] };
      });

      const adapter = new MCPToolAdapter({
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 100,
      });

      await adapter.connect(testConfig);
      const result = await adapter.callToolWithRetry(
        'test-server',
        'test_tool',
        {}
      );

      expect(result.success).toBe(true);
      expect(attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      mockCallTool.mockImplementation(async () => {
        attempts++;
        throw new Error('Invalid argument');
      });

      const adapter = new MCPToolAdapter({
        maxRetries: 3,
        initialDelayMs: 10,
      });

      await adapter.connect(testConfig);
      const result = await adapter.callToolWithRetry(
        'test-server',
        'test_tool',
        {}
      );

      expect(result.success).toBe(false);
      expect(attempts).toBe(1); // No retry for non-retryable error
    });
  });

  describe('listTools', () => {
    it('should list tools from connected server', async () => {
      await adapter.connect(testConfig);
      const tools = await adapter.listTools('test-server');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
      expect(tools[0].description).toBe('A test tool');
    });

    it('should return empty array for non-connected server', async () => {
      const tools = await adapter.listTools('non-existent');
      expect(tools).toEqual([]);
    });
  });

  describe('listAllTools', () => {
    it('should list tools from all connected servers', async () => {
      await adapter.connect(testConfig);
      await adapter.connect({
        ...testConfig,
        name: 'another-server',
      });

      const allTools = await adapter.listAllTools();

      expect(allTools.size).toBe(2);
      expect(allTools.has('test-server')).toBe(true);
      expect(allTools.has('another-server')).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from a server', async () => {
      await adapter.connect(testConfig);
      expect(adapter.isConnected('test-server')).toBe(true);

      await adapter.disconnect('test-server');
      expect(adapter.isConnected('test-server')).toBe(false);
    });

    it('should handle disconnect for non-existent server', async () => {
      await expect(adapter.disconnect('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect from all servers', async () => {
      await adapter.connect(testConfig);
      await adapter.connect({ ...testConfig, name: 'another-server' });

      expect(adapter.getConnectedServers()).toHaveLength(2);

      await adapter.disconnectAll();

      expect(adapter.getConnectedServers()).toHaveLength(0);
    });
  });

  describe('getConnectionStats', () => {
    it('should return connection statistics', async () => {
      await adapter.connect(testConfig);

      const stats = adapter.getConnectionStats();

      expect(stats.has('test-server')).toBe(true);
      const serverStats = stats.get('test-server')!;
      expect(serverStats.connected).toBe(true);
      expect(serverStats.lastActivity).toBeInstanceOf(Date);
      expect(serverStats.retryCount).toBe(0);
    });
  });
});

describe('loadMCPConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY = 'env-api-key';
  });

  afterEach(() => {
    delete process.env.API_KEY;
  });

  it('should load and parse MCP config file', async () => {
    const configs = await loadMCPConfig('/path/to/mcp.json');

    expect(configs).toHaveLength(1); // disabled server should be filtered out
    expect(configs[0].name).toBe('test-server');
    expect(configs[0].command).toBe('node');
    expect(configs[0].args).toEqual(['test.js']);
  });

  it('should resolve environment variables', async () => {
    const configs = await loadMCPConfig('/path/to/mcp.json');

    expect(configs[0].env?.API_KEY).toBe('env-api-key');
  });

  it('should filter out disabled servers', async () => {
    const configs = await loadMCPConfig('/path/to/mcp.json');

    const names = configs.map((c) => c.name);
    expect(names).not.toContain('disabled-server');
  });
});
