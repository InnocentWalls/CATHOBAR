import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '@cathobar/shared';
import { createApp } from '../src/app.js';
import { ConfigStore } from '../src/config-store.js';
import { TickerHub } from '../src/hub.js';
import { formatCountdownEvent } from '../src/sources/countdown.js';
import { parseP2pQuakeEvent } from '../src/sources/earthquake.js';
import { formatMarketQuote } from '../src/sources/market.js';
import { parseMastodonStatus } from '../src/sources/mastodon.js';
import { parseNhkBreakingXml } from '../src/sources/nhk-breaking.js';
import { parseRssXml } from '../src/sources/rss.js';
import { formatCalendarEventsToItems, parseIcsEvents } from '../src/sources/calendar.js';
import { formatSensorReading } from '../src/sources/sensors.js';
import { computeCpuUsagePercent, formatSysmonItems } from '../src/sources/sysmon.js';
import { parseOdptTrainInfo } from '../src/sources/transit.js';
import { parseJmaWarnings, parseOpenMeteoForecast } from '../src/sources/weather.js';
import { parseWebhookPayload } from '../src/sources/webhook.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('ConfigStore', () => {
  it('creates default config and persists partial updates including multi-weather & mastodon', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-test-'));
    tempDirs.push(dir);
    const configFile = join(dir, 'config.json');

    const store = new ConfigStore(configFile);
    const initial = await store.load();
    expect(initial.display.visualMode).toBe('anobar8-vfd');
    expect(initial.display.layoutMode).toBe('auto');
    expect(initial.display.screenLayout).toBe('auto');
    expect(initial.display.boardLogicalWidth).toBe(640);
    expect(initial.display.wallLanes).toBe(6);
    expect(initial.activeChannel).toBe('all');
    expect(initial.sources.weather.locations).toHaveLength(1);

    await store.patch({
      activeChannel: 'mastodon',
      display: {
        visualMode: 'anobar-fed',
        layoutMode: 'danmaku',
        screenLayout: 'wall',
        boardLogicalWidth: 768,
        wallLanes: 8,
        scrollSpeed: 120,
      },
      sources: {
        weather: {
          locations: [
            { id: 'tokyo', cityName: '東京', latitude: 35.67, longitude: 139.65, enabled: true },
            { id: 'osaka', cityName: '大阪', latitude: 34.69, longitude: 135.5, enabled: true },
          ],
        },
      },
    });

    const reloadedStore = new ConfigStore(configFile);
    const reloaded = await reloadedStore.load();
    expect(reloaded.activeChannel).toBe('mastodon');
    expect(reloaded.display.visualMode).toBe('anobar-fed');
    expect(reloaded.display.layoutMode).toBe('danmaku');
    expect(reloaded.display.screenLayout).toBe('wall');
    expect(reloaded.display.boardLogicalWidth).toBe(768);
    expect(reloaded.display.wallLanes).toBe(8);
    expect(reloaded.sources.weather.locations).toHaveLength(2);
  });

  it('migrates legacy single-city weather and bluesky activeChannel safely', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-migrate-'));
    tempDirs.push(dir);
    const configFile = join(dir, 'config.json');

    await writeFile(
      configFile,
      JSON.stringify({
        version: 1,
        activeChannel: 'bluesky',
        sources: {
          weather: { enabled: true, cityName: '札幌', latitude: 43.06, longitude: 141.35 },
        },
      }),
      'utf-8',
    );

    const store = new ConfigStore(configFile);
    const migrated = await store.load();
    expect(migrated.activeChannel).toBe('mastodon');
    expect(migrated.sources.weather.locations[0]?.cityName).toBe('札幌');
  });

  it('migrates legacy NHK RSS URLs to news.web.nhk and persists the migrated config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-nhk-migrate-'));
    tempDirs.push(dir);
    const configFile = join(dir, 'config.json');

    await writeFile(
      configFile,
      JSON.stringify({
        version: 1,
        sources: {
          rss: {
            enabled: true,
            feeds: [
              {
                id: 'nhk-news',
                name: 'NHK',
                url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
                enabled: true,
              },
              {
                id: 'nhk-econ',
                name: 'NHK経済',
                url: 'http://www3.nhk.or.jp/rss/news/cat5.xml',
                enabled: true,
              },
            ],
          },
        },
      }),
      'utf-8',
    );

    const store = new ConfigStore(configFile);
    const migrated = await store.load();
    expect(migrated.sources.rss.feeds[0]?.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat0.xml');
    expect(migrated.sources.rss.feeds[1]?.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat5.xml');

    const reloaded = await new ConfigStore(configFile).load();
    expect(reloaded.sources.rss.feeds[0]?.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat0.xml');
    expect(reloaded.sources.rss.feeds[1]?.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat5.xml');
  });

  it('migrates legacy nhkBreaking cat-live.xml URL and populates nhkBreaking defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-nhk-breaking-migrate-'));
    tempDirs.push(dir);
    const configFile = join(dir, 'config.json');

    await writeFile(
      configFile,
      JSON.stringify({
        version: 1,
        sources: {
          nhkBreaking: {
            enabled: true,
            url: 'http://www3.nhk.or.jp/rss/news/cat-live.xml',
          },
        },
      }),
      'utf-8',
    );

    const store = new ConfigStore(configFile);
    const loaded = await store.load();
    expect(loaded.sources.nhkBreaking.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat-live.xml');
    expect(loaded.sources.nhkBreaking.pollIntervalSec).toBe(60);
    expect(loaded.sources.nhkBreaking.maxItemAgeMinutes).toBe(30);

    const reloaded = await new ConfigStore(configFile).load();
    expect(reloaded.sources.nhkBreaking.url).toBe('https://news.web.nhk/n-data/conf/na/rss/cat-live.xml');
  });
});

