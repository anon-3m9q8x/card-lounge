import { validTableSession } from "../games/table/validate.ts";
import { tableConfigLabel } from "../games/engine.ts";
import type { GameSession } from "../games/engine.ts";
import type {
  Settings,
  StoredData,
  MemorySession,
  MemoryConfig,
  GameRecord,
  MemoryGameRecord,
} from "../app/types.ts";
import { makeDeck, pairKey } from "./cards.ts";
export const STORAGE_KEY = "card-lounge:v1";
export const defaults: Settings = {
  schemaVersion: 1,
  tableTheme: "emerald",
  cardBackTheme: "royal",
  appTheme: "dark",
  reducedMotion: "system",
};
export const emptyData = (): StoredData => ({
  schemaVersion: 1,
  settings: { ...defaults },
  saves: {},
  records: [],
  processedSessionIds: [],
});
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const unique = (v: readonly string[]): boolean => new Set(v).size === v.length;
const numericRecord = (v: unknown): v is Record<string, number> =>
  object(v) && Object.values(v).every(time);
function config(v: unknown): boolean {
  return (
    object(v) &&
    ["solo", "vsCpu"].includes(String(v.mode)) &&
    [8, 12, 26].includes(Number(v.pairs)) &&
    typeof v.pairs === "number" &&
    (v.mode === "solo"
      ? v.difficulty === null
      : ["easy", "normal", "hard"].includes(String(v.difficulty)))
  );
}
export function validSettings(v: unknown): v is Settings {
  return (
    object(v) &&
    v.schemaVersion === 1 &&
    ["emerald", "midnight", "burgundy"].includes(String(v.tableTheme)) &&
    ["royal", "geometric", "classic"].includes(String(v.cardBackTheme)) &&
    ["dark", "light", "system"].includes(String(v.appTheme)) &&
    ["system", "on", "off"].includes(String(v.reducedMotion))
  );
}
export function validSession(v: unknown): v is MemorySession {
  if (
    !object(v) ||
    v.schemaVersion !== 1 ||
    v.gameId !== "memory" ||
    typeof v.sessionId !== "string" ||
    !v.sessionId ||
    !config(v.config) ||
    !["playing", "paused", "finished"].includes(String(v.phase)) ||
    !["human", "cpu1"].includes(String(v.turn)) ||
    !["idle", "mismatch"].includes(String(v.resolution))
  )
    return false;
  if (
    !time(v.createdAt) ||
    !time(v.updatedAt) ||
    v.updatedAt < v.createdAt ||
    !object(v.clock) ||
    !time(v.clock.elapsedMs) ||
    !(v.clock.lastStartedAt === null || time(v.clock.lastStartedAt))
  )
    return false;
  if (
    !object(v.rng) ||
    !count(v.rng.seed) ||
    !count(v.rng.state) ||
    v.rng.seed === 0 ||
    v.rng.state === 0 ||
    v.rng.seed > 0xffffffff ||
    v.rng.state > 0xffffffff
  )
    return false;
  if (
    !count(v.moveCount) ||
    !count(v.hintCount) ||
    typeof v.assistUsed !== "boolean" ||
    !Array.isArray(v.tiles) ||
    !strings(v.pickedTileIds) ||
    !unique(v.pickedTileIds) ||
    v.pickedTileIds.length > 2 ||
    !strings(v.cpuMemory) ||
    !unique(v.cpuMemory) ||
    !object(v.cpuObserved)
  )
    return false;
  for (const key of ["pairsWon", "attempts"]) {
    const x = v[key];
    if (!object(x) || !count(x.human) || !count(x.cpu1)) return false;
  }
  const cards = new Map(makeDeck().map((c) => [c.id as string, c]));
  for (const t of v.tiles)
    if (
      !object(t) ||
      typeof t.tileId !== "string" ||
      !t.tileId ||
      typeof t.cardId !== "string" ||
      !cards.has(t.cardId) ||
      typeof t.pairKey !== "string" ||
      typeof t.faceUp !== "boolean" ||
      typeof t.matched !== "boolean"
    )
      return false;
  if (
    v.result !== null &&
    (!object(v.result) ||
      !["completed", "win", "loss", "draw"].includes(
        String(v.result.outcome),
      ) ||
      !time(v.result.elapsedMs) ||
      !time(v.result.finishedAt) ||
      !count(v.result.score) ||
      !numericRecord(v.result.stats))
  )
    return false;
  const s = v as unknown as MemorySession;
  if (
    s.tiles.length !== s.config.pairs * 2 ||
    !unique(s.tiles.map((t) => t.tileId)) ||
    !unique(s.tiles.map((t) => t.cardId)) ||
    (s.config.mode === "solo" &&
      (s.turn !== "human" || s.pairsWon.cpu1 !== 0 || s.attempts.cpu1 !== 0))
  )
    return false;
  const keys = new Map<string, number>(),
    matched = new Map<string, number>();
  for (const t of s.tiles) {
    if (pairKey(t.cardId) !== t.pairKey || (t.matched && !t.faceUp))
      return false;
    keys.set(t.pairKey, (keys.get(t.pairKey) ?? 0) + 1);
    if (t.matched) matched.set(t.pairKey, (matched.get(t.pairKey) ?? 0) + 1);
  }
  if (
    [...keys.values()].some((n) => n !== 2) ||
    [...matched.values()].some((n) => n !== 2) ||
    matched.size !== s.pairsWon.human + s.pairsWon.cpu1 ||
    s.attempts.human < s.pairsWon.human ||
    s.attempts.cpu1 < s.pairsWon.cpu1
  )
    return false;
  const open = s.tiles
    .filter((t) => t.faceUp && !t.matched)
    .map((t) => t.tileId);
  if (
    open.length !== s.pickedTileIds.length ||
    open.some((id) => !s.pickedTileIds.includes(id)) ||
    (s.resolution === "mismatch") !== (open.length === 2)
  )
    return false;
  if (
    s.resolution === "mismatch" &&
    new Set(
      s.tiles.filter((t) => open.includes(t.tileId)).map((t) => t.pairKey),
    ).size !== 2
  )
    return false;
  if (
    s.cpuMemory.some(
      (id) =>
        !s.tiles.some(
          (t) =>
            t.tileId === id && !t.matched && t.pairKey === s.cpuObserved[id],
        ),
    ) ||
    Object.keys(s.cpuObserved).some((id) => !s.cpuMemory.includes(id))
  )
    return false;
  if (
    s.cpuMemory.length >
      (s.config.difficulty === "easy"
        ? 2
        : s.config.difficulty === "normal"
          ? 6
          : 52) ||
    (s.hintCount > 0 && !s.assistUsed)
  )
    return false;
  if (
    (s.phase === "playing") !== (s.clock.lastStartedAt !== null) ||
    (s.phase === "finished") !== (s.result !== null) ||
    s.tiles.every((t) => t.matched) !== (s.phase === "finished")
  )
    return false;
  if (s.result) {
    const expected =
      s.config.mode === "solo"
        ? "completed"
        : s.pairsWon.human > s.pairsWon.cpu1
          ? "win"
          : s.pairsWon.human < s.pairsWon.cpu1
            ? "loss"
            : "draw";
    if (
      s.result.outcome !== expected ||
      s.result.score !== s.pairsWon.human ||
      s.result.elapsedMs !== s.clock.elapsedMs
    )
      return false;
  }
  return true;
}
function validRecord(v: unknown): v is GameRecord {
  return (
    object(v) &&
    typeof v.sessionId === "string" &&
    ((v.gameId === "memory" && config(v.config)) ||
      (["klondike", "oldMaid", "sevens", "speed"].includes(String(v.gameId)) &&
        object(v.config) &&
        ["easy", "normal", "hard"].includes(String(v.config.difficulty)))) &&
    typeof v.configLabel === "string" &&
    ["completed", "win", "loss", "draw"].includes(String(v.outcome)) &&
    time(v.elapsedMs) &&
    count(v.hints) &&
    typeof v.assisted === "boolean" &&
    numericRecord(v.stats) &&
    time(v.finishedAt)
  );
}
export function decodeStored(raw: string | null): {
  data: StoredData;
  blocked: boolean;
  warning: string;
} {
  if (raw === null) return { data: emptyData(), blocked: false, warning: "" };
  try {
    const v: unknown = JSON.parse(raw);
    if (!object(v) || v.schemaVersion !== 1)
      return {
        data: emptyData(),
        blocked: true,
        warning:
          "対応外の保存データです。原本を保護し、このタブでのみプレイします。",
      };
    if (
      !validSettings(v.settings) ||
      !object(v.saves) ||
      Object.entries(v.saves).some(
        ([k, slot]) =>
          !["memory", "klondike", "oldMaid", "sevens", "speed"].includes(k) ||
          !(validSession(slot) || validTableSession(slot)) ||
          slot.gameId !== k ||
          slot.phase !== "paused",
      ) ||
      (v.saves.memory !== undefined &&
        (!validSession(v.saves.memory) || v.saves.memory.phase !== "paused")) ||
      !Array.isArray(v.records) ||
      !v.records.every(validRecord) ||
      !strings(v.processedSessionIds) ||
      !unique(v.processedSessionIds) ||
      !unique(v.records.map((r) => r.sessionId))
    )
      throw Error("data");
    return { data: v as unknown as StoredData, blocked: false, warning: "" };
  } catch {
    return {
      data: emptyData(),
      blocked: true,
      warning:
        "保存データを読み込めません。原本は変更せず、一時プレイできます。",
    };
  }
}
export function loadStored(): {
  data: StoredData;
  blocked: boolean;
  warning: string;
} {
  try {
    return decodeStored(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {
      data: emptyData(),
      blocked: true,
      warning: "端末の保存領域を利用できません。このタブでのみプレイします。",
    };
  }
}
export function persist(data: StoredData): string {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return "";
  } catch {
    return "端末に保存できません。ページを閉じると進捗が失われる場合があります。";
  }
}
export const configLabel = (c: MemorySession["config"]): string =>
  `${c.pairs}ペア / ${c.mode === "solo" ? "1人" : `CPU・${{ easy: "初級", normal: "中級", hard: "上級" }[c.difficulty ?? "normal"]}`}`;
