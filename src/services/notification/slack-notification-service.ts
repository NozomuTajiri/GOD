/**
 * Slack Notification Service
 *
 * Service for sending notifications to Slack via MCP.
 * Supports Block Kit for rich message formatting.
 */

import { MCPToolAdapter, MCPToolResult } from '../../agent-runtime/mcp-tool-adapter.js';

/**
 * Slack MCP Server name constant
 */
export const SLACK_MCP_SERVER = 'slack';

/**
 * Slack Block Types
 */
export interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

export interface SlackSectionBlock {
  type: 'section';
  text?: SlackTextObject;
  fields?: SlackTextObject[];
  accessory?: SlackElement;
}

export interface SlackHeaderBlock {
  type: 'header';
  text: SlackTextObject;
}

export interface SlackDividerBlock {
  type: 'divider';
}

export interface SlackContextBlock {
  type: 'context';
  elements: (SlackTextObject | SlackImageElement)[];
}

export interface SlackActionsBlock {
  type: 'actions';
  elements: SlackElement[];
}

export interface SlackImageElement {
  type: 'image';
  image_url: string;
  alt_text: string;
}

export interface SlackButtonElement {
  type: 'button';
  text: SlackTextObject;
  action_id: string;
  value?: string;
  url?: string;
  style?: 'primary' | 'danger';
}

export type SlackElement = SlackButtonElement | SlackImageElement;

export type SlackBlock =
  | SlackSectionBlock
  | SlackHeaderBlock
  | SlackDividerBlock
  | SlackContextBlock
  | SlackActionsBlock;

/**
 * Slack Message Options
 */
export interface SlackMessageOptions {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

/**
 * Slack Post Response
 */
export interface SlackPostResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message?: {
    text: string;
    ts: string;
  };
}

/**
 * Escalation Severity Levels
 */
export type EscalationSeverity =
  | 'Sev.1-Critical'
  | 'Sev.2-High'
  | 'Sev.3-Medium'
  | 'Sev.4-Low';

/**
 * Escalation Target Types
 */
export type EscalationTarget =
  | 'TechLead'
  | 'CISO'
  | 'PO'
  | 'DevOps'
  | 'Architect'
  | 'Human';

/**
 * Escalation Record
 */
export interface EscalationRecord {
  id: string;
  timestamp: string;
  target: EscalationTarget;
  severity: EscalationSeverity;
  reason: string;
  context?: Record<string, unknown>;
  status: 'pending' | 'acknowledged' | 'resolved';
}

/**
 * Task Info for notifications
 */
export interface TaskInfo {
  id: string;
  title?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

/**
 * Agent Result for notifications
 */
export interface AgentResultInfo {
  status: 'success' | 'failure';
  data?: unknown;
  error?: string;
  metrics?: {
    durationMs?: number;
    [key: string]: unknown;
  };
}

/**
 * PR Info for notifications
 */
export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  body?: string;
  author?: string;
  labels?: string[];
  reviewers?: string[];
}

/**
 * Deployment Info for notifications
 */
export interface DeploymentInfo {
  environment: 'staging' | 'production';
  version: string;
  sha?: string;
  url?: string;
  deployedBy?: string;
  status: 'started' | 'success' | 'failure' | 'rollback';
  duration?: number;
}

/**
 * Security Alert Info for notifications
 */
export interface SecurityAlertInfo {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation?: string;
  cve?: string;
}

/**
 * Notification Channel Configuration
 */
export interface ChannelConfig {
  devNotifications: string;
  escalations: string;
  codeReview: string;
  deployments: string;
  securityAlerts: string;
}

/**
 * Default channel configuration
 */
const DEFAULT_CHANNELS: ChannelConfig = {
  devNotifications: '#dev-notifications',
  escalations: '#escalations',
  codeReview: '#code-review',
  deployments: '#deployments',
  securityAlerts: '#security-alerts',
};

/**
 * Slack Notification Service
 */
export class SlackNotificationService {
  private mcp: MCPToolAdapter;
  private channels: ChannelConfig;

  constructor(mcp: MCPToolAdapter, channels?: Partial<ChannelConfig>) {
    this.mcp = mcp;
    this.channels = { ...DEFAULT_CHANNELS, ...channels };
  }

  /**
   * Post a message to Slack
   */
  async postMessage(options: SlackMessageOptions): Promise<SlackPostResponse> {
    const result = await this.mcp.callToolWithRetry(
      SLACK_MCP_SERVER,
      'slack_post_message',
      options
    );

    if (!result.success) {
      throw new Error(`Failed to post Slack message: ${result.error}`);
    }

    return result.data as SlackPostResponse;
  }

  /**
   * Reply to a thread
   */
  async replyToThread(
    channel: string,
    threadTs: string,
    text: string,
    blocks?: SlackBlock[]
  ): Promise<SlackPostResponse> {
    return this.postMessage({
      channel,
      text,
      blocks,
      thread_ts: threadTs,
    });
  }