describe('parseRssXml', () => {
  const feed = { id: 'test', name: 'TEST', url: 'https://example.com/rss', enabled: true };

  it('parses RSS 2.0 items', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Sample</title>
          <item>
            <title>速報 &amp; テスト記事</title>
            <link>https://example.com/1</link>
          </item>
        </channel>
      </rss>`;
    const items = parseRssXml(xml, feed);
    expect(items).toHaveLength(1);
    expect(items[0]?.badge).toBe('TEST');
    expect(items[0]?.text).toBe('速報 & テスト記事');
    expect(items[0]?.oneShot).toBe(false);
    expect(items[0]?.sourceKey).toBe('rss:test');
  });

  it('parses Atom entries', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom テスト</title>
          <link href="https://example.com/atom/1" />
        </entry>
      </feed>`;
    const items = parseRssXml(xml, feed);
    expect(items).toHaveLength(1);
    expect(items[0]?.text).toBe('Atom テスト');
  });
});

describe('parseMastodonStatus', () => {
  it('strips HTML, handles CW, and applies language/keyword filters', () => {
    const cfg = { ...DEFAULT_CONFIG.sources.mastodon, lang: 'ja', keywords: ['CATHOBAR'] };
    const item = parseMastodonStatus(
      {
        id: '12345',
        language: 'ja',
        spoiler_text: 'テスト',
        content: '<p>CATHOBARで<br />トゥート表示テスト</p>',
        account: { acct: 'alice@mstdn.jp' },
        url: 'https://mstdn.jp/@alice/12345',
      },
      cfg,
    );
    expect(item).not.toBeNull();
    expect(item?.badge).toBe('@alice');
    expect(item?.text).toBe('[CW: テスト] CATHOBARで トゥート表示テスト');
    expect(item?.source).toBe('mastodon');

    const filteredOut = parseMastodonStatus(
      { id: '999', language: 'en', content: '<p>Hello world</p>', account: { acct: 'bob' } },
      cfg,
    );
    expect(filteredOut).toBeNull();
  });
});

describe('Hono API', () => {
  it('handles health, config, and one-shot vs persistent push endpoints', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-api-'));
    tempDirs.push(dir);

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();
    const app = createApp(hub);

    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);

    const patchRes = await app.request('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: { vfdPalette: 'amber', layoutMode: 'danmaku' } }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      display: { vfdPalette: string; layoutMode: string };
    };
    expect(patched.display.vfdPalette).toBe('amber');
    expect(patched.display.layoutMode).toBe('danmaku');

    // Default push is oneShot=true, so it should NOT persist in state.items
    const oneShotPush = await app.request('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '一度きりの通知', badge: 'NOTICE' }),
    });
    expect(oneShotPush.status).toBe(201);

    // Explicit oneShot=false persists
    const persistentPush = await app.request('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '常駐お知らせ', badge: 'INFO', oneShot: false }),
    });
    expect(persistentPush.status).toBe(201);

    const stateRes = await app.request('/api/state');
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as { items: Array<{ text: string }> };
    expect(state.items.some((i) => i.text === '一度きりの通知')).toBe(false);
    expect(state.items.some((i) => i.text === '常駐お知らせ')).toBe(true);
  });
});

