# Card Lounge — Claude Code 実装正本仕様書 v1.0

> 更新日: 2026-11-04 ／ 状態: 実装指示（アプリ本体は未実装）  
> **対象:** 新規Webアプリ（トランプゲーム5種）  
> **本書の構成:** 指定の6章。個別ルールの細部は `docs/GAME_RULES_AND_CPU.md`、検証の具体的操作は `tests/ACCEPTANCE_MATRIX.md` を参照。食い違いは本書 §6.1 に従って解決する。

## 1. 概要と目的

### 1.1 ゴール・確定事項

外部サービスやデータベースなしで動く、日本語のトランプゲーム総合サイト「Card Lounge」を作る。テーマは **Classic Casino Table**。深緑のフェルト風ゲーム卓、ダークチャコールのUI、ゴールドのアクセント、紙カード風のトランプを備える。装飾より可読性・正確な操作判定を優先する。

| ID | 必須条件 | 完了判定 |
|---|---|---|
| REQ-001 | ソリティア（クロンダイク・ドロー1） | 52枚と7列・組札・山札の一貫した移動検証と勝利判定 |
| REQ-002 | 神経衰弱（1人／CPU対戦） | 8/12/26ペア、同じ数字かつ同じ色の2枚で一致判定 |
| REQ-003 | ババ抜き（人間1＋CPU3） | 53枚、同ランクのペア除去、最後のジョーカー保持者が負け |
| REQ-004 | 七並べ（人間1＋CPU3） | 全スートの7を中央に置き、連続する数字のみ出せる |
| REQ-005 | スピード（人間1＋CPU1） | 2つの場札へ同時進行、隣接ランクのカードを配置 |
| REQ-006 | 戦績・ローカルランキング | 結果確定時に記録、ゲーム別上位10件、端末外の順位を偽装しない |
| REQ-007 | 中断・再開 | ゲームごとの1件のスナップショット保存・再開、復帰時に検証 |
| REQ-008 | ルール・ヒント | 5ゲームのルール、局面に合う合法手の案内、CPUの隠れ札は参照しない |
| REQ-009 | カード・卓上スキン | 裏面3種、卓上3種、設定の永続化。スート判別を保持 |
| REQ-010 | 効果音とアニメーション | 設定でON/OFF、音声API未対応でもプレイ可、動作軽減設定を尊重 |
| REQ-011 | 実績・称号 | §4.11の固定条件で解除。二重カウントなし |
| REQ-012 | レスポンシブ・キーボード操作 | PC・タブレット・モバイルでプレイ可能、カードの代替操作あり |
| REQ-013 | 安全な端末内保存 | `localStorage`のみ。破損データから復旧、保存不可でも一時プレイ可 |
| REQ-014 | 完全なゲームルール | `GAME_RULES_AND_CPU.md` と同じ判定を実装。曖昧なローカルルールを推測しない |

- **対象外:** オンライン対戦、チャット、ユーザー登録、課金、賭博・現金、ランキングサーバー、外部API、広告、多人同時ローカル対戦、バトルパス。
- **技術:** Vite + React 18以降 + TypeScript（strict）+ CSS Modules または素のCSS。React、React DOM、Vite、TypeScript、必要な公式型パッケージのみを初期依存とし、状態管理・ルーター・ドラッグ・音声・アニメーション用の追加ライブラリは原則不要。機能不足を確認した場合のみ、導入理由を文書化する。
- **バックエンド:** なし。Google OAuth、Firebase、Supabase、Prisma、PostgreSQL、外部認証・DBを使わない。
- **配布:** `npm run dev` / `npm run build` / `npm run preview` で動く静的SPA。`index.html` を `file://` で直接開くことはサポート保証外。

### 1.2 画面と画面遷移

1. **ホーム `/`**: おすすめ／前回のゲーム、5種のゲームカード、直近戦績、実績の進捗。ゲーム開始・再開・ルールを起動できる。
2. **ゲーム選択 `/games`**: 5種、プレイ人数、難易度選択（適用されるゲームのみ）、時間記録方式／カード・卓デザイン。非対応の選択肢は表示しない。
3. **プレイ `/play/:gameId`**: 左＝基本操作（大型画面のみ）、中央＝ゲーム卓、右＝ターン／山札／ヒント／ログ（必要時）。ゲームに無関係な情報は隠す。ヘッダーは戻る・ゲーム名・タイマー・音量・一時停止。
4. **結果 `/result/:sessionId`**: 勝敗または成功、所要時間、ゲーム別指標、ランキング順位（ローカル）、解除した実績、再戦・ホーム。
5. **戦績 `/records`**: ゲーム別の通算プレイ、勝利、勝率、ベスト、最新履歴と上位10件。条件・補助使用区分を明記。
6. **実績 `/achievements`**: バッジ一覧、解除条件、進捗と解除日時。
7. **設定 `/settings`**: スキン、SEのON/OFFと音量、動き軽減、確認ダイアログ設定、戦績データ消去。
8. **共通ダイアログ**: ルール、ヒント、一時停止、保存確認、終了確認、エラー表示。

**URLの取り扱い:** React Routerは不要。HTML History API（`pushState` と `popstate`）またはハッシュ方式を1つ選択し、直リンクでも静的ホストがリライトできる構成にする。静的ホストがリライト不可なら `/#/play/klondike` を標準とし、実装内の全画面遷移をこの方式で統一。仕様上の画面名と画面遷移は共通。未定義URLはホームへ案内。

ホーム → ゲーム選択 → 設定確認 → プレイ → 結果 → 再戦／ホーム。プレイ途中の戻る操作は「保存して終了」「保存せず終了」「キャンセル」の選択を出す。未完了ゲームを勝利として記録しない。保存済みがあるゲームを新規開始する場合は上書き警告を出す。

### 1.3 確定UI（Classic Casino Table）

