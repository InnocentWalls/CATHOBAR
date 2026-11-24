# CATHOBAR

2008〜2011年頃に存在した電光掲示板型ネットガジェット **「ANOBAR / ANOBAR8」** を、現代の Web・GPU 技術で再構築したティッカーディスプレイシステムです。

Raspberry Pi に横向き接続した超横長ディスプレイ（通称 **ツイ廃モニタ**：`1920×480`、`1280×400` 等）での常時稼働を主軸としつつ、任意の PC（Windows / macOS / Linux）のブラウザ上でウィンドウデバッグ・任意解像度シミュレーション、LAN 内のスマホ／PC からの Web 管理画面操作に対応しています。

---

## 主な特徴

- **4つのビジュアルをリアルタイム切替**
  - **ANOBAR8 モード（VFD 16階調）**: 蛍光表示管風のモノクロ16階調量子化・シアン/グリーン/ホワイト/アンバー配色・自発光ブルーム・残像（WebGL2 シェーダー）
  - **初代 ANOBAR モード（FED フルカラー）**: 高輝度フルカラー自発光ドットマトリクス表現
  - **東北新幹線 3色 LED モード (`shinkansen-led`)**: 車内電光掲示板風の丸型 LED 素子＋緑・橙・赤の3色ドットマトリクス（16/24/32 ドット切替、右から左への連続スクロールを既定とし、オプションで頭出し静止演出も選択可能）
  - **クリーンモード**: ドット加工を抑えた高精細モダン表示
- **2種類の流し方 ＋ 自動切替（`auto` / `lanes` / `danmaku`）**
  - **固定レーン (`lanes`)**: 1〜4行に整列して流す電光掲示板スタイル
  - **弾幕フリーフロー (`danmaku`)**: ニコニコ動画のように行の概念に縛られず、画面全体の空き高さへ高密度に流すスタイル
  - **自動 (`auto`)**: Mastodon 表示時や急激な流量増加時は弾幕へ自動切替し、通常時は整列レーンで表示
- **任意解像度 / 任意アスペクト比対応**
  - 縦の論理ドット数（標準 `96px`）を基準に、表示ウィンドウのアスペクト比へ合わせて横ドット数を自動計算するため、`1920×480` / `1280×400` / `640×96` などどんな画面比率でも文字が歪みません。
- **現代のコンテンツソースと自動更新**
  - **RSS / ニュース**: サーバー側タイマー（既定300秒、管理画面から変更・即時更新可）で自動巡回し、新着記事を即座に WebSocket 経由で全表示端末へ配信
  - **Wikipedia ランダム表示**: 一定間隔（既定45秒）でランダム記事を自動取得
  - **天気予報（複数地点対応）**: Open-Meteo（API キー不要）で複数都市を登録・同時取得し、各地点の最新予報へ自動差し替え
  - **Mastodon タイムライン**: WebSocket Streaming（非対応・要認証サーバーでは REST ポーリングへ自動フォールバック）でローカル / 連合 / ハッシュタグをリアルタイム表示（初期状態は OFF のため、`/admin` から任意のインスタンスを選んで有効化してください）
  - **時計 / 割り込み Push API**: 起動メッセージ・Push 通知・テスト電文は「1回のみ表示 (`oneShot`)」に対応し、通過後にループへ残らず自動消滅
- **内部サーバー + LAN Web 管理画面**
  - `/`: 表示画面（キオスク・アプリウィンドウ向け）
  - `/admin`: スマホ・PC から操作できる Web 管理画面
  - `/debug`: PC ブラウザ向け仮想モニタ枠シミュレーター（各種ツイ廃モニタ解像度プリセット・弾幕テスト内蔵）

---

## クイックスタート

### 1. 依存インストール & ビルド

```bash
npm install
npm run build
```

### 2. 起動

#### 開発モード（ホットリロード）
```bash
npm run dev
```
- 開発時のフロントエンド: `http://localhost:5173/`（`/debug`, `/admin` も利用可）
- バックエンド API: `http://localhost:3000/`

#### 本番モード（ビルド済みファイルを単一サーバーで配信）
```bash
npm start
```
- 表示画面: `http://localhost:3000/`
- Web 管理画面: `http://localhost:3000/admin`（起動時に LAN IP もコンソールに表示されます）
- デバッグシミュレーター: `http://localhost:3000/debug`

---

## PC でのウィンドウ表示デバッグ（Windows / macOS / Linux）

Node.js とモダンブラウザだけで動作するため、OS を問わず検証できます。