describe('TickerHub ALL MIX source filtering', () => {
  it('prunes disabled sources and individual feeds immediately and repopulates on re-enable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-allmix-'));
    tempDirs.push(dir);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('news.web.nhk')) {
          return new Response(
            `<?xml version="1.0"?><rss version="2.0"><channel><item><title>NHKニュース1</title><link>https://nhk.example/1</link></item></channel></rss>`,
            { status: 200 },
          );
        }
        if (url.includes('itmedia.co.jp')) {
          return new Response(
            `<?xml version="1.0"?><rss version="2.0"><channel><item><title>ITmedia記事1</title><link>https://itmedia.example/1</link></item></channel></rss>`,
            { status: 200 },
          );
        }
        if (url.includes('wikipedia.org')) {
          return new Response(
            JSON.stringify({ title: '東京タワー', extract: '東京都港区にある電波塔' }),
            { status: 200 },
          );
        }
        if (url.includes('open-meteo.com')) {
          return new Response(
            JSON.stringify({
              current: { temperature_2m: 21.5, relative_humidity_2m: 50, weather_code: 0 },
            }),
            { status: 200 },
          );
        }
        return new Response('Not Found', { status: 404 });
      }),
    );

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();

    await hub.refreshSource('rss');
    await hub.refreshSource('wikipedia');
    await hub.refreshSource('weather');
    hub.pushMessage({
      text: '常駐メッセージ',
      badge: 'INFO',
      color: '#38fad9',
      priority: 'normal',
      oneShot: false,
    });

    const initialItems = hub.getState().items;
    expect(initialItems.some((i) => i.source === 'rss' && i.sourceKey === 'rss:nhk-news')).toBe(true);
    expect(initialItems.some((i) => i.source === 'rss' && i.sourceKey === 'rss:itmedia-news')).toBe(true);
    expect(initialItems.some((i) => i.source === 'wikipedia')).toBe(true);
    expect(initialItems.some((i) => i.source === 'weather')).toBe(true);
    expect(initialItems.some((i) => i.source === 'push')).toBe(true);

    // Disable Wikipedia -> Wikipedia items are removed while RSS/weather/push remain
    await hub.updateConfig({ sources: { wikipedia: { enabled: false } } });
    const afterWikiOff = hub.getState().items;
    expect(afterWikiOff.some((i) => i.source === 'wikipedia')).toBe(false);
    expect(afterWikiOff.some((i) => i.source === 'rss')).toBe(true);
    expect(afterWikiOff.some((i) => i.source === 'weather')).toBe(true);

    // Disable only NHK RSS feed -> NHK removed, ITmedia remains
    const feedsWithoutNhk = hub.getConfig().sources.rss.feeds.map((f) =>
      f.id === 'nhk-news' ? { ...f, enabled: false } : f,
    );
    await hub.updateConfig({ sources: { rss: { feeds: feedsWithoutNhk } } });
    const afterNhkOff = hub.getState().items;
    expect(afterNhkOff.some((i) => i.sourceKey === 'rss:nhk-news')).toBe(false);
    expect(afterNhkOff.some((i) => i.sourceKey === 'rss:itmedia-news')).toBe(true);

    // Disable RSS completely -> all RSS removed
    await hub.updateConfig({ sources: { rss: { enabled: false } } });
    expect(hub.getState().items.some((i) => i.source === 'rss')).toBe(false);

    // Re-enable RSS and all feeds -> RSS repopulates (seenIdsByFeed cleared on stop)
    const feedsAllOn = hub.getConfig().sources.rss.feeds.map((f) => ({ ...f, enabled: true }));
    await hub.updateConfig({ sources: { rss: { enabled: true, feeds: feedsAllOn } } });
    await hub.refreshSource('rss');
    const afterRssOn = hub.getState().items;
    expect(afterRssOn.some((i) => i.sourceKey === 'rss:nhk-news')).toBe(true);
    expect(afterRssOn.some((i) => i.sourceKey === 'rss:itmedia-news')).toBe(true);

    // Disable weather -> weather items removed while persistent push remains
    await hub.updateConfig({ sources: { weather: { enabled: false } } });
    const afterWeatherOff = hub.getState().items;
    expect(afterWeatherOff.some((i) => i.source === 'weather')).toBe(false);
    expect(afterWeatherOff.some((i) => i.source === 'push' && i.text === '常駐メッセージ')).toBe(true);
  });

  it('prunes rotated-out RSS articles when feed items update on subsequent refresh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-rss-rotate-'));
    tempDirs.push(dir);

    let generation = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('news.web.nhk')) {
          const xml =
            generation === 1
              ? `<?xml version="1.0"?><rss version="2.0"><channel><item><title>古い記事A</title><link>https://nhk.example/old</link></item><item><title>継続記事B</title><link>https://nhk.example/keep</link></item></channel></rss>`
              : `<?xml version="1.0"?><rss version="2.0"><channel><item><title>継続記事B</title><link>https://nhk.example/keep</link></item><item><title>最新記事C</title><link>https://nhk.example/new</link></item></channel></rss>`;
          return new Response(xml, { status: 200 });
        }
        return new Response('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>', {
          status: 200,
        });
      }),
    );

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();

    await hub.refreshSource('rss');
    expect(hub.getState().items.map((i) => i.text)).toEqual(['古い記事A', '継続記事B']);

    generation = 2;
    await hub.refreshSource('rss');
    expect(hub.getState().items.map((i) => i.text)).toEqual(['継続記事B', '最新記事C']);
  });
});

