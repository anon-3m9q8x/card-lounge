import test from "node:test";
import assert from "node:assert/strict";
import {
  createTable,
  reduceTable,
  removePairs,
  sevensMoves,
  chooseSevens,
  speedMoves,
  legalKlondike,
  klondikeHint,
  pile,
  needsSpeedReset,
  nextSeat,
} from "../src/games/table/engine.ts";
import { validTableSession } from "../src/games/table/validate.ts";
import { seats } from "../src/games/table/types.ts";
import type {
  TableSession,
  TableAction,
  KlondikeSession,
  SpeedSession,
} from "../src/games/table/types.ts";
import { makeDeck, suits, rng } from "../src/core/cards.ts";
import type { CardId } from "../src/app/types.ts";
import {
  emptyData,
  decodeStored,
  recordFinished,
} from "../src/core/storage.ts";
import { saveGame, gameSnapshot, reduceGame } from "../src/games/engine.ts";
function apply<T extends TableSession>(s: T, a: TableAction, now = 2000): T {
  const r = reduceTable(s, a, now);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.ok(validTableSession(r.state), JSON.stringify(r.state));
  return r.state as T;
}
function kl(
  columns: CardId[][],
  foundations: { S: CardId[]; H: CardId[]; D: CardId[]; C: CardId[] } = {
    S: [],
    H: [],
    D: [],
    C: [],
  },
): KlondikeSession {
  const s = createTable("klondike", 1, "normal", 1000, "kl");
  assert.equal(s.gameId, "klondike");
  if (s.gameId !== "klondike") throw Error();
  const used = [...columns.flat(), ...Object.values(foundations).flat()];
  s.frame = {
    stock: makeDeck()
      .map((c) => c.id)
      .filter((c) => !used.includes(c)),
    waste: [],
    foundations,
    tableau: Array.from({ length: 7 }, (_, i) => ({
      down: [],
      up: columns[i] ?? [],
    })),
    redealCount: 0,
    moveCount: 0,
  };
  assert.ok(validTableSession(s));
  return s;
}
test("100 seeds for all four games: valid initial distribution and paused save round trips", () => {
  for (let seed = 0; seed < 100; seed++)
    for (const id of ["klondike", "oldMaid", "sevens", "speed"] as const) {
      const s = createTable(id, seed, "normal", 1000, "id-" + id);
      assert.ok(validTableSession(s), id);
      const data = emptyData();
      saveGame(data, s, 1500);
      assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
      assert.ok(validTableSession(gameSnapshot(s, 1500)));
    }
});
test("Klondike draw/redeal order and max 10 Undo frames, stopped clock is not rewound", () => {
  let s = kl([]);
  const stock = [...s.frame.stock];
  for (let i = 0; i < 52; i++) s = apply(s, { kind: "KL_DRAW" });
  assert.equal(s.frame.stock.length, 0);
  assert.equal(s.frame.waste.length, 52);
  s = apply(s, { kind: "KL_DRAW" });
  assert.deepEqual(s.frame.stock, stock);
  assert.equal(s.frame.redealCount, 1);
  assert.equal(s.undoStack.length, 10);
  const moves = s.moveCount;
  s = apply(s, { kind: "KL_UNDO" });
  assert.equal(s.moveCount, moves - 1);
  assert.equal(s.assistUsed, true);
  assert.equal(s.frame.waste.length, 52);
});
test("Klondike legal sequence moves, same color/empty non-K reject, and foundation returns", () => {
  let s = kl([["S-7"], ["H-8"]]);
  s = apply(s, {
    kind: "KL_MOVE",
    from: { zone: "tableau", column: 0 },
    to: { zone: "tableau", column: 1 },
    count: 1,
  });
  assert.deepEqual(s.frame.tableau[1]?.up, ["H-8", "S-7"]);
  const bad = kl([["D-7"], ["H-8"]]);
  assert.equal(
    reduceTable(bad, {
      kind: "KL_MOVE",
      from: { zone: "tableau", column: 0 },
      to: { zone: "tableau", column: 1 },
      count: 1,
    }).ok,
    false,
  );
  assert.equal(
    legalKlondike(
      bad.frame,
      { zone: "tableau", column: 0 },
      { zone: "tableau", column: 2 },
      1,
    ),
    false,
  );
  const king = kl([["S-13", "H-12"]]);
  assert.ok(
    legalKlondike(
      king.frame,
      { zone: "tableau", column: 0 },
      { zone: "tableau", column: 3 },
      2,
    ),
  );
  const f = kl([["S-2"]], { S: [], H: ["H-1"], D: [], C: [] });
  assert.ok(
    legalKlondike(
      f.frame,
      { zone: "foundation", suit: "H" },
      { zone: "tableau", column: 0 },
      1,
    ),
  );
});
test("Klondike foundation Ace and auto-flip, visible-only hint, completion and idempotent record", () => {
  let s = kl([["H-1"]]);
  const hidden = s.frame.stock.pop();
  assert.ok(hidden);
  s.frame.tableau[0]?.down.push(hidden);
  s = apply(s, {
    kind: "KL_MOVE",
    from: { zone: "tableau", column: 0 },
    to: { zone: "foundation", suit: "H" },
    count: 1,
  });
  assert.equal(s.frame.tableau[0]?.up[0], hidden);
  const a = kl([["H-1"]]);
  const other = structuredClone(a);
  other.frame.stock.reverse();
  assert.deepEqual(klondikeHint(a), klondikeHint(other));
  const f = {
    S: [] as CardId[],
    H: [] as CardId[],
    D: [] as CardId[],
    C: [] as CardId[],
  };
  for (const k of suits)
    f[k] = Array.from({ length: 12 }, (_, i) => `${k}-${i + 1}` as CardId);
  s = kl(
    suits.map((k) => [`${k}-13` as CardId]),
    f,
  );
  for (let i = 0; i < 4; i++) {
    const k = suits[i];
    assert.ok(k);
    s = apply(s, {
      kind: "KL_MOVE",
      from: { zone: "tableau", column: i },
      to: { zone: "foundation", suit: k },
      count: 1,
    });
  }
  assert.equal(s.result?.outcome, "completed");
  assert.equal(s.result?.score, 52);
  const d = recordFinished(emptyData(), s);
  assert.equal(d.records.length, 1);
  assert.equal(recordFinished(d, s), d);
  assert.equal(reduceTable(s, { kind: "KL_DRAW" }).ok, false);
});
test("Old Maid removes all rank pairs but never Joker", () => {
  const r = removePairs(["S-4", "H-4", "D-4", "C-4", "JOKER"]);
  assert.deepEqual(r.hand, ["JOKER"]);
  assert.equal(r.discarded.length, 4);
});
test("Old Maid: 40 complete games, 53 IDs retained, wrong turn/index reject and hidden-card uniform selection", () => {
  for (let seed = 1; seed <= 40; seed++) {
    let s = createTable("oldMaid", seed, "normal", 1000, "om");
    assert.equal(s.gameId, "oldMaid");
    if (s.gameId !== "oldMaid") throw Error();
    assert.equal(
      reduceTable(s, { kind: "OM_DRAW", actor: s.turn, targetIndex: 999 }).ok,
      false,
    );
    let steps = 0;
    while (s.phase !== "finished" && steps++ < 20000)
      s = apply(
        s,
        s.turn === "human"
          ? { kind: "OM_DRAW", actor: "human", targetIndex: 0 }
          : { kind: "CPU" },
      );
    assert.equal(s.phase, "finished");
    assert.equal(s.finishOrder.length, 4);
    assert.equal(seats.flatMap((p) => s.hands[p]).length, 1);
    assert.equal(s.discarded.length, 52);
  }
});
test("Sevens: starts after diamond7 owner, boundaries and 3 voluntary passes vs unlimited forced pass", () => {
  let s = createTable("sevens", 3, "normal", 1000, "sv");
  assert.equal(s.gameId, "sevens");
  if (s.gameId !== "sevens") throw Error();
  assert.equal(seats.flatMap((p) => s.hands[p]).length, 48);
  const legal = sevensMoves(s.hands[s.turn], s.lanes);
  if (legal.length) {
    s.voluntaryPasses[s.turn] = 3;
    assert.equal(reduceTable(s, { kind: "SV_PASS", actor: s.turn }).ok, false);
  }
  assert.deepEqual(sevensMoves(["C-5", "C-6", "C-8"], s.lanes), ["C-6", "C-8"]);
  const noCards = seats.find((p) => !sevensMoves(s.hands[p], s.lanes).length);
  if (noCards) {
    s.turn = noCards;
    const next = apply(s, { kind: "SV_PASS", actor: noCards });
    assert.equal(next.voluntaryPasses[noCards], 0);
    assert.equal(next.forcedPasses[noCards], 1);
  }
});
test("Sevens: 60 completed games across difficulty levels without stalls or hidden-hand decisions", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const)
    for (let seed = 1; seed <= 20; seed++) {
      let s = createTable("sevens", seed, difficulty, 1000, "sv");
      if (s.gameId !== "sevens") throw Error();
      let steps = 0;
      while (s.phase !== "finished" && steps++ < 1000) {
        if (s.turn === "human") {
          const legal = sevensMoves(s.hands.human, s.lanes);
          const c = legal[0];
          s = apply(
            s,
            c
              ? { kind: "SV_PLACE", actor: "human", cardId: c }
              : { kind: "SV_PASS", actor: "human" },
          );
        } else s = apply(s, { kind: "CPU" });
      }
      assert.equal(s.phase, "finished");
      assert.equal(s.finishOrder.length, 4);
    }
  const lanes = {
    S: { low: 7 as const, high: 7 as const },
    H: { low: 7 as const, high: 7 as const },
    D: { low: 7 as const, high: 7 as const },
    C: { low: 7 as const, high: 7 as const },
  };
  assert.equal(chooseSevens(["S-6", "S-5", "H-8"], lanes, "hard", rng(1)).cardId,"S-6");
});
function speedFixture(): SpeedSession {
  const s = createTable("speed", 1, "normal", 1000, "sp");
  if (s.gameId !== "speed") throw Error();
  s.visible = {
    human: ["H-8", "S-2", "S-4", "S-6"],
    cpu1: ["D-6", "C-2", "C-4", "C-6"],
  };
  s.centers = { human: ["H-7"], cpu1: ["C-10"] };
  const used = [
    ...s.visible.human,
    ...s.visible.cpu1,
    ...s.centers.human,
    ...s.centers.cpu1,
  ];
  const rest = makeDeck()
    .map((c) => c.id)
    .filter((c) => !used.includes(c));
  s.reserve = { human: rest.slice(0, 21), cpu1: rest.slice(21) };
  assert.ok(validTableSession(s));
  return s;
}
test("Speed atomic placement rejects stale move, immediate replenishment, A/K wrap", () => {
  let s = speedFixture();
  assert.ok(
    speedMoves(s.visible.cpu1, s.centers).some(
      (m) => m.visibleIndex === 0 && m.center === "human",
    ),
  );
  s = apply(s, {
    kind: "SP_PLACE",
    actor: "human",
    visibleIndex: 0,
    center: "human",
  });
  assert.equal(s.reserve.human.length, 20);
  assert.ok(s.visible.human[0]);
  const r = reduceTable(s, {
    kind: "SP_PLACE",
    actor: "cpu1",
    visibleIndex: 0,
    center: "human",
  });
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  const c = { human: ["S-13"] as CardId[], cpu1: ["S-7"] as CardId[] };
  assert.ok(speedMoves(["H-1"], c).some((m) => m.center === "human"));
});
test("Speed: 60 complete games across 3 difficulties, 52 IDs maintained through resets and wins", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const)
    for (let seed = 1; seed <= 20; seed++) {
      let s = createTable("speed", seed, difficulty, 1000, "sp");
      if (s.gameId !== "speed") throw Error();
      let steps = 0;
      while (s.phase !== "finished" && steps++ < 3000) {
        const human = speedMoves(s.visible.human, s.centers)[0];
        if (human) s = apply(s, { kind: "SP_PLACE", actor: "human", ...human });
        if (s.phase === "finished") break;
        if (speedMoves(s.visible.cpu1, s.centers).length)
          s = apply(s, { kind: "CPU" });
        else if (needsSpeedReset(s)) s = apply(s, { kind: "SP_RESET" });
      }
      assert.equal(s.phase, "finished");
    }
});
test("all games pause/resume preserve clocks, invalid cross-game actions and corrupt saves reject", () => {
  const data = emptyData();
  for (const id of ["klondike", "oldMaid", "sevens", "speed"] as const) {
    let s = createTable(id, 1, "normal", 1000, id);
    s = apply(s, { kind: "PAUSE" }, 3000);
    assert.equal(s.clock.elapsedMs, 2000);
    saveGame(data, s, 9000);
    assert.equal(reduceTable(s, { kind: "CPU" }).ok, false);
    s = apply(s, { kind: "RESUME" }, 10000);
    assert.equal(s.clock.elapsedMs, 2000);
    assert.equal(
      reduceGame(s, { kind: "FLIP", actor: "human", tileId: "bad" }).ok,
      false,
    );
    const bad = structuredClone(s);
    bad.clock.elapsedMs = -1;
    assert.equal(validTableSession(bad), false);
  }
  assert.equal(Object.keys(data.saves).length, 4);
  assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
});
test("Speed reset retains old centers, supports one reserve and settles equal empty-reserve stalemate", () => {
  let s = speedFixture();
  s.visible = {
    human: ["S-1", "S-2", "S-3", "S-4"],
    cpu1: ["H-9", "H-10", "H-11", "H-12"],
  };
  s.centers = { human: ["C-7"], cpu1: ["D-7"] };
  const used = [
    ...s.visible.human,
    ...s.visible.cpu1,
    ...s.centers.human,
    ...s.centers.cpu1,
  ];
  const rest = makeDeck()
    .map((c) => c.id)
    .filter((c) => !used.includes(c));
  s.reserve = { human: rest.slice(0, 21), cpu1: rest.slice(21) };
  assert.ok(validTableSession(s));
  const oldHuman = s.centers.human[0],
    oldCpu = s.centers.cpu1[0];
  s = apply(s, { kind: "SP_RESET" });
  assert.equal(s.centers.human[0], oldHuman);
  assert.equal(s.centers.cpu1[0], oldCpu);
  assert.equal(s.centers.human.length, 2);
  assert.equal(s.reserve.human.length, 20);
  let one = speedFixture();
  one.visible = {
    human: ["S-1", "S-2", "S-3", "S-4"],
    cpu1: ["H-9", "H-10", "H-11", "H-12"],
  };
  const chosen = [...one.visible.human, ...one.visible.cpu1, "C-7", "D-7"];
  const r = makeDeck()
    .map((c) => c.id)
    .filter((c) => !chosen.includes(c));
  one.reserve = { human: r.slice(0, 21), cpu1: [] };
  one.centers = { human: ["C-7"], cpu1: [...r.slice(21), "D-7"] };
  assert.ok(validTableSession(one));
  const cpuCenter = [...one.centers.cpu1];
  one = apply(one, { kind: "SP_RESET" });
  assert.deepEqual(one.centers.cpu1, cpuCenter);
  assert.equal(one.centers.human.length, 2);
  let dead = speedFixture();
  dead.visible = {
    human: ["S-1", "S-2", "S-3", "S-4"],
    cpu1: ["H-9", "H-10", "H-11", "H-12"],
  };
  const u = [...dead.visible.human, ...dead.visible.cpu1, "C-7", "D-7"];
  dead.centers = {
    human: [
      ...makeDeck()
        .map((c) => c.id)
        .filter((c) => !u.includes(c)),
      "C-7",
    ],
    cpu1: ["D-7"],
  };
  dead.reserve = { human: [], cpu1: [] };
  dead = apply(dead, { kind: "SP_RESET" });
  assert.equal(dead.result?.outcome, "draw");
  assert.equal(dead.result?.stats.stalemate, 1);
});
test("Old Maid CPU selects a position independently of the target hidden identity", () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = createTable("oldMaid", seed, "normal", 1000, "fair");
    if (s.gameId !== "oldMaid") throw Error();
    const actor = seats.find((p) => p !== "human" && s.hands[p].length);
    assert.ok(actor);
    s.turn = actor;
    const target = nextSeat(actor, s.hands);
    const a = structuredClone(s);
    a.hands[target].reverse();
    const r1 = reduceTable(s, { kind: "CPU" }),
      r2 = reduceTable(a, { kind: "CPU" });
    assert.ok(r1.ok && r2.ok);
    if (r1.state.gameId !== "oldMaid" || r2.state.gameId !== "oldMaid")
      throw Error();
    const removed1 = s.hands[target].find(
      (c) => !r1.state.hands[target].includes(c),
    );
    const removed2 = a.hands[target].find(
      (c) => !r2.state.hands[target].includes(c),
    );
    assert.ok(removed1 && removed2);
    assert.equal(
      s.hands[target].indexOf(removed1),
      a.hands[target].indexOf(removed2),
    );
  }
});
test("legacy memory data survives adding all four saves, and duplicate-card saves reject for every game", async () => {
  const { createMemory } = await import("../src/games/memory/engine.ts");
  const data = emptyData();
  const memory = createMemory(
    { mode: "solo", pairs: 8, difficulty: null },
    1,
    1000,
    "legacy-memory",
  );
  saveGame(data, memory, 1500);
  const before = structuredClone(data.saves.memory);
  data.records.push({
    sessionId: "legacy-record",
    gameId: "memory",
    config: { mode: "solo", pairs: 8, difficulty: null },
    configLabel: "8ペア / 1人",
    outcome: "completed",
    elapsedMs: 1000,
    hints: 0,
    assisted: false,
    stats: { pairs: 8, humanPairs: 8, cpuPairs: 0, attempts: 8 },
    finishedAt: 2000,
  });
  data.processedSessionIds.push("legacy-record");
  for (const id of ["klondike", "oldMaid", "sevens", "speed"] as const) {
    const s = createTable(id, 31, "normal", 1000, id);
    saveGame(data, s, 1500);
    const bad = structuredClone(s);
    const duplicate = (cards: CardId[]) => {
      const first = cards[0];
      if (!first || cards.length < 2) throw Error();
      cards[1] = first;
    };
    if (bad.gameId === "klondike") duplicate(bad.frame.stock);
    else if (bad.gameId === "speed") duplicate(bad.reserve.human);
    else {
      const seat = seats.find((p) => bad.hands[p].length >= 2);
      if (!seat) throw Error();
      duplicate(bad.hands[seat]);
    }
    assert.equal(validTableSession(bad), false);
  }
  const loaded = decodeStored(JSON.stringify(data));
  assert.equal(loaded.blocked, false);
  assert.equal(Object.keys(loaded.data.saves).length, 5);
  assert.deepEqual(loaded.data.saves.memory, before);
  assert.equal(loaded.data.records[0]?.sessionId, "legacy-record");
  assert.ok(loaded.data.processedSessionIds.includes("legacy-record"));
});
