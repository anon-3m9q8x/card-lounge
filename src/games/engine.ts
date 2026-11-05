import type {
  MemoryAction,
  MemorySession,
  GameRecord,
  StoredData,
} from "../app/types.ts";
import type {
  TableAction,
  TableSession,
  TableConfig,
  TableGameId,
} from "./table/types.ts";
import {
  reduceMemory,
  snapshot as memorySnapshot,
  elapsed as memoryElapsed,
} from "./memory/engine.ts";
import { reduceTable, tableElapsed, tableNames } from "./table/engine.ts";
import { validTableSession } from "./table/validate.ts";
export type GameSession = MemorySession | TableSession;
export type GameAction = MemoryAction | TableAction;
export const elapsedGame = (s: GameSession, now: number) =>
  s.gameId === "memory" ? memoryElapsed(s, now) : tableElapsed(s, now);
export function gameSnapshot<T extends GameSession>(s: T, now: number): T {
  return {
    ...structuredClone(s),
    phase: "paused",
    updatedAt: now,
    clock: { elapsedMs: elapsedGame(s, now), lastStartedAt: null },
  };
}
export function reduceGame(
  previous: GameSession,
  action: GameAction,
  now = Date.now(),
):
  | { ok: true; state: GameSession; message: string }
  | { ok: false; state: GameSession; error: string } {
  if (previous.gameId === "memory") {
    switch (action.kind) {
      case "FLIP":
      case "RESOLVE":
      case "CPU":
      case "PAUSE":
      case "RESUME":
      case "HINT":
        return reduceMemory(previous, action, now);
      default:
        return {
          ok: false,
          state: previous,
          error: "このゲームでは使えない操作です。",
        };
    }
  }
  if (action.kind === "FLIP" || action.kind === "RESOLVE")
    return {
      ok: false,
      state: previous,
      error: "このゲームでは使えない操作です。",
    };
  return reduceTable(previous, action, now);
}
export function saveGame(data: StoredData, s: GameSession, now: number) {
  switch (s.gameId) {
    case "memory":
      data.saves.memory = memorySnapshot(s, now);
      break;
    case "klondike":
      data.saves.klondike = gameSnapshot(s, now);
      break;
    case "oldMaid":
      data.saves.oldMaid = gameSnapshot(s, now);
      break;
    case "sevens":
      data.saves.sevens = gameSnapshot(s, now);
      break;
    case "speed":
      data.saves.speed = gameSnapshot(s, now);
      break;
    case "daifugo":
      data.saves.daifugo = gameSnapshot(s, now);
      break;
    case "uno":
      data.saves.uno = gameSnapshot(s, now);
  }
}
export const tableConfigLabel = (id: TableGameId, c: TableConfig) =>
  id === "klondike"
    ? "ドロー1 / 再循環無制限"
    : id === "oldMaid"
      ? "4人 / ジョーカー1枚"
      : `CPU・${{ easy: "初級", normal: "中級", hard: "上級" }[c.difficulty]}`;
export const gameTitle = (id: GameSession["gameId"]) =>
  id === "memory" ? "神経衰弱" : tableNames[id];
export const isTableRecord = (
  record: GameRecord,
): record is Exclude<GameRecord, { gameId: "memory" }> =>
  record.gameId !== "memory";
export { validTableSession };