- `1440px` PC例: 固定ナビ `220px` + 可変メイン + （ホームの必要時のみ）右情報 `280px`。全体最大幅 `1680px`。ゲームプレイは右サイドを撤去して卓面積を優先。
- ヘッダー `64px`、PCサイド `220px`、カード枠 `clamp(56px, 5.5vw, 86px)` のように画面に応じて縮小。カード縦横比 **5:7**。
- 画面幅 `<= 1023px`: サイドナビの表示をコンパクト化。`<= 767px`: ナビを下部タブへ、カードタッチ領域は最低 `44×44px`。`<= 360px` では卓を縮小・必要に応じて一部の列を内部スクロールさせ、ページ全体の横スクロールは出さない。
- 背景は緑フェルト（CSSで作る。外部画像必須にしない）。金色のエッジ、白／赤黒カード。シャドウ／光沢は控えめにする。ダーク／ライトのサイト表示も提供するが卓面は選択スキンを優先。
- カードはカード固有ID・表裏・選択状態・操作可能状態を視覚と `aria-label` で表現。♠・♣は黒系、♥・♦は赤系、色覚に依存しないスート記号を併用。
- 動画・画像は要らない。背景・カードはCSS/SVGで構成する。カスタムの絵札がなくても標準的なランク＋スート表示で全52枚を識別できる。
- 詳細は `design/casino-tokens.css` に**実値**を定義。ダークUIの強いコントラストを確保する。

## 2. ファイル・ディレクトリ構成

> 下記は**Claude Codeが作成するアプリの目標構造**であり、この納品ZIPに実装済みコードがあることを意味しない。

```text
card-lounge/
├── CLAUDE.md
├── README.md
├── START_PROMPT.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx                  # React 起動
│   ├── App.tsx                   # 画面切替、グローバル操作
│   ├── assets/                   # 任意の自作SVGのみ（外部画像不要）
│   ├── app/
│   │   ├── routes.ts             # URL→画面の純粋解決
│   │   ├── AppProvider.tsx       # ストア・永続化・音声注入
│   │   └── types.ts             # §3の型の正本
│   ├── core/
│   │   ├── cards.ts             # 52枚+JOKER、比較・ランク
│   │   ├── rng.ts               # 乱数状態・Fisher–Yates
│   │   ├── clock.ts             # 正味プレイ時間
│   │   ├── storage.ts           # バージョン付き安全読み書き
│   │   ├── records.ts           # 集計・ランキング
│   │   ├── achievements.ts      # 達成条件と重複排除
│   │   ├── audio.ts             # 遅延初期化WebAudio
│   │   ├── animation.ts         # CSS再生指令・キャンセル
│   │   └── validators.ts        # データ検証・不変条件
│   ├── games/
│   │   ├── engine.ts            # GameEngine共通契約
│   │   ├── registry.ts          # 5ゲームの定義を列挙
│   │   ├── klondike/{model.ts,rules.ts,reducer.ts,hint.ts,View.tsx}
│   │   ├── memory/{model.ts,rules.ts,reducer.ts,cpu.ts,View.tsx}
│   │   ├── oldMaid/{model.ts,rules.ts,reducer.ts,cpu.ts,View.tsx}
│   │   ├── sevens/{model.ts,rules.ts,reducer.ts,cpu.ts,View.tsx}
│   │   └── speed/{model.ts,rules.ts,reducer.ts,cpu.ts,View.tsx}
│   ├── components/
│   │   ├── AppShell.tsx          # 上部／左ナビ／モバイルナビ
│   │   ├── PlayingCard.tsx      # 1枚のカード。ボタン／ドラッグ
│   │   ├── CardBack.tsx         # カード背面
│   │   ├── GameTable.tsx        # 緑フェルト卓・スロット
│   │   ├── GameToolbar.tsx      # 停止・ルール・ヒント等
│   │   ├── Timer.tsx            # プレイ時間
│   │   ├── ConfirmDialog.tsx    # 離脱・削除確認
│   │   ├── Toast.tsx            # 成功・エラー通知
│   │   └── ResultSummary.tsx
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── GamesPage.tsx
│   │   ├── PlayPage.tsx
│   │   ├── ResultPage.tsx
│   │   ├── RecordsPage.tsx
│   │   ├── AchievementsPage.tsx
│   │   └── SettingsPage.tsx
│   └── styles/
│       ├── tokens.css
│       ├── global.css
│       ├── layout.css
│       ├── cards.css
│       └── animations.css
├── tests/
│   ├── unit/{cards,rng,klondike,memory,oldMaid,sevens,speed}.test.ts
│   ├── integration/{save-resume,records,settings}.test.ts
│   └── e2e/{desktop,mobile,accessibility}.spec.ts
└── docs/
    ├── CARD_LOUNGE_MASTER_SPEC.md
    ├── GAME_RULES_AND_CPU.md
    ├── IMPLEMENTATION_PLAN.md
    └── ...
```

- `src/app/types.ts` は§3の型を転記した正本。ゲーム別モデルで拡張する場合でも型の分岐が型安全なこと。
- アニメーションは描画だけを担当し、ルール／採点／山札を変更しない。
- `tests/*` は実装工程で追加するコードテスト。npm test で動かす場合、Vitest等の**テストに必要な開発用依存のみ**追加可。導入した場合READMEに明記。
- `design/casino-tokens.css` は本納品の参照素材。実装時に `src/styles/tokens.css` へコピーして調整する。
- 旧アプリを同じリポジトリに取り込む場合でも、既存コードを削除せず新しいサブフォルダに作成する。

## 3. データ構造・型定義

TypeScript の `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` を有効にする。`any` 禁止。UIで表示するカードはランク・スートから導出し、毎回同じIDを使用する。

### 3.1 基本型

