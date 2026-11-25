import { z } from 'zod';

export const VisualModeSchema = z.enum([
  'anobar8-vfd',
  'anobar-fed',
  'shinkansen-led',
  'split-flap',
  'station-board',
  'clean',
]);
export type VisualMode = z.infer<typeof VisualModeSchema>;

export const ShinkansenScrollStyleSchema = z.enum(['pause-head', 'scroll']);
export type ShinkansenScrollStyle = z.infer<typeof ShinkansenScrollStyleSchema>;

export const VfdPaletteSchema = z.enum(['cyan', 'green', 'white', 'amber']);
export type VfdPalette = z.infer<typeof VfdPaletteSchema>;

export const LayoutModeSchema = z.enum(['auto', 'lanes', 'danmaku']);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const ScreenLayoutModeSchema = z.enum(['auto', 'bar', 'board', 'wall']);
export type ScreenLayoutMode = z.infer<typeof ScreenLayoutModeSchema>;

export const PixelIconIdSchema = z.enum([
  'sun',
  'partly-cloudy',
  'cloud',
  'rain',
  'snow',
  'thunder',
  'fog',
  'news',
  'wiki',
  'mastodon',
  'quake',
  'tsunami',
  'train',
  'train-alert',
  'music',
  'market-up',
  'market-down',
  'market-flat',
  'timer',
  'webhook',
  'alert',
  'info',
  'cpu',
  'calendar',
  'sensor',
]);
export type PixelIconId = z.infer<typeof PixelIconIdSchema>;

export const ChannelIdSchema = z.enum([
  'all',
  'rss',
  'wikipedia',
  'weather',
  'mastodon',
  'disaster',
  'market',
  'nowplaying',
  'countdown',
  'system',
  'clock',
]);
export type ChannelId = z.infer<typeof ChannelIdSchema>;

export const TickerSourceIdSchema = z.enum([
  'rss',
  'nhk-breaking',
  'wikipedia',
  'weather',
  'mastodon',
  'earthquake',
  'transit',
  'market',
  'nowplaying',
  'countdown',
  'sysmon',
  'calendar',
  'sensors',
  'clock',
  'push',
  'webhook',
]);
export type TickerSourceId = z.infer<typeof TickerSourceIdSchema>;

export const RssFeedConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  enabled: z.boolean().default(true),
  color: z.string().optional(),
});
export type RssFeedConfig = z.infer<typeof RssFeedConfigSchema>;

export const WeatherLocationSchema = z.object({
  id: z.string().min(1),
  cityName: z.string().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  enabled: z.boolean().default(true),
  jmaAreaCode: z.string().max(12).optional(),
  rainAlert: z.boolean().default(true),
  jmaWarning: z.boolean().default(true),
});
export type WeatherLocation = z.infer<typeof WeatherLocationSchema>;

export const MastodonStreamTypeSchema = z.enum(['public:local', 'public', 'hashtag']);
export type MastodonStreamType = z.infer<typeof MastodonStreamTypeSchema>;

export const SpectrumAudioInputSchema = z.enum(['auto', 'mic', 'synth']);
export type SpectrumAudioInput = z.infer<typeof SpectrumAudioInputSchema>;

export const DisplaySettingsSchema = z.object({
  visualMode: VisualModeSchema.default('anobar8-vfd'),
  vfdPalette: VfdPaletteSchema.default('cyan'),
  layoutMode: LayoutModeSchema.default('auto'),
  screenLayout: ScreenLayoutModeSchema.default('auto'),
  logicalHeight: z.number().int().min(48).max(240).default(96),
  boardLogicalWidth: z.number().int().min(320).max(1280).default(640),
  wallLanes: z.number().int().min(2).max(10).default(6),
  ledRows: z.number().int().min(16).max(48).default(24),
  shinkansenStyle: ShinkansenScrollStyleSchema.default('scroll'),
  lanes: z.number().int().min(1).max(4).default(2),
  scrollSpeed: z.number().min(20).max(400).default(72),
  brightness: z.number().min(0.2).max(2.0).default(1.15),
  dotIntensity: z.number().min(0).max(1).default(0.65),
  bloom: z.number().min(0).max(1.5).default(0.55),
  persistence: z.number().min(0).max(0.92).default(0.35),
  showClockOverlay: z.boolean().default(true),
  showActivityGraph: z.boolean().default(true),
  showSourceBadge: z.boolean().default(true),
  showPixelIcons: z.boolean().default(true),
  vfdGridIntensity: z.number().min(0).max(1).default(0.45),
  vfdGlassReflection: z.number().min(0).max(1).default(0.3),
  burnInShift: z.boolean().default(true),
  breakingAlertEnabled: z.boolean().default(true),
  breakingAlertDurationSec: z.number().min(4).max(30).default(10),
  breakingAlertSound: z.boolean().default(false),
  breakingAlertVolume: z.number().min(0.05).max(1).default(0.5),
  showSpectrumAnalyzer: z.boolean().default(true),
  spectrumAudioInput: SpectrumAudioInputSchema.default('auto'),
});
export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

