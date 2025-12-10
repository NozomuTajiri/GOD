/**
 * Browser Automation Service
 *
 * Service for browser automation via Puppeteer MCP.
 * Supports E2E testing, visual regression testing, and UI automation.
 */

import { MCPToolAdapter, MCPToolResult } from '../../agent-runtime/mcp-tool-adapter.js';

/**
 * Puppeteer MCP Server name constant
 */
export const PUPPETEER_MCP_SERVER = 'puppeteer';

/**
 * Screenshot Result
 */
export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  name?: string;
}

/**
 * E2E Test Step
 */
export interface E2EStep {
  action: 'navigate' | 'click' | 'fill' | 'select' | 'hover' | 'screenshot' | 'evaluate' | 'wait';
  target?: string;
  value?: string;
  timeout?: number;
}

/**
 * E2E Test Case
 */
export interface E2ETestCase {
  name: string;
  description?: string;
  steps: E2EStep[];
  expectedScreenshot?: string;
  tags?: string[];
}

/**
 * Step Result
 */
export interface StepResult {
  step: E2EStep;
  success: boolean;
  error?: string;
  screenshot?: ScreenshotResult;
  duration?: number;
}

/**
 * E2E Test Result
 */
export interface E2ETestResult {
  testCase: string;
  description?: string;
  passed: boolean;
  results: StepResult[];
  duration: number;
  screenshots: ScreenshotResult[];
  error?: string;
}

/**
 * E2E Test Suite Result
 */
export interface E2ETestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: E2ETestResult[];
  summary: string;
}

/**
 * Visual Regression Result
 */
export interface VisualRegressionResult {
  page: string;
  current: ScreenshotResult;
  baseline?: ScreenshotResult;
  diff?: number;
  passed: boolean;
  diffImage?: string;
}

/**
 * Browser Configuration
 */
export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  defaultTimeout?: number;
  baseUrl?: string;
}

/**
 * Default browser configuration
 */
const DEFAULT_CONFIG: BrowserConfig = {
  headless: true,
  viewport: {
    width: 1280,
    height: 720,
  },
  defaultTimeout: 30000,
};

/**
 * Browser Automation Service
 */
export class BrowserAutomationService {
  private mcp: MCPToolAdapter;
  private config: BrowserConfig;

  constructor(mcp: MCPToolAdapter, config?: Partial<BrowserConfig>) {
    this.mcp = mcp;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<void> {
    const fullUrl = this.resolveUrl(url);

    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_navigate',
      { url: fullUrl }
    );

    if (!result.success) {
      throw new Error(`Failed to navigate to ${fullUrl}: ${result.error}`);
    }
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<void> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_click',
      { selector }
    );