```ts
export type GameId = 'klondike' | 'memory' | 'oldMaid' | 'sevens' | 'speed';
export type Phase = 'setup' | 'playing' | 'paused' | 'finished';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardId = `${Suit}-${Rank}` | 'JOKER';
export type ParticipantId = 'human' | 'cpu1' | 'cpu2' | 'cpu3';
export type OpponentId = 'cpu1' | 'cpu2' | 'cpu3';
export type TwoPlayerId = 'human' | 'cpu1';
export type Outcome = 'win' | 'loss' | 'draw' | 'completed';
export type TableTheme = 'emerald' | 'midnight' | 'burgundy';
export type CardBackTheme = 'royal' | 'geometric' | 'classic';
export type AppTheme = 'dark' | 'light' | 'system';
export type MemoryPairs = 8 | 12 | 26;
export type MemoryMode = 'solo' | 'vsCpu';
export type PageId = 'home' | 'games' | 'play' | 'result' | 'records' | 'achievements' | 'settings';
export type GameConfig = KlondikeConfig | MemoryConfig | OldMaidConfig | SevensConfig | SpeedConfig;
export type Orientation = 'horizontal' | 'vertical';
export interface Card { readonly id: CardId; readonly suit: Suit | null; readonly rank: Rank | null; readonly isJoker: boolean; }
export type FourHands = Record<ParticipantId, CardId[]>;
export type TwoHands = Record<TwoPlayerId, CardId[]>;
export interface RngState { seed: number; state: number; } // unsigned 32-bit integer。0 は正規化
export interface ClockState { elapsedMs: number; lastStartedAt: number | null; } // Date.now由来。保存時はlastStartedAt:nullにする
export interface UserSettings {
  schemaVersion: 1;
  tableTheme: TableTheme;
  cardBackTheme: CardBackTheme;
  appTheme: AppTheme;
  soundEnabled: boolean;
  soundVolume: number;         // 0..1。既定 0.5。初期 OFF
  reducedMotion: 'system' | 'on' | 'off';
  confirmQuit: boolean;       // 既定 true
}
export interface SessionBase<G extends GameId, C> {
  schemaVersion: 1;
  sessionId: string;           // crypto.randomUUID、利用できない場合は安全な代替
  gameId: G;
  phase: Phase;
  createdAt: number;          // epoch ms
  updatedAt: number;
  clock: ClockState;
  rng: RngState;
  config: C;
  moveCount: number;
  hintCount: number;
  assistUsed: boolean;
  result: SessionResult | null;
}
export interface SessionResult {
  outcome: Outcome;            // ソロの達成は completed
  winner: ParticipantId | null;  // ババ抜きは勝者が複数なのでnull。finishOrder末尾が敗者
  finishOrder: ParticipantId[];
  finishedAt: number;
  elapsedMs: number;
  score: number | null;
  stats: Record<string, number>;
}
```

**制約:** `CardId` の組は52枚＋必要時のみJOKER 1枚。カードをカード配列間で移動するときIDのユニーク性を保つ。`SessionResult` に数値を入れない勝敗でも `score:null`。全時刻はepoch ms、日時ラベルは端末ロケール。CPUの「考え中」など表示専用フラグは永続化しない。

### 3.2 ゲーム別セッション

```ts
export interface KlondikeConfig { drawCount: 1; unlimitedRedeals: true; }
export interface KlondikeColumn { down: CardId[]; up: CardId[]; }
export interface KlondikeFrame {
  stock: CardId[];
  waste: CardId[];
  foundations: Record<Suit, CardId[]>;
  tableau: KlondikeColumn[];   // 7本固定
  redealCount: number;
  moveCount: number;
}
export interface KlondikeSession extends SessionBase<'klondike', KlondikeConfig> {
  frame: KlondikeFrame;
  undoStack: KlondikeFrame[];   // 最大10スナップショット。時間は戻さない
}

export interface MemoryConfig { mode: MemoryMode; pairs: MemoryPairs; difficulty: Difficulty | null; }
export interface MemoryTile {
  tileId: string;
  cardId: CardId;
  pairKey: string;             // 色(S/C黒 H/D赤)＋ランク
  faceUp: boolean;
  matched: boolean;
}
export interface MemorySession extends SessionBase<'memory', MemoryConfig> {
  tiles: MemoryTile[];
  turn: TwoPlayerId;
  pickedTileIds: string[];    // 0..2
  resolution: 'idle' | 'mismatch';
  pairsWon: Record<TwoPlayerId, number>;
  attempts: Record<TwoPlayerId, number>;
  cpuMemory: string[];        // CPUが実際に観測したtileId。能力により上限あり
  cpuObserved: Record<string, string>; // 実際に表になったtileId→pairKeyのみ
}

export interface OldMaidConfig { cpuCount: 3; useSingleJoker: true; }
export interface OldMaidSession extends SessionBase<'oldMaid', OldMaidConfig> {
  hands: FourHands;
  discarded: CardId[];        // 取り除いたペア。全手札＋discardedで53枚
  turn: ParticipantId;
  finishedOrder: ParticipantId[];
  lastDraw: { from: ParticipantId; to: ParticipantId; drawn: CardId } | null;
}

export interface SevensConfig { difficulty: Difficulty; voluntaryPassLimit: 3; }
export interface Lane { low: Rank; high: Rank; } // start low=high=7
export interface SevensSession extends SessionBase<'sevens', SevensConfig> {
  hands: FourHands;
  lanes: Record<Suit, Lane>;
  turn: ParticipantId;
  voluntaryPasses: Record<ParticipantId, number>;
  forcedPasses: Record<ParticipantId, number>;
  finishOrder: ParticipantId[];
}

export interface SpeedConfig {
  difficulty: Difficulty;
  aceKingWrap: true;
  visibleSlots: 4;
}
export interface SpeedSession extends SessionBase<'speed', SpeedConfig> {
  reserve: TwoHands;          // 初期各21枚。末尾が次の補充カード
  visible: Record<TwoPlayerId, (CardId | null)[]>; // 各4枠
  centers: Record<TwoPlayerId, CardId[]>; // 各1枚から開始。両者どちらへも置ける
  lastActor: TwoPlayerId | null;
  resetCount: number;
}

export type GameSession = KlondikeSession | MemorySession | OldMaidSession | SevensSession | SpeedSession;
```

### 3.3 操作、保存、戦績、実績