1. **仮想モニタ枠で確認（どの OS でも共通）**:
   ブラウザで `http://localhost:3000/debug` を開くと、各種ツイ廃モニタ解像度やカスタム解像度をズーム付きで確認できます。
2. **実サイズのフレームレスウィンドウで開く**:
   * **Windows（1クリック起動：サーバー自動起動＆ウィンドウ終了時に自動停止）**:
     `scripts/start-cathobar.vbs` をダブルクリックすると、ターミナル画面を出さずに裏でサーバーを起動し、超横長ウィンドウを開きます（ウィンドウを閉じるとサーバーも自動終了します）。
     デスクトップショートカットを作成してタスクバー等へピン留めしたい場合は以下を実行してください：
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/create-shortcut-win.ps1
     ```
     ウィンドウのみ開く場合（`npm run dev` 確認時など）：
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/launch-window.ps1 -Width 1280 -Height 400
     ```
     ※ `npm run dev` 時は `-Url http://localhost:5173/` を指定してください。
   * **macOS / Linux**（Chrome / Chromium で直接起動）：
     ```bash
     google-chrome --app=http://localhost:3000/ --window-size=1280,400
     ```

---

## Raspberry Pi キオスク運用

### ワンコマンド自動セットアップ（推奨）
Raspberry Pi OS (Desktop) 上で以下を実行すると、日本語フォント（`fonts-noto-cjk`）・Node.js 22・ビルド・`systemd` サービス登録（`cathobar.service`）・デスクトップ自動起動（Wayland `labwc` / X11 両対応）まで一括設定されます。

```bash
bash scripts/install-pi.sh
```

オプション：
- `--port 8080`: 待ち受けポートを変更（既定 `3000`）
- `--skip-build`: Pi Zero 2 W 等の省メモリ機向けに、PC 側でビルド済みの `dist/` を配置したままセットアップする場合に使用
- アンインストール（常駐サービスと自動起動の解除）：
  ```bash
  bash scripts/uninstall-pi.sh
  ```

### 手動起動する場合
1. Raspberry Pi 上でビルドして起動します：
   ```bash
   npm install
   npm run build
   npm start
   ```
2. 別の端末や起動スクリプトから Chromium キオスクを起動します：
   ```bash
   bash scripts/launch-kiosk.sh http://localhost:3000/
   ```
3. 同じ LAN 内のスマートフォンや PC から `http://<RaspberryPiのIP>:3000/admin` を開くと、チャンネル切替やビジュアル調整が行えます。

---

## 表示画面のキーボードショートカット（`/`）

| キー | 動作 |
| :--- | :--- |
| `1` 〜 `6` | チャンネル切替（ALL / RSS / Wiki / 天気 / Mastodon / 時計） |
| `L` | レイアウト切替（自動 → 固定レーン → 弾幕フリーフロー） |
| `V` | ビジュアルモード切替（ANOBAR8 VFD → 初代 FED → クリーン） |
| `C` | VFD 蛍光管カラー切替（Cyan → Green → White → Amber） |
| `G` | 下部 勢いグラフ ON/OFF |
| `F` | フルスクリーン切替 |
| `H` | 上部操作 HUD の表示/非表示 |

---

## 割り込みメッセージ Push API

LAN 内の別スクリプトやスマートホーム連携から、いつでもティッカーに緊急・通知メッセージを流せます（既定で `oneShot: true` のため 1回流れたら消えます）。

```bash
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"badge":"ALERT","text":"ビルドが完了しました！","color":"#38fad9","priority":"high","oneShot":true}'
```

---

## テスト・型チェック

```bash
npm run typecheck
npm test
```

---

## 注意事項・免責（公開 / 運用にあたって）

- **自宅 LAN 専用設計です（インターネット直接公開禁止）**：本サーバーは `0.0.0.0:3000` で待受け、認証なしで設定変更（`/api/config`）や通知投入（`/api/push`）を受け付けます。外部インターネットから直接アクセス可能なポート開放やリバースプロキシ公開は行わないでください。
- **非公式インスパイアプロジェクト**：本プロジェクトは、かつての「ANOBAR / ANOBAR8」（株式会社アノドス）や鉄道車両の車内 LED 表示器から着想を得て独自に制作した非公式の再現ソフトウェアであり、株式会社アノドス・東日本旅客鉄道株式会社（JR東日本）・各ニュース／天気／SNS サービス運営元とは一切関係ありません。
- **ライセンス**：[MIT License](LICENSE)