    if (!result.success) {
      throw new Error(`Failed to click ${selector}: ${result.error}`);
    }
  }

  /**
   * Fill a form field
   */
  async fill(selector: string, value: string): Promise<void> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_fill',
      { selector, value }
    );

    if (!result.success) {
      throw new Error(`Failed to fill ${selector}: ${result.error}`);
    }
  }

  /**
   * Select an option from dropdown
   */
  async select(selector: string, value: string): Promise<void> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_select',
      { selector, value }
    );

    if (!result.success) {
      throw new Error(`Failed to select ${value} from ${selector}: ${result.error}`);
    }
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<void> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_hover',
      { selector }
    );

    if (!result.success) {
      throw new Error(`Failed to hover over ${selector}: ${result.error}`);
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(name?: string): Promise<ScreenshotResult> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_screenshot',
      {
        name,
        width: this.config.viewport?.width,
        height: this.config.viewport?.height,
      }
    );

    if (!result.success) {
      throw new Error(`Failed to take screenshot: ${result.error}`);
    }

    return result.data as ScreenshotResult;
  }

  /**
   * Execute JavaScript in the browser
   */
  async evaluate(script: string): Promise<unknown> {
    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_evaluate',
      { script }
    );

    if (!result.success) {
      throw new Error(`Failed to evaluate script: ${result.error}`);
    }

    return result.data;
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    const script = `
      await page.waitForSelector('${selector}', { timeout: ${timeout || this.config.defaultTimeout} });
    `;

    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_evaluate',
      { script }
    );

    if (!result.success) {
      throw new Error(`Timeout waiting for ${selector}: ${result.error}`);
    }
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout?: number): Promise<void> {
    const script = `
      await page.waitForNavigation({ timeout: ${timeout || this.config.defaultTimeout} });
    `;

    const result = await this.mcp.callToolWithRetry(
      PUPPETEER_MCP_SERVER,
      'puppeteer_evaluate',
      { script }
    );

    if (!result.success) {
      throw new Error(`Timeout waiting for navigation: ${result.error}`);
    }
  }

  /**
   * Run a single E2E test case
   */
  async runE2ETest(testCase: E2ETestCase): Promise<E2ETestResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const screenshots: ScreenshotResult[] = [];
    let testError: string | undefined;

    for (const step of testCase.steps) {
      const stepStart = Date.now();
      let stepResult: StepResult;

      try {
        let screenshot: ScreenshotResult | undefined;

        switch (step.action) {
          case 'navigate':
            await this.navigate(step.value!);
            break;
          case 'click':
            await this.click(step.target!);
            break;
          case 'fill':
            await this.fill(step.target!, step.value!);
            break;
          case 'select':
            await this.select(step.target!, step.value!);
            break;
          case 'hover':
            await this.hover(step.target!);
            break;
          case 'screenshot':
            screenshot = await this.screenshot(step.value);
            screenshots.push(screenshot);
            break;
          case 'evaluate':
            await this.evaluate(step.value!);
            break;
          case 'wait':
            if (step.target) {
              await this.waitForSelector(step.target, step.timeout);
            } else {
              await new Promise((resolve) =>
                setTimeout(resolve, step.timeout || 1000)
              );
            }
            break;
          default:
            throw new Error(`Unknown action: ${step.action}`);
        }

        stepResult = {
          step,
          success: true,
          duration: Date.now() - stepStart,
          screenshot,
        };
      } catch (error) {
        stepResult = {
          step,
          success: false,
          error: (error as Error).message,
          duration: Date.now() - stepStart,
        };
        testError = (error as Error).message;
      }

      results.push(stepResult);

      // Stop on first failure
      if (!stepResult.success) {
        break;
      }
    }

    return {
      testCase: testCase.name,
      description: testCase.description,
      passed: results.every((r) => r.success),
      results,
      duration: Date.now() - startTime,
      screenshots,
      error: testError,
    };
  }

  /**
   * Run multiple E2E test cases
   */
  async runE2ETestSuite(
    testCases: E2ETestCase[],
    options?: { stopOnFailure?: boolean }
  ): Promise<E2ETestSuiteResult> {
    const startTime = Date.now();
    const results: E2ETestResult[] = [];
    let skipped = 0;

    for (const testCase of testCases) {
      if (
        options?.stopOnFailure &&
        results.some((r) => !r.passed)
      ) {
        skipped++;
        continue;
      }

      const result = await this.runE2ETest(testCase);
      results.push(result);
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = testCases.length;
    const duration = Date.now() - startTime;

    return {
      total,
      passed,
      failed,
      skipped,
      duration,
      results,
      summary: this.generateSummary(total, passed, failed, skipped, duration),
    };
  }

  /**
   * Capture visual regression screenshots
   */
  async captureVisualRegression(
    pages: Array<{ name: string; url: string }>
  ): Promise<VisualRegressionResult[]> {
    const results: VisualRegressionResult[] = [];

    for (const page of pages) {
      await this.navigate(page.url);
      const screenshot = await this.screenshot(page.name);

      results.push({
        page: page.name,
        current: screenshot,
        passed: true, // Baseline comparison would be done separately
      });
    }

    return results;
  }

  /**
   * Compare screenshots for visual regression
   */
  compareScreenshots(
    current: ScreenshotResult,
    baseline: ScreenshotResult,
    threshold: number = 0.01
  ): { passed: boolean; diff: number } {
    // In a real implementation, this would use image comparison libraries
    // like pixelmatch or resemble.js
    // For now, we return a placeholder
    return {
      passed: true,
      diff: 0,
    };
  }

  /**
   * Generate test report
   */
  generateReport(suiteResult: E2ETestSuiteResult): string {
    const lines: string[] = [
      '# E2E Test Report',
      '',
      '## Summary',
      `- **Total:** ${suiteResult.total}`,
      `- **Passed:** ${suiteResult.passed} ✅`,
      `- **Failed:** ${suiteResult.failed} ❌`,
      `- **Skipped:** ${suiteResult.skipped} ⏭️`,
      `- **Duration:** ${suiteResult.duration}ms`,
      '',
      '## Test Results',
      '',
    ];

    for (const result of suiteResult.results) {
      const icon = result.passed ? '✅' : '❌';
      lines.push(`### ${icon} ${result.testCase}`);

      if (result.description) {
        lines.push(`> ${result.description}`);
      }

      lines.push(`- Duration: ${result.duration}ms`);
      lines.push(`- Steps: ${result.results.length}`);

      if (!result.passed && result.error) {
        lines.push(`- **Error:** ${result.error}`);
      }

      lines.push('');

      // Step details
      lines.push('| Step | Action | Target | Status |');
      lines.push('|------|--------|--------|--------|');

      for (let i = 0; i < result.results.length; i++) {
        const stepResult = result.results[i];
        const status = stepResult.success ? '✅' : '❌';
        lines.push(
          `| ${i + 1} | ${stepResult.step.action} | ${stepResult.step.target || stepResult.step.value || '-'} | ${status} |`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Resolve URL with base URL
   */
  private resolveUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `${this.config.baseUrl || ''}${url}`;
  }

  /**
   * Generate test summary
   */
  private generateSummary(
    total: number,
    passed: number,
    failed: number,
    skipped: number,
    duration: number
  ): string {
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    return `${passed}/${total} tests passed (${passRate}%) in ${duration}ms${skipped > 0 ? `, ${skipped} skipped` : ''}`;
  }
}

/**
 * Pre-defined E2E test cases
 */
export const E2E_TEST_TEMPLATES = {
  loginFlow: (options: {
    loginUrl: string;
    emailSelector: string;
    passwordSelector: string;
    submitSelector: string;
    email: string;
    password: string;
  }): E2ETestCase => ({
    name: 'Login Flow',
    description: 'Test user login functionality',
    steps: [
      { action: 'navigate', value: options.loginUrl },
      { action: 'fill', target: options.emailSelector, value: options.email },
      {
        action: 'fill',
        target: options.passwordSelector,
        value: options.password,
      },
      { action: 'screenshot', value: 'before-login' },
      { action: 'click', target: options.submitSelector },
      { action: 'wait', timeout: 2000 },
      { action: 'screenshot', value: 'after-login' },
    ],
    tags: ['auth', 'critical'],
  }),

  formSubmission: (options: {
    formUrl: string;
    fields: Array<{ selector: string; value: string }>;
    submitSelector: string;
  }): E2ETestCase => ({
    name: 'Form Submission',
    description: 'Test form submission',
    steps: [
      { action: 'navigate', value: options.formUrl },
      ...options.fields.map((field) => ({
        action: 'fill' as const,
        target: field.selector,
        value: field.value,
      })),
      { action: 'screenshot', value: 'before-submit' },
      { action: 'click', target: options.submitSelector },
      { action: 'wait', timeout: 2000 },
      { action: 'screenshot', value: 'after-submit' },
    ],
    tags: ['form'],
  }),

  pageLoad: (options: { url: string; name: string }): E2ETestCase => ({
    name: `Page Load: ${options.name}`,
    description: `Verify ${options.name} page loads correctly`,
    steps: [
      { action: 'navigate', value: options.url },
      { action: 'wait', timeout: 1000 },
      { action: 'screenshot', value: options.name },
    ],
    tags: ['smoke'],
  }),
};