export const NightModeBehaviorSchema = z.enum(['dim', 'clock-only', 'blackout']);
export type NightModeBehavior = z.infer<typeof NightModeBehaviorSchema>;

export const NightModeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).default('23:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  behavior: NightModeBehaviorSchema.default('dim'),
  brightness: z.number().min(0.1).max(1.0).default(0.35),
  forceAmberVfd: z.boolean().default(true),
});
export type NightModeConfig = z.infer<typeof NightModeConfigSchema>;

export const ScenePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  activeChannel: ChannelIdSchema.optional(),
  rotationEnabled: z.boolean().optional(),
  visualMode: VisualModeSchema.optional(),
  vfdPalette: VfdPaletteSchema.optional(),
  layoutMode: LayoutModeSchema.optional(),
  screenLayout: ScreenLayoutModeSchema.optional(),
  brightness: z.number().min(0.2).max(2.0).optional(),
  showSpectrumAnalyzer: z.boolean().optional(),
  showClockOverlay: z.boolean().optional(),
  showActivityGraph: z.boolean().optional(),
  scheduleStart: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]).default(''),
});
export type ScenePreset = z.infer<typeof ScenePresetSchema>;

export const ChannelRotationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalSec: z.number().int().min(10).max(600).default(45),
  channels: z
    .array(ChannelIdSchema)
    .min(1)
    .default(['rss', 'weather', 'disaster', 'market', 'nowplaying', 'wikipedia', 'clock']),
});
export type ChannelRotationConfig = z.infer<typeof ChannelRotationConfigSchema>;

export const SourceWeightsSchema = z.object({
  rss: z.number().int().min(0).max(10).default(3),
  weather: z.number().int().min(0).max(10).default(2),
  mastodon: z.number().int().min(0).max(10).default(2),
  wikipedia: z.number().int().min(0).max(10).default(1),
  earthquake: z.number().int().min(0).max(10).default(2),
  transit: z.number().int().min(0).max(10).default(2),
  market: z.number().int().min(0).max(10).default(2),
  nowplaying: z.number().int().min(0).max(10).default(2),
  countdown: z.number().int().min(0).max(10).default(1),
  sysmon: z.number().int().min(0).max(10).default(1),
  calendar: z.number().int().min(0).max(10).default(2),
  sensors: z.number().int().min(0).max(10).default(2),
  webhook: z.number().int().min(0).max(10).default(2),
});
export type SourceWeights = z.infer<typeof SourceWeightsSchema>;

export const FilterConfigSchema = z.object({
  muteKeywords: z.array(z.string().min(1).max(80)).default([]),
  dedupeTitles: z.boolean().default(true),
  weights: SourceWeightsSchema.default({}),
});
export type FilterConfig = z.infer<typeof FilterConfigSchema>;

export const RssSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(3600).default(300),
  feeds: z.array(RssFeedConfigSchema).default([]),
});

export const NhkBreakingSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(600).default(60),
  url: z.string().url().default('https://news.web.nhk/n-data/conf/na/rss/cat-live.xml'),
  maxItemAgeMinutes: z.number().int().min(5).max(180).default(30),
});
export type NhkBreakingSourceConfig = z.infer<typeof NhkBreakingSourceConfigSchema>;

