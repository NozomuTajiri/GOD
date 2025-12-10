/**
 * Review Agent
 *
 * Code quality validation and security scanning.
 * Extended with GitHub MCP integration for code review operations.
 */

import { BaseAgent, Task, AgentResult, AgentConfig } from './base-agent.js';
import { MCPToolAdapter } from '../mcp-tool-adapter.js';
import {
  GitHubFileContent,
  GitHubPRFile,
  GitHubAPIError,
  getGitHubFileContents,
  getGitHubPullRequestFiles,
  createGitHubPRReview,
  searchGitHubCode,
  listGitHubCommits,
} from './github-mcp-mixin.js';

/**
 * Review Result
 */
export interface ReviewResult {
  qualityScore: number;
  typeScriptErrors: number;
  eslintErrors: number;
  securityIssues: SecurityIssue[];
  codeSmells: CodeSmell[];
  testCoverage: number;
  complexity: ComplexityMetrics;
  passed: boolean;
  recommendations: string[];
}

/**
 * Security Issue
 */
export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  file: string;
  line?: number;
  rule?: string;
  recommendation?: string;
}

/**
 * Code Smell
 */
export interface CodeSmell {
  type: CodeSmellType;
  file: string;
  line?: number;
  description: string;
  suggestion?: string;
}

/**
 * Code Smell Types
 */
export type CodeSmellType =
  | 'long-method'
  | 'large-class'
  | 'duplicate-code'
  | 'dead-code'
  | 'complex-conditional'
  | 'magic-number'
  | 'god-class'
  | 'feature-envy'
  | 'data-clump';

/**
 * Complexity Metrics
 */
export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  maintainabilityIndex: number;
}

/**
 * TypeScript Error
 */
export interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
}

/**
 * ESLint Error
 */
export interface ESLintError {
  file: string;
  line: number;
  column: number;
  message: string;
  ruleId: string;
  severity: 'error' | 'warning';
}

/**
 * Review Agent Configuration
 */
export interface ReviewAgentConfig extends AgentConfig {
  qualityThreshold?: number;
  coverageThreshold?: number;
  complexityThreshold?: number;
  enableSecurityScan?: boolean;
  enableCodeSmellDetection?: boolean;
  mcpAdapter?: MCPToolAdapter;
  defaultOwner?: string;
  defaultRepo?: string;
}

/**
 * Review Agent Implementation
 */
export class ReviewAgent extends BaseAgent {
  private qualityThreshold: number;
  private coverageThreshold: number;
  private complexityThreshold: number;
  private enableSecurityScan: boolean;
  private enableCodeSmellDetection: boolean;
  private mcp?: MCPToolAdapter;
  private defaultOwner?: string;
  private defaultRepo?: string;

  constructor(config: ReviewAgentConfig) {
    super('review', config);
    this.qualityThreshold = config.qualityThreshold ?? 80;
    this.coverageThreshold = config.coverageThreshold ?? 80;
    this.complexityThreshold = config.complexityThreshold ?? 20;
    this.enableSecurityScan = config.enableSecurityScan ?? true;
    this.enableCodeSmellDetection = config.enableCodeSmellDetection ?? true;
    this.mcp = config.mcpAdapter;
    this.defaultOwner = config.defaultOwner;
    this.defaultRepo = config.defaultRepo;
  }

  /**
   * Set MCP adapter
   */
  setMCPAdapter(mcp: MCPToolAdapter): void {
    this.mcp = mcp;
  }

  /**
   * Set default repository
   */
  setDefaultRepository(owner: string, repo: string): void {
    this.defaultOwner = owner;
    this.defaultRepo = repo;
  }