describe('New sources & global filtering & webhooks', () => {
  it('parses P2PQuake 551/552/556 events with live vs history breaking flags', () => {
    const cfg = DEFAULT_CONFIG.sources.earthquake;
    const minor = parseP2pQuakeEvent(
      { code: 551, id: 'q1', earthquake: { maxScale: 10, hypocenter: { name: '千葉県北西部' } } },
      cfg,
      true,
    );
    expect(minor).toBeNull();

    const majorHistory = parseP2pQuakeEvent(
      {
        code: 551,
        id: 'q2',
        earthquake: {
          maxScale: 50,
          domesticTsunami: 'None',
          hypocenter: { name: '宮城県沖', depth: 40, magnitude: 6.1 },
        },
      },
      cfg,
      false,
    );
    expect(majorHistory).not.toBeNull();
    expect(majorHistory?.breaking).toBe(false);
    expect(majorHistory?.icon).toBe('quake');

    const majorLive = parseP2pQuakeEvent(
      {
        code: 551,
        id: 'q3',
        earthquake: {
          maxScale: 50,
          domesticTsunami: 'Warning',
          hypocenter: { name: '三陸沖', depth: 20, magnitude: 7.2 },
        },
      },
      cfg,
      true,
    );
    expect(majorLive?.breaking).toBe(true);
    expect(majorLive?.icon).toBe('tsunami');

    const eewLive = parseP2pQuakeEvent(
      {
        code: 556,
        id: 'eew1',
        earthquake: { hypocenter: { name: '茨城沖' } },
        areas: [{ pref: '茨城県' }, { pref: '東京都' }],
      },
      cfg,
      true,
    );
    expect(eewLive?.breaking).toBe(true);
    expect(eewLive?.icon).toBe('alert');
  });

  it('parses ODPT train info with onlyProblems, lineFilter, and breakingOnSuspension', () => {
    const sample = [
      {
        'odpt:railway': 'odpt.Railway:Toei.Asakusa',
        'odpt:trainInformationText': { ja: '現在、１５分以上の遅延はありません。' },
      },
      {
        'odpt:railway': 'odpt.Railway:JR-East.Yamanote',
        'odpt:trainInformationText': { ja: '人身事故の影響で運転見合わせとなっています。' },
      },
    ];

    const cfg = {
      ...DEFAULT_CONFIG.sources.transit,
      onlyProblems: true,
      breakingOnSuspension: true,
    };
    const { items, suspendedKeys } = parseOdptTrainInfo(sample, cfg, new Set());
    expect(items).toHaveLength(1);
    expect(items[0]?.badge).toBe('運行:JR山手線');
    expect(items[0]?.breaking).toBe(true);
    expect(items[0]?.icon).toBe('train-alert');
    expect(suspendedKeys.size).toBe(1);

    const filtered = parseOdptTrainInfo(sample, {
      ...DEFAULT_CONFIG.sources.transit,
      lineFilter: ['浅草線'],
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.badge).toBe('運行:都営浅草線');
    expect(filtered.items[0]?.icon).toBe('train');
  });

  it('formats market quotes and countdown events', () => {
    const up = formatMarketQuote(
      { id: 'usdjpy', symbol: 'USDJPY=X', label: 'USD/JPY', enabled: true },
      155.5,
      154.0,
      'JPY',
    );
    expect(up.icon).toBe('market-up');
    expect(up.text).toContain('▲+0.97%');

    const now = Date.now();
    const triggered = new Set<string>();
    const active = formatCountdownEvent(
      {
        id: 'c1',
        title: 'リリース',
        targetIso: new Date(now + 90 * 60_000).toISOString(),
        enabled: true,
        alertOnComplete: true,
      },
      now,
      triggered,
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.icon).toBe('timer');

    const completed = formatCountdownEvent(
      {
        id: 'c2',
        title: '定時',
        targetIso: new Date(now - 5_000).toISOString(),
        enabled: true,
        alertOnComplete: true,
      },
      now,
      triggered,
    );
    expect(completed.some((i) => i.breaking)).toBe(true);
  });

  it('enforces global muteKeywords, dedupeTitles, and handles /api/now-playing & /api/webhook/:preset', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-v2-api-'));
    tempDirs.push(dir);

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();
    const app = createApp(hub);

    await hub.updateConfig({
      filtering: {
        muteKeywords: ['PR', '/広告|宣伝/i'],
        dedupeTitles: true,
      },
      sources: {
        webhook: { enabled: true, secret: 'topsecret' },
      },
    });

    // Unauthorized webhook rejected
    const unauth = await app.request('/api/webhook/generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(unauth.status).toBe(401);

    // Muted webhook (non-breaking) filtered out from persistent items
    const muted = await app.request('/api/webhook/generic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cathobar-token': 'topsecret' },
      body: JSON.stringify({ badge: 'BOT', text: '本日の広告プロモーションです', oneShot: false }),
    });
    expect(muted.status).toBe(201);
    expect(hub.getState().items.some((i) => i.text.includes('広告'))).toBe(false);

    // Breaking alert bypasses muteKeywords
    const alertRes = await app.request('/api/webhook/alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer topsecret' },
      body: JSON.stringify({ badge: 'ALERT', text: 'PRサーバ異常検知', oneShot: false }),
    });
    expect(alertRes.status).toBe(201);
    expect(hub.getState().items.some((i) => i.text === 'PRサーバ異常検知')).toBe(true);

    // Now Playing endpoint updates ServerState.nowPlaying
    const npRes = await app.request('/api/now-playing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playing: true, title: 'Moonlight', artist: 'Test Band' }),
    });
    expect(npRes.status).toBe(201);
    expect(hub.getState().nowPlaying?.title).toBe('Moonlight');
    expect(hub.getState().items.some((i) => i.source === 'nowplaying')).toBe(true);
  });
});

