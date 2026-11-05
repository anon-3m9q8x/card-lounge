import type {
  Actor,
  CardId,
  Difficulty,
  Outcome,
  Rank,
  RngState,
  Suit,
} from "../../app/types.ts";
export type TableGameId =
  "klondike" | "oldMaid" | "sevens" | "speed" | "daifugo" | "uno";
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
/** 大富豪: 場に出ている組(最後に出した人)と、この場でパスした人 */
export interface DaifugoField {
  cards: CardId[];
  by: Participant;
}
export interface DaifugoSession extends TableBase {
  gameId: "daifugo";
  hands: Record<Participant, CardId[]>;
  field: DaifugoField | null;
  pile: CardId[];
  passed: Participant[];
  turn: Participant;
  finishOrder: Participant[];
  revolution: boolean;
  /** 8切り・革命などの直近の出来事(画面表示用) */
  lastEvent: "none" | "eight" | "revolution" | "clear";
}
export type UnoColor = "R" | "Y" | "G" | "B";
/** UNO札のID。例: R5-1(赤5の1枚目) RS-2(赤スキップ) RR-1(赤リバース) RD-1(赤ドロー2) W-1(ワイルド) W4-1(ワイルドドロー4) */
export type UnoCardId = string;
export interface UnoSession extends TableBase {
  gameId: "uno";
  hands: Record<Participant, UnoCardId[]>;
  drawPile: UnoCardId[];
  discard: UnoCardId[];
  color: UnoColor;
  direction: 1 | -1;
  turn: Participant;
  /** 手番の人が山札から引いた札(その札を出すかパスするかを選ぶ) */
  drawn: UnoCardId | null;
  lastEvent: "none" | "skip" | "reverse" | "draw2" | "wild" | "draw4";
}
export type TableSession =
  | KlondikeSession
  | OldMaidSession
  | SevensSession
  | SpeedSession
  | DaifugoSession
  | UnoSession;
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
  | { kind: "SP_PLACE"; actor: Actor; visibleIndex: number; center: Actor }
  | { kind: "DF_PLAY"; actor: Participant; cards: CardId[] }
  | { kind: "DF_PASS"; actor: Participant }
  | { kind: "UN_PLAY"; actor: Participant; cardId: UnoCardId; color?: UnoColor }
  | { kind: "UN_DRAW"; actor: Participant }
  | { kind: "UN_PASS"; actor: Participant };
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