export const TransitDiscoveredLineSchema = z.object({
  id: z.string(),
  railwayKey: z.string(),
  name: z.string(),
  operator: z.string(),
  normal: z.boolean(),
  severe: z.boolean(),
  statusText: z.string(),
});
export type TransitDiscoveredLine = z.infer<typeof TransitDiscoveredLineSchema>;

export const WikipediaSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lang: z.string().min(2).max(10).default('ja'),
  pollIntervalSec: z.number().int().min(15).max(3600).default(45),
});

export const WeatherSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(60).max(7200).default(900),
  locations: z.array(WeatherLocationSchema).default([]),
  rainAlertEnabled: z.boolean().default(true),
  rainAlertBreaking: z.boolean().default(false),
  jmaWarningEnabled: z.boolean().default(true),
});

export const MastodonSourceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  instanceUrl: z.string().url().default('https://mstdn.jp'),
  stream: MastodonStreamTypeSchema.default('public:local'),
  hashtag: z.string().max(60).default(''),
  accessToken: z.string().max(256).default(''),
  lang: z.string().max(10).default('ja'),
  keywords: z.array(z.string().min(1).max(40)).default([]),
  maxItemsPerMinute: z.number().int().min(1).max(120).default(24),
  pollIntervalSec: z.number().int().min(10).max(300).default(20),
});
export type MastodonSourceConfig = z.infer<typeof MastodonSourceConfigSchema>;

export const EarthquakeSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minScale: z.number().int().min(10).max(70).default(20),
  breakingMinScale: z.number().int().min(10).max(70).default(45),
  includeTsunami: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(600).default(120),
});
export type EarthquakeSourceConfig = z.infer<typeof EarthquakeSourceConfigSchema>;

export const TransitSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(60).max(900).default(180),
  usePublicOdpt: z.boolean().default(true),
  odptToken: z.string().max(256).default(''),
  customFeeds: z.array(RssFeedConfigSchema).default([]),
  lineFilter: z.array(z.string().min(1).max(40)).default([]),
  onlyProblems: z.boolean().default(false),
  breakingOnSuspension: z.boolean().default(false),
});
export type TransitSourceConfig = z.infer<typeof TransitSourceConfigSchema>;

export const MarketSymbolConfigSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1).max(32),
  label: z.string().min(1).max(40),
  enabled: z.boolean().default(true),
});
export type MarketSymbolConfig = z.infer<typeof MarketSymbolConfigSchema>;

export const MarketSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(3600).default(180),
  symbols: z.array(MarketSymbolConfigSchema).default([]),
});
export type MarketSourceConfig = z.infer<typeof MarketSourceConfigSchema>;

export const NowPlayingSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(3).max(60).default(8),
  enableSystemMedia: z.boolean().default(true),
  lastfmUsername: z.string().max(80).default(''),
  lastfmApiKey: z.string().max(128).default(''),
});
export type NowPlayingSourceConfig = z.infer<typeof NowPlayingSourceConfigSchema>;

export const CountdownEventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(60),
  targetIso: z.string().min(1),
  enabled: z.boolean().default(true),
  alertOnComplete: z.boolean().default(true),
});
export type CountdownEvent = z.infer<typeof CountdownEventSchema>;

export const CountdownSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  events: z.array(CountdownEventSchema).default([]),
});
export type CountdownSourceConfig = z.infer<typeof CountdownSourceConfigSchema>;

export const SysmonSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(5).max(300).default(15),
  highTempThresholdC: z.number().min(50).max(110).default(80),
  alertOnHighTemp: z.boolean().default(true),
});
export type SysmonSourceConfig = z.infer<typeof SysmonSourceConfigSchema>;

export const CalendarFeedConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  enabled: z.boolean().default(true),
  color: z.string().optional(),
});
export type CalendarFeedConfig = z.infer<typeof CalendarFeedConfigSchema>;

export const CalendarSourceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  pollIntervalSec: z.number().int().min(60).max(3600).default(300),
  feeds: z.array(CalendarFeedConfigSchema).default([]),
  windowHours: z.number().int().min(1).max(168).default(24),
  alertBeforeMinutes: z.number().int().min(0).max(60).default(5),
});
export type CalendarSourceConfig = z.infer<typeof CalendarSourceConfigSchema>;