```ts
export type GameAction =
  | { kind: 'KL_DRAW' }
  | { kind: 'KL_REDEAL' }
  | { kind: 'KL_MOVE'; from: KlondikePlace; to: KlondikePlace; count: number }
  | { kind: 'KL_UNDO' }
  | { kind: 'MEM_FLIP'; tileId: string; actor: TwoPlayerId }
  | { kind: 'MEM_RESOLVE_MISMATCH' }
  | { kind: 'OM_DRAW'; actor: ParticipantId; targetIndex: number }
  | { kind: 'SV_PLACE'; actor: ParticipantId; cardId: CardId }
  | { kind: 'SV_PASS'; actor: ParticipantId }
  | { kind: 'SP_PLACE'; actor: TwoPlayerId; visibleIndex: number; center: TwoPlayerId }
  | { kind: 'SP_RESET_CENTERS' }
  | { kind: 'PAUSE' } | { kind: 'RESUME' }
  | { kind: 'REQUEST_HINT' };
export type KlondikePlace =
  | { zone: 'stock' }
  | { zone: 'waste' }
  | { zone: 'foundation'; suit: Suit }
  | { zone: 'tableau'; column: number };
export interface ActionError {
  code: 'INVALID_ACTION' | 'INVALID_PHASE' | 'NOT_YOUR_TURN' |
        'ILLEGAL_MOVE' | 'CARD_NOT_FOUND' | 'SAVE_FAILED' |
        'DATA_CORRUPT' | 'UNSUPPORTED_VERSION' | 'AUDIO_UNAVAILABLE';
  message: string;
  recoverable: boolean;
}
export type ActionResult<S> =
  | { ok: true; state: S; events: GameEvent[] }
  | { ok: false; state: S; error: ActionError };
export type GameEvent =
  | { type: 'cardMoved'; cardIds: CardId[] }
  | { type: 'turnChanged'; participant: ParticipantId }
  | { type: 'pairMatched'; actor: TwoPlayerId }
  | { type: 'gameFinished'; result: SessionResult }
  | { type: 'hintShown'; text: string }
  | { type: 'undoCompleted' };

export interface GameSaveSlot {
  schemaVersion: 1;
  gameId: GameId;
  savedAt: number;
  session: GameSession;
}
export interface RankingEntry {
  sessionId: string;
  gameId: GameId;
  label: string;               // 例「難易度:ふつう」「ペア数:12 / CPU:初級」
  outcome: Outcome;
  metricName: 'timeMs' | 'turns' | 'rank' | 'score';
  metricValue: number;
  sortDirection: 'asc' | 'desc';
  assisted: boolean;
  achievedAt: number;
}
export interface GameRecord {
  sessionId: string;
  gameId: GameId;
  configLabel: string;
  outcome: Outcome;
  elapsedMs: number;
  hints: number;
  assisted: boolean;
  stats: Record<string, number>;
  finishedAt: number;
}
export type AchievementId =
  | 'first-play' | 'first-win' | 'klondike-clear' | 'memory-perfect'
  | 'memory-26' | 'oldmaid-survivor' | 'sevens-first'
  | 'speed-win' | 'five-types' | 'ten-wins';
export interface AchievementProgress {
  id: AchievementId;
  unlockedAt: number | null;
  progress: number;
  target: number;
}
/** CPUに渡すのはこの公開情報のViewだけ。非公開の実カードの真値を渡さない。 */
export type CpuObservation =
  | { gameId: 'memory'; turn: 'cpu1'; known: {tileId: string; pairKey: string}[];
      eligibleHiddenTileIds: string[]; firstOpened: {tileId: string; pairKey: string} | null }
  | { gameId: 'oldMaid'; turn: OpponentId; targetCount: number }
  | { gameId: 'sevens'; turn: OpponentId; ownHand: CardId[];
      lanes: Record<Suit, Lane>; voluntaryPassesLeft: number }
  | { gameId: 'speed'; turn: 'cpu1'; visible: (CardId | null)[];
      centerTops: Record<TwoPlayerId, CardId>; reserveCount: number };

export type NewGameArgs =
  | { gameId: 'klondike'; config: KlondikeConfig }
  | { gameId: 'memory'; config: MemoryConfig }
  | { gameId: 'oldMaid'; config: OldMaidConfig }
  | { gameId: 'sevens'; config: SevensConfig }
  | { gameId: 'speed'; config: SpeedConfig };

export interface StoredDataV1 {
  schemaVersion: 1;
  settings: UserSettings;
  saves: Partial<Record<GameId, GameSaveSlot>>;
  records: GameRecord[];           // 最大500件、古い順に間引く
  achievements: Record<AchievementId, AchievementProgress>;
  processedSessionIds: string[];   // 最大1000件、重複記録防止
}
```

- 保存キーは **`card-lounge:v1`**。未保存初回は初期オブジェクト生成。`schemaVersion !== 1` は上書きせず「対応外データ」と警告し、新規セッションのみ一時利用を許可する。壊れたJSONを自動で空データとして保存し直さない。
- **セッションID一意性**: `crypto.randomUUID()` が使えない場合は `crypto.getRandomValues` 由来の128bit乱数を整形。`Math.random()` のみで識別子を発行しない。HTTPSまたはlocalhostを想定。利用不可ならセッション開始を止め、理由を表示する。
- `GameRecord` に回答内容・ゲーム中の相手の隠れ札は保存しない。`GameSaveSlot.session` にはゲーム再開に必要な全カード配置とCPU記憶を含めるが、画面上は相手の札を表示しない。
- ローカルランキングは**この端末の記録**。ユーザー間比較なし。「世界ランキング」「オンライン」の表記は禁止。

## 4. 関数・コンポーネント詳細

### 4.1 共通エンジンと状態遷移

```ts
export interface GameEngine<S extends GameSession, A extends GameAction> {
  createSession(config: S['config'], seed: number, sessionId: string, now: number): S;
  validateState(state: S): ActionError | null;
  getLegalActions(state: S): A[];
  dispatch(state: S, action: A, now: number): ActionResult<S>;
  getHint(state: S): string | null;
  getResult(state: S, now: number): SessionResult | null;
}
export function transition<S extends GameSession>(
  state: S, action: GameAction, now: number
): ActionResult<S>;
```

