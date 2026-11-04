# Card Lounge — Step 1

深緑のフェルト卓、チャコールとゴールド、紙のトランプを基調とした日本語カードゲームサイトの基本実装です。AWS学習サイトとは独立した新規プロジェクトです。

## 起動

Node.js 22.12以降または24系を推奨（Vite7の要件を満たすバージョン）。今回の実行環境はNode24.22.1。

```sh
cd /workspace/card-lounge
npm ci
npm run dev -- --port 3400
```

```sh
npm test
npm run build
npm run preview -- --port 3401
```

ビルド成果物はdist/。GitHub Pagesを想定した相対baseとハッシュURL（#/play/memory等）です。file://による直接オープンは対応しません。ソースはmainブランチで管理します。GitHub Actionsはmainの更新時にnpm ci・npm test・npm run buildを実行し、dist/をGitHub Pagesへ配信します。

## 今回の範囲

- 5ゲームの一覧とルール。遊べるゲームは神経衰弱1種類です。残り4種類は準備中と表示し、開始ボタンを無効化しています。
- 神経衰弱: 8/12/26ペア、1人/CPU対戦、初級2枚・中級6枚・上級は観測した未一致全札の記憶。
- 同ランク・同色でペア。♥と♦、♠と♣。不一致の確認800ms、CPUの各選択600ms。
- 合法操作とCPU選択を純粋なエンジンに分離。CPUへは観測済み情報のみを渡します。
- 自動保存、一時停止、保存して終了/保存せず終了/キャンセル、再開、タブ非表示時の停止。
- 完了結果の冪等な記録、同設定・補助なしのローカル上位10件。中断は戦績に数えません。
- 卓3種、カード裏面3種、dark/light/system、動き軽減。
- 320px以上の表示、ボタンによるキーボード操作。

## 未実装

クロンダイク・ババ抜き・七並べ・スピードのゲームエンジン/対戦、効果音、実績・称号、戦績消去、全5ゲームのセーブスロット、仕様書全111項目の完了。全仕様の完成版ではありません。ルール文を表示できることはゲーム実装完了を意味しません。

## 保存

localStorageのcard-lounge:v1を使用します。現在の保存形式は神経衰弱の基本実装用のサブセットで、マスター仕様の全フィールドを実装したものではありません。将来の機能追加時に互換性を維持して拡張します。破損・将来版・未知のゲーム保存は上書きせず一時プレイへ切り替えます。保存容量不足は通知し、プレイを継続。別タブの変更検出後はこのタブからの書き込みを停止。

再開用データにはカード配置が含まれますが、裏向きカードの中身はDOM/aria-labelへ出しません。端末内ゲームでありサーバーによる不正防止・端末間同期・オンライン対戦はありません。

## 構成

- src/App.tsx: ホーム・ゲーム画面・結果・戦績・設定・スケジューラー
- src/app/types.ts: 今回実装した型
- src/core/cards.ts: カード生成・再現可能な乱数・シャッフル
- src/core/storage.ts: 保存検証・保護・記録・ランキング
- src/games/registry.ts: 5ゲームの案内・ルールと実装状態
- src/games/memory/engine.ts: 神経衰弱の状態遷移・CPU観測/選択
- src/components/: カード描画・ダイアログ
- src/styles/global.css: フェルト・カード・レスポンシブ・テーマ
- tests/memory.test.ts: Node組み込みランナーによる単体テスト
- tests/browser.py: Playwright / /usr/bin/chromiumがある環境でのブラウザ確認
- docs/: 元仕様書（参考資料）・スコープ・実行結果・画面

## 外部依存

実行時はReact/React DOMのみ。開発用はVite/TypeScript/公式型。外部画像・フォント・API・認証・DBなし。追加の状態管理/ルーター/ゲーム/アニメーションライブラリなし。ブラウザ検証のみPython Playwrightを利用します。

本番ビルドをプレビュー起動後の検証例：

```sh
CARD_LOUNGE_BASE_URL=http://127.0.0.1:3401 python3 tests/browser.py
```

実行証跡はdocs/TEST_REPORT.md、基本版の採用範囲はdocs/STEP1_SCOPE.mdを参照してください。

## GitHub Pages の設定

リポジトリの Settings → Pages → Build and deployment → Source で **GitHub Actions** を選択します。

ワークフローは `.github/workflows/pages.yml`。mainへのPush、またはActions画面のRun workflowで実行。テストとビルドが成功した成果物のみ配信します。

公開予定URL: https://banben18-creator.github.io/card-lounge/

最初の公開はPages設定とデプロイ成功後に有効になります。React/Viteのソースをmainのルートから直接配信する設定は使用しません。