export const SensorsSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(3600).default(120),
  co2AlertPpm: z.number().int().min(600).max(5000).default(1200),
  alertOnHighCo2: z.boolean().default(false),
  switchbotToken: z.string().max(256).default(''),
  switchbotSecret: z.string().max(256).default(''),
  switchbotDeviceIds: z.array(z.string().min(1).max(64)).default([]),
  natureRemoToken: z.string().max(256).default(''),
});
export type SensorsSourceConfig = z.infer<typeof SensorsSourceConfigSchema>;

export const WebhookSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  secret: z.string().max(128).default(''),
});
export type WebhookSourceConfig = z.infer<typeof WebhookSourceConfigSchema>;

export const SourcesConfigSchema = z.object({
  rss: RssSourceConfigSchema.default({}),
  nhkBreaking: NhkBreakingSourceConfigSchema.default({}),
  wikipedia: WikipediaSourceConfigSchema.default({}),
  weather: WeatherSourceConfigSchema.default({}),
  mastodon: MastodonSourceConfigSchema.default({}),
  earthquake: EarthquakeSourceConfigSchema.default({}),
  transit: TransitSourceConfigSchema.default({}),
  market: MarketSourceConfigSchema.default({}),
  nowplaying: NowPlayingSourceConfigSchema.default({}),
  countdown: CountdownSourceConfigSchema.default({}),
  sysmon: SysmonSourceConfigSchema.default({}),
  calendar: CalendarSourceConfigSchema.default({}),
  sensors: SensorsSourceConfigSchema.default({}),
  webhook: WebhookSourceConfigSchema.default({}),
});
export type SourcesConfig = z.infer<typeof SourcesConfigSchema>;

export const AppConfigSchema = z.object({
  version: z.literal(1).default(1),
  activeChannel: ChannelIdSchema.default('all'),
  display: DisplaySettingsSchema.default({}),
  nightMode: NightModeConfigSchema.default({}),
  scenes: z.array(ScenePresetSchema).default([]),
  rotation: ChannelRotationConfigSchema.default({}),
  filtering: FilterConfigSchema.default({}),
  sources: SourcesConfigSchema.default({}),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const PartialAppConfigSchema = z.object({
  activeChannel: ChannelIdSchema.optional(),
  display: DisplaySettingsSchema.partial().optional(),
  nightMode: NightModeConfigSchema.partial().optional(),
  scenes: z.array(ScenePresetSchema).optional(),
  rotation: ChannelRotationConfigSchema.partial().optional(),
  filtering: z
    .object({
      muteKeywords: z.array(z.string().min(1).max(80)).optional(),
      dedupeTitles: z.boolean().optional(),
      weights: SourceWeightsSchema.partial().optional(),
    })
    .optional(),
  sources: z
    .object({
      rss: RssSourceConfigSchema.partial().optional(),
      nhkBreaking: NhkBreakingSourceConfigSchema.partial().optional(),
      wikipedia: WikipediaSourceConfigSchema.partial().optional(),
      weather: WeatherSourceConfigSchema.partial().optional(),
      mastodon: MastodonSourceConfigSchema.partial().optional(),
      earthquake: EarthquakeSourceConfigSchema.partial().optional(),
      transit: TransitSourceConfigSchema.partial().optional(),
      market: MarketSourceConfigSchema.partial().optional(),
      nowplaying: NowPlayingSourceConfigSchema.partial().optional(),
      countdown: CountdownSourceConfigSchema.partial().optional(),
      sysmon: SysmonSourceConfigSchema.partial().optional(),
      calendar: CalendarSourceConfigSchema.partial().optional(),
      sensors: SensorsSourceConfigSchema.partial().optional(),
      webhook: WebhookSourceConfigSchema.partial().optional(),
    })
    .optional(),
});
export type PartialAppConfig = z.infer<typeof PartialAppConfigSchema>;

export const TickerItemSchema = z.object({
  id: z.string(),
  source: TickerSourceIdSchema,
  badge: z.string(),
  text: z.string(),
  color: z.string(),
  timestamp: z.number(),
  priority: z.enum(['normal', 'high']).default('normal'),
  oneShot: z.boolean().default(false),
  breaking: z.boolean().default(false),
  icon: PixelIconIdSchema.optional(),
  replaceKey: z.string().optional(),
  sourceKey: z.string().optional(),
  url: z.string().optional(),
});
export type TickerItem = z.infer<typeof TickerItemSchema>;

export const NowPlayingStateSchema = z.object({
  playing: z.boolean(),
  title: z.string(),
  artist: z.string().default(''),
  album: z.string().default(''),
  sourceApp: z.string().default(''),
  updatedAt: z.number(),
  levels: z.array(z.number().min(0).max(1)).max(32).optional(),
});
export type NowPlayingState = z.infer<typeof NowPlayingStateSchema>;

export const NowPlayingPushInputSchema = z.object({
  playing: z.boolean().default(true),
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().max(120).default(''),
  album: z.string().trim().max(120).default(''),
  sourceApp: z.string().trim().max(40).default('API'),
  levels: z.array(z.number().min(0).max(1)).max(32).optional(),
});
export type NowPlayingPushInput = z.infer<typeof NowPlayingPushInputSchema>;

export const SensorReadingSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  temperature: z.number().optional(),
  humidity: z.number().optional(),
  co2: z.number().optional(),
  illuminance: z.number().optional(),
  powerW: z.number().optional(),
  battery: z.number().optional(),
  customText: z.string().max(120).optional(),
  sourceApp: z.string().default('API'),
  updatedAt: z.number(),
});
export type SensorReading = z.infer<typeof SensorReadingSchema>;