**純粋性・確定性**: ゲームの状態変更は `dispatch` のみ。`Math.random()`・DOM・タイマー・localStorage・音声は直接呼ばない。乱数は `rng.state` を入力→更新後stateを出力する。`now` は引数で受け取る。`dispatch` は原本オブジェクトを破壊せず成功時に新状態を返す。失敗時には同一状態を返し、エラーを通知。手札・場・山札・ジョーカーの各IDは常に重複禁止。

**共通phase**: ゲーム設定UIが`setup`、配置完了したcreateSessionの初期値は`playing`。`playing → paused → playing → finished`の状態遷移をとる。`finished` は操作不可。`PAUSE` は `playing` のみ受け付け、計測を確定して `lastStartedAt=null`。`RESUME` は `paused` のみ。画面が非表示(`visibilitychange`)なら自動一時停止。CPU進行・アニメーション・不一致ペアの待機処理も停止。復帰時に明示的「再開」を押すまで進まない。`finished` 確定は1回のみ。

**時間**: プレイ中の時間は `clock.elapsedMs + max(0, now - clock.lastStartedAt)`、非プレイ中は `elapsedMs`。端末時計の大幅逆転は差分0に丸める。保存時は表示中の経過時間を `elapsedMs` に反映し `lastStartedAt=null`、phaseを `paused` にしてスナップショット化。勝敗時は計測確定。ゲーム中のヒントやUndoは時計を戻さない。

**進行副作用**: reducerのeventsをReact側のコントローラーが順に消費。再生中アニメーションはルール処理を抑止しないが、同じ選択に対する重複入力をロック。`useEffect` のinterval/timeout/音声はクリーンアップを必須とする。React StrictModeの2回初期化で2回配布や二重採点を起こさない。

### 4.2 共通関数（契約）

| 関数名（入出力型） | 必須ロジック・契約 |
|---|---|
| `makeDeck(includeJoker: boolean): Card[]` | S/H/D/C×A..Kを52ID作成。true時JOKER追加。重複しない |
| `sameColor(a: Suit,b: Suit): boolean` | S,C=黒／H,D=赤 |
| `adjacentRank(a: Rank,b: Rank,wrap: boolean): boolean` | 差が1、wrap trueの場合のみ(1,13)も隣接 |
| `nextRng(r:RngState): {value:number;next:RngState}` | xorshift32。出力 `[0,1)`、0 stateは固定値に置換 |
| `shuffle(ids:CardId[],rng:RngState): {cards:CardId[];rng:RngState}` | Fisher–Yates。入力を破壊しない。乱数消費順を固定 |
| `createSession(args: NewGameArgs, seed: number, sessionId: string, now: number): GameSession` | 設定値検証後、ゲーム別初期配置を作る。セッションIDは呼び出し元が生成 |
| `validateSession(s: unknown): s is GameSession` | schemaVersion、config、カード総数・重複、各場の整合性、phase、turn、時刻と数値範囲を検証 |
| `dispatchGame(state:GameSession,action:GameAction,now:number): ActionResult<GameSession>` | gameIdとactionの組をチェックして対応するreducerへ振り分け |
| `availableHints(state:GameSession): string[]` | 公開情報と合法手だけを参照。見えないCPU手札・山札を教えない |
| `loadStoredData(): LoadResult` | JSON parse +厳密検証。正常/破損/新バージョン/ストレージ不可を識別 |
| `saveStoredData(data:StoredDataV1): SaveResult` | try/catch。保存エラーは一時メモリで継続し通知。破損データを上書きしない |
| `storeSnapshot(gameId:GameId,session:GameSession): SaveResult` | phaseをpausedに正規化、`saves[gameId]` のみ置換、既存記録維持 |
| `restoreSnapshot(gameId:GameId): RestoreResult` | 型・枚数・順序検証、成功時pausedで再開画面へ。失敗はスロット破棄せず案内 |
| `finalizeSession(session:GameSession): StoredDataV1` | finishedのみ記録。`processedSessionIds` で冪等。実績・順位を同時更新 |
| `getLeaderboard(data:StoredDataV1,gameId:GameId,configLabel:string):RankingEntry[]` | 同条件のみ比較。時間/ターン昇順またはスコア降順。上位10件 |
| `checkAchievements(records:GameRecord[],latest:GameRecord):AchievementProgress[]` | 後述の解除条件を適用。既解除は再解除しない |
| `setSoundEnabled(value:boolean):void` | ユーザー操作からのみAudioContext生成。非対応時は音なしで継続 |

`LoadResult`, `SaveResult`, `RestoreResult` は次の判別可能unionで定義する。`RestoreResult` は `session` を取得成功時にのみ含める。

```ts
type LoadResult =
  | { ok: true; value: StoredDataV1; source: 'storage' | 'default' }
  | { ok: false; reason: 'unavailable' | 'corrupt' | 'future-version'; raw: string | null };
type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' | 'unknown' };
type RestoreResult =
  | { ok: true; session: GameSession }
  | { ok: false; reason: 'none' | 'corrupt' | 'unsupported-version' | 'wrong-game' };
```

### 4.3 ゲーム別操作（詳細は別紙が正本）

| ゲーム | reducer／公開関数 | 条件・失敗時 |
|---|---|---|
| ソリティア | `createKlondike`, `getKlondikeMoves`, `moveKlondike`, `drawStock`, `recycleWaste`, `undoKlondike` | 交互色の降順・キングのみ空列・同スート昇順組札。失敗時state維持。履歴最大10件 |
| 神経衰弱 | `createMemory`, `flipTile`, `resolveMismatch`, `chooseMemoryCpuMove` | 合法は未マッチ・未オープンのみ。2枚目で比較、一致なら連続手番、不一致は800ms表示後裏返し次手番 |
| ババ抜き | `createOldMaid`, `drawOldMaidCard`, `removePairs`, `nextActivePlayer`, `chooseOldMaidCpuIndex` | 非公開の隠れ札を選べない／ペアを自動除去／手札0の人は飛ばす／最後にJOKER保持者が敗者 |
| 七並べ | `createSevens`, `getSevensLegalCards`, `placeSevensCard`, `passSevens`, `chooseSevensCpuCard` | スートの`low-1` / `high+1`のみ合法。自発パス上限3、合法手0の強制パスは無制限 |
| スピード | `createSpeed`, `placeSpeedCard`, `resetSpeedCenters`, `chooseSpeedCpuAction` | カードのランク隣接、K-A循環あり、2枚の中央札のいずれにも出せる。操作は原子的。両者手詰まり時のみ中央更新 |

