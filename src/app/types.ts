import type {
  KlondikeSession,
  OldMaidSession,
  SevensSession,
  SpeedSession,
  TableRecord,
} from "../games/table/types.ts";
export type GameId = "klondike" | "memory" | "oldMaid" | "sevens" | "speed";
export type Suit = "S" | "H" | "D" | "C";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type CardId = `${Suit}-${Rank}` | "JOKER";
export type Actor = "human" | "cpu1";
export type Difficulty = "easy" | "normal" | "hard";
export type Outcome = "completed" | "win" | "loss" | "draw";
export interface Card {
  readonly id: CardId;
  readonly suit: Suit | null;
  readonly rank: Rank | null;
  readonly isJoker: boolean;
}
export interface RngState {
  seed: number;
  state: number;
}
export interface MemoryConfig {
  mode: "solo" | "vsCpu";
  pairs: 8 | 12 | 26;
  difficulty: Difficulty | null;
}
export interface MemoryTile {
  tileId: string;
  cardId: CardId;
  pairKey: string;
  faceUp: boolean;
  matched: boolean;
}
export interface SessionResult {
  outcome: Outcome;
  elapsedMs: number;
  finishedAt: number;
  score: number;
  stats: Record<string, number>;
}
export interface MemorySession {
  schemaVersion: 1;
  sessionId: string;
  gameId: "memory";
  phase: "playing" | "paused" | "finished";
  createdAt: number;
  updatedAt: number;
  clock: { elapsedMs: number; lastStartedAt: number | null };
  rng: RngState;
  config: MemoryConfig;
  moveCount: number;
  hintCount: number;
  assistUsed: boolean;
  result: SessionResult | null;
  tiles: MemoryTile[];
  turn: Actor;
  pickedTileIds: string[];
  resolution: "idle" | "mismatch";
  pairsWon: Record<Actor, number>;
  attempts: Record<Actor, number>;
  cpuMemory: string[];
  cpuObserved: Record<string, string>;
}
export interface CpuObservation {
  known: { tileId: string; pairKey: string }[];
  eligibleHiddenTileIds: string[];
  firstOpened: { tileId: string; pairKey: string } | null;
}
export type MemoryAction =
  | { kind: "FLIP"; tileId: string; actor: Actor }
  | { kind: "RESOLVE" }
  | { kind: "CPU" }
  | { kind: "PAUSE" }
  | { kind: "RESUME" }
  | { kind: "HINT" };
export type ActionResult =
  | { ok: true; state: MemorySession; message: string }
  | { ok: false; state: MemorySession; error: string };
export interface Settings {
  schemaVersion: 1;
  tableTheme: "emerald" | "midnight" | "burgundy";
  cardBackTheme: "royal" | "geometric" | "classic";
  appTheme: "dark" | "light" | "system";
  reducedMotion: "system" | "on" | "off";
}
export interface MemoryGameRecord {
  sessionId: string;
  gameId: "memory";
  config: MemoryConfig;
  configLabel: string;
  outcome: Outcome;
  elapsedMs: number;
  hints: number;
  assisted: boolean;
  stats: Record<string, number>;
  finishedAt: number;
}
export type GameRecord = MemoryGameRecord | TableRecord;
export interface StoredData {
  schemaVersion: 1;
  settings: Settings;
  saves: {
    memory?: MemorySession;
    klondike?: KlondikeSession;
    oldMaid?: OldMaidSession;
    sevens?: SevensSession;
    speed?: SpeedSession;
  };
  records: GameRecord[];
  processedSessionIds: string[];
}