export const SensorPushInputSchema = z.object({
  id: z.string().trim().min(1).max(64).default('room'),
  name: z.string().trim().min(1).max(40).default('室内'),
  temperature: z.number().min(-50).max(100).optional(),
  humidity: z.number().min(0).max(100).optional(),
  co2: z.number().min(0).max(20000).optional(),
  illuminance: z.number().min(0).max(200000).optional(),
  powerW: z.number().min(0).max(100000).optional(),
  battery: z.number().min(0).max(100).optional(),
  customText: z.string().trim().max(120).optional(),
  sourceApp: z.string().trim().max(40).default('API'),
});
export type SensorPushInput = z.infer<typeof SensorPushInputSchema>;

export const ActivityBucketSchema = z.object({
  timestamp: z.number(),
  count: z.number().int().nonnegative(),
});
export type ActivityBucket = z.infer<typeof ActivityBucketSchema>;

export const SourceStatusSchema = z.object({
  id: TickerSourceIdSchema,
  connected: z.boolean(),
  active: z.boolean(),
  lastFetchAt: z.number().nullable(),
  lastError: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
});
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const ServerStateSchema = z.object({
  config: AppConfigSchema,
  items: z.array(TickerItemSchema),
  activity: z.array(ActivityBucketSchema),
  statuses: z.array(SourceStatusSchema),
  lanUrls: z.array(z.string()),
  nowPlaying: NowPlayingStateSchema.nullable().default(null),
  sensors: z.array(SensorReadingSchema).default([]),
});
export type ServerState = z.infer<typeof ServerStateSchema>;

export const PushMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(400),
  badge: z.string().trim().min(1).max(24).default('PUSH'),
  color: z.string().trim().min(4).max(20).default('#ff66aa'),
  priority: z.enum(['normal', 'high']).default('high'),
  oneShot: z.boolean().default(true),
  breaking: z.boolean().default(false),
  icon: PixelIconIdSchema.optional(),
});
export type PushMessageInput = z.infer<typeof PushMessageInputSchema>;

export const WsMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('init'), payload: ServerStateSchema }),
  z.object({ type: z.literal('config:update'), payload: AppConfigSchema }),
  z.object({ type: z.literal('item:new'), payload: TickerItemSchema }),
  z.object({ type: z.literal('items:batch'), payload: z.array(TickerItemSchema) }),
  z.object({ type: z.literal('items:sync'), payload: z.array(TickerItemSchema) }),
  z.object({ type: z.literal('activity:update'), payload: z.array(ActivityBucketSchema) }),
  z.object({ type: z.literal('status:update'), payload: z.array(SourceStatusSchema) }),
  z.object({ type: z.literal('nowplaying:update'), payload: NowPlayingStateSchema.nullable() }),
  z.object({ type: z.literal('sensors:update'), payload: z.array(SensorReadingSchema) }),
]);
export type WsMessage = z.infer<typeof WsMessageSchema>;
