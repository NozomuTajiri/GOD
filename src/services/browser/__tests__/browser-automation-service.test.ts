/**
 * Browser Automation Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BrowserAutomationService,
  PUPPETEER_MCP_SERVER,
  E2E_TEST_TEMPLATES,
} from '../browser-automation-service.js';
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

describe('BrowserAutomationService', () => {
  let service: BrowserAutomationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BrowserAutomationService(mockMCPAdapter);
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const service = new BrowserAutomationService(mockMCPAdapter);
      expect(service).toBeInstanceOf(BrowserAutomationService);
    });

    it('should create service with custom config', () => {
      const service = new BrowserAutomationService(mockMCPAdapter, {
        baseUrl: 'http://localhost:3000',
        viewport: { width: 1920, height: 1080 },
      });
      expect(service).toBeInstanceOf(BrowserAutomationService);
    });
  });

  describe('navigate', () => {
    it('should navigate to URL successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await service.navigate('http://example.com');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_navigate',
        { url: 'http://example.com' }
      );
    });

    it('should resolve relative URL with baseUrl', async () => {
      const serviceWithBase = new BrowserAutomationService(mockMCPAdapter, {
        baseUrl: 'http://localhost:3000',
      });

      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await serviceWithBase.navigate('/login');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_navigate',
        { url: 'http://localhost:3000/login' }
      );
    });

    it('should throw error on failure', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      await expect(service.navigate('http://example.com')).rejects.toThrow(
        'Failed to navigate'
      );
    });
  });

  describe('click', () => {
    it('should click element successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await service.click('#submit-button');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_click',
        { selector: '#submit-button' }
      );
    });

    it('should throw error on failure', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'Element not found',
      });

      await expect(service.click('#nonexistent')).rejects.toThrow(
        'Failed to click'
      );
    });
  });

  describe('fill', () => {
    it('should fill form field successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await service.fill('#email', 'test@example.com');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_fill',
        { selector: '#email', value: 'test@example.com' }
      );
    });
  });

  describe('select', () => {
    it('should select option successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await service.select('#country', 'US');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_select',
        { selector: '#country', value: 'US' }
      );
    });
  });

  describe('hover', () => {
    it('should hover over element successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });

      await service.hover('.menu-item');

      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_hover',
        { selector: '.menu-item' }
      );
    });
  });

  describe('screenshot', () => {
    it('should take screenshot successfully', async () => {
      const mockScreenshot = {
        base64: 'iVBORw0KGgo...',
        width: 1280,
        height: 720,
      };

      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: mockScreenshot,
      });

      const result = await service.screenshot('test-screenshot');

      expect(result.base64).toBe('iVBORw0KGgo...');
      expect(result.width).toBe(1280);
      expect(mockCallToolWithRetry).toHaveBeenCalledWith(
        PUPPETEER_MCP_SERVER,
        'puppeteer_screenshot',
        expect.objectContaining({ name: 'test-screenshot' })
      );
    });
  });

  describe('evaluate', () => {
    it('should execute JavaScript successfully', async () => {
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { result: 'Hello' },
      });

      const result = await service.evaluate('return "Hello"');

      expect(result).toEqual({ result: 'Hello' });
    });
  });

  describe('runE2ETest', () => {
    it('should run simple test case successfully', async () => {
      // Mock navigate
      mockCallToolWithRetry.mockResolvedValueOnce({ success: true });
      // Mock screenshot
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: true,
        data: { base64: 'test', width: 1280, height: 720 },
      });

      const result = await service.runE2ETest({
        name: 'Simple Test',
        steps: [
          { action: 'navigate', value: 'http://example.com' },
          { action: 'screenshot', value: 'home' },
        ],
      });

      expect(result.testCase).toBe('Simple Test');
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.screenshots).toHaveLength(1);
    });

    it('should stop on first failure', async () => {
      // Mock navigate failure
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'Network error',
      });

      const result = await service.runE2ETest({
        name: 'Failing Test',
        steps: [
          { action: 'navigate', value: 'http://example.com' },
          { action: 'screenshot', value: 'home' }, // Should not execute
        ],
      });

      expect(result.passed).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.error).toBe('Failed to navigate to http://example.com: Network error');
    });

    it('should handle all step types', async () => {
      // Mock all successful responses
      mockCallToolWithRetry.mockResolvedValue({ success: true });

      const result = await service.runE2ETest({
        name: 'Full Test',
        steps: [
          { action: 'navigate', value: 'http://example.com' },
          { action: 'click', target: '#button' },
          { action: 'fill', target: '#input', value: 'test' },
          { action: 'select', target: '#dropdown', value: 'option1' },
          { action: 'hover', target: '.menu' },
          { action: 'wait', timeout: 100 },
        ],
      });

      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(6);
    });
  });

  describe('runE2ETestSuite', () => {
    it('should run multiple test cases', async () => {
      // Mock all successful responses
      mockCallToolWithRetry.mockResolvedValue({ success: true });

      const result = await service.runE2ETestSuite([
        {
          name: 'Test 1',
          steps: [{ action: 'navigate', value: 'http://example.com/1' }],
        },
        {
          name: 'Test 2',
          steps: [{ action: 'navigate', value: 'http://example.com/2' }],
        },
      ]);

      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should skip remaining tests on failure with stopOnFailure', async () => {
      // First test fails
      mockCallToolWithRetry.mockResolvedValueOnce({
        success: false,
        error: 'Failed',
      });

      const result = await service.runE2ETestSuite(
        [
          {
            name: 'Test 1',
            steps: [{ action: 'navigate', value: 'http://example.com/1' }],
          },
          {
            name: 'Test 2',
            steps: [{ action: 'navigate', value: 'http://example.com/2' }],
          },
        ],
        { stopOnFailure: true }
      );

      expect(result.total).toBe(2);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  describe('captureVisualRegression', () => {
    it('should capture screenshots for all pages', async () => {
      // Mock navigate
      mockCallToolWithRetry.mockResolvedValue({ success: true });
      // Override screenshot calls
      mockCallToolWithRetry.mockImplementation((server, tool) => {
        if (tool === 'puppeteer_screenshot') {
          return Promise.resolve({
            success: true,
            data: { base64: 'test', width: 1280, height: 720 },
          });
        }
        return Promise.resolve({ success: true });
      });

      const result = await service.captureVisualRegression([
        { name: 'home', url: 'http://example.com' },
        { name: 'about', url: 'http://example.com/about' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].page).toBe('home');
      expect(result[1].page).toBe('about');
    });
  });

  describe('compareScreenshots', () => {
    it('should compare screenshots', () => {
      const current = { base64: 'test1', width: 1280, height: 720 };
      const baseline = { base64: 'test1', width: 1280, height: 720 };

      const result = service.compareScreenshots(current, baseline);

      expect(result.passed).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', () => {
      const suiteResult = {
        total: 2,
        passed: 1,
        failed: 1,
        skipped: 0,
        duration: 1000,
        results: [
          {
            testCase: 'Test 1',
            passed: true,
            duration: 500,
            results: [
              {
                step: { action: 'navigate' as const, value: '/home' },
                success: true,
                duration: 500,
              },
            ],
            screenshots: [],
          },
          {
            testCase: 'Test 2',
            passed: false,
            duration: 500,
            results: [
              {
                step: { action: 'click' as const, target: '#button' },
                success: false,
                error: 'Element not found',
                duration: 500,
              },
            ],
            screenshots: [],
            error: 'Element not found',
          },
        ],
        summary: '1/2 tests passed (50%) in 1000ms',
      };

      const report = service.generateReport(suiteResult);

      expect(report).toContain('# E2E Test Report');
      expect(report).toContain('**Total:** 2');
      expect(report).toContain('**Passed:** 1');
      expect(report).toContain('**Failed:** 1');
      expect(report).toContain('Test 1');
      expect(report).toContain('Test 2');
    });
  });
});

describe('E2E_TEST_TEMPLATES', () => {
  describe('loginFlow', () => {
    it('should create login test case', () => {
      const testCase = E2E_TEST_TEMPLATES.loginFlow({
        loginUrl: '/login',
        emailSelector: '#email',
        passwordSelector: '#password',
        submitSelector: '#submit',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(testCase.name).toBe('Login Flow');
      expect(testCase.steps).toHaveLength(7);
      expect(testCase.tags).toContain('auth');
    });
  });

  describe('formSubmission', () => {
    it('should create form submission test case', () => {
      const testCase = E2E_TEST_TEMPLATES.formSubmission({
        formUrl: '/contact',
        fields: [
          { selector: '#name', value: 'John' },
          { selector: '#email', value: 'john@example.com' },
        ],
        submitSelector: '#submit',
      });

      expect(testCase.name).toBe('Form Submission');
      expect(testCase.steps.length).toBeGreaterThan(2);
    });
  });

  describe('pageLoad', () => {
    it('should create page load test case', () => {
      const testCase = E2E_TEST_TEMPLATES.pageLoad({
        url: '/dashboard',
        name: 'Dashboard',
      });

      expect(testCase.name).toBe('Page Load: Dashboard');
      expect(testCase.steps).toHaveLength(3);
      expect(testCase.tags).toContain('smoke');
    });
  });
});
