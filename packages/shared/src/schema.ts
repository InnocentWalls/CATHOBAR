import { z } from 'zod';

export const VisualModeSchema = z.enum([
  'anobar8-vfd',
  'anobar-fed',
  'shinkansen-led',
  'clean',
]);
export type VisualMode = z.infer<typeof VisualModeSchema>;

export const ShinkansenScrollStyleSchema = z.enum(['pause-head', 'scroll']);
export type ShinkansenScrollStyle = z.infer<typeof ShinkansenScrollStyleSchema>;

export const VfdPaletteSchema = z.enum(['cyan', 'green', 'white', 'amber']);
export type VfdPalette = z.infer<typeof VfdPaletteSchema>;

export const LayoutModeSchema = z.enum(['auto', 'lanes', 'danmaku']);
export type LayoutMode = z.infer<typeof LayoutModeSchema>;

export const ChannelIdSchema = z.enum([
  'all',
  'rss',
  'wikipedia',
  'weather',
  'mastodon',
  'clock',
]);
export type ChannelId = z.infer<typeof ChannelIdSchema>;

export const TickerSourceIdSchema = z.enum([
  'rss',
  'wikipedia',
  'weather',
  'mastodon',
  'clock',
  'push',
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
});
export type WeatherLocation = z.infer<typeof WeatherLocationSchema>;

export const MastodonStreamTypeSchema = z.enum(['public:local', 'public', 'hashtag']);
export type MastodonStreamType = z.infer<typeof MastodonStreamTypeSchema>;

export const DisplaySettingsSchema = z.object({
  visualMode: VisualModeSchema.default('anobar8-vfd'),
  vfdPalette: VfdPaletteSchema.default('cyan'),
  layoutMode: LayoutModeSchema.default('auto'),
  logicalHeight: z.number().int().min(48).max(240).default(96),
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
});
export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

export const RssSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(30).max(3600).default(300),
  feeds: z.array(RssFeedConfigSchema).default([]),
});

export const WikipediaSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  lang: z.string().min(2).max(10).default('ja'),
  pollIntervalSec: z.number().int().min(15).max(3600).default(45),
});

export const WeatherSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  pollIntervalSec: z.number().int().min(60).max(7200).default(900),
  locations: z.array(WeatherLocationSchema).default([]),
});

export const MastodonSourceConfigSchema = z.object({
  enabled: z.boolean().default(true),
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

export const SourcesConfigSchema = z.object({
  rss: RssSourceConfigSchema.default({}),
  wikipedia: WikipediaSourceConfigSchema.default({}),
  weather: WeatherSourceConfigSchema.default({}),
  mastodon: MastodonSourceConfigSchema.default({}),
});
export type SourcesConfig = z.infer<typeof SourcesConfigSchema>;

export const AppConfigSchema = z.object({
  version: z.literal(1).default(1),
  activeChannel: ChannelIdSchema.default('all'),
  display: DisplaySettingsSchema.default({}),
  sources: SourcesConfigSchema.default({}),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const PartialAppConfigSchema = z.object({
  activeChannel: ChannelIdSchema.optional(),
  display: DisplaySettingsSchema.partial().optional(),
  sources: z
    .object({
      rss: RssSourceConfigSchema.partial().optional(),
      wikipedia: WikipediaSourceConfigSchema.partial().optional(),
      weather: WeatherSourceConfigSchema.partial().optional(),
      mastodon: MastodonSourceConfigSchema.partial().optional(),
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
  replaceKey: z.string().optional(),
  url: z.string().optional(),
});
export type TickerItem = z.infer<typeof TickerItemSchema>;

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
});
export type ServerState = z.infer<typeof ServerStateSchema>;

export const PushMessageInputSchema = z.object({
  text: z.string().trim().min(1).max(400),
  badge: z.string().trim().min(1).max(24).default('PUSH'),
  color: z.string().trim().min(4).max(20).default('#ff66aa'),
  priority: z.enum(['normal', 'high']).default('high'),
  oneShot: z.boolean().default(true),
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
]);
export type WsMessage = z.infer<typeof WsMessageSchema>;
