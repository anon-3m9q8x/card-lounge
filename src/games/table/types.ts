import type {
  Actor,
  CardId,
  Difficulty,
  Outcome,
  Rank,
  RngState,
  Suit,
} from "../../app/types.ts";
export type TableGameId = "klondike" | "oldMaid" | "sevens" | "speed";
export type Participant = "human" | "cpu1" | "cpu2" | "cpu3";
export const seats: Participant[] = ["human", "cpu1", "cpu2", "cpu3"];
export interface TableConfig {
  difficulty: Difficulty;
}
export interface TableBase {
  schemaVersion: 1;
  sessionId: string;
  gameId: TableGameId;
  phase: "playing" | "paused" | "finished";
  createdAt: number;
  updatedAt: number;
  clock: { elapsedMs: number; lastStartedAt: number | null };
  rng: RngState;
  config: TableConfig;
  moveCount: number;
  hintCount: number;
  assistUsed: boolean;
  result: {
    outcome: Outcome;
    elapsedMs: number;
    finishedAt: number;
    score: number | null;
    stats: Record<string, number>;
  } | null;
}
export interface KlondikeFrame {
  stock: CardId[];
  waste: CardId[];
  foundations: Record<Suit, CardId[]>;
  tableau: { down: CardId[]; up: CardId[] }[];
  redealCount: number;
  moveCount: number;
}
export interface KlondikeSession extends TableBase {
  gameId: "klondike";
  frame: KlondikeFrame;
  undoStack: KlondikeFrame[];
}
export interface OldMaidSession extends TableBase {
  gameId: "oldMaid";
  hands: Record<Participant, CardId[]>;
  discarded: CardId[];
  turn: Participant;
  finishOrder: Participant[];
}
export interface Lane {
  low: Rank;
  high: Rank;
}
export interface SevensSession extends TableBase {
  gameId: "sevens";
  hands: Record<Participant, CardId[]>;
  lanes: Record<Suit, Lane>;
  turn: Participant;
  finishOrder: Participant[];
  voluntaryPasses: Record<Participant, number>;
  forcedPasses: Record<Participant, number>;
  stalledTurns: number;
}
export interface SpeedSession extends TableBase {
  gameId: "speed";
  reserve: Record<Actor, CardId[]>;
  visible: Record<Actor, (CardId | null)[]>;
  centers: Record<Actor, CardId[]>;
  resetCount: number;
  lastActor: Actor | null;
}
export type TableSession =
  | KlondikeSession
  | OldMaidSession
  | SevensSession
  | SpeedSession;
export type KlondikePlace =
  | { zone: "waste" }
  | { zone: "foundation"; suit: Suit }
  | { zone: "tableau"; column: number };
export type TableAction =
  | { kind: "PAUSE" }
  | { kind: "RESUME" }
  | { kind: "HINT" }
  | { kind: "CPU" }
  | { kind: "KL_DRAW" }
  | { kind: "KL_UNDO" }
  | { kind: "SP_RESET" }
  | { kind: "KL_MOVE"; from: KlondikePlace; to: KlondikePlace; count: number }
  | { kind: "OM_DRAW"; actor: Participant; targetIndex: number }
  | { kind: "SV_PLACE"; actor: Participant; cardId: CardId }
  | { kind: "SV_PASS"; actor: Participant }
  | { kind: "SP_PLACE"; actor: Actor; visibleIndex: number; center: Actor };
export interface TableRecord {
  sessionId: string;
  gameId: TableGameId;
  config: TableConfig;
  configLabel: string;
  outcome: Outcome;
  elapsedMs: number;
  hints: number;
  assisted: boolean;
  stats: Record<string, number>;
  finishedAt: number;
}