  /**
   * Add reaction to a message
   */
  async addReaction(
    channel: string,
    timestamp: string,
    emoji: string
  ): Promise<void> {
    const result = await this.mcp.callToolWithRetry(
      SLACK_MCP_SERVER,
      'slack_add_reaction',
      {
        channel,
        timestamp,
        name: emoji,
      }
    );

    if (!result.success) {
      throw new Error(`Failed to add reaction: ${result.error}`);
    }
  }

  /**
   * Notify task started
   */
  async notifyTaskStart(task: TaskInfo): Promise<SlackPostResponse> {
    return this.postMessage({
      channel: this.channels.devNotifications,
      text: `:hourglass_flowing_sand: Task ${task.id} started`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:hourglass_flowing_sand: *Task Started*\n*ID:* ${task.id}${task.title ? `\n*Title:* ${task.title}` : ''}${task.type ? `\n*Type:* ${task.type}` : ''}`,
          },
        },
      ],
    });
  }

  /**
   * Notify task completed
   */
  async notifyTaskComplete(
    task: TaskInfo,
    result: AgentResultInfo
  ): Promise<SlackPostResponse> {
    const emoji = result.status === 'success' ? ':white_check_mark:' : ':x:';
    const statusText = result.status === 'success' ? 'Completed' : 'Failed';

    const fields: SlackTextObject[] = [
      { type: 'mrkdwn', text: `*Task ID:*\n${task.id}` },
      { type: 'mrkdwn', text: `*Status:*\n${statusText}` },
    ];

    if (result.metrics?.durationMs) {
      fields.push({
        type: 'mrkdwn',
        text: `*Duration:*\n${result.metrics.durationMs}ms`,
      });
    }

    if (result.error) {
      fields.push({
        type: 'mrkdwn',
        text: `*Error:*\n${result.error.slice(0, 100)}`,
      });
    }

    return this.postMessage({
      channel: this.channels.devNotifications,
      text: `${emoji} Task ${task.id} ${result.status}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Task ${statusText}*${task.title ? `\n${task.title}` : ''}`,
          },
        },
        {
          type: 'section',
          fields,
        },
      ],
    });
  }

  /**
   * Notify task error
   */
  async notifyTaskError(
    task: TaskInfo,
    error: Error
  ): Promise<SlackPostResponse> {
    return this.postMessage({
      channel: this.channels.devNotifications,
      text: `:x: Task ${task.id} failed with error`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: ':x: Task Error' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Task ID:*\n${task.id}` },
            { type: 'mrkdwn', text: `*Error:*\n${error.message}` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Stack trace available in logs`,
            },
          ],
        },
      ],
    });
  }

  /**
   * Notify escalation
   */
  async notifyEscalation(
    escalation: EscalationRecord
  ): Promise<SlackPostResponse> {
    const severityEmoji: Record<EscalationSeverity, string> = {
      'Sev.1-Critical': ':rotating_light:',
      'Sev.2-High': ':warning:',
      'Sev.3-Medium': ':large_yellow_circle:',
      'Sev.4-Low': ':information_source:',
    };

    const severityColor: Record<EscalationSeverity, 'danger' | 'primary' | undefined> = {
      'Sev.1-Critical': 'danger',
      'Sev.2-High': 'danger',
      'Sev.3-Medium': undefined,
      'Sev.4-Low': undefined,
    };

    return this.postMessage({
      channel: this.channels.escalations,
      text: `${severityEmoji[escalation.severity]} Escalation to ${escalation.target}: ${escalation.reason}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji[escalation.severity]} Escalation: ${escalation.severity}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Target:*\n${escalation.target}` },
            { type: 'mrkdwn', text: `*Status:*\n${escalation.status}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reason:*\n${escalation.reason}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Acknowledge' },
              action_id: `ack_${escalation.id}`,
              style: severityColor[escalation.severity],
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Details' },
              action_id: `view_${escalation.id}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `ID: ${escalation.id} | ${escalation.timestamp}`,
            },
          ],
        },
      ],
    });
  }

  /**
   * Notify PR ready for review
   */
  async notifyPRReady(pr: PullRequestInfo): Promise<SlackPostResponse> {
    const fields: SlackTextObject[] = [
      { type: 'mrkdwn', text: `*PR:*\n#${pr.number}` },
    ];

    if (pr.author) {
      fields.push({ type: 'mrkdwn', text: `*Author:*\n${pr.author}` });
    }

    if (pr.labels && pr.labels.length > 0) {
      fields.push({
        type: 'mrkdwn',
        text: `*Labels:*\n${pr.labels.join(', ')}`,
      });
    }

    return this.postMessage({
      channel: this.channels.codeReview,
      text: `:git-pull-request: New PR ready for review: ${pr.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:git-pull-request: *<${pr.url}|${pr.title}>*${pr.body ? `\n${pr.body.slice(0, 200)}${pr.body.length > 200 ? '...' : ''}` : ''}`,
          },
        },
        {
          type: 'section',
          fields,
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Review PR' },
              action_id: `review_pr_${pr.number}`,
              url: pr.url,
              style: 'primary',
            },
          ],
        },
      ],
    });
  }

  /**
   * Notify deployment
   */
  async notifyDeployment(deployment: DeploymentInfo): Promise<SlackPostResponse> {
    const statusEmoji: Record<DeploymentInfo['status'], string> = {
      started: ':rocket:',
      success: ':white_check_mark:',
      failure: ':x:',
      rollback: ':rewind:',
    };

    const statusText: Record<DeploymentInfo['status'], string> = {
      started: 'Started',
      success: 'Successful',
      failure: 'Failed',
      rollback: 'Rolled Back',
    };

    const envEmoji = deployment.environment === 'production' ? ':fire:' : ':test_tube:';

    const fields: SlackTextObject[] = [
      {
        type: 'mrkdwn',
        text: `*Environment:*\n${envEmoji} ${deployment.environment}`,
      },
      { type: 'mrkdwn', text: `*Version:*\n${deployment.version}` },
    ];

    if (deployment.sha) {
      fields.push({
        type: 'mrkdwn',
        text: `*Commit:*\n\`${deployment.sha.slice(0, 7)}\``,
      });
    }

    if (deployment.duration) {
      fields.push({
        type: 'mrkdwn',
        text: `*Duration:*\n${deployment.duration}s`,
      });
    }

    if (deployment.deployedBy) {
      fields.push({
        type: 'mrkdwn',
        text: `*Deployed by:*\n${deployment.deployedBy}`,
      });
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji[deployment.status]} Deployment ${statusText[deployment.status]}`,
        },
      },
      {
        type: 'section',
        fields,
      },
    ];

    if (deployment.url && deployment.status === 'success') {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Deployment' },
            action_id: `view_deployment_${deployment.version}`,
            url: deployment.url,
          },
        ],
      });
    }

    return this.postMessage({
      channel: this.channels.deployments,
      text: `${statusEmoji[deployment.status]} ${deployment.environment} deployment ${statusText[deployment.status].toLowerCase()}: ${deployment.version}`,
      blocks,
    });
  }

  /**
   * Notify security alert
   */
  async notifySecurityAlert(alert: SecurityAlertInfo): Promise<SlackPostResponse> {
    const severityEmoji: Record<SecurityAlertInfo['severity'], string> = {
      critical: ':rotating_light:',
      high: ':warning:',
      medium: ':large_yellow_circle:',
      low: ':information_source:',
    };

    const severityColor: Record<SecurityAlertInfo['severity'], 'danger' | 'primary' | undefined> = {
      critical: 'danger',
      high: 'danger',
      medium: undefined,
      low: undefined,
    };

    const fields: SlackTextObject[] = [
      { type: 'mrkdwn', text: `*Severity:*\n${alert.severity.toUpperCase()}` },
    ];

    if (alert.file) {
      fields.push({
        type: 'mrkdwn',
        text: `*File:*\n${alert.file}${alert.line ? `:${alert.line}` : ''}`,
      });
    }

    if (alert.cve) {
      fields.push({ type: 'mrkdwn', text: `*CVE:*\n${alert.cve}` });
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji[alert.severity]} Security Alert`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.title}*\n${alert.description}`,
        },
      },
      {
        type: 'section',
        fields,
      },
    ];

    if (alert.recommendation) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Recommendation:*\n${alert.recommendation}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Acknowledge' },
          action_id: `ack_security_${Date.now()}`,
          style: severityColor[alert.severity],
        },
      ],
    });

    return this.postMessage({
      channel: this.channels.securityAlerts,
      text: `${severityEmoji[alert.severity]} Security Alert: ${alert.title}`,
      blocks,
    });
  }

  /**
   * Update thread with progress
   */
  async updateProgress(
    channel: string,
    threadTs: string,
    progress: {
      current: number;
      total: number;
      message: string;
    }
  ): Promise<SlackPostResponse> {
    const percentage = Math.round((progress.current / progress.total) * 100);
    const progressBar = this.createProgressBar(percentage);

    return this.replyToThread(channel, threadTs, progress.message, [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Progress:* ${progress.current}/${progress.total} (${percentage}%)\n${progressBar}\n${progress.message}`,
        },
      },
    ]);
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * Get channel history
   */
  async getChannelHistory(
    channel: string,
    limit?: number
  ): Promise<MCPToolResult> {
    return this.mcp.callToolWithRetry(SLACK_MCP_SERVER, 'slack_get_channel_history', {
      channel,
      limit: limit || 10,
    });
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(
    channel: string,
    threadTs: string
  ): Promise<MCPToolResult> {
    return this.mcp.callToolWithRetry(SLACK_MCP_SERVER, 'slack_get_thread_replies', {
      channel,
      thread_ts: threadTs,
    });
  }

  /**
   * Search messages
   */
  async searchMessages(query: string): Promise<MCPToolResult> {
    return this.mcp.callToolWithRetry(SLACK_MCP_SERVER, 'slack_search_messages', {
      query,
    });
  }

  /**
   * Get user info
   */
  async getUserInfo(userId: string): Promise<MCPToolResult> {
    return this.mcp.callToolWithRetry(SLACK_MCP_SERVER, 'slack_get_user_profile', {
      user_id: userId,
    });
  }
}
