/**
 * Slack Notification Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SlackNotificationService,
  SLACK_MCP_SERVER,
} from '../slack-notification-service.js';
import { MCPToolAdapter } from '../../../agent-runtime/mcp-tool-adapter.js';

// Mock MCPToolAdapter
const mockCallToolWithRetry = vi.fn();

const mockMCPAdapter = {
  callToolWithRetry: mockCallToolWithRetry,
  callTool: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true),
} as unknown as MCPToolAdapter;

describe('SlackNotificationService', () => {
  let service: SlackNotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SlackNotificationService(mockMCPAdapter);
  });

  describe('constructor', () => {
    it('should create service with default channels', () => {
      const service = new SlackNotificationService(mockMCPAdapter);
      expect(service).toBeInstanceOf(SlackNotificationService);
    });

    it('should create service with custom channels', () => {
      const service = new SlackNotificationService(mockMCPAdapter, {
        devNotifications: '#custom-dev',
        escalations: '#custom-escalations',
      });
      expect(service).toBeInstanceOf(SlackNotificationService);
    });
  });

  describe('postMessage', () => {
    it('should post message successfully', async () => {
      const mockResponse = {
        ok: true,
        channel: 'C123',
        ts: '1234567890.123456',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockResponse,
      });

      const result = await service.postMessage({
        channel: '#test',
        text: 'Hello World',
      });

      expect(result.ok).toBe(true);
      expect(result.ts).toBe('1234567890.123456');
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#test',
          text: 'Hello World',
        })
      );
    });

    it('should throw error on failure', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'channel_not_found',
      });

      await expect(
        service.postMessage({
          channel: '#nonexistent',
          text: 'Hello',
        })
      ).rejects.toThrow('Failed to post Slack message');
    });
  });

  describe('replyToThread', () => {
    it('should reply to thread successfully', async () => {
      const mockResponse = {
        ok: true,
        channel: 'C123',
        ts: '1234567890.123457',
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockResponse,
      });

      const result = await service.replyToThread(
        '#test',
        '1234567890.123456',
        'Reply message'
      );

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          thread_ts: '1234567890.123456',
        })
      );
    });
  });

  describe('addReaction', () => {
    it('should add reaction successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true },
      });

      await expect(
        service.addReaction('#test', '1234567890.123456', 'thumbsup')
      ).resolves.toBeUndefined();

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_add_reaction',
        expect.objectContaining({
          name: 'thumbsup',
        })
      );
    });
  });

  describe('notifyTaskStart', () => {
    it('should send task start notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyTaskStart({
        id: 'task-123',
        title: 'Test Task',
        type: 'codegen',
      });

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#dev-notifications',
        })
      );
    });
  });

  describe('notifyTaskComplete', () => {
    it('should send success notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyTaskComplete(
        { id: 'task-123', title: 'Test Task' },
        { status: 'success', metrics: { durationMs: 1000 } }
      );

      expect(result.ok).toBe(true);
    });

    it('should send failure notification with error', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyTaskComplete(
        { id: 'task-123' },
        { status: 'failure', error: 'Something went wrong' }
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('notifyTaskError', () => {
    it('should send error notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyTaskError(
        { id: 'task-123' },
        new Error('Test error')
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('notifyEscalation', () => {
    it('should send critical escalation notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyEscalation({
        id: 'esc-123',
        timestamp: new Date().toISOString(),
        target: 'TechLead',
        severity: 'Sev.1-Critical',
        reason: 'Critical security vulnerability',
        status: 'pending',
      });

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#escalations',
        })
      );
    });

    it('should send low severity escalation', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyEscalation({
        id: 'esc-124',
        timestamp: new Date().toISOString(),
        target: 'PO',
        severity: 'Sev.4-Low',
        reason: 'Minor issue',
        status: 'pending',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('notifyPRReady', () => {
    it('should send PR notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyPRReady({
        number: 42,
        title: 'feat: Add new feature',
        url: 'https://github.com/org/repo/pull/42',
        body: 'This PR adds a new feature...',
        author: 'developer',
        labels: ['feature', 'needs-review'],
      });

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#code-review',
        })
      );
    });
  });

  describe('notifyDeployment', () => {
    it('should send deployment started notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyDeployment({
        environment: 'staging',
        version: 'v1.2.3',
        status: 'started',
        deployedBy: 'CI/CD',
      });

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#deployments',
        })
      );
    });

    it('should send deployment success notification with URL', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyDeployment({
        environment: 'production',
        version: 'v1.2.3',
        sha: 'abc123def456',
        url: 'https://app.example.com',
        status: 'success',
        duration: 120,
      });

      expect(result.ok).toBe(true);
    });

    it('should send deployment failure notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyDeployment({
        environment: 'production',
        version: 'v1.2.3',
        status: 'failure',
      });

      expect(result.ok).toBe(true);
    });

    it('should send rollback notification', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifyDeployment({
        environment: 'production',
        version: 'v1.2.2',
        status: 'rollback',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('notifySecurityAlert', () => {
    it('should send critical security alert', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifySecurityAlert({
        severity: 'critical',
        title: 'SQL Injection Vulnerability',
        description: 'Potential SQL injection found in user input handler',
        file: 'src/handlers/user.ts',
        line: 42,
        recommendation: 'Use parameterized queries',
        cve: 'CVE-2024-1234',
      });

      expect(result.ok).toBe(true);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_post_message',
        expect.objectContaining({
          channel: '#security-alerts',
        })
      );
    });

    it('should send low severity alert', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.notifySecurityAlert({
        severity: 'low',
        title: 'Outdated dependency',
        description: 'A dependency has a minor security update available',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('updateProgress', () => {
    it('should send progress update', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { ok: true, channel: 'C123', ts: '123' },
      });

      const result = await service.updateProgress('#test', '123.456', {
        current: 5,
        total: 10,
        message: 'Processing files...',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('getChannelHistory', () => {
    it('should get channel history', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { messages: [] },
      });

      const result = await service.getChannelHistory('#test', 20);

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_get_channel_history',
        expect.objectContaining({
          channel: '#test',
          limit: 20,
        })
      );
    });
  });

  describe('getThreadReplies', () => {
    it('should get thread replies', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { messages: [] },
      });

      const result = await service.getThreadReplies('#test', '123.456');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_get_thread_replies',
        expect.objectContaining({
          thread_ts: '123.456',
        })
      );
    });
  });

  describe('searchMessages', () => {
    it('should search messages', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { messages: { matches: [] } },
      });

      const result = await service.searchMessages('test query');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_search_messages',
        { query: 'test query' }
      );
    });
  });

  describe('getUserInfo', () => {
    it('should get user info', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { user: { id: 'U123', name: 'testuser' } },
      });

      const result = await service.getUserInfo('U123');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        SLACK_MCP_SERVER,
        'slack_get_user_profile',
        { user_id: 'U123' }
      );
    });
  });
});
