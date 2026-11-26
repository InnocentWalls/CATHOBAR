import type {
  AppConfig,
  BootGlyphStyle,
  BootMessageMode,
  BootSequenceMode,
  ChannelId,
  LayoutMode,
  MarketSymbolConfig,
  ScenePreset,
  ScreenLayoutMode,
  ShinkansenScrollStyle,
  SourceWeights,
  VfdPalette,
  VisualMode,
} from './schema.js';

export const DEFAULT_MARKET_SYMBOLS: MarketSymbolConfig[] = [
  { id: 'usdjpy', symbol: 'USDJPY=X', label: 'USD/JPY', enabled: true },
  { id: 'nikkei225', symbol: '^N225', label: '日経平均', enabled: true },
  { id: 'sp500', symbol: '^GSPC', label: 'S&P 500', enabled: true },
  { id: 'btcjpy', symbol: 'BTC-JPY', label: 'BTC/JPY', enabled: true },
];

export const DEFAULT_SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'work',
    name: '仕事モード',
    activeChannel: 'all',
    rotationEnabled: false,
    visualMode: 'anobar8-vfd',
    vfdPalette: 'cyan',
    layoutMode: 'lanes',
    brightness: 1.15,
    showSpectrumAnalyzer: false,
    showClockOverlay: true,
    showActivityGraph: true,
    scheduleStart: '',
  },
  {
    id: 'music',
    name: '音楽鑑賞',
    activeChannel: 'nowplaying',
    rotationEnabled: false,
    visualMode: 'anobar-fed',
    layoutMode: 'lanes',
    brightness: 1.25,
    showSpectrumAnalyzer: true,
    showClockOverlay: true,
    showActivityGraph: false,
    scheduleStart: '',
  },
  {
    id: 'train-news',
    name: '車内ニュース',
    activeChannel: 'rss',
    rotationEnabled: false,
    visualMode: 'shinkansen-led',
    layoutMode: 'lanes',
    brightness: 1.15,
    showSpectrumAnalyzer: false,
    showClockOverlay: true,
    showActivityGraph: true,
    scheduleStart: '',
  },
  {
    id: 'night-watch',
    name: '夜間防災監視',
    activeChannel: 'disaster',
    rotationEnabled: false,
    visualMode: 'anobar8-vfd',
    vfdPalette: 'amber',
    layoutMode: 'lanes',
    brightness: 0.45,
    showSpectrumAnalyzer: false,
    showClockOverlay: true,
    showActivityGraph: false,
    scheduleStart: '',
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  activeChannel: 'all',
  display: {
    visualMode: 'anobar8-vfd',
    vfdPalette: 'cyan',
    layoutMode: 'auto',
    screenLayout: 'auto',
    logicalHeight: 96,
    boardLogicalWidth: 640,
    wallLanes: 6,
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
    showPixelIcons: true,
    vfdGridIntensity: 0.45,
    vfdGlassReflection: 0.3,
    burnInShift: true,
    breakingAlertEnabled: true,
    breakingAlertDurationSec: 10,
    breakingAlertSound: false,
    breakingAlertVolume: 0.5,
    showSpectrumAnalyzer: true,
    spectrumAudioInput: 'auto',
    bootSequenceMode: 'auto',
    bootGlyphStyle: 'circuit',
    bootDecodeScan: true,
    bootMessageMode: 'dynamic',
    bootCustomMessage: '',
    bootDurationSec: 9,
  },
  nightMode: {
    enabled: false,
    startTime: '23:00',
    endTime: '07:00',
    behavior: 'dim',
    brightness: 0.35,
    forceAmberVfd: true,
  },
  scenes: DEFAULT_SCENE_PRESETS,
  rotation: {
    enabled: false,
    intervalSec: 45,
    channels: ['rss', 'weather', 'disaster', 'market', 'nowplaying', 'wikipedia', 'clock'],
  },
  filtering: {
    muteKeywords: [],
    dedupeTitles: true,
    weights: {
      rss: 3,
      weather: 2,
      mastodon: 2,
      wikipedia: 1,
      earthquake: 2,
      transit: 2,
      market: 2,
      nowplaying: 2,
      countdown: 1,
      sysmon: 1,
      calendar: 2,
      sensors: 2,
      webhook: 2,
    },
  },
  sources: {
    rss: {
      enabled: true,
      pollIntervalSec: 300,
      feeds: [
        {
          id: 'nhk-news',
          name: 'NHK',
          url: 'https://news.web.nhk/n-data/conf/na/rss/cat0.xml',
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
    nhkBreaking: {
      enabled: true,
      pollIntervalSec: 60,
      url: 'https://news.web.nhk/n-data/conf/na/rss/cat-live.xml',
      maxItemAgeMinutes: 30,
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
          jmaAreaCode: '130000',
          rainAlert: true,
          jmaWarning: true,
        },
      ],
      rainAlertEnabled: true,
      rainAlertBreaking: false,
      jmaWarningEnabled: true,
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
    earthquake: {
      enabled: true,
      minScale: 20,
      breakingMinScale: 45,
      includeTsunami: true,
      pollIntervalSec: 120,
    },
    transit: {
      enabled: true,
      pollIntervalSec: 180,
      usePublicOdpt: true,
      odptToken: '',
      customFeeds: [],
      lineFilter: [],
      onlyProblems: false,
      breakingOnSuspension: false,
    },
    market: {
      enabled: true,
      pollIntervalSec: 180,
      symbols: DEFAULT_MARKET_SYMBOLS,
    },
    nowplaying: {
      enabled: true,
      pollIntervalSec: 8,
      enableSystemMedia: true,
      lastfmUsername: '',
      lastfmApiKey: '',
    },
    countdown: {
      enabled: true,
      events: [],
    },
    sysmon: {
      enabled: true,
      pollIntervalSec: 15,
      highTempThresholdC: 80,
      alertOnHighTemp: true,
    },
    calendar: {
      enabled: false,
      pollIntervalSec: 300,
      feeds: [],
      windowHours: 24,
      alertBeforeMinutes: 5,
    },
    sensors: {
      enabled: true,
      pollIntervalSec: 120,
      co2AlertPpm: 1200,
      alertOnHighCo2: false,
      switchbotToken: '',
      switchbotSecret: '',
      switchbotDeviceIds: [],
      natureRemoToken: '',
    },
    webhook: {
      enabled: true,
      secret: '',
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
  { id: 'std-1920x1080', label: '1920 × 1080', width: 1920, height: 1080, note: 'フルHD 一般モニタ (16:9)' },
  { id: 'std-2560x1440', label: '2560 × 1440', width: 2560, height: 1440, note: 'WQHD モニタ (16:9)' },
  { id: 'std-3840x2160', label: '3840 × 2160', width: 3840, height: 2160, note: '4K UHD モニタ / TV (16:9)' },
  { id: 'std-1280x720', label: '1280 × 720', width: 1280, height: 720, note: 'HD モニタ (16:9)' },
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
    description: '蛍光表示管風のモノクロ16階調・メッシュグリッド・ブルーム・残像表現',
  },
  'anobar-fed': {
    label: '初代 ANOBAR (FED フルカラー)',
    description: '高輝度フルカラー自発光ドットマトリクス表現',
  },
  'shinkansen-led': {
    label: '東北新幹線 (3色LED)',
    description: '丸型LED素子＋緑・橙・赤の3色ドットマトリクス＆車内ニュース風演出',
  },
  'split-flap': {
    label: 'パタパタ (反転フラップ)',
    description: '空港・旧駅の発車標風メカニカル反転フラップ表示',
  },
  'station-board': {
    label: '在来線 発車標 (2カラムLED)',
    description: '左側に種別・ソースバッジを固定し、右側に本文を流す駅発車標スタイル',
  },
  clean: {
    label: 'クリーン (モダン表示)',
    description: 'ドット加工を抑えた高精細・高視認性モード',
  },
};

export const BOOT_SEQUENCE_MODE_LABELS: Record<
  BootSequenceMode,
  { label: string; short: string; description: string }
> = {
  auto: {
    label: '自動 (表示モード連動)',
    short: 'AUTO',
    description: 'VFD/FED/Cleanは暗号グリフ、新幹線/発車標はLEDテスト、パタパタは一斉回転を自動選択',
  },
  'glyph-circuit': {
    label: '回路パターン・16セグ (左→右)',
    short: 'CIRCUIT',
    description: 'プリント基板配線＋端点パッド風の独自幾何学グリフでブート暗号を流す',
  },
  'glyph-oscilloscope': {
    label: '陰極線オシロスコープ (左→右)',
    short: 'SCOPE',
    description: '電子ビームの一筆書き波形・輝点ベクター文字でブート暗号を流す',
  },
  'glyph-hex': {
    label: 'ハニカム六角格子 (左→右)',
    short: 'HEX',
    description: '二段六角形メッシュの辺で構成されたオリジナル幾何学文字で流す',
  },
  'led-test': {
    label: '3色LEDテスト＆試運転',
    short: 'LED-CHK',
    description: '緑→橙→赤の全素子スキャン＆ドット検査後に [試運転] 診断表示を行う',
  },
  'flap-cascade': {
    label: 'パタパタ一斉回転',
    short: 'FLAP',
    description: '全メカニカルフラップが一斉に回転して起動メッセージへ揃う儀式',
  },
  off: {
    label: 'OFF (通常ティッカーのみ)',
    short: 'OFF',
    description: '専用ブート演出をスキップし、従来の軽量な接続通知のみ流す',
  },
};

export const BOOT_GLYPH_STYLE_LABELS: Record<
  BootGlyphStyle,
  { label: string; description: string }
> = {
  circuit: {
    label: '回路 / 16セグメント',
    description: 'PCB配線とハンダパッド風のシャープな幾何学文字',
  },
  oscilloscope: {
    label: '陰極線オシロ',
    description: '電子ビームの微振動と輝点を持つベクター文字',
  },
  hex: {
    label: 'ハニカム格子',
    description: '六角形グリッドの辺だけで構成した幾何学文字',
  },
};

export const BOOT_MESSAGE_MODE_LABELS: Record<
  BootMessageMode,
  { label: string; description: string }
> = {
  dynamic: {
    label: '動的 POST ログ',
    description: 'LAN IP・稼働ソース数・現在時刻を含むシステム起動情報を自動生成',
  },
  custom: {
    label: 'カスタムメッセージ',
    description: '下の入力欄で指定した任意の文字列（英数字は幾何学グリフ化）を流す',
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

export const SCREEN_LAYOUT_LABELS: Record<ScreenLayoutMode, { label: string; description: string }> = {
  auto: {
    label: '自動 (画面比率で切替)',
    description: '16:9等の一般モニタは総合ボード、横長バー液晶は従来バー表示',
  },
  board: {
    label: '総合情報ボード (16:9)',
    description: '上部ステータス(時計/天気/再生中/スペアナ)＋中央情報盤＋下部ティッカー',
  },
  wall: {
    label: '多段ティッカー壁 (16:9)',
    description: '上部ミニバー＋画面いっぱいの多段レーン／大型発車標・パタパタ・弾幕',
  },
  bar: {
    label: '横長バー (ANOBAR標準)',
    description: 'ツイ廃モニタ・超横長ディスプレイ向けの従来レイアウト',
  },
};

export const CHANNEL_LABELS: Record<ChannelId, { label: string; short: string }> = {
  all: { label: 'ALL MIX (全チャンネル)', short: 'ALL' },
  rss: { label: 'RSS / ニュース', short: 'RSS' },
  wikipedia: { label: 'Wikipedia ランダム', short: 'WIKI' },
  weather: { label: '天気予報・気象警報', short: 'WTHR' },
  mastodon: { label: 'Mastodon タイムライン', short: 'MAST' },
  disaster: { label: '防災・鉄道運行情報', short: 'SAFE' },
  market: { label: '市況・為替・株', short: 'MKT' },
  nowplaying: { label: 'Now Playing', short: 'PLAY' },
  countdown: { label: '予定・カウントダウン', short: 'CNTD' },
  system: { label: 'システム・室内環境', short: 'SYS' },
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
  jmaAreaCode: string;
}

export const CITY_PRESETS: CityPreset[] = [
  { name: '東京', latitude: 35.6762, longitude: 139.6503, jmaAreaCode: '130000' },
  { name: '大阪', latitude: 34.6937, longitude: 135.5023, jmaAreaCode: '270000' },
  { name: '札幌', latitude: 43.0618, longitude: 141.3545, jmaAreaCode: '016000' },
  { name: '名古屋', latitude: 35.1815, longitude: 136.9066, jmaAreaCode: '230000' },
  { name: '福岡', latitude: 33.5902, longitude: 130.4017, jmaAreaCode: '400000' },
  { name: '那覇', latitude: 26.2124, longitude: 127.6809, jmaAreaCode: '471000' },
];

export interface MarketSymbolPreset {
  id: string;
  symbol: string;
  label: string;
}

export const MARKET_SYMBOL_PRESETS: MarketSymbolPreset[] = [
  { id: 'usdjpy', symbol: 'USDJPY=X', label: 'USD/JPY' },
  { id: 'eurjpy', symbol: 'EURJPY=X', label: 'EUR/JPY' },
  { id: 'nikkei225', symbol: '^N225', label: '日経平均' },
  { id: 'sp500', symbol: '^GSPC', label: 'S&P 500' },
  { id: 'nasdaq', symbol: '^IXIC', label: 'NASDAQ' },
  { id: 'btcjpy', symbol: 'BTC-JPY', label: 'BTC/JPY' },
  { id: 'ethjpy', symbol: 'ETH-JPY', label: 'ETH/JPY' },
];

export const EARTHQUAKE_SCALE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 10, label: '震度1以上' },
  { value: 20, label: '震度2以上' },
  { value: 30, label: '震度3以上' },
  { value: 40, label: '震度4以上' },
  { value: 45, label: '震度5弱以上' },
  { value: 50, label: '震度5強以上' },
  { value: 55, label: '震度6弱以上' },
  { value: 60, label: '震度6強以上' },
  { value: 70, label: '震度7' },
];

export const SOURCE_WEIGHT_LABELS: Record<keyof SourceWeights, string> = {
  rss: 'RSS ニュース',
  weather: '天気・気象警報',
  mastodon: 'Mastodon',
  wikipedia: 'Wikipedia',
  earthquake: '地震・津波',
  transit: '鉄道運行',
  market: '市況・為替',
  nowplaying: 'Now Playing',
  countdown: 'カウントダウン',
  sysmon: 'システム監視',
  calendar: 'カレンダー予定',
  sensors: '室内環境センサー',
  webhook: 'Webhook',
};

export interface TransitLinePreset {
  name: string;
  odptKey?: string;
}

export interface TransitOperatorGroup {
  id: string;
  label: string;
  note: string;
  lines: TransitLinePreset[];
}

export const TRANSIT_OPERATOR_GROUPS: TransitOperatorGroup[] = [
  {
    id: 'toei',
    label: '都営地下鉄・東京都交通局',
    note: 'ODPT公開API（キー不要）',
    lines: [
      { name: '都営浅草線', odptKey: 'Toei.Asakusa' },
      { name: '都営三田線', odptKey: 'Toei.Mita' },
      { name: '都営新宿線', odptKey: 'Toei.Shinjuku' },
      { name: '都営大江戸線', odptKey: 'Toei.Oedo' },
      { name: '東京さくらトラム', odptKey: 'Toei.Arakawa' },
      { name: '日暮里・舎人ライナー', odptKey: 'Toei.NipporiToneri' },
    ],
  },
  {
    id: 'tokyo-metro',
    label: '東京メトロ',
    note: '要ODPTキー',
    lines: [
      { name: '東京メトロ銀座線', odptKey: 'TokyoMetro.Ginza' },
      { name: '東京メトロ丸ノ内線', odptKey: 'TokyoMetro.Marunouchi' },
      { name: '東京メトロ日比谷線', odptKey: 'TokyoMetro.Hibiya' },
      { name: '東京メトロ東西線', odptKey: 'TokyoMetro.Tozai' },
      { name: '東京メトロ千代田線', odptKey: 'TokyoMetro.Chiyoda' },
      { name: '東京メトロ有楽町線', odptKey: 'TokyoMetro.Yurakucho' },
      { name: '東京メトロ半蔵門線', odptKey: 'TokyoMetro.Hanzomon' },
      { name: '東京メトロ南北線', odptKey: 'TokyoMetro.Namboku' },
      { name: '東京メトロ副都心線', odptKey: 'TokyoMetro.Fukutoshin' },
    ],
  },
  {
    id: 'jr-east',
    label: 'JR東日本',
    note: '要ODPTキー',
    lines: [
      { name: 'JR山手線', odptKey: 'JR-East.Yamanote' },
      { name: 'JR京浜東北線', odptKey: 'JR-East.KeihinTohokuNegishi' },
      { name: 'JR中央線快速', odptKey: 'JR-East.ChuoRapid' },
      { name: 'JR中央・総武線', odptKey: 'JR-East.ChuoSobuLocal' },
      { name: 'JR東海道線', odptKey: 'JR-East.Tokaido' },
      { name: 'JR横須賀線', odptKey: 'JR-East.Yokosuka' },
      { name: 'JR埼京線', odptKey: 'JR-East.SaikyoKawagoe' },
      { name: 'JR湘南新宿ライン', odptKey: 'JR-East.ShonanShinjuku' },
      { name: 'JR総武線快速', odptKey: 'JR-East.SobuRapid' },
      { name: 'JR常磐線', odptKey: 'JR-East.Joban' },
      { name: 'JR常磐線快速', odptKey: 'JR-East.JobanRapid' },
      { name: 'JR京葉線', odptKey: 'JR-East.Keiyo' },
      { name: 'JR南武線', odptKey: 'JR-East.Nambu' },
      { name: 'JR横浜線', odptKey: 'JR-East.Yokohama' },
      { name: 'JR武蔵野線', odptKey: 'JR-East.Musashino' },
      { name: 'JR高崎線', odptKey: 'JR-East.Takasaki' },
      { name: 'JR宇都宮線', odptKey: 'JR-East.Utsunomiya' },
    ],
  },
  {
    id: 'kanto-private',
    label: '首都圏私鉄・その他',
    note: '要ODPTキー / カスタムRSS',
    lines: [
      { name: '東急東横線', odptKey: 'Tokyu.Toyoko' },
      { name: '東急田園都市線', odptKey: 'Tokyu.DenEnToshi' },
      { name: '東急目黒線', odptKey: 'Tokyu.Meguro' },
      { name: '東急池上線', odptKey: 'Tokyu.Ikegami' },
      { name: '東急大井町線', odptKey: 'Tokyu.Oimachi' },
      { name: '東急多摩川線', odptKey: 'Tokyu.Tamagawa' },
      { name: '小田急小田原線', odptKey: 'Odakyu.Odawara' },
      { name: '小田急江ノ島線', odptKey: 'Odakyu.Enoshima' },
      { name: '小田急多摩線', odptKey: 'Odakyu.Tama' },
      { name: '京王線', odptKey: 'Keio.Keio' },
      { name: '京王井の頭線', odptKey: 'Keio.Inokashira' },
      { name: '西武池袋線', odptKey: 'Seibu.Ikebukuro' },
      { name: '西武新宿線', odptKey: 'Seibu.Shinjuku' },
      { name: '東武東上線', odptKey: 'Tobu.Tojo' },
      { name: '東武スカイツリーライン', odptKey: 'Tobu.TobuSkytree' },
      { name: '京急本線', odptKey: 'Keikyu.Main' },
      { name: '京成本線', odptKey: 'Keisei.Main' },
      { name: '相鉄本線', odptKey: 'Sotetsu.Main' },
      { name: 'つくばエクスプレス', odptKey: 'MIR.TsukubaExpress' },
      { name: 'りんかい線', odptKey: 'TWR.Rinkai' },
      { name: 'ゆりかもめ', odptKey: 'Yurikamome.Yurikamome' },
    ],
  },
  {
    id: 'nationwide',
    label: '新幹線・全国主要路線',
    note: 'カスタムRSS等',
    lines: [
      { name: '東海道新幹線' },
      { name: '東北新幹線' },
      { name: '山陽新幹線' },
      { name: '北陸新幹線' },
      { name: 'JR京都線' },
      { name: 'JR神戸線' },
      { name: '大阪環状線' },
      { name: '阪急神戸線' },
      { name: '阪急京都線' },
      { name: '阪神本線' },
      { name: '京阪本線' },
      { name: '近鉄奈良線' },
      { name: '名鉄名古屋本線' },
      { name: '福岡市地下鉄空港線' },
      { name: '札幌市営地下鉄南北線' },
    ],
  },
];

export const RAILWAY_NAME_MAP: Record<string, string> = Object.fromEntries(
  TRANSIT_OPERATOR_GROUPS.flatMap((group) =>
    group.lines
      .filter((line): line is { name: string; odptKey: string } => Boolean(line.odptKey))
      .map((line) => [line.odptKey, line.name]),
  ),
);
