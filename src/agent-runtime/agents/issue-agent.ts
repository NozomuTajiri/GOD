/**
 * Issue Agent
 *
 * GitHub Issue analysis and automatic labeling based on 65-label taxonomy.
 * Extended with GitHub MCP integration for Issue management.
 */

import { BaseAgent, Task, AgentResult, AgentConfig } from './base-agent.js';
import { MCPToolAdapter } from '../mcp-tool-adapter.js';
import {
  GitHubIssue,
  GitHubAPIError,
  createGitHubIssue,
  updateGitHubIssue,
  getGitHubIssue,
  addIssueComment,
  listGitHubIssues,
  searchGitHubIssues,
} from './github-mcp-mixin.js';

/**
 * 65-Label Taxonomy Categories
 */
export const LABEL_TAXONOMY = {
  // Phase Labels (フェーズ)
  phase: [
    'phase:planning',
    'phase:design',
    'phase:development',
    'phase:review',
    'phase:testing',
    'phase:deployment',
    'phase:maintenance',
  ],

  // Priority Labels (優先度)
  priority: [
    'priority:P0-Critical',
    'priority:P1-High',
    'priority:P2-Medium',
    'priority:P3-Low',
  ],

  // Type Labels (タイプ)
  type: [
    'type:feature',
    'type:bug',
    'type:enhancement',
    'type:refactor',
    'type:docs',
    'type:test',
    'type:chore',
    'type:security',
    'type:performance',
    'type:infrastructure',
  ],

  // State Labels (状態)
  state: [
    'state:pending',
    'state:in-progress',
    'state:blocked',
    'state:needs-review',
    'state:approved',
    'state:completed',
    'state:cancelled',
  ],

  // Agent Labels (担当Agent)
  agent: [
    'agent:coordinator',
    'agent:codegen',
    'agent:review',
    'agent:test',
    'agent:deploy',
    'agent:issue',
    'agent:pr',
    'agent:mizusumashi',
  ],

  // Component Labels (コンポーネント)
  component: [
    'component:frontend',
    'component:backend',
    'component:api',
    'component:database',
    'component:infrastructure',
    'component:ci-cd',
    'component:monitoring',
    'component:security',
  ],

  // Severity Labels (重要度)
  severity: [
    'severity:critical',
    'severity:high',
    'severity:medium',
    'severity:low',
  ],

  // Effort Labels (工数)
  effort: [
    'effort:xs',
    'effort:s',
    'effort:m',
    'effort:l',
    'effort:xl',
  ],

  // Domain Labels (ドメイン)
  domain: [
    'domain:auth',
    'domain:payment',
    'domain:notification',
    'domain:analytics',
    'domain:user-management',
    'domain:content',
    'domain:integration',
  ],
} as const;

/**
 * Issue Analysis Result
 */
export interface IssueAnalysisResult {
  labels: string[];
  priority: string;
  severity: string;
  recommendedAgent: string;
  confidence: number;
  reasoning: string;
}

/**
 * Issue Agent Configuration
 */
export interface IssueAgentConfig extends AgentConfig {
  githubToken?: string;
  anthropicApiKey?: string;
  mcpAdapter?: MCPToolAdapter;
  defaultOwner?: string;
  defaultRepo?: string;
}

/**
 * Issue Agent Implementation
 */
export class IssueAgent extends BaseAgent {
  private githubToken?: string;
  private anthropicApiKey?: string;
  private mcp?: MCPToolAdapter;
  private defaultOwner?: string;
  private defaultRepo?: string;

  constructor(config: IssueAgentConfig) {
    super('issue', config);
    this.githubToken = config.githubToken;
    this.anthropicApiKey = config.anthropicApiKey;
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
   * Create a GitHub Issue via MCP
   */
  async createIssue(payload: {
    owner?: string;
    repo?: string;
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Creating GitHub issue', { owner, repo, title: payload.title });

    try {
      const issue = await createGitHubIssue(this.mcp, {
        owner,
        repo,
        title: payload.title,
        body: payload.body,
        labels: payload.labels,
        assignees: payload.assignees,
      });

      this.log('GitHub issue created', {
        number: issue.number,
        url: issue.html_url,
      });

      return issue;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'createIssue');
      }
      throw error;
    }
  }