describe('NHK Breaking News (JUST IN) & Transit checkbox filtering', () => {
  it('parses cat-live.xml items including empty channel, guid, link, and pubDate', () => {
    const emptyXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0"><channel><title>NHKONEニュース|JUST IN</title></channel></rss>`;
    expect(parseNhkBreakingXml(emptyXml)).toEqual([]);

    const itemXml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>東京で震度5弱の地震</title>
            <link>https://news.web.nhk/newsweb/na/nb-001</link>
            <guid isPermaLink="true">https://news.web.nhk/newsweb/na/nb-001</guid>
            <pubDate>Wed, 25 Nov 2026 17:30:00 +0900</pubDate>
          </item>
        </channel>
      </rss>`;
    const entries = parseNhkBreakingXml(itemXml);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('東京で震度5弱の地震');
    expect(entries[0]?.url).toBe('https://news.web.nhk/newsweb/na/nb-001');
    expect(entries[0]?.dedupeKey).toBe('https://news.web.nhk/newsweb/na/nb-001');
    expect(entries[0]?.pubDateMs).toBe(Date.parse('Wed, 25 Nov 2026 17:30:00 +0900'));
  });

  it('prevents duplicate breaking hooks across polls, title edits, CDN flicker, 304, and stale items', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-nhk-breaking-'));
    tempDirs.push(dir);

    let mode: 'seed' | 'fresh' | 'repeat' | 'edited' | 'empty' | 'reappear' | 'stale' | 'not-modified' = 'seed';
    const seenIfNoneMatch: Array<string | null> = [];

    const makeRss = (items: Array<{ title: string; guid: string; pubDate: string }>) =>
      `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>NHKONEニュース|JUST IN</title>${items
        .map(
          (it) =>
            `<item><title>${it.title}</title><link>${it.guid}</link><guid>${it.guid}</guid><pubDate>${it.pubDate}</pubDate></item>`,
        )
        .join('')}</channel></rss>`;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const hdrs = (init?.headers ?? {}) as Record<string, string>;
        seenIfNoneMatch.push(hdrs['If-None-Match'] ?? null);

        const nowRfc = new Date().toUTCString();
        const staleRfc = new Date(Date.now() - 2 * 60 * 60_000).toUTCString();

        if (mode === 'not-modified') {
          return new Response(null, { status: 304 });
        }
        if (mode === 'seed') {
          return new Response(
            makeRss([
              { title: '起動前の既存速報', guid: 'https://news.web.nhk/nb-seed', pubDate: nowRfc },
            ]),
            { status: 200, headers: { etag: '"etag-1"' } },
          );
        }
        if (mode === 'fresh' || mode === 'repeat') {
          return new Response(
            makeRss([
              { title: '起動前の既存速報', guid: 'https://news.web.nhk/nb-seed', pubDate: nowRfc },
              { title: '新しい速報ニュース', guid: 'https://news.web.nhk/nb-fresh', pubDate: nowRfc },
            ]),
            { status: 200, headers: { etag: '"etag-2"' } },
          );
        }
        if (mode === 'edited') {
          return new Response(
            makeRss([
              { title: '起動前の既存速報', guid: 'https://news.web.nhk/nb-seed', pubDate: nowRfc },
              {
                title: '新しい速報ニュース（続報・詳細）',
                guid: 'https://news.web.nhk/nb-fresh',
                pubDate: nowRfc,
              },
            ]),
            { status: 200, headers: { etag: '"etag-3"' } },
          );
        }
        if (mode === 'empty') {
          return new Response(makeRss([]), { status: 200, headers: { etag: '"etag-4"' } });
        }
        if (mode === 'reappear') {
          return new Response(
            makeRss([
              { title: '新しい速報ニュース', guid: 'https://news.web.nhk/nb-fresh', pubDate: nowRfc },
            ]),
            { status: 200, headers: { etag: '"etag-5"' } },
          );
        }
        return new Response(
          makeRss([
            { title: '古い速報ニュース', guid: 'https://news.web.nhk/nb-stale', pubDate: staleRfc },
          ]),
          { status: 200, headers: { etag: '"etag-6"' } },
        );
      }),
    );

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();

    // 1. Initial seed must NOT trigger breaking alert
    mode = 'seed';
    await hub.refreshSource('nhk-breaking');
    const seeded = hub.getState().items.filter((i) => i.source === 'nhk-breaking');
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.breaking).toBe(false);

    // 2. Fresh item triggers breaking: true
    mode = 'fresh';
    await hub.refreshSource('nhk-breaking');
    expect(seenIfNoneMatch[1]).toBe('"etag-1"');
    const afterFresh = hub.getState().items.filter((i) => i.source === 'nhk-breaking');
    const freshItem = afterFresh.find((i) => i.text === '新しい速報ニュース');
    expect(freshItem?.breaking).toBe(true);
    expect(freshItem?.icon).toBe('alert');

    // 3. Repeated poll does not duplicate or re-emit
    mode = 'repeat';
    await hub.refreshSource('nhk-breaking');
    expect(hub.getState().items.filter((i) => i.source === 'nhk-breaking')).toHaveLength(2);

    // 4. Title edit on same guid does NOT re-hook
    mode = 'edited';
    await hub.refreshSource('nhk-breaking');
    const afterEdited = hub.getState().items.filter((i) => i.source === 'nhk-breaking');
    expect(afterEdited.some((i) => i.text.includes('続報'))).toBe(false);

    // 5. 304 Not Modified preserves retained items
    mode = 'not-modified';
    await hub.refreshSource('nhk-breaking');
    expect(hub.getState().items.filter((i) => i.source === 'nhk-breaking')).toHaveLength(2);

    // 6. Empty feed prunes items from loop
    mode = 'empty';
    await hub.refreshSource('nhk-breaking');
    expect(hub.getState().items.filter((i) => i.source === 'nhk-breaking')).toHaveLength(0);

    // 7. Reappearing item (CDN flicker) does NOT re-hook
    mode = 'reappear';
    await hub.refreshSource('nhk-breaking');
    expect(hub.getState().items.filter((i) => i.source === 'nhk-breaking')).toHaveLength(0);

    // 8. Stale pubDate emits into loop with breaking: false
    mode = 'stale';
    await hub.refreshSource('nhk-breaking');
    const staleItems = hub.getState().items.filter((i) => i.source === 'nhk-breaking');
    expect(staleItems).toHaveLength(1);
    expect(staleItems[0]?.breaking).toBe(false);
  });

  it('discovers all ODPT lines, exposes /api/transit/lines, and prunes immediately on lineFilter update', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-transit-checkbox-'));
    tempDirs.push(dir);

    const odptPayload = [
      {
        'odpt:railway': 'odpt.Railway:Toei.Asakusa',
        'odpt:operator': 'odpt.Operator:Toei',
        'odpt:trainInformationText': { ja: '現在、１５分以上の遅延はありません。' },
      },
      {
        'odpt:railway': 'odpt.Railway:Toei.Oedo',
        'odpt:operator': 'odpt.Operator:Toei',
        'odpt:trainInformationText': { ja: '車両点検のため一部列車に遅れが出ています。' },
      },
      {
        'odpt:railway': 'odpt.Railway:JR-East.Yamanote',
        'odpt:operator': 'odpt.Operator:JR-East',
        'odpt:railwayTitle': { ja: '山手線' },
        'odpt:trainInformationText': { ja: '人身事故の影響で運転見合わせとなっています。' },
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(odptPayload), { status: 200 })),
    );

    const parsedAll = parseOdptTrainInfo(odptPayload, {
      ...DEFAULT_CONFIG.sources.transit,
      lineFilter: ['JR山手線'],
    });
    // Discovered lines contains all 3 lines before filtering; canonical RAILWAY_NAME_MAP matches 'JR山手線'
    expect(parsedAll.discoveredLines).toHaveLength(3);
    expect(parsedAll.items).toHaveLength(1);
    expect(parsedAll.items[0]?.badge).toBe('運行:山手線');

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();
    const app = createApp(hub);

    await hub.refreshSource('transit');
    expect(hub.getState().items.filter((i) => i.source === 'transit')).toHaveLength(3);

    const linesRes = await app.request('/api/transit/lines');
    expect(linesRes.status).toBe(200);
    const linesJson = (await linesRes.json()) as { lines: Array<{ name: string; normal: boolean }> };
    expect(linesJson.lines).toHaveLength(3);

    // Select only 都営大江戸線 via checkbox -> immediately prunes the other 2 lines without needing another fetch
    await hub.updateConfig({
      sources: {
        transit: {
          lineFilter: ['都営大江戸線'],
        },
      },
    });
    const filteredItems = hub.getState().items.filter((i) => i.source === 'transit');
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0]?.badge).toBe('運行:都営大江戸線');
    hub.stop();
  });
});

describe('Additional improvements & new sources & APIs', () => {
  it('serializes concurrent ConfigStore patches and supports full config replace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-cfg-queue-'));
    tempDirs.push(dir);
    const store = new ConfigStore(join(dir, 'config.json'));
    await store.load();

    await Promise.all([
      store.patch({ display: { brightness: 0.9 } }),
      store.patch({ display: { scrollSpeed: 96 } }),
      store.patch({ nightMode: { enabled: true, behavior: 'clock-only' } }),
    ]);

    const reloaded = await new ConfigStore(join(dir, 'config.json')).load();
    expect(reloaded.display.brightness).toBe(0.9);
    expect(reloaded.display.scrollSpeed).toBe(96);
    expect(reloaded.nightMode.enabled).toBe(true);
    expect(reloaded.nightMode.behavior).toBe('clock-only');

    const replaced = await store.replace({
      version: 1,
      activeChannel: 'market',
      display: { visualMode: 'split-flap' },
    });
    expect(replaced.activeChannel).toBe('market');
    expect(replaced.display.visualMode).toBe('split-flap');
  });

  it('uses ETag 304 for RSS and avoids refetching RSS on unrelated display config patches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-rss-etag-'));
    tempDirs.push(dir);

    let fetchCount = 0;
    const seenIfNoneMatch: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('news.web.nhk') && url.includes('cat0.xml')) {
          fetchCount += 1;
          const hdrs = (init?.headers ?? {}) as Record<string, string>;
          seenIfNoneMatch.push(hdrs['If-None-Match'] ?? null);
          if (fetchCount === 1) {
            return new Response(
              `<?xml version="1.0"?><rss version="2.0"><channel><item><title>RSS記事1</title><link>https://nhk.example/a</link></item></channel></rss>`,
              { status: 200, headers: { etag: '"rss-etag-1"' } },
            );
          }
          return new Response(null, { status: 304 });
        }
        return new Response(`<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`, {
          status: 200,
        });
      }),
    );

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();
    await hub.updateConfig({
      sources: {
        rss: {
          feeds: [
            {
              id: 'nhk-news',
              name: 'NHK',
              url: 'https://news.web.nhk/n-data/conf/na/rss/cat0.xml',
              enabled: true,
            },
          ],
        },
      },
    });
    // Wait a tick for onConfigUpdate's initial fetch to settle, or call refreshSource directly
    await new Promise((r) => setTimeout(r, 20));
    const countAfterFeedChange = fetchCount;
    expect(countAfterFeedChange).toBeGreaterThanOrEqual(1);

    // Unrelated display update should NOT trigger an RSS refetch
    await hub.updateConfig({ display: { brightness: 1.4 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchCount).toBe(countAfterFeedChange);

    // Manual refresh sends If-None-Match and preserves item on 304
    await hub.refreshSource('rss');
    expect(seenIfNoneMatch[seenIfNoneMatch.length - 1]).toBe('"rss-etag-1"');
    expect(hub.getState().items.some((i) => i.text === 'RSS記事1')).toBe(true);
    hub.stop();
  });

  it('parses Open-Meteo rain-approach alerts and JMA warnings', () => {
    const nowMs = Date.UTC(2026, 10, 25, 9, 0, 0);
    const { weatherItem, rainAlertItem } = parseOpenMeteoForecast(
      {
        current: { temperature_2m: 18.2, relative_humidity_2m: 62, weather_code: 2, precipitation: 0 },
        daily: {
          weather_code: [61, 1],
          temperature_2m_min: [12, 10],
          temperature_2m_max: [19, 21],
          precipitation_probability_max: [70, 10],
        },
        minutely_15: {
          time: [new Date(nowMs + 30 * 60_000).toISOString()],
          precipitation: [1.4],
        },
      },
      { id: 'tokyo', cityName: '東京', latitude: 35.67, longitude: 139.65, enabled: true },
      { rainAlertEnabled: true, rainAlertBreaking: true },
      nowMs,
    );
    expect(weatherItem?.text).toContain('降水70%');
    expect(rainAlertItem?.badge).toBe('雨雲:東京');
    expect(rainAlertItem?.text).toContain('約30分後');
    expect(rainAlertItem?.breaking).toBe(true);

    const jma = parseJmaWarnings(
      {
        areaTypes: [
          {
            areas: [
              {
                code: '1310100',
                warnings: [
                  { code: '03', status: '発表' },
                  { code: '33', status: '継続' },
                ],
              },
            ],
          },
        ],
      },
      { id: 'tokyo', cityName: '東京' },
      new Set(),
      nowMs,
    );
    expect(jma.item?.badge).toBe('気象警報:東京');
    expect(jma.item?.text).toContain('大雨警報');
    expect(jma.item?.text).toContain('大雨特別警報');
    expect(jma.item?.breaking).toBe(true);
  });

  it('parses iCal (.ics) folded lines, generates countdown & reminder items', () => {
    const nowMs = Date.UTC(2026, 10, 25, 8, 57, 0);
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:evt-1',
      'DTSTART:20261125T090000Z',
      'DTEND:20261125T100000Z',
      'SUMMARY:定例',
      ' ミーティング',
      'LOCATION:会議室A',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseIcsEvents(ics, nowMs, 24);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('定例ミーティング');

    const alerted = new Set<string>();
    const items = formatCalendarEventsToItems(
      events,
      { id: 'work', name: '仕事', url: 'https://example.com/cal.ics', enabled: true },
      nowMs,
      5,
      alerted,
    );
    expect(items.some((i) => i.source === 'calendar' && !i.oneShot)).toBe(true);
    expect(items.some((i) => i.breaking && i.badge === 'まもなく予定')).toBe(true);
  });

  it('computes CPU usage, formats sysmon & sensor readings, and parses new webhook presets', () => {
    const prev = [
      { model: 'cpu', speed: 1000, times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
    ];
    const next = [
      { model: 'cpu', speed: 1000, times: { user: 200, nice: 0, sys: 100, idle: 900, irq: 0 } },
    ];
    expect(computeCpuUsagePercent(prev, next)).toBeCloseTo(75);

    const sysItems = formatSysmonItems(
      { cpuPct: 75, memUsedGb: 4, memTotalGb: 8, memPct: 50, tempC: 85, load1: 1.2, uptimeSec: 3600 },
      { enabled: true, pollIntervalSec: 15, highTempThresholdC: 80, alertOnHighTemp: true },
      1000,
      true,
    );
    expect(sysItems.some((i) => i.source === 'sysmon' && i.breaking)).toBe(true);

    const sensorItem = formatSensorReading(
      { id: 'r1', name: '書斎', temperature: 24.2, humidity: 45, co2: 1400, sourceApp: 'API', updatedAt: 1000 },
      {
        enabled: true,
        pollIntervalSec: 120,
        co2AlertPpm: 1200,
        alertOnHighCo2: true,
        switchbotToken: '',
        switchbotSecret: '',
        switchbotDeviceIds: [],
        natureRemoToken: '',
      },
      true,
    );
    expect(sensorItem?.breaking).toBe(true);
    expect(sensorItem?.text).toContain('CO2 1400ppm');

    expect(
      parseWebhookPayload('uptime-kuma', { monitor: { name: 'Home' }, heartbeat: { status: 0, msg: 'Timeout' } })
        ?.breaking,
    ).toBe(true);
    expect(
      parseWebhookPayload('alertmanager', {
        status: 'firing',
        alerts: [{ labels: { alertname: 'HighMem', severity: 'critical' }, annotations: { summary: 'OOM' } }],
      })?.breaking,
    ).toBe(true);
    expect(parseWebhookPayload('discord', { content: 'ビルド完了' })?.badge).toBe('DISCORD');
    expect(parseWebhookPayload('slack', { text: 'Deploy OK', channel: '#ops' })?.badge).toBe('#ops');
    expect(
      parseWebhookPayload('gitlab', {
        object_kind: 'pipeline',
        project: { path_with_namespace: 'org/app' },
        object_attributes: { status: 'failed', ref: 'main' },
      })?.breaking,
    ).toBe(true);
    expect(parseWebhookPayload('cloudflare', { text: 'Origin down', breaking: true })?.badge).toBe('CF');
  });

  it('exposes /api/history, /api/config/export & import, /api/scenes/:id/apply, and /api/sensors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-new-apis-'));
    tempDirs.push(dir);

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();
    const app = createApp(hub);

    // Push message & sensor
    await app.request('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '履歴テスト電文', badge: 'HIST' }),
    });
    const histRes = await app.request('/api/history');
    expect(histRes.status).toBe(200);
    const histJson = (await histRes.json()) as { items: Array<{ text: string }> };
    expect(histJson.items.some((i) => i.text === '履歴テスト電文')).toBe(true);

    const senRes = await app.request('/api/sensors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'desk', name: 'デスク', temperature: 25.1, co2: 750 }),
    });
    expect(senRes.status).toBe(201);
    const senGet = await app.request('/api/sensors');
    const senList = (await senGet.json()) as { sensors: Array<{ id: string; co2?: number }> };
    expect(senList.sensors[0]?.co2).toBe(750);

    // Apply scene preset
    const sceneRes = await app.request('/api/scenes/train-news/apply', { method: 'POST' });
    expect(sceneRes.status).toBe(200);
    const sceneCfg = (await sceneRes.json()) as { display: { visualMode: string }; activeChannel: string };
    expect(sceneCfg.display.visualMode).toBe('shinkansen-led');
    expect(sceneCfg.activeChannel).toBe('rss');

    // Export & import config
    const expRes = await app.request('/api/config/export');
    expect(expRes.status).toBe(200);
    const exported = (await expRes.json()) as Record<string, unknown>;
    exported.activeChannel = 'system';
    const impRes = await app.request('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exported),
    });
    expect(impRes.status).toBe(200);
    expect(hub.getConfig().activeChannel).toBe('system');
  });

  it('filters rain-approach alerts per weather location and prunes immediately when toggled off', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cathobar-weather-perloc-'));
    tempDirs.push(dir);

    const soonIso = new Date(Date.now() + 25 * 60_000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('open-meteo.com')) {
          return new Response(
            JSON.stringify({
              current: { temperature_2m: 16.0, relative_humidity_2m: 70, weather_code: 2, precipitation: 0 },
              daily: {
                weather_code: [61, 1],
                temperature_2m_min: [11, 9],
                temperature_2m_max: [18, 20],
                precipitation_probability_max: [80, 20],
              },
              minutely_15: { time: [soonIso], precipitation: [1.5] },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ areaTypes: [] }), { status: 200 });
      }),
    );

    const store = new ConfigStore(join(dir, 'config.json'));
    const hub = new TickerHub(store);
    await hub.init();

    await hub.updateConfig({
      sources: {
        weather: {
          rainAlertEnabled: true,
          locations: [
            { id: 'tokyo', cityName: '東京', latitude: 35.67, longitude: 139.65, enabled: true, rainAlert: true, jmaWarning: false },
            { id: 'osaka', cityName: '大阪', latitude: 34.69, longitude: 135.5, enabled: true, rainAlert: false, jmaWarning: false },
          ],
        },
      },
    });
    await hub.refreshSource('weather');

    const items = hub.getState().items.filter((i) => i.source === 'weather');
    expect(items.some((i) => i.sourceKey === 'weather-rain:tokyo')).toBe(true);
    expect(items.some((i) => i.sourceKey === 'weather-rain:osaka')).toBe(false);
    expect(items.some((i) => i.sourceKey === 'weather:osaka')).toBe(true);

    // Turning off rainAlert for Tokyo immediately prunes Tokyo's rain alert while keeping Tokyo's weather
    await hub.updateConfig({
      sources: {
        weather: {
          locations: [
            { id: 'tokyo', cityName: '東京', latitude: 35.67, longitude: 139.65, enabled: true, rainAlert: false, jmaWarning: false },
            { id: 'osaka', cityName: '大阪', latitude: 34.69, longitude: 135.5, enabled: true, rainAlert: false, jmaWarning: false },
          ],
        },
      },
    });
    const afterPrune = hub.getState().items.filter((i) => i.source === 'weather');
    expect(afterPrune.some((i) => i.sourceKey === 'weather-rain:tokyo')).toBe(false);
    expect(afterPrune.some((i) => i.sourceKey === 'weather:tokyo')).toBe(true);
    hub.stop();
  });
});
