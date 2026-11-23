import type {
  AppConfig,
  ChannelId,
  LayoutMode,
  ShinkansenScrollStyle,
  VfdPalette,
  VisualMode,
} from './schema.js';

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  activeChannel: 'all',
  display: {
    visualMode: 'anobar8-vfd',
    vfdPalette: 'cyan',
    layoutMode: 'auto',
    logicalHeight: 96,
    ledRows: 24,
    shinkansenStyle: 'scroll',
    lanes: 2,
    scrollSpeed: 72,
    brightness: 1.15,
    dotIntensity: 0.65,
    bloom: 0.55,
    persistence: 0.35,
    showClockOverlay: true,
    showActivityGraph: true,
    showSourceBadge: true,
  },
  sources: {
    rss: {
      enabled: true,
      pollIntervalSec: 300,
      feeds: [
        {
          id: 'nhk-news',
          name: 'NHK',
          url: 'https://www3.nhk.or.jp/rss/news/cat0.xml',
          enabled: true,
          color: '#38bdf8',
        },
        {
          id: 'itmedia-news',
          name: 'ITmedia',
          url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
          enabled: true,
          color: '#fb923c',
        },
      ],
    },
    wikipedia: {
      enabled: true,
      lang: 'ja',
      pollIntervalSec: 45,
    },
    weather: {
      enabled: true,
      pollIntervalSec: 900,
      locations: [
        {
          id: 'tokyo',
          cityName: '東京',
          latitude: 35.6762,
          longitude: 139.6503,
          enabled: true,
        },
      ],
    },
    mastodon: {
      enabled: false,
      instanceUrl: 'https://mstdn.jp',
      stream: 'public:local',
      hashtag: '',
      accessToken: '',
      lang: 'ja',
      keywords: [],
      maxItemsPerMinute: 24,
      pollIntervalSec: 20,
    },
  },
};

export interface ResolutionPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  note: string;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { id: 'twihai-1920x480', label: '1920 × 480', width: 1920, height: 480, note: 'ツイ廃モニタ (8.8" / 4:1)' },
  { id: 'twihai-1280x400', label: '1280 × 400', width: 1280, height: 400, note: 'ツイ廃モニタ (7.9" / 3.2:1)' },
  { id: 'twihai-1920x515', label: '1920 × 515', width: 1920, height: 515, note: 'バータイプ液晶 (12.6" / 3.7:1)' },
  { id: 'twihai-1480x320', label: '1480 × 320', width: 1480, height: 320, note: '超横長バー液晶 (4.6:1)' },
  { id: 'anobar-640x96', label: '640 × 96', width: 640, height: 96, note: '初代 ANOBAR 実寸比率 (6.7:1)' },
  { id: 'anobar8-720x96', label: '720 × 96', width: 720, height: 96, note: 'ANOBAR8 筐体比 (7.5:1)' },
  { id: 'shinkansen-1280x160', label: '1280 × 160', width: 1280, height: 160, note: '新幹線 車内LED表示器比 (8:1)' },
];

export const VFD_PALETTES: Record<
  VfdPalette,
  { label: string; rgb: [number, number, number]; hex: string }
> = {
  cyan: { label: 'VFD Cyan (標準蛍光管)', rgb: [0.22, 0.98, 0.86], hex: '#38fad9' },
  green: { label: 'VFD Green (クラシック緑)', rgb: [0.25, 1.0, 0.45], hex: '#40ff73' },
  white: { label: 'ANOBAR8 White (白蛍光)', rgb: [0.92, 0.97, 1.0], hex: '#ebf7ff' },
  amber: { label: 'Amber (EL/琥珀)', rgb: [1.0, 0.72, 0.18], hex: '#ffb82e' },
};

export const VISUAL_MODE_LABELS: Record<VisualMode, { label: string; description: string }> = {
  'anobar8-vfd': {
    label: 'ANOBAR8 (VFD 16階調)',
    description: '蛍光表示管風のモノクロ16階調・自発光ブルーム・残像表現',
  },
  'anobar-fed': {
    label: '初代 ANOBAR (FED フルカラー)',
    description: '高輝度フルカラー自発光ドットマトリクス表現',
  },
  'shinkansen-led': {
    label: '東北新幹線 (3色LED)',
    description: '丸型LED素子＋緑・橙・赤の3色ドットマトリクス＆車内ニュース風演出',
  },
  clean: {
    label: 'クリーン (モダン表示)',
    description: 'ドット加工を抑えた高精細・高視認性モード',
  },
};

export const SHINKANSEN_STYLE_LABELS: Record<
  ShinkansenScrollStyle,
  { label: string; description: string }
> = {
  scroll: {
    label: '連続スクロール (右→左)',
    description: '1行の3色LED表示器として右から左へ途切れなく流し続ける（既定）',
  },
  'pause-head': {
    label: '頭出し停止 (オプション)',
    description: '下からスライドインし、先頭で一瞬静止してから左へ流す演出',
  },
};

export const LAYOUT_MODE_LABELS: Record<LayoutMode, { label: string; description: string }> = {
  auto: {
    label: '自動 (状況切替)',
    description: '高流量時やMastodon時は弾幕フリーフロー、通常時は整列レーン',
  },
  lanes: {
    label: '固定レーン',
    description: '指定した行数（1〜4行）に整列して流す',
  },
  danmaku: {
    label: '弾幕 (フリーフロー)',
    description: 'ニコニコ動画のように行に縛られず空き高さへ自由に流す',
  },
};

export const CHANNEL_LABELS: Record<ChannelId, { label: string; short: string }> = {
  all: { label: 'ALL MIX (全チャンネル)', short: 'ALL' },
  rss: { label: 'RSS / ニュース', short: 'RSS' },
  wikipedia: { label: 'Wikipedia ランダム', short: 'WIKI' },
  weather: { label: '天気予報', short: 'WTHR' },
  mastodon: { label: 'Mastodon タイムライン', short: 'MAST' },
  clock: { label: '時計 / ステータス', short: 'CLK' },
};

export interface MastodonInstancePreset {
  name: string;
  url: string;
  defaultStream: 'public:local' | 'public';
}

export const MASTODON_INSTANCE_PRESETS: MastodonInstancePreset[] = [
  { name: 'mstdn.jp', url: 'https://mstdn.jp', defaultStream: 'public:local' },
  { name: 'fedibird.com', url: 'https://fedibird.com', defaultStream: 'public:local' },
  { name: 'mastodon.social', url: 'https://mastodon.social', defaultStream: 'public:local' },
  { name: 'pawoo.net', url: 'https://pawoo.net', defaultStream: 'public:local' },
];

export interface CityPreset {
  name: string;
  latitude: number;
  longitude: number;
}

export const CITY_PRESETS: CityPreset[] = [
  { name: '東京', latitude: 35.6762, longitude: 139.6503 },
  { name: '大阪', latitude: 34.6937, longitude: 135.5023 },
  { name: '札幌', latitude: 43.0618, longitude: 141.3545 },
  { name: '名古屋', latitude: 35.1815, longitude: 136.9066 },
  { name: '福岡', latitude: 33.5902, longitude: 130.4017 },
  { name: '那覇', latitude: 26.2124, longitude: 127.6809 },
];