  /**
   * Update a GitHub Issue via MCP
   */
  async updateIssue(payload: {
    owner?: string;
    repo?: string;
    issue_number: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Updating GitHub issue', {
      owner,
      repo,
      issue_number: payload.issue_number,
    });

    try {
      const issue = await updateGitHubIssue(this.mcp, {
        owner,
        repo,
        issue_number: payload.issue_number,
        title: payload.title,
        body: payload.body,
        state: payload.state,
        labels: payload.labels,
        assignees: payload.assignees,
      });

      this.log('GitHub issue updated', {
        number: issue.number,
        state: issue.state,
      });

      return issue;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'updateIssue');
      }
      throw error;
    }
  }

  /**
   * Get a GitHub Issue via MCP
   */
  async getIssue(payload: {
    owner?: string;
    repo?: string;
    issue_number: number;
  }): Promise<GitHubIssue> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      return await getGitHubIssue(this.mcp, {
        owner,
        repo,
        issue_number: payload.issue_number,
      });
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'getIssue');
      }
      throw error;
    }
  }

  /**
   * Add a comment to a GitHub Issue via MCP
   */
  async addComment(payload: {
    owner?: string;
    repo?: string;
    issue_number: number;
    body: string;
  }): Promise<{ id: number; body: string; url: string }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    this.log('Adding comment to GitHub issue', {
      owner,
      repo,
      issue_number: payload.issue_number,
    });

    try {
      const comment = await addIssueComment(this.mcp, {
        owner,
        repo,
        issue_number: payload.issue_number,
        body: payload.body,
      });

      this.log('Comment added to GitHub issue', { commentId: comment.id });

      return comment;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'addComment');
      }
      throw error;
    }
  }

  /**
   * List GitHub Issues via MCP
   */
  async listIssues(payload: {
    owner?: string;
    repo?: string;
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    per_page?: number;
    page?: number;
  }): Promise<GitHubIssue[]> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    const owner = payload.owner || this.defaultOwner;
    const repo = payload.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new Error('Owner and repo must be specified');
    }

    try {
      return await listGitHubIssues(this.mcp, {
        owner,
        repo,
        state: payload.state,
        labels: payload.labels,
        per_page: payload.per_page,
        page: payload.page,
      });
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'listIssues');
      }
      throw error;
    }
  }

  /**
   * Search GitHub Issues via MCP
   */
  async searchIssues(payload: {
    q: string;
    sort?: 'created' | 'updated' | 'comments';
    order?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }): Promise<{ total_count: number; items: GitHubIssue[] }> {
    if (!this.mcp) {
      throw new Error('MCP adapter not configured');
    }

    try {
      return await searchGitHubIssues(this.mcp, payload);
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        await this.handleGitHubAPIError(error, 'searchIssues');
      }
      throw error;
    }
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
   * Execute issue analysis task
   */
  async execute(task: Task): Promise<AgentResult> {
    this.log('Starting issue analysis', { taskId: task.id });

    try {
      // Extract issue data from task payload
      const issueData = this.extractIssueData(task);

      // Analyze issue content
      const analysis = await this.analyzeIssue(issueData);

      // Validate labels against taxonomy
      this.validateLabels(analysis.labels);

      // Check if escalation is needed
      if (this.needsEscalation(analysis)) {
        await this.handleEscalation(analysis, task);
      }

      this.log('Issue analysis completed', {
        taskId: task.id,
        labelsCount: analysis.labels.length,
        priority: analysis.priority,
        recommendedAgent: analysis.recommendedAgent,
      });

      return this.createSuccessResult(task, analysis);
    } catch (error) {
      this.logError('Issue analysis failed', error as Error, { taskId: task.id });
      return this.createFailureResult(task, error as Error);
    }
  }

  /**
   * Extract issue data from task payload
   */
  private extractIssueData(task: Task): {
    title: string;
    body: string;
    url?: string;
    number?: number;
  } {
    const payload = task.payload;
    return {
      title: (payload.title as string) || '',
      body: (payload.body as string) || '',
      url: payload.url as string | undefined,
      number: payload.number as number | undefined,
    };
  }

  /**
   * Analyze issue content and generate labels
   */
  private async analyzeIssue(issueData: {
    title: string;
    body: string;
    url?: string;
    number?: number;
  }): Promise<IssueAnalysisResult> {
    const { title, body } = issueData;
    const content = `${title}\n\n${body}`.toLowerCase();

    // Determine type
    const type = this.determineType(content);

    // Determine priority
    const priority = this.determinePriority(content);

    // Determine severity
    const severity = this.determineSeverity(content);

    // Determine component
    const component = this.determineComponent(content);

    // Determine domain
    const domain = this.determineDomain(content);

    // Determine effort
    const effort = this.determineEffort(content);

    // Determine recommended agent
    const recommendedAgent = this.determineAgent(type, content);

    // Build labels array
    const labels: string[] = [
      `type:${type}`,
      priority,
      `severity:${severity}`,
      'state:pending',
      'phase:planning',
    ];

    if (component) labels.push(`component:${component}`);
    if (domain) labels.push(`domain:${domain}`);
    if (effort) labels.push(`effort:${effort}`);
    labels.push(`agent:${recommendedAgent}`);

    return {
      labels,
      priority,
      severity: `severity:${severity}`,
      recommendedAgent,
      confidence: this.calculateConfidence(content, labels),
      reasoning: this.generateReasoning(type, priority, severity, recommendedAgent),
    };
  }

  /**
   * Determine issue type from content
   */
  private determineType(content: string): string {
    if (content.includes('bug') || content.includes('fix') || content.includes('error') || content.includes('broken')) {
      return 'bug';
    }
    if (content.includes('security') || content.includes('vulnerability') || content.includes('cve')) {
      return 'security';
    }
    if (content.includes('performance') || content.includes('slow') || content.includes('optimize')) {
      return 'performance';
    }
    if (content.includes('refactor') || content.includes('cleanup') || content.includes('technical debt')) {
      return 'refactor';
    }
    if (content.includes('doc') || content.includes('readme') || content.includes('documentation')) {
      return 'docs';
    }
    if (content.includes('test') || content.includes('coverage')) {
      return 'test';
    }
    if (content.includes('infrastructure') || content.includes('deploy') || content.includes('ci/cd')) {
      return 'infrastructure';
    }
    if (content.includes('enhance') || content.includes('improve') || content.includes('update')) {
      return 'enhancement';
    }
    return 'feature';
  }

  /**
   * Determine priority from content
   */
  private determinePriority(content: string): string {
    if (content.includes('critical') || content.includes('urgent') || content.includes('asap') || content.includes('production down')) {
      return 'priority:P0-Critical';
    }
    if (content.includes('high priority') || content.includes('important') || content.includes('blocker')) {
      return 'priority:P1-High';
    }
    if (content.includes('low priority') || content.includes('nice to have') || content.includes('backlog')) {
      return 'priority:P3-Low';
    }
    return 'priority:P2-Medium';
  }

  /**
   * Determine severity from content
   */
  private determineSeverity(content: string): string {
    if (content.includes('critical') || content.includes('crash') || content.includes('data loss')) {
      return 'critical';
    }
    if (content.includes('major') || content.includes('significant') || content.includes('blocking')) {
      return 'high';
    }
    if (content.includes('minor') || content.includes('cosmetic')) {
      return 'low';
    }
    return 'medium';
  }

  /**
   * Determine component from content
   */
  private determineComponent(content: string): string | null {
    if (content.includes('frontend') || content.includes('ui') || content.includes('react') || content.includes('css')) {
      return 'frontend';
    }
    if (content.includes('backend') || content.includes('server') || content.includes('lambda')) {
      return 'backend';
    }
    if (content.includes('api') || content.includes('endpoint') || content.includes('rest') || content.includes('graphql')) {
      return 'api';
    }
    if (content.includes('database') || content.includes('dynamodb') || content.includes('sql') || content.includes('migration')) {
      return 'database';
    }
    if (content.includes('infrastructure') || content.includes('aws') || content.includes('cdk') || content.includes('terraform')) {
      return 'infrastructure';
    }
    if (content.includes('ci/cd') || content.includes('pipeline') || content.includes('github actions')) {
      return 'ci-cd';
    }
    if (content.includes('monitoring') || content.includes('logging') || content.includes('metrics') || content.includes('alert')) {
      return 'monitoring';
    }
    if (content.includes('security') || content.includes('auth') || content.includes('permission')) {
      return 'security';
    }
    return null;
  }

  /**
   * Determine domain from content
   */
  private determineDomain(content: string): string | null {
    if (content.includes('auth') || content.includes('login') || content.includes('oauth') || content.includes('jwt')) {
      return 'auth';
    }
    if (content.includes('payment') || content.includes('stripe') || content.includes('billing')) {
      return 'payment';
    }
    if (content.includes('notification') || content.includes('email') || content.includes('push') || content.includes('sms')) {
      return 'notification';
    }
    if (content.includes('analytics') || content.includes('tracking') || content.includes('metrics')) {
      return 'analytics';
    }
    if (content.includes('user') || content.includes('profile') || content.includes('account')) {
      return 'user-management';
    }
    return null;
  }

  /**
   * Determine effort from content
   */
  private determineEffort(content: string): string | null {
    const wordCount = content.split(/\s+/).length;
    
    if (content.includes('simple') || content.includes('quick') || content.includes('typo') || wordCount < 50) {
      return 'xs';
    }
    if (content.includes('small') || content.includes('minor change') || wordCount < 100) {
      return 's';
    }
    if (content.includes('large') || content.includes('major') || content.includes('redesign') || wordCount > 500) {
      return 'xl';
    }
    if (content.includes('complex') || content.includes('multiple') || wordCount > 300) {
      return 'l';
    }
    return 'm';
  }

  /**
   * Determine recommended agent
   */
  private determineAgent(type: string, content: string): string {
    if (type === 'test' || content.includes('test coverage')) {
      return 'test';
    }
    if (type === 'infrastructure' || content.includes('deploy')) {
      return 'deploy';
    }
    if (type === 'docs') {
      return 'codegen';
    }
    if (type === 'security' || type === 'bug') {
      return 'review';
    }
    return 'codegen';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(content: string, labels: string[]): number {
    let confidence = 0.5; // Base confidence

    // More content = higher confidence
    if (content.length > 500) confidence += 0.1;
    if (content.length > 1000) confidence += 0.1;

    // More labels matched = higher confidence
    if (labels.length > 5) confidence += 0.1;
    if (labels.length > 7) confidence += 0.1;

    // Cap at 0.95
    return Math.min(0.95, confidence);
  }

  /**
   * Generate reasoning for the analysis
   */
  private generateReasoning(
    type: string,
    priority: string,
    severity: string,
    agent: string
  ): string {
    return `Issue classified as ${type} with ${priority}. ` +
      `Severity assessed as ${severity}. ` +
      `Recommended agent: ${agent}.`;
  }

  /**
   * Validate labels against taxonomy
   */
  private validateLabels(labels: string[]): void {
    const allValidLabels: string[] = Object.values(LABEL_TAXONOMY).flat() as string[];

    for (const label of labels) {
      if (!allValidLabels.includes(label)) {
        this.log('Warning: Label not in taxonomy', { label });
      }
    }
  }

  /**
   * Check if escalation is needed
   */
  private needsEscalation(analysis: IssueAnalysisResult): boolean {
    return analysis.confidence < 0.5 || 
           analysis.priority === 'priority:P0-Critical';
  }

  /**
   * Handle escalation
   */
  private async handleEscalation(
    analysis: IssueAnalysisResult,
    task: Task
  ): Promise<void> {
    if (analysis.confidence < 0.5) {
      await this.escalate(
        'Low confidence in issue classification',
        'TechLead',
        'Sev.2-High',
        { taskId: task.id, confidence: analysis.confidence }
      );
    }

    if (analysis.priority === 'priority:P0-Critical') {
      await this.escalate(
        'Critical priority issue detected',
        'TechLead',
        'Sev.1-Critical',
        { taskId: task.id, priority: analysis.priority }
      );
    }
  }
}