export function recordFinished(
  data: StoredData,
  session: GameSession,
): StoredData {
  if (
    !session.result ||
    session.phase !== "finished" ||
    data.processedSessionIds.includes(session.sessionId)
  )
    return data;
  const result = session.result;
  const next = structuredClone(data);
  delete next.saves[session.gameId];
  const common = {
    sessionId: session.sessionId,
    outcome: result.outcome,
    elapsedMs: result.elapsedMs,
    hints: session.hintCount,
    assisted: session.assistUsed,
    stats: result.stats,
    finishedAt: result.finishedAt,
  };
  if (session.gameId === "memory")
    next.records.push({
      ...common,
      gameId: "memory",
      config: session.config,
      configLabel: configLabel(session.config),
    });
  else
    next.records.push({
      ...common,
      gameId: session.gameId,
      config: session.config,
      configLabel: tableConfigLabel(session.gameId, session.config),
    });
  next.records = next.records.slice(-500);
  next.processedSessionIds = [
    ...next.processedSessionIds,
    session.sessionId,
  ].slice(-1000);
  return next;
}
export function ranking(
  records: readonly GameRecord[],
  config: MemoryConfig,
): MemoryGameRecord[] {
  return records
    .filter((r): r is MemoryGameRecord => r.gameId === "memory")
    .filter(
      (r) =>
        configLabel(r.config) === configLabel(config) &&
        !r.assisted &&
        (r.outcome === "completed" || r.outcome === "win"),
    )
    .sort((a, b) =>
      config.mode === "solo"
        ? a.elapsedMs - b.elapsedMs ||
          (a.stats.attempts ?? 0) - (b.stats.attempts ?? 0)
        : (b.stats.humanPairs ?? 0) - (a.stats.humanPairs ?? 0) ||
          a.elapsedMs - b.elapsedMs,
    )
    .slice(0, 10);
}