`GameEngine` の具体的な型引数は、各ゲームの操作unionへ狭める。必要な場合 `getLegalActions` を `Move` のような実行対象だけに分け、`PAUSE` や`REQUEST_HINT` は共通処理で行う。失敗が明確なUIアクションをサイレントに破棄しない。

### 4.4 CPUの公平性・スケジューラ

- CPUが参照できるのは自身の手札・公開された場・実際に公開された記憶だけ。対戦相手の裏札・山札順・未来の乱数を参照禁止。実装のCPU関数へ`GameSession`全体を直接渡さず、§3.3の観測Viewを渡す。
- CPU思考はUI側の「次のアクションを発行する」処理。純粋CPU関数は `(state, difficulty, rng) => {action,rng}` または `null`。`dispatch` で都度再検証。
- 神経衰弱: 既知の未消去ペアを優先。easyは直近2枚、normalは直近6枚、hardは観測した全タイルを保持。知らないカードは未公開からランダム（ランダム選択時も乱数状態を進める）。
- ババ抜き: CPU難易度なし。相手の手札順から均等な位置を抽選。人間のカード表面を不当に参照しない。
- 七並べ: easyは合法手ランダム、normalは手持ちに次の連続カードがある手を優先、hardはその連続数が最も多い手を優先。同点はスート順`S,H,D,C`→数字昇順。CPUは合法手がある限り自発パスしない。
- スピード: CPU反応目安easy 1100ms／normal 700ms／hard 400ms（実時間タイマーの厳密な保証ではない）。その時点の合法手のみから選択、操作時に再検証。アニメーション中や画面非表示時は停止する。
- CPUによるアクションはプレイヤーアクションと同じreducerを通す。`setTimeout` はゲームID・セッションID・phaseが変わったらキャンセル。連続スケジュールは同時に最大1本。

### 4.5 コンポーネント詳細と操作仕様

| コンポーネント名（props型） | 主な動作／受け入れ条件 |
|---|---|
| `AppShell({children:ReactNode,currentPage:PageId,onNavigate:(id:PageId)=>void})` | PC左ナビ／モバイル下ナビ・ヘッダー。プレイ中の離脱は保存確認 |
| `GameCard({id:GameId,hasSave:boolean,onStart:()=>void,onResume:()=>void})` | ゲーム名・説明・再開。空の保存に再開ボタンなし |
| `PlayingCard({card:Card,faceUp:boolean,selected:boolean,disabled:boolean,onActivate:()=>void})` | `button`のキーボードEnter/Space対応、明確なfocus、表裏のラベル。背面カードは中身をDOMのaria-labelに漏らさない |
| `GameTable({gameId:GameId,children:ReactNode})` | フェルトと配置領域、横はみ出し防止、カード移動の表示のみ |
| `GameToolbar({phase:Phase,elapsedMs:number,onPause,onHint,onRules,onQuit})` | ヒント回数を加算、一時停止中CPUも停止 |
| `GameSetupDialog({gameId:GameId,onConfirm:(config:GameConfig)=>void})` | そのゲームが利用できる難易度のみ提示、不正値拒否 |
| `ResultSummary({result:SessionResult,record:GameRecord})` | 勝敗・所要時間・達成条件・端末内ランキング。重複書込禁止 |
| `RecordsPage({records:GameRecord[]})` | ゲーム別フィルタ、母数が0なら`—`、局所順位明示 |
| `AchievementsPage({items:AchievementProgress[]})` | 確定条件／未達成の進捗、達成済みのみ解除日時 |
| `SettingsPage({settings:UserSettings,onChange:(next:UserSettings)=>void})` | テーマ切替、音量、アニメ軽減、確認の保存、破壊的削除は再確認 |

各ゲーム別 `View.tsx` は一切ルールを直接更新せず、合法手表示・操作発行・結果描画のみを行う。

**ドラッグとクリックの代替操作**: `pointerdown`→移動→`pointerup`で手札を配置。ドラッグできない環境ではカードを1枚選択し、置きたい組札・列・中央札をクリックする2段階操作を同等の合法手として提供。七並べは合法手をタップするだけ、神経衰弱は1枚タップ。ソリティアは動かす連続札の起点を選べる。無効なターゲットを選んでも状態を変えず、理由を短く表示。ESCは選択解除→次に一時停止（入力要素にフォーカス中は特殊処理をしない）。

### 4.6 保存・再開・タブ閉じ対策

- `session` 保存は新規ゲーム開始後の配布完了時、合法アクション後（最大500msのdebounce、ただしSpeedは最大300ms）、pause時、`visibilitychange`時。タブ終了に同期処理を保証しないのでアクション後保存を主とする。
- **タブ非表示時の自動pauseはゲームを有利にしない**: CPUの行動・アニメーションを停止し、戻って明示再開するまでタイマー停止。
- 起動時に `saveSlot` を検証して「前回のゲームを再開」表示。壊れた保存は破棄しないで「この保存から再開できません」と表示、別のゲームを開始可。該当ゲームの上書きには確認が必要。
- localStorage保存失敗は状態の更新を妨げず、画面上部に「端末に保存できません。ページを閉じると進捗を失う場合があります」と明示。`QuotaExceededError` はサイズ見直し案内、勝手に実績や履歴を消去しない。
- 保存データはゲームごとに1スロット。結果確定後は当該スロットを削除（records・achievementsは保持）。保存済みがなくなった場合「再開」は非表示。

### 4.7 採点・戦績・ランキング

**すべてローカルのみ**。勝率=`wins/finishedPlays`、中断は分母に含めない。ゲーム別順位は同じゲーム・設定・モード／難易度だけを比較し、補助（Hint/Undo）の有無はラベルで明示、通常ランキングには**補助使用なしのみ**を登録。補助使用ありの結果は戦績に残すがランキング別枠にする。

