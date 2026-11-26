import { describe, expect, it } from 'vitest';
import { parseWebhookPayload } from '../src/sources/webhook.js';
import {
  extractLink,
  extractText,
  normalizeTitleKey,
  parseTimestampMs,
  toArray,
} from '../src/sources/xml-utils.js';

describe('xml-utils', () => {
  it('normalizes arrays and extracts text/links/timestamps', () => {
    expect(toArray(undefined)).toEqual([]);
    expect(toArray(null)).toEqual([]);
    expect(toArray('a')).toEqual(['a']);
    expect(toArray(['a', 'b'])).toEqual(['a', 'b']);

    expect(extractText('hello')).toBe('hello');
    expect(extractText(42)).toBe('42');
    expect(extractText({ '#text': 'nested' })).toBe('nested');
    expect(extractText({})).toBe('');

    expect(extractLink('https://example.com')).toBe('https://example.com');
    expect(extractLink({ '@_href': 'https://example.com/atom' })).toBe('https://example.com/atom');
    expect(extractLink([{ '#text': 'https://example.com/first' }])).toBe(
      'https://example.com/first',
    );
    expect(extractLink(undefined)).toBeUndefined();

    expect(normalizeTitleKey('【速報】 Test! ニュース (2026)')).toBe('速報testニュース2026');
    expect(parseTimestampMs('2026-11-26T00:00:00Z')).toBe(Date.UTC(2026, 10, 26, 0, 0, 0));
    expect(parseTimestampMs('invalid-date')).toBeNull();
    expect(parseTimestampMs('')).toBeNull();
  });
});

describe('parseWebhookPayload', () => {
  it('handles github push, workflow_run, release, and generic PR/issue events', () => {
    const pushItem = parseWebhookPayload(
      'github',
      {
        repository: { full_name: 'org/cathobar' },
        ref: 'refs/heads/main',
        commits: [{ message: 'feat: release v1.0.0\n\ndetails' }],
      },
      { 'x-github-event': 'push' },
    );
    expect(pushItem?.badge).toBe('GITHUB');
    expect(pushItem?.text).toBe('[org/cathobar:main] feat: release v1.0.0 details');
    expect(pushItem?.breaking).toBe(false);

    const ciFail = parseWebhookPayload(
      'github',
      {
        repository: { full_name: 'org/cathobar' },
        workflow_run: { name: 'CI', conclusion: 'failure' },
      },
      { 'x-github-event': 'workflow_run' },
    );
    expect(ciFail?.badge).toBe('CI FAIL');
    expect(ciFail?.breaking).toBe(true);
    expect(ciFail?.icon).toBe('alert');

    const ciOk = parseWebhookPayload(
      'github',
      {
        repository: { full_name: 'org/cathobar' },
        workflow_run: { name: 'CI', conclusion: 'success' },
      },
      { 'x-github-event': 'workflow_run' },
    );
    expect(ciOk?.badge).toBe('CI');
    expect(ciOk?.breaking).toBe(false);

    const releaseItem = parseWebhookPayload(
      'github',
      {
        repository: { full_name: 'org/cathobar' },
        release: { tag_name: 'v1.0.0' },
      },
      { 'x-github-event': 'release' },
    );
    expect(releaseItem?.badge).toBe('RELEASE');
    expect(releaseItem?.text).toContain('v1.0.0');

    const prItem = parseWebhookPayload('github', {
      repository: { full_name: 'org/cathobar' },
      action: 'opened',
      pull_request: { title: 'Add Docker support' },
    });
    expect(prItem?.text).toBe('[org/cathobar] opened: Add Docker support');
  });

  it('handles gitlab, homeassistant, uptime-kuma, alertmanager, discord, slack, cloudflare, alert, and generic', () => {
    const glOk = parseWebhookPayload('gitlab', {
      object_kind: 'pipeline',
      project: { path_with_namespace: 'team/app' },
      object_attributes: { status: 'success', ref: 'main' },
    });
    expect(glOk?.badge).toBe('GITLAB CI');
    expect(glOk?.breaking).toBe(false);

    const glPush = parseWebhookPayload('gitlab', {
      object_kind: 'push',
      project: { path_with_namespace: 'team/app' },
      commits: [{ title: 'fix bug' }],
    });
    expect(glPush?.badge).toBe('GITLAB');
    expect(glPush?.text).toBe('[team/app] fix bug');

    const haState = parseWebhookPayload('homeassistant', {
      domain: 'lock',
      entity_id: 'lock.front_door',
      state: 'locked',
      replaceKey: 'ha-front-door',
    });
    expect(haState?.badge).toBe('LOCK');
    expect(haState?.text).toBe('lock.front_door: locked');
    expect(haState?.replaceKey).toBe('ha-front-door');
    expect(haState?.breaking).toBe(false);

    const haCrit = parseWebhookPayload('homeassistant', {
      message: 'Smoke detected',
      severity: 'critical',
    });
    expect(haCrit?.breaking).toBe(true);
    expect(haCrit?.icon).toBe('alert');

    const kumaUp = parseWebhookPayload('uptime-kuma', {
      monitor: { name: 'API' },
      heartbeat: { status: 1, msg: '200 OK' },
    });
    expect(kumaUp?.badge).toBe('UPTIME');
    expect(kumaUp?.breaking).toBe(false);

    const amWarn = parseWebhookPayload('alertmanager', {
      status: 'firing',
      alerts: [{ labels: { alertname: 'HighCPU', severity: 'warning' }, annotations: { summary: '85%' } }],
    });
    expect(amWarn?.badge).toBe('ALERT');
    expect(amWarn?.breaking).toBe(false);

    const amResolved = parseWebhookPayload('alertmanager', {
      status: 'resolved',
      alerts: [{ labels: { alertname: 'HighCPU' }, annotations: { description: 'Recovered' } }],
    });
    expect(amResolved?.badge).toBe('RESOLVED');
    expect(amResolved?.breaking).toBe(false);

    const dcEmbed = parseWebhookPayload('discord', {
      username: 'DeployBot',
      embeds: [{ title: 'Deploy', description: 'Production updated' }],
    });
    expect(dcEmbed?.badge).toBe('DeployBot');
    expect(dcEmbed?.text).toBe('Deploy: Production updated');
    expect(parseWebhookPayload('discord', {})).toBeNull();

    const slackAtt = parseWebhookPayload('slack', {
      attachments: [{ fallback: 'Build finished' }],
    });
    expect(slackAtt?.badge).toBe('SLACK');
    expect(slackAtt?.text).toBe('Build finished');
    expect(parseWebhookPayload('slack', {})).toBeNull();

    const cf = parseWebhookPayload('cloudflare', {
      alert_type: 'ddos_attack',
      message: 'Mitigation active',
    });
    expect(cf?.badge).toBe('CF');
    expect(cf?.text).toBe('[ddos_attack] Mitigation active');

    const alert = parseWebhookPayload('alert', { text: 'Disk full' });
    expect(alert?.breaking).toBe(true);
    expect(alert?.icon).toBe('alert');

    const gen = parseWebhookPayload('generic', {
      text: 'Hello',
      priority: 'normal',
      oneShot: false,
    });
    expect(gen?.priority).toBe('normal');
    expect(gen?.oneShot).toBe(false);
    expect(gen?.breaking).toBe(false);
    expect(parseWebhookPayload('generic', null)).toBeNull();
    expect(parseWebhookPayload('generic', {})).toBeNull();
  });
});
