import type { PixelIconId, TickerItem } from '@cathobar/shared';
import { cleanText } from './types.js';

function str(val: unknown): string {
  return typeof val === 'string' ? cleanText(val) : '';
}

/**
 * Parses external webhook payloads for presets: generic, github, homeassistant, alert.
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
      const head = (obj.head_commit as Record<string, unknown> | undefined) ??
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
