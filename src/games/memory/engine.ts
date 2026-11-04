import type {
  MemorySession,
  MemoryConfig,
  MemoryAction,
  ActionResult,
  CpuObservation,
  RngState,
} from "../../app/types.ts";
import {
  makeDeck,
  pairKey,
  shuffle,
  rng,
  nextRng,
  sessionId,
} from "../../core/cards.ts";
export const elapsed = (s: MemorySession, now: number): number =>
  s.clock.elapsedMs +
  (s.phase === "playing" && s.clock.lastStartedAt !== null
    ? Math.max(0, now - s.clock.lastStartedAt)
    : 0);
export function createMemory(
  config: MemoryConfig,
  seed: number,
  now = Date.now(),
  id = sessionId(),
): MemorySession {
  let state = rng(seed);
  const all = makeDeck();
  const keys = [...new Set(all.map((c) => pairKey(c.id)))];
  const [shuffledKeys, r1] = shuffle(keys, state);
  const chosen = new Set(shuffledKeys.slice(0, config.pairs));
  const [cards, r2] = shuffle(
    all.filter((c) => chosen.has(pairKey(c.id))),
    r1,
  );
  state = r2;
  return {
    schemaVersion: 1,
    sessionId: id,
    gameId: "memory",
    phase: "playing",
    createdAt: now,
    updatedAt: now,
    clock: { elapsedMs: 0, lastStartedAt: now },
    rng: state,
    config: {
      ...config,
      difficulty:
        config.mode === "solo" ? null : (config.difficulty ?? "normal"),
    },
    moveCount: 0,
    hintCount: 0,
    assistUsed: false,
    result: null,
    tiles: cards.map((c, i) => ({
      tileId: `tile-${i}`,
      cardId: c.id,
      pairKey: pairKey(c.id),
      faceUp: false,
      matched: false,
    })),
    turn: "human",
    pickedTileIds: [],
    resolution: "idle",
    pairsWon: { human: 0, cpu1: 0 },
    attempts: { human: 0, cpu1: 0 },
    cpuMemory: [],
    cpuObserved: {},
  };
}
export function observation(s: MemorySession): CpuObservation {
  const hidden = s.tiles
    .filter((t) => !t.faceUp && !t.matched)
    .map((t) => t.tileId);
  const first = s.tiles.find(
    (t) => s.pickedTileIds[0] === t.tileId && t.faceUp,
  );
  return {
    known: s.cpuMemory
      .filter((id) => hidden.includes(id))
      .flatMap((id) => {
        const k = s.cpuObserved[id];
        return k ? [{ tileId: id, pairKey: k }] : [];
      }),
    eligibleHiddenTileIds: hidden,
    firstOpened: first
      ? { tileId: first.tileId, pairKey: first.pairKey }
      : null,
  };
}
export function chooseCpu(
  view: CpuObservation,
  initial: RngState,
): { tileId: string; rng: RngState } | null {
  if (view.firstOpened) {
    const match = view.known.find(
      (k) => k.pairKey === view.firstOpened?.pairKey,
    );
    if (match) return { tileId: match.tileId, rng: initial };
  } else {
    for (const card of view.known)
      if (
        view.known.some(
          (c) => c.tileId !== card.tileId && c.pairKey === card.pairKey,
        )
      )
        return { tileId: card.tileId, rng: initial };
  }
  const unknown = view.eligibleHiddenTileIds.filter(
    (id) => !view.known.some((k) => k.tileId === id),
  );
  const pool = unknown.length ? unknown : view.eligibleHiddenTileIds;
  if (!pool.length) return null;
  const [n, next] = nextRng(initial);
  const tileId = pool[Math.floor(n * pool.length)];
  return tileId ? { tileId, rng: next } : null;
}
function observe(s: MemorySession, tileId: string, key: string): void {
  s.cpuMemory = [...s.cpuMemory.filter((id) => id !== tileId), tileId];
  s.cpuObserved[tileId] = key;
  const limit =
    s.config.difficulty === "easy"
      ? 2
      : s.config.difficulty === "normal"
        ? 6
        : Infinity;
  while (s.cpuMemory.length > limit) {
    const id = s.cpuMemory.shift();
    if (id) delete s.cpuObserved[id];
  }
}
export function reduceMemory(
  previous: MemorySession,
  action: MemoryAction,
  now = Date.now(),
): ActionResult {
  const fail = (error: string): ActionResult => ({
    ok: false,
    state: previous,
    error,
  });
  if (previous.phase === "finished")
    return fail("このゲームは終了しています。");
  if (action.kind === "RESUME") {
    if (previous.phase !== "paused") return fail("すでにプレイ中です。");
    return {
      ok: true,
      state: {
        ...previous,
        phase: "playing",
        updatedAt: now,
        clock: { ...previous.clock, lastStartedAt: now },
      },
      message: "再開しました。",
    };
  }
  if (previous.phase !== "playing")
    return fail("一時停止中です。再開してください。");
  if (action.kind === "PAUSE")
    return {
      ok: true,
      state: {
        ...previous,
        phase: "paused",
        updatedAt: now,
        clock: { elapsedMs: elapsed(previous, now), lastStartedAt: null },
      },
      message: "一時停止しました。",
    };
  if (action.kind === "HINT")
    return {
      ok: true,
      state: {
        ...previous,
        hintCount: previous.hintCount + 1,
        assistUsed: true,
        updatedAt: now,
      },
      message:
        "同じ数字で、同じ色の2枚がペアです。選べる裏向きカードを1枚めくってみましょう。",
    };
  const s = structuredClone(previous);
  s.updatedAt = now;
  if (action.kind === "RESOLVE") {
    if (s.resolution !== "mismatch")
      return fail("解決する不一致がありません。");
    s.tiles.forEach((t) => {
      if (s.pickedTileIds.includes(t.tileId)) t.faceUp = false;
    });
    s.pickedTileIds = [];
    s.resolution = "idle";
    if (s.config.mode === "vsCpu")
      s.turn = s.turn === "human" ? "cpu1" : "human";
    return {
      ok: true,
      state: s,
      message: s.turn === "human" ? "あなたの番です。" : "CPUの番です。",
    };
  }
  let tileId: string;
  if (action.kind === "CPU") {
    if (s.turn !== "cpu1" || s.config.mode !== "vsCpu")
      return fail("CPUの手番ではありません。");
    const choice = chooseCpu(observation(s), s.rng);
    if (!choice) return fail("選べるカードがありません。");
    tileId = choice.tileId;
    s.rng = choice.rng;
  } else {
    if (action.actor !== s.turn) return fail("あなたの番ではありません。");
    tileId = action.tileId;
  }
  if (s.resolution !== "idle" || s.pickedTileIds.length >= 2)
    return fail("2枚の確認が終わるまでお待ちください。");
  const tile = s.tiles.find((t) => t.tileId === tileId);
  if (!tile || tile.faceUp || tile.matched)
    return fail("そのカードは選べません。");
  tile.faceUp = true;
  s.pickedTileIds.push(tileId);
  s.moveCount++;
  observe(s, tileId, tile.pairKey);
  if (s.pickedTileIds.length === 1)
    return { ok: true, state: s, message: "もう1枚、めくってください。" };
  s.attempts[s.turn]++;
  const first = s.tiles.find((t) => t.tileId === s.pickedTileIds[0]);
  if (!first) return fail("カードが見つかりません。");
  if (first.pairKey !== tile.pairKey) {
    s.resolution = "mismatch";
    return { ok: true, state: s, message: "ペアになりませんでした。" };
  }
  for (const t of [first, tile]) {
    t.matched = true;
    s.cpuMemory = s.cpuMemory.filter((id) => id !== t.tileId);
    delete s.cpuObserved[t.tileId];
  }
  s.pairsWon[s.turn]++;
  s.pickedTileIds = [];
  if (s.tiles.every((t) => t.matched)) {
    const time = elapsed(s, now);
    s.phase = "finished";
    s.clock = { elapsedMs: time, lastStartedAt: null };
    const outcome =
      s.config.mode === "solo"
        ? "completed"
        : s.pairsWon.human > s.pairsWon.cpu1
          ? "win"
          : s.pairsWon.human === s.pairsWon.cpu1
            ? "draw"
            : "loss";
    s.result = {
      outcome,
      elapsedMs: time,
      finishedAt: now,
      score: s.pairsWon.human,
      stats: {
        pairs: s.config.pairs,
        humanPairs: s.pairsWon.human,
        cpuPairs: s.pairsWon.cpu1,
        attempts: s.attempts.human,
      },
    };
    return { ok: true, state: s, message: "ゲーム終了です。" };
  }
  return { ok: true, state: s, message: "ペアです！ 続けてめくれます。" };
}
export function snapshot(s: MemorySession, now: number): MemorySession {
  return {
    ...structuredClone(s),
    phase: "paused",
    updatedAt: now,
    clock: { elapsedMs: elapsed(s, now), lastStartedAt: null },
  };
}