| ゲーム | 結果 | ランキング指標 |
|---|---|---|
| ソリティア | 52枚組札移動で`completed` | クリア所要時間昇順、同値は少ない操作回数優先 |
| 神経衰弱solo | 全ペア取得で`completed` | ペア数別クリア時間昇順、同値は試行回数が少ない順 |
| 神経衰弱vsCPU | 人間の獲得ペア数が多い場合`win`、同数`draw` | 勝利時のペア獲得数降順、同値は時間昇順 |
| ババ抜き | 人間が最後のJOKER保持者以外なら`win` | 連勝数降順・通算勝数降順（個別結果のタイム順位ではない） |
| 七並べ | 先に上がった人間1位なら`win`、それ以外`loss` | 先着順位昇順、同値は時間昇順 |
| スピード | 先に手持ち0で`win`、CPU先着で`loss`、手詰まり同数なら`draw` | 勝利タイム昇順、同値は操作回数昇順 |

`RankingEntry` と`GameRecord` の`metricName`は各ゲームに合致させる。ババ抜きの連勝はランキング画面で `records` の時系列から再集計するため、`RankingEntry` の生データを無理に生成しない。**順位はこのブラウザ内での順位**。十分なデータがない場合は「まだ記録がありません」と表示。

### 4.8 ルール・ヒント・カード選択詳細

- 5種類の説明を「目的／準備／プレイ手順／合法手／勝利条件／ローカルルール／操作方法」の共通レイアウトで表示。
- ヒントは押下で `hintCount++`、`assistUsed=true`。合法手がないときは「今できる手がありません。山札をめくる／パスをしてください」などの行動を説明。ソリティアの伏せ札を覗かない。ババ抜きのヒントは選択方法だけで、相手のジョーカー位置は教えない。スピードのヒントは合法な中央札への移動先のみをハイライト。
- Undoはクロンダイクのみ。使用時に `assistUsed=true`、`moveCount` はスナップショットに従って戻すが`hintCount`／時計は戻さない。Undo前に合法手がない場合はエラーメッセージを表示。
- `Space`/`Enter`でボタン実行、カード移動には `aria-live=polite` で短い通知。手が動いたことは色だけで表さない。

### 4.9 体感品質とパフォーマンス

- カード移動は `transform`/`opacity` 主体で約160〜260ms、CPUのカード選択は自然に表示。設定 `reducedMotion:on` または端末設定時は移動アニメーションを省略して即更新。
- 効果音: カード選択／配布／成功／失敗（合成音）。`soundEnabled:false` が既定。AudioContextはユーザー操作後だけ開始。音声利用不可でゲーム停止禁止。
- アニメーションの完了イベントにゲーム状態確定を依存させない。アニメーションが省略されても勝敗判定や次手番は進む。
- 未必要な画像や動画、外部CDNを不要にする。`prefers-reduced-motion`、コントラスト、ポインターの有無をチェックする。

### 4.10 型と状態不変条件

- クロンダイク: 7列、4組札、すべての保持カード合計52、同IDなし。表向き列は降順交互色、伏せ札は列の上側にだけあり、列が非空なら最上位は表向き。
- 神経衰弱: `tiles.length===pairs*2`、対応pairKeyが必ず2枚、`pairsWon`合計は実際のmatchedペア数、`pickedTileIds.length<=2`。
- ババ抜き: 初期カードは53枚。手札から取り除いたペアは`discarded`に保持し、全hands＋discardedが常に53枚。最後は唯一のJOKERが1枚残る。
- 七並べ: 7は`lanes`にあり手札にない。`lanes`の各ランク範囲が連続で、手札と盤面合わせて52枚。各スートの境界は1..13。
- スピード: 両者のreserve・visible・centersを合わせて52枚、同IDなし。visibleは常に長さ4。空き枠はreserveから即補充。中央札は1枚以上。

### 4.11 実績・称号の解除条件（固定）

| ID | 日本語表示 | 達成条件（未完了・破損記録を除外） |
|---|---|---|
| `first-play` | はじめの一歩 | はじめて任意のゲームを`finished`にした |
| `first-win` | はじめての勝利 | `outcome=win`の結果が1件 |
| `klondike-clear` | クロンダイク達人 | クロンダイクを1回完成 |
| `memory-perfect` | 完璧な記憶 | 1人用神経衰弱で誤一致0回かつ8ペア以上を完成 |
| `memory-26` | 記憶の王者 | 26ペアの神経衰弱を完成 |
| `oldmaid-survivor` | ジョーカー回避 | ババ抜きで人間が敗者にならない |
| `sevens-first` | 最速の七並べ | 七並べで人間が1位で上がる |
| `speed-win` | スピードスター | スピードでCPUより先に手札を0にする |
| `five-types` | 五種目制覇 | 5ゲームそれぞれで少なくとも1回`finished`にする |
| `ten-wins` | 常勝プレイヤー | `outcome=win`が累計10件（solo`completed`は含まない） |

解除条件が成立した時点で`unlockedAt`を記録。達成はローカルの記録に基づく（不正を防ぐ権威あるサーバーはない）。同一`sessionId`で二度加算しない。難易度やモードに依存する条件は表の通り。

## 5. エラーハンドリング・例外処理

### 5.1 エラーコードと表示文言