  /**
   * Get file contents from GitHub via MCP
   */
  async getFileContents(payload: {
    owner?: string;
    repo?: string;
    path: string;
    ref?: string;
  }): Promise<GitHubFileContent> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Getting file contents from GitHub', {
      owner,
      repo,
      path: payload.path,
      ref: payload.ref,
    });

    try {
      const content = await getGitHubFileContents(this.mcp, {
        owner,
        repo,
        path: payload.path,
        ref: payload.ref,
      });

      return content;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getFileContents');
      }
      throw error;
    }
  }

  /**
   * Get pull request files from GitHub via MCP
   */
  async getPullRequestFiles(payload: {
    owner?: string;
    repo?: string;
    pull_number: number;
  }): Promise<GitHubPRFile[]> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Getting pull request files from GitHub', {
      owner,
      repo,
      pull_number: payload.pull_number,
    });

    try {
      const files = await getGitHubPullRequestFiles(this.mcp, {
        owner,
        repo,
        pull_number: payload.pull_number,
      });

      this.log('Retrieved pull request files', { fileCount: files.length });

      return files;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getPullRequestFiles');
      }
      throw error;
    }
  }

  /**
   * Create a pull request review via GitHub MCP
   */
  async createPRReview(payload: {
    owner?: string;
    repo?: string;
    pull_number: number;
    body?: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: Array<{
      path: string;
      position?: number;
      body: string;
    }>;
  }): Promise<{ id: number; state: string; body: string }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Creating pull request review', {
      owner,
      repo,
      pull_number: payload.pull_number,
      event: payload.event,
    });

    try {
      const review = await createGitHubPRReview(this.mcp, {
        owner,
        repo,
        pull_number: payload.pull_number,
        body: payload.body,
        event: payload.event,
        comments: payload.comments,
      });

      this.log('Pull request review created', {
        reviewId: review.id,
        state: review.state,
      });

      return review;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'createPRReview');
      }
      throw error;
    }
  }

  /**
   * Search code in repository via GitHub MCP
   */
  async searchCode(payload: {
    q: string;
    sort?: 'indexed';
    order?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }): Promise<{
    total_count: number;
    items: Array<{
      name: string;
      path: string;
      sha: string;
      url: string;
      repository: { full_name: string };
    }>;
  }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    this.log('Searching code in GitHub', { query: payload.q });

    try {
      return await searchGitHubCode(this.mcp, payload);
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'searchCode');
      }
      throw error;
    }
  }

  /**
   * Get commit history from GitHub via MCP
   */
  async getCommitHistory(payload: {
    owner?: string;
    repo?: string;
    sha?: string;
    path?: string;
    per_page?: number;
    page?: number;
  }): Promise<
    Array<{
      sha: string;
      commit: {
        message: string;
        author: { name: string; email: string; date: string };
      };
      url: string;
    }>
  > {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      return await listGitHubCommits(this.mcp, {
        owner,
        repo,
        sha: payload.sha,
        path: payload.path,
        per_page: payload.per_page,
        page: payload.page,
      });
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getCommitHistory');
      }
      throw error;
    }
  }

  /**
   * Review a pull request automatically
   */
  async reviewPullRequest(payload: {
    owner?: string;
    repo?: string;
    pull_number: number;
  }): Promise<ReviewResult & { reviewId?: number }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Starting automatic PR review', {
      owner,
      repo,
      pull_number: payload.pull_number,
    });

    // Get PR files
    const prFiles = await this.getPullRequestFiles({
      owner,
      repo,
      pull_number: payload.pull_number,
    });

    // Convert to review format
    const filesToReview: Array<{ path: string; content: string }> = [];

    for (const file of prFiles) {
      if (file.patch) {
        filesToReview.push({
          path: file.filename,
          content: file.patch,
        });
      }
    }

    // Create a task for internal review
    const reviewTask = {
      id: `pr-review-${payload.pull_number}`,
      type: 'review',
      status: 'pending' as const,
      payload: { files: filesToReview },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Execute review
    const result = await this.execute(reviewTask);

    if (result.status === 'success' && result.data) {
      const reviewResult = result.data as ReviewResult;

      // Create PR review based on result
      const event = reviewResult.passed ? 'APPROVE' : 'REQUEST_CHANGES';
      const body = ReviewAgent.formatReviewReport(reviewResult);

      const review = await this.createPRReview({
        owner,
        repo,
        pull_number: payload.pull_number,
        body,
        event,
      });

      return {
        ...reviewResult,
        reviewId: review.id,
      };
    }

    throw new Error('Review failed: ' + result.error);
  }

  /**
   * Handle GitHub API errors with escalation
   */
  private async handleGitHubAPIError(
    error: GitHubAPIError,
    operation: string
  ): Promise<void> {
    if (error.isRateLimited()) {
      await this.escalate(
        `GitHub API rate limit exceeded during ${operation}`,
        'DevOps',
        'Sev.2-High',
        {
          operation,
          rateLimitReset: error.rateLimitReset?.toISOString(),
        }
      );
    } else if (error.isAuthError()) {
      await this.escalate(
        `GitHub API authentication error during ${operation}`,
        'DevOps',
        'Sev.1-Critical',
        { operation }
      );
    }
  }

  /**
   * Execute code review task
   */
  async execute(task: Task): Promise<AgentResult> {
    this.log('Starting code review', { taskId: task.id });

    try {
      // Extract code to review from task payload
      const codeToReview = this.extractCode(task);

      // Run static analysis
      const typeScriptErrors = await this.runTypeScriptCheck(codeToReview);
      const eslintErrors = await this.runESLintCheck(codeToReview);

      // Run security scan
      const securityIssues = this.enableSecurityScan
        ? await this.runSecurityScan(codeToReview)
        : [];

      // Detect code smells
      const codeSmells = this.enableCodeSmellDetection
        ? this.detectCodeSmells(codeToReview)
        : [];

      // Calculate complexity metrics
      const complexity = this.calculateComplexity(codeToReview);

      // Run test coverage check
      const testCoverage = await this.runTestCoverage(codeToReview);

      // Calculate quality score
      const qualityScore = this.calculateQualityScore({
        typeScriptErrors,
        eslintErrors,
        securityIssues,
        codeSmells,
        testCoverage,
        complexity,
      });

      // Generate recommendations
      const recommendations = this.generateRecommendations({
        typeScriptErrors,
        eslintErrors,
        securityIssues,
        codeSmells,
        testCoverage,
        complexity,
      });

      const passed = qualityScore >= this.qualityThreshold;

      // Escalate if critical issues found
      const criticalIssues = securityIssues.filter(i => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        await this.escalate(
          `Critical security issues found: ${criticalIssues.length}`,
          'CISO',
          'Sev.1-Critical',
          { taskId: task.id, issues: criticalIssues }
        );
      }

      const reviewResult: ReviewResult = {
        qualityScore,
        typeScriptErrors,
        eslintErrors,
        securityIssues,
        codeSmells,
        testCoverage,
        complexity,
        passed,
        recommendations,
      };

      this.log('Code review completed', {
        taskId: task.id,
        qualityScore,
        passed,
        securityIssuesCount: securityIssues.length,
        codeSmellsCount: codeSmells.length,
      });

      return this.createSuccessResult(task, reviewResult);
    } catch (error) {
      this.logError('Code review failed', error as Error, { taskId: task.id });
      return this.createFailureResult(task, error as Error);
    }
  }

  /**
   * Extract code from task payload
   */
  private extractCode(task: Task): { files: Array<{ path: string; content: string }> } {
    const payload = task.payload;

    if (payload.files && Array.isArray(payload.files)) {
      return { files: payload.files as Array<{ path: string; content: string }> };
    }

    if (payload.code && typeof payload.code === 'object') {
      const code = payload.code as { files?: Array<{ path: string; content: string }> };
      if (code.files) {
        return { files: code.files };
      }
    }

    return { files: [] };
  }

  /**
   * Run TypeScript type check
   */
  private async runTypeScriptCheck(
    code: { files: Array<{ path: string; content: string }> }
  ): Promise<number> {
    this.log('Running TypeScript check');

    let errorCount = 0;

    for (const file of code.files) {
      if (!file.path.endsWith('.ts') && !file.path.endsWith('.tsx')) {
        continue;
      }

      // Check for common TypeScript errors
      const errors = this.checkTypeScriptErrors(file.content);
      errorCount += errors.length;
    }

    return errorCount;
  }

  /**
   * Check for TypeScript errors in content
   */
  private checkTypeScriptErrors(content: string): TypeScriptError[] {
    const errors: TypeScriptError[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check for 'any' type usage
      if (line.includes(': any') || line.includes('<any>')) {
        errors.push({
          file: '',
          line: index + 1,
          column: line.indexOf('any'),
          message: 'Avoid using "any" type',
          code: 'TS7006',
        });
      }

      // Check for @ts-ignore
      if (line.includes('@ts-ignore') || line.includes('@ts-nocheck')) {
        errors.push({
          file: '',
          line: index + 1,
          column: 0,
          message: 'Avoid using @ts-ignore or @ts-nocheck',
          code: 'TS-IGNORE',
        });
      }

      // Check for non-null assertion
      if (line.match(/\w+!/)) {
        errors.push({
          file: '',
          line: index + 1,
          column: 0,
          message: 'Avoid non-null assertion operator',
          code: 'TS-NON-NULL',
        });
      }
    });

    return errors;
  }

  /**
   * Run ESLint check
   */
  private async runESLintCheck(
    code: { files: Array<{ path: string; content: string }> }
  ): Promise<number> {
    this.log('Running ESLint check');

    let errorCount = 0;

    for (const file of code.files) {
      const errors = this.checkESLintErrors(file.content);
      errorCount += errors.length;
    }

    return errorCount;
  }

  /**
   * Check for ESLint errors in content
   */
  private checkESLintErrors(content: string): ESLintError[] {
    const errors: ESLintError[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check for console.log
      if (line.includes('console.log')) {
        errors.push({
          file: '',
          line: index + 1,
          column: line.indexOf('console.log'),
          message: 'Unexpected console statement',
          ruleId: 'no-console',
          severity: 'warning',
        });
      }

      // Check for debugger
      if (line.includes('debugger')) {
        errors.push({
          file: '',
          line: index + 1,
          column: line.indexOf('debugger'),
          message: 'Unexpected debugger statement',
          ruleId: 'no-debugger',
          severity: 'error',
        });
      }

      // Check for var usage
      if (line.match(/\bvar\s+\w+/)) {
        errors.push({
          file: '',
          line: index + 1,
          column: line.indexOf('var'),
          message: 'Unexpected var, use let or const instead',
          ruleId: 'no-var',
          severity: 'error',
        });
      }

      // Check for == and !=
      if (line.match(/[^!=]==[^=]/) || line.match(/!=[^=]/)) {
        errors.push({
          file: '',
          line: index + 1,
          column: 0,
          message: 'Expected === and !== instead of == and !=',
          ruleId: 'eqeqeq',
          severity: 'error',
        });
      }

      // Check for unused variables (simple check)
      const unusedMatch = line.match(/(?:const|let|var)\s+_\w+/);
      if (unusedMatch) {
        errors.push({
          file: '',
          line: index + 1,
          column: 0,
          message: 'Variable appears to be unused',
          ruleId: 'no-unused-vars',
          severity: 'warning',
        });
      }
    });

    return errors;
  }

  /**
   * Run security scan
   */
  private async runSecurityScan(
    code: { files: Array<{ path: string; content: string }> }
  ): Promise<SecurityIssue[]> {
    this.log('Running security scan');

    const issues: SecurityIssue[] = [];

    for (const file of code.files) {
      const fileIssues = this.checkSecurityIssues(file.path, file.content);
      issues.push(...fileIssues);
    }

    return issues;
  }

  /**
   * Check for security issues in content
   */
  private checkSecurityIssues(filePath: string, content: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // SQL Injection
      if (line.match(/SELECT.*\+|INSERT.*\+|UPDATE.*\+|DELETE.*\+/i)) {
        issues.push({
          severity: 'critical',
          description: 'Potential SQL injection vulnerability',
          file: filePath,
          line: index + 1,
          rule: 'sql-injection',
          recommendation: 'Use parameterized queries or prepared statements',
        });
      }

      // XSS
      if (line.includes('innerHTML') || line.includes('document.write')) {
        issues.push({
          severity: 'high',
          description: 'Potential XSS vulnerability',
          file: filePath,
          line: index + 1,
          rule: 'xss',
          recommendation: 'Sanitize user input before rendering',
        });
      }

      // Hardcoded secrets
      if (line.match(/password\s*=\s*['"][^'"]+['"]/i) ||
          line.match(/api[_-]?key\s*=\s*['"][^'"]+['"]/i) ||
          line.match(/secret\s*=\s*['"][^'"]+['"]/i)) {
        issues.push({
          severity: 'critical',
          description: 'Hardcoded secret detected',
          file: filePath,
          line: index + 1,
          rule: 'hardcoded-secret',
          recommendation: 'Use environment variables or secret management',
        });
      }

      // eval usage
      if (line.includes('eval(')) {
        issues.push({
          severity: 'critical',
          description: 'Dangerous eval() usage',
          file: filePath,
          line: index + 1,
          rule: 'no-eval',
          recommendation: 'Avoid eval() and use safer alternatives',
        });
      }

      // Command injection
      if (line.match(/exec\(|execSync\(|spawn\(/)) {
        issues.push({
          severity: 'high',
          description: 'Potential command injection',
          file: filePath,
          line: index + 1,
          rule: 'command-injection',
          recommendation: 'Validate and sanitize user input',
        });
      }

      // Insecure random
      if (line.includes('Math.random()')) {
        issues.push({
          severity: 'medium',
          description: 'Math.random() is not cryptographically secure',
          file: filePath,
          line: index + 1,
          rule: 'insecure-random',
          recommendation: 'Use crypto.randomBytes() for security purposes',
        });
      }
    });

    return issues;
  }

  /**
   * Detect code smells
   */
  private detectCodeSmells(
    code: { files: Array<{ path: string; content: string }> }
  ): CodeSmell[] {
    const smells: CodeSmell[] = [];

    for (const file of code.files) {
      const fileSmells = this.analyzeCodeSmells(file.path, file.content);
      smells.push(...fileSmells);
    }

    return smells;
  }

  /**
   * Analyze code smells in content
   */
  private analyzeCodeSmells(filePath: string, content: string): CodeSmell[] {
    const smells: CodeSmell[] = [];
    const lines = content.split('\n');

    // Long method detection (more than 50 lines)
    const methodMatches = content.match(/(function\s+\w+|(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>|\w+\([^)]*\)\s*{)/g);
    if (methodMatches) {
      // Simplified: check total line count as proxy
      if (lines.length > 200) {
        smells.push({
          type: 'long-method',
          file: filePath,
          description: 'File contains potentially long methods',
          suggestion: 'Consider breaking down into smaller functions',
        });
      }
    }

    // Magic numbers
    const magicNumberRegex = /(?<![\w.])\d{2,}(?![\w])/g;
    lines.forEach((line, index) => {
      // Skip import/require lines and comments
      if (line.includes('import') || line.includes('require') || line.trim().startsWith('//')) {
        return;
      }

      const matches = line.match(magicNumberRegex);
      if (matches) {
        for (const match of matches) {
          const num = parseInt(match);
          if (num !== 0 && num !== 1 && num !== 100) {
            smells.push({
              type: 'magic-number',
              file: filePath,
              line: index + 1,
              description: `Magic number ${match} found`,
              suggestion: 'Extract to named constant',
            });
            break; // Only report first per line
          }
        }
      }
    });

    // Complex conditionals
    lines.forEach((line, index) => {
      const andCount = (line.match(/&&/g) || []).length;
      const orCount = (line.match(/\|\|/g) || []).length;
      if (andCount + orCount >= 3) {
        smells.push({
          type: 'complex-conditional',
          file: filePath,
          line: index + 1,
          description: 'Complex conditional expression',
          suggestion: 'Extract conditions into well-named variables or methods',
        });
      }
    });

    // Duplicate code (simplified: check for similar line patterns)
    const lineHashes = new Map<string, number[]>();
    lines.forEach((line, index) => {
      const normalized = line.trim();
      if (normalized.length > 30) { // Only consider substantial lines
        const existing = lineHashes.get(normalized) || [];
        existing.push(index + 1);
        lineHashes.set(normalized, existing);
      }
    });

    for (const [_, lineNumbers] of lineHashes) {
      if (lineNumbers.length >= 3) {
        smells.push({
          type: 'duplicate-code',
          file: filePath,
          line: lineNumbers[0],
          description: `Similar code found on lines: ${lineNumbers.join(', ')}`,
          suggestion: 'Extract duplicate code into a reusable function',
        });
        break; // Only report once per file
      }
    }

    // Large class detection
    const classMatch = content.match(/class\s+\w+/g);
    if (classMatch && classMatch.length > 0) {
      const methodCount = (content.match(/(?:async\s+)?\w+\s*\([^)]*\)\s*{/g) || []).length;
      if (methodCount > 15) {
        smells.push({
          type: 'god-class',
          file: filePath,
          description: `Class has ${methodCount} methods`,
          suggestion: 'Consider splitting into smaller, focused classes',
        });
      }
    }

    return smells;
  }

  /**
   * Calculate complexity metrics
   */
  private calculateComplexity(
    code: { files: Array<{ path: string; content: string }> }
  ): ComplexityMetrics {
    let totalCyclomatic = 0;
    let totalCognitive = 0;
    let totalLines = 0;

    for (const file of code.files) {
      const metrics = this.analyzeFileComplexity(file.content);
      totalCyclomatic += metrics.cyclomatic;
      totalCognitive += metrics.cognitive;
      totalLines += metrics.lines;
    }

    const fileCount = Math.max(1, code.files.length);

    // Calculate maintainability index (simplified formula)
    // MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
    const avgCyclomatic = totalCyclomatic / fileCount;
    const avgLines = totalLines / fileCount;
    const maintainabilityIndex = Math.max(0, Math.min(100,
      171 - (5.2 * Math.log(1 + avgLines)) - (0.23 * avgCyclomatic) - (16.2 * Math.log(1 + avgLines))
    ));

    return {
      cyclomaticComplexity: totalCyclomatic,
      cognitiveComplexity: totalCognitive,
      linesOfCode: totalLines,
      maintainabilityIndex: Math.round(maintainabilityIndex),
    };
  }

  /**
   * Analyze complexity of a single file
   */
  private analyzeFileComplexity(content: string): {
    cyclomatic: number;
    cognitive: number;
    lines: number;
  } {
    const lines = content.split('\n');

    // Count decision points for cyclomatic complexity
    let cyclomatic = 1; // Base complexity
    const decisionKeywords = /\b(if|else|for|while|do|switch|case|catch|&&|\|\||\?:)/g;
    const matches = content.match(decisionKeywords);
    if (matches) {
      cyclomatic += matches.length;
    }

    // Cognitive complexity (simplified)
    let cognitive = 0;
    let nestingLevel = 0;

    lines.forEach(line => {
      // Increase nesting for blocks
      if (line.includes('{')) {
        nestingLevel += (line.match(/{/g) || []).length;
      }

      // Add cognitive complexity for control structures
      if (line.match(/\b(if|for|while|do|switch)\b/)) {
        cognitive += 1 + nestingLevel;
      }
      if (line.match(/\b(else|catch)\b/)) {
        cognitive += 1;
      }
      if (line.match(/&&|\|\|/)) {
        cognitive += 1;
      }

      // Decrease nesting for closing blocks
      if (line.includes('}')) {
        nestingLevel -= (line.match(/}/g) || []).length;
        nestingLevel = Math.max(0, nestingLevel);
      }
    });

    return {
      cyclomatic,
      cognitive,
      lines: lines.length,
    };
  }

  /**
   * Run test coverage check
   */
  private async runTestCoverage(
    code: { files: Array<{ path: string; content: string }> }
  ): Promise<number> {
    this.log('Running test coverage check');

    // Count test files
    const testFiles = code.files.filter(f =>
      f.path.includes('.test.') || f.path.includes('.spec.') || f.path.includes('__tests__')
    );

    // Count source files
    const sourceFiles = code.files.filter(f =>
      !f.path.includes('.test.') && !f.path.includes('.spec.') && !f.path.includes('__tests__')
    );

    if (sourceFiles.length === 0) {
      return 100; // No source files to test
    }

    // Estimate coverage based on test file ratio
    const testRatio = testFiles.length / sourceFiles.length;

    // Also check for test assertions
    let assertionCount = 0;
    for (const testFile of testFiles) {
      const assertions = testFile.content.match(/expect\(|assert\.|should\./g);
      if (assertions) {
        assertionCount += assertions.length;
      }
    }

    // Calculate estimated coverage (simplified)
    const baseCoverage = Math.min(100, testRatio * 80);
    const assertionBonus = Math.min(20, assertionCount * 0.5);

    return Math.round(baseCoverage + assertionBonus);
  }

  /**
   * Calculate quality score
   */
  private calculateQualityScore(metrics: {
    typeScriptErrors: number;
    eslintErrors: number;
    securityIssues: SecurityIssue[];
    codeSmells: CodeSmell[];
    testCoverage: number;
    complexity: ComplexityMetrics;
  }): number {
    let score = 100;

    // Deduct points for TypeScript errors
    score -= metrics.typeScriptErrors * 5;

    // Deduct points for ESLint errors
    score -= metrics.eslintErrors * 2;

    // Deduct points for security issues
    const criticalIssues = metrics.securityIssues.filter(i => i.severity === 'critical').length;
    const highIssues = metrics.securityIssues.filter(i => i.severity === 'high').length;
    const mediumIssues = metrics.securityIssues.filter(i => i.severity === 'medium').length;
    score -= criticalIssues * 20;
    score -= highIssues * 10;
    score -= mediumIssues * 3;

    // Deduct points for code smells
    score -= metrics.codeSmells.length * 2;

    // Deduct points for low test coverage
    if (metrics.testCoverage < this.coverageThreshold) {
      score -= (this.coverageThreshold - metrics.testCoverage) * 0.5;
    }

    // Deduct points for high complexity
    const avgComplexity = metrics.complexity.cyclomaticComplexity /
      Math.max(1, Math.ceil(metrics.complexity.linesOfCode / 100));
    if (avgComplexity > this.complexityThreshold) {
      score -= (avgComplexity - this.complexityThreshold) * 2;
    }

    // Bonus for good maintainability
    if (metrics.complexity.maintainabilityIndex > 70) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metrics: {
    typeScriptErrors: number;
    eslintErrors: number;
    securityIssues: SecurityIssue[];
    codeSmells: CodeSmell[];
    testCoverage: number;
    complexity: ComplexityMetrics;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.typeScriptErrors > 0) {
      recommendations.push(
        `Fix ${metrics.typeScriptErrors} TypeScript errors to improve type safety`
      );
    }

    if (metrics.eslintErrors > 0) {
      recommendations.push(
        `Address ${metrics.eslintErrors} ESLint issues to improve code quality`
      );
    }

    const criticalSecurity = metrics.securityIssues.filter(i => i.severity === 'critical');
    if (criticalSecurity.length > 0) {
      recommendations.push(
        `URGENT: Fix ${criticalSecurity.length} critical security vulnerabilities`
      );
    }

    if (metrics.testCoverage < this.coverageThreshold) {
      recommendations.push(
        `Increase test coverage from ${metrics.testCoverage}% to at least ${this.coverageThreshold}%`
      );
    }

    if (metrics.complexity.cyclomaticComplexity > 50) {
      recommendations.push(
        'Reduce cyclomatic complexity by breaking down complex functions'
      );
    }

    if (metrics.complexity.maintainabilityIndex < 50) {
      recommendations.push(
        'Improve maintainability by refactoring complex code sections'
      );
    }

    const duplicateSmells = metrics.codeSmells.filter(s => s.type === 'duplicate-code');
    if (duplicateSmells.length > 0) {
      recommendations.push(
        'Extract duplicate code into reusable functions'
      );
    }

    const godClasses = metrics.codeSmells.filter(s => s.type === 'god-class');
    if (godClasses.length > 0) {
      recommendations.push(
        'Split large classes into smaller, focused components'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Code quality looks good! Keep up the great work.');
    }

    return recommendations;
  }

  /**
   * Format review report
   */
  static formatReviewReport(result: ReviewResult): string {
    const lines: string[] = [
      '# Code Review Report',
      '',
      '## Summary',
      `- **Quality Score:** ${result.qualityScore}/100 ${result.passed ? '✅' : '❌'}`,
      `- **TypeScript Errors:** ${result.typeScriptErrors}`,
      `- **ESLint Errors:** ${result.eslintErrors}`,
      `- **Security Issues:** ${result.securityIssues.length}`,
      `- **Code Smells:** ${result.codeSmells.length}`,
      `- **Test Coverage:** ${result.testCoverage}%`,
      '',
      '## Complexity Metrics',
      `- Cyclomatic Complexity: ${result.complexity.cyclomaticComplexity}`,
      `- Cognitive Complexity: ${result.complexity.cognitiveComplexity}`,
      `- Lines of Code: ${result.complexity.linesOfCode}`,
      `- Maintainability Index: ${result.complexity.maintainabilityIndex}`,
      '',
    ];

    if (result.securityIssues.length > 0) {
      lines.push('## Security Issues');
      for (const issue of result.securityIssues) {
        const location = issue.line ? `:${issue.line}` : '';
        lines.push(`- **[${issue.severity.toUpperCase()}]** ${issue.file}${location}: ${issue.description}`);
        if (issue.recommendation) {
          lines.push(`  - Recommendation: ${issue.recommendation}`);
        }
      }
      lines.push('');
    }

    if (result.codeSmells.length > 0) {
      lines.push('## Code Smells');
      for (const smell of result.codeSmells) {
        const location = smell.line ? `:${smell.line}` : '';
        lines.push(`- **${smell.type}** in ${smell.file}${location}: ${smell.description}`);
        if (smell.suggestion) {
          lines.push(`  - Suggestion: ${smell.suggestion}`);
        }
      }
      lines.push('');
    }

    lines.push('## Recommendations');
    for (const rec of result.recommendations) {
      lines.push(`- ${rec}`);
    }

    return lines.join('\n');
  }
}
