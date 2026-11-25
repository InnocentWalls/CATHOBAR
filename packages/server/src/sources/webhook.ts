import type { PixelIconId, TickerItem } from '@cathobar/shared';
import { cleanText } from './types.js';

function str(val: unknown): string {
  return typeof val === 'string' ? cleanText(val) : '';
}

/**
 * Parses external webhook payloads for presets:
 * generic, github, homeassistant, alert, uptime-kuma, alertmanager, discord, slack, gitlab, cloudflare.
 */
export function parseWebhookPayload(
  preset: string,
  body: unknown,
  headers: Record<string, string | undefined> = {},
): TickerItem | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  const now = Date.now();
  const normalizedPreset = preset.toLowerCase();

  if (normalizedPreset === 'github') {
    const ghEvent = (headers['x-github-event'] ?? '').toLowerCase();
    const repo = (obj.repository as Record<string, unknown> | undefined)?.full_name;
    const repoLabel = str(repo) || 'GitHub';

    if (ghEvent === 'push' || Array.isArray(obj.commits)) {
      const ref = str(obj.ref).replace('refs/heads/', '');
      const commits = Array.isArray(obj.commits) ? obj.commits : [];
      const head =
        (obj.head_commit as Record<string, unknown> | undefined) ??
        (commits[0] as Record<string, unknown> | undefined);
      const msg = str(head?.message).split('\n')[0] || `${commits.length} commits`;
      return {
        id: `wh-gh-${now}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'webhook',
        badge: 'GITHUB',
        text: `[${repoLabel}${ref ? `:${ref}` : ''}] ${msg}`,
        color: '#38bdf8',
        timestamp: now,
        priority: 'high',
        oneShot: true,
        breaking: false,
        icon: 'webhook',
      };
    }

    if (ghEvent === 'workflow_run' || obj.workflow_run) {
      const run = obj.workflow_run as Record<string, unknown> | undefined;
      const name = str(run?.name) || 'Workflow';
      const conclusion = str(run?.conclusion) || str(run?.status) || str(obj.action);
      const failed = conclusion === 'failure' || conclusion === 'timed_out';
      return {
        id: `wh-gh-ci-${now}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'webhook',
        badge: failed ? 'CI FAIL' : 'CI',
        text: `[${repoLabel}] ${name}: ${conclusion}`,
        color: failed ? '#ef4444' : '#22c55e',
        timestamp: now,
        priority: 'high',
        oneShot: true,
        breaking: failed,
        icon: failed ? 'alert' : 'webhook',
      };
    }

    if (ghEvent === 'release' || obj.release) {
      const rel = obj.release as Record<string, unknown> | undefined;
      const tag = str(rel?.tag_name) || str(rel?.name);
      return {
        id: `wh-gh-rel-${now}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'webhook',
        badge: 'RELEASE',
        text: `[${repoLabel}] 新規リリース ${tag}`,
        color: '#a78bfa',
        timestamp: now,
        priority: 'high',
        oneShot: true,
        breaking: false,
        icon: 'webhook',
      };
    }

    const action = str(obj.action);
    const prTitle = str((obj.pull_request as Record<string, unknown> | undefined)?.title);
    const issueTitle = str((obj.issue as Record<string, unknown> | undefined)?.title);
    const summary = prTitle || issueTitle || str(obj.message) || action || 'GitHub Event';
    return {
      id: `wh-gh-evt-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: 'GITHUB',
      text: `[${repoLabel}] ${action ? `${action}: ` : ''}${summary}`,
      color: '#38bdf8',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: false,
      icon: 'webhook',
    };
  }

  if (normalizedPreset === 'gitlab') {
    const kind = str(obj.object_kind) || str(headers['x-gitlab-event']).toLowerCase();
    const proj = str((obj.project as Record<string, unknown> | undefined)?.path_with_namespace) || 'GitLab';
    if (kind === 'pipeline') {
      const attrs = obj.object_attributes as Record<string, unknown> | undefined;
      const status = str(attrs?.status) || 'unknown';
      const ref = str(attrs?.ref);
      const failed = status === 'failed';
      return {
        id: `wh-gl-pipe-${now}-${Math.random().toString(36).slice(2, 6)}`,
        source: 'webhook',
        badge: failed ? 'GL FAIL' : 'GITLAB CI',
        text: `[${proj}${ref ? `:${ref}` : ''}] Pipeline ${status}`,
        color: failed ? '#ef4444' : status === 'success' ? '#22c55e' : '#38bdf8',
        timestamp: now,
        priority: 'high',
        oneShot: true,
        breaking: failed,
        icon: failed ? 'alert' : 'webhook',
      };
    }
    const commits = Array.isArray(obj.commits) ? obj.commits : [];
    const lastCommit = commits[0] as Record<string, unknown> | undefined;
    const summary = str(lastCommit?.title) || str(obj.msg) || kind || 'GitLab Event';
    return {
      id: `wh-gl-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: 'GITLAB',
      text: `[${proj}] ${summary}`,
      color: '#fb923c',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: false,
      icon: 'webhook',
    };
  }

  if (normalizedPreset === 'uptime-kuma' || normalizedPreset === 'uptimekuma') {
    const heartbeat = obj.heartbeat as Record<string, unknown> | undefined;
    const monitor = obj.monitor as Record<string, unknown> | undefined;
    const name = str(monitor?.name) || str(obj.msg) || 'Monitor';
    const statusNum = typeof heartbeat?.status === 'number' ? heartbeat.status : undefined;
    const isDown = statusNum === 0;
    const msg = str(heartbeat?.msg) || str(obj.msg);
    const statusLabel = isDown ? 'DOWN' : statusNum === 1 ? 'UP' : 'STATUS';
    return {
      id: `wh-kuma-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: isDown ? 'DOWN' : 'UPTIME',
      text: `[${name}] ${statusLabel}${msg ? ` — ${msg}` : ''}`,
      color: isDown ? '#ef4444' : '#22c55e',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: isDown,
      icon: isDown ? 'alert' : 'webhook',
    };
  }

  if (normalizedPreset === 'alertmanager') {
    const status = str(obj.status) || 'firing';
    const alerts = Array.isArray(obj.alerts) ? (obj.alerts as Array<Record<string, unknown>>) : [];
    const first = alerts[0];
    const labels = (first?.labels as Record<string, unknown> | undefined) ?? {};
    const annotations = (first?.annotations as Record<string, unknown> | undefined) ?? {};
    const alertName = str(labels.alertname) || str(obj.groupKey) || 'Alertmanager';
    const severity = str(labels.severity).toLowerCase();
    const summary = str(annotations.summary) || str(annotations.description) || `${alerts.length} alerts`;
    const isFiring = status.toLowerCase() === 'firing';
    const isCritical = isFiring && (severity === 'critical' || severity === 'page');
    return {
      id: `wh-am-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: isFiring ? 'ALERT' : 'RESOLVED',
      text: `[${alertName}] ${summary}`,
      color: isFiring ? (isCritical ? '#ff2a22' : '#f59e0b') : '#22c55e',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: isCritical,
      icon: isFiring ? 'alert' : 'webhook',
    };
  }

  if (normalizedPreset === 'discord') {
    const embeds = Array.isArray(obj.embeds) ? (obj.embeds as Array<Record<string, unknown>>) : [];
    const embedTitle = str(embeds[0]?.title);
    const embedDesc = str(embeds[0]?.description);
    const content = str(obj.content) || [embedTitle, embedDesc].filter(Boolean).join(': ');
    if (!content) return null;
    const username = str(obj.username) || 'DISCORD';
    return {
      id: `wh-dc-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: username.slice(0, 20),
      text: content,
      color: '#818cf8',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: false,
      icon: 'webhook',
    };
  }

  if (normalizedPreset === 'slack') {
    const attachments = Array.isArray(obj.attachments)
      ? (obj.attachments as Array<Record<string, unknown>>)
      : [];
    const attText = str(attachments[0]?.fallback) || str(attachments[0]?.text);
    const text = str(obj.text) || attText;
    if (!text) return null;
    const badge = str(obj.username) || str(obj.channel) || 'SLACK';
    return {
      id: `wh-sl-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: badge.slice(0, 20),
      text,
      color: '#38fad9',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: false,
      icon: 'webhook',
    };
  }

  if (normalizedPreset === 'cloudflare') {
    const text = str(obj.text) || str(obj.message) || str(obj.alert_type);
    if (!text) return null;
    const alertType = str(obj.alert_type);
    return {
      id: `wh-cf-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: 'CF',
      text: alertType && !text.includes(alertType) ? `[${alertType}] ${text}` : text,
      color: '#fb923c',
      timestamp: now,
      priority: 'high',
      oneShot: true,
      breaking: obj.breaking === true,
      icon: obj.breaking === true ? 'alert' : 'webhook',
    };
  }

  if (normalizedPreset === 'homeassistant') {
    const badge = str(obj.badge) || str(obj.domain).toUpperCase() || 'HOME';
    const entity = str(obj.entity_id) || str(obj.name);
    const message =
      str(obj.message) ||
      str(obj.text) ||
      (entity && str(obj.state) ? `${entity}: ${str(obj.state)}` : '');
    if (!message) return null;
    const isBreaking = obj.breaking === true || obj.severity === 'critical';
    return {
      id: `wh-ha-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: badge.slice(0, 20),
      text: message,
      color: str(obj.color) || (isBreaking ? '#ef4444' : '#38fad9'),
      timestamp: now,
      priority: 'high',
      oneShot: obj.oneShot !== false,
      breaking: isBreaking,
      icon: (isBreaking ? 'alert' : 'webhook') as PixelIconId,
      replaceKey: str(obj.replaceKey) || undefined,
    };
  }

  if (normalizedPreset === 'alert') {
    const text = str(obj.text) || str(obj.message) || str(obj.title);
    if (!text) return null;
    return {
      id: `wh-alert-${now}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'webhook',
      badge: (str(obj.badge) || 'ALERT').slice(0, 20),
      text,
      color: str(obj.color) || '#ef4444',
      timestamp: now,
      priority: 'high',
      oneShot: obj.oneShot !== false,
      breaking: obj.breaking !== false,
      icon: 'alert',
    };
  }

  // Generic preset
  const text = str(obj.text) || str(obj.message) || str(obj.title);
  if (!text) return null;
  const isBreaking = obj.breaking === true;
  return {
    id: `wh-gen-${now}-${Math.random().toString(36).slice(2, 6)}`,
    source: 'webhook',
    badge: (str(obj.badge) || 'WEBHOOK').slice(0, 20),
    text,
    color: str(obj.color) || (isBreaking ? '#ef4444' : '#38fad9'),
    timestamp: now,
    priority: obj.priority === 'normal' ? 'normal' : 'high',
    oneShot: obj.oneShot !== false,
    breaking: isBreaking,
    icon: (isBreaking ? 'alert' : 'webhook') as PixelIconId,
    replaceKey: str(obj.replaceKey) || undefined,
  };
}