| コード／条件 | 画面表示 | フォールバック |
|---|---|---|
| `INVALID_ACTION` 不正／型不一致 | 「この操作はできません」 | 状態そのまま。再度選択を許可 |
| `INVALID_PHASE` 停止・終了後入力 | 「ゲームを再開してから操作してください」 | 不正アクション無視 |
| `NOT_YOUR_TURN` CPU進行中 | 「CPUの手番です」 | 状態不変、連打防止 |
| `ILLEGAL_MOVE` 置けないカード | 「そのカードはここに置けません」 | 選択維持または解除、合法箇所を示す |
| `CARD_NOT_FOUND` 選択札が既に消えた | 「カードが更新されました。選び直してください」 | 選択解除／最新盤面を再描画 |
| `SAVE_FAILED` 容量・権限なし | 「この端末に保存できません。終了すると結果が失われる場合があります」 | プレイ続行、再保存試行は次の操作時 |
| `DATA_CORRUPT` 保存JSON破損 | 「保存データを読み込めません。新しいゲームは開始できます」 | 破損原本を上書きしない。確認のうえ初期化可能 |
| `UNSUPPORTED_VERSION` 将来版保存 | 「新しいバージョンのデータです。このサイトでは復元できません」 | 初期化せず一時プレイのみ |
| `AUDIO_UNAVAILABLE` 音声不許可 | 「効果音を再生できません。ゲームは続行できます」 | 音声なし |
| 画面が閉じられた | 次回起動時「前回のゲームを再開」 | 最新正常スナップショットを復元 |
| CPUで合法手0 | 七並べは強制パス／神経衰弱は無効牌を除外して再選択／Speedは中央札更新条件を確認 | 未定義ループを防止 |
| チェック失敗・不整合 | 「保存状態に矛盾があります。保存したゲームからは再開できません」 | クラッシュせず保存スロットを保護 |
| 未定義URL | 「ページが見つかりません」 | ホームへ戻る導線 |

### 5.2 リカバリー・安全性

- `try/catch` と値検証を明示し、空のcatchは禁止。consoleへ機密データやデッキ全体を出さない。
- 乱数が取得できない場合は偏った固定デッキに切り替えず、開始失敗と明示する。
- イベントを同時に受けた場合、毎回直近stateに対し原子的にreducerを通す（Reactの関数型state更新）。古い参照に基づくCPU操作は再計算、または棄却。
- `requestAnimationFrame` の未解放、タイマー重複、マウス操作のキャンセル、`pointercancel`、タブ非表示時の自動pauseに対応。
- 本文・設定入力はすべてプレーンなテキスト。外部HTMLの挿入はしない。生のDOM `innerHTML` にユーザー入力を入れない。
- キャッシュ破損後の「全データ消去」は確認ダイアログ2段階にし、操作対象のストレージキーのみ削除。他のアプリのlocalStorageを消さない。
- Browser `storage` イベントで同一オリジン別タブの変更を検出したら通知「別タブでデータが更新されました」。プレイ状態を自動マージしない（競合時は上書き前に確認）。

## 6. 特記事項・制約

### 6.1 正本優先順位・スコープ

優先順位: **(1)本書 > (2) `GAME_RULES_AND_CPU.md` のゲーム詳細（ただし本書に明示ない項目を補う） > (3)`ACCEPTANCE_MATRIX.md` > (4) `IMPLEMENTATION_PLAN.md` > (5)デザインCSS/README**。競合が見つかった場合は実装を中断せず重要な安全・ゲーム進行問題をチケット化し、上位文書に従って修正。ルール変更が必要なら両文書とテストを同時更新する。

当初のデザインはClassic Casino Tableに確定。ゲーム5種、1人＋CPU対戦、6つの追加機能すべて必須。実際の金銭、掛け金、対人オンラインは実装しない。表記は日本語を基本とする。JavaScriptがない環境では「JavaScriptを有効にしてください」を表示。

**ローカルルールの明示:** クロンダイク=ドロー1＋組札・列への手動移動、山札の循環無制限。神経衰弱=同ランク・同色ペア。ババ抜き=ジョーカー1枚、4名。七並べ=自発パス3回、合法手なし強制パス可。Speed=AとKを隣接扱い、中央更新時は残り補充から各1枚（片方だけ残りがある場合は片方のみ）。ゲーム開始前のルール画面にも明記。

### 6.2 実装フェーズ・成果物

- **Phase 0**: リポジトリ調査と環境確認。既存プロジェクトならバックアップ作成。
- **Phase 1**: 型・カード生成・RNG・保存・共通UI・ページ遷移。
- **Phase 2**: ソリティア／神経衰弱＋テスト。
- **Phase 3**: ババ抜き／七並べ＋CPU公平性テスト。
- **Phase 4**: スピード＋タイマー・音声・アニメ・ヒント／Undo。
- **Phase 5**: 戦績・ローカルランキング・実績・設定／再開、回帰テスト。
- **Phase 6**: E2E/モバイル/キーボード/コントラスト確認、ビルド、納品と不足一覧。

**完了定義**: 全5ゲームが開始→プレイ→正しく終了する。中断と復帰、戦績、スキン、音声、実績、各PC・スマホUIが動く。`npm run build`が通り、テストはP/F/SKIPと理由が報告される。未検証をPASSと記載しない。デモ画面だけ完成した状態を「完成」と呼ばない。

### 6.3 受け入れ試験（必要条件）

`tests/ACCEPTANCE_MATRIX.md` の各条件を**再現可能な操作・入力・期待結果**で検証する。加えて以下の品質ゲートを必須とする。

1. 52/53枚のカード重複・消失なし。パス・配札・山札巡回・勝敗確定時の不変条件が常に満たされる。
2. CPUは伏せ札情報を読めない。easy / normal / hardの差が合理的な手番選択または反応速度に現れる。
3. 低速・中断・再開・非表示・タブ多重起動で二重勝利、二重保存、CPU暴走が起こらない。
4. キーボードだけで全5ゲームを開始・主要操作・終了できる。モバイルは全てタップ操作可能。
5. `prefers-reduced-motion` と音声OFF時にゲームの進行・採点が同じである。
6. `localStorage`破損・容量超過に対しても既存記録を暗黙削除しない。
7. 戦績とランキングを誤ってオンラインと表現しない。
8. 結果で解除した実績と`records`・`processedSessionIds` が同期し、二重解除しない。

### 6.4 追加の実装禁止・報告

- 使わないAPI/DB/認証の導入禁止。
- 実装済みでないサーバー同期・オンライン対戦・ランキングをできると説明しない。
- CSS見た目のためにメインゲームの判定関数を変更しない。
- ゲームルール・CPU判断をコンポーネント内へ複製しない。
- 最終報告に**変更ファイル、操作方法、起動コマンド、実行したテスト、未実装／未確認、外部依存の有無**を必ず明記。
- 本書納品時点では**アプリの実装やブラウザ動作試験は未実施**。Claude Codeによる実装後に検証する。

