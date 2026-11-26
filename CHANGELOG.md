# Changelog

## v1.0.0 (2026-11-26)

### Highlights
- **6つのビジュアルモード**: ANOBAR8 (VFD 16階調 WebGL2 シェーダー)、初代 ANOBAR (FED フルカラー)、東北新幹線 3色 LED (`shinkansen-led`)、パタパタ (`split-flap`)、在来線発車標 (`station-board`)、クリーンモード
- **柔軟なレイアウトと演出**: 固定レーン / 弾幕フリーフロー / 自動切替、16バンド VFD スペクトラムアナライザ、16×16 ドット絵ミニアイコン、緊急割り込み演出 (`Breaking Alert`) & 種別別チャイム、ナイトモード、シーンプリセット、OBS 透過オーバーレイ
- **14種以上のリアルタイムソース**: RSS/Atom、NHK ニュース速報 (JUST IN)、Wikipedia、天気予報・雨雲接近・気象庁警報、P2P地震情報・ODPT 鉄道運行、市況、Now Playing (SMTC / `playerctl` / Last.fm)、カウントダウン、iCal カレンダー、システムモニター、室内センサー (SwitchBot / Nature Remo)、Mastodon、10種対応 Webhook / Push API
- **マルチプラットフォーム運用**: Raspberry Pi ワンコマンドセットアップ＆キオスク起動、Windows フレームレスウィンドウ起動、Web 管理画面 (`/admin`) & スマホ用 QR コード、任意解像度シミュレーター (`/debug`)
- **セキュリティ・運用基盤**:
  - 環境変数 `CATHOBAR_TOKEN` によるオプトイン API 認証と Admin UI ロック解除フロー
  - `Dockerfile` / `docker-compose.yml` によるコンテナ実行対応
  - GitHub Actions CI（Node.js 20 / 22 で `typecheck`, `test`, `build` を自動検証）
  - 共有ロジック・パーサー・認証 API の単体テスト拡充
