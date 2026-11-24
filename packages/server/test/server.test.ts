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
import { parseRssXml } from '../src/sources/rss.js';
import { parseOdptTrainInfo } from '../src/sources/transit.js';

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
    expect(initial.activeChannel).toBe('all');
    expect(initial.sources.weather.locations).toHaveLength(1);

    await store.patch({
      activeChannel: 'mastodon',
      display: { visualMode: 'anobar-fed', layoutMode: 'danmaku', scrollSpeed: 120 },
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
