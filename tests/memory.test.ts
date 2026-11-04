import test from "node:test";
import assert from "node:assert/strict";
import {
  makeDeck,
  pairKey,
  rng,
  shuffle,
  adjacentRank,
} from "../src/core/cards.ts";
import {
  createMemory,
  reduceMemory,
  snapshot,
  observation,
  chooseCpu,
} from "../src/games/memory/engine.ts";
import {
  validSession,
  decodeStored,
  emptyData,
  recordFinished,
  ranking,
} from "../src/core/storage.ts";
import type {
  MemoryAction,
  MemorySession,
  MemoryConfig,
} from "../src/app/types.ts";
const config: MemoryConfig = { mode: "solo", pairs: 8, difficulty: null };
const initial = (c: MemoryConfig = config, seed = 1) =>
  createMemory(c, seed, 1000, "test-session");
function apply(s: MemorySession, a: MemoryAction, now = 2000): MemorySession {
  const r = reduceMemory(s, a, now);
  assert.equal(r.ok, true);
  assert.ok(validSession(r.state));
  return r.state;
}
function mismatch(s: MemorySession): MemorySession {
  const first = s.tiles[0];
  assert.ok(first);
  const other = s.tiles.find((t) => t.pairKey !== first.pairKey);
  assert.ok(other);
  return apply(
    apply(s, { kind: "FLIP", tileId: first.tileId, actor: "human" }),
    { kind: "FLIP", tileId: other.tileId, actor: "human" },
  );
}
function finish(s: MemorySession): MemorySession {
  for (const key of new Set(s.tiles.map((t) => t.pairKey))) {
    for (const t of s.tiles.filter((t) => t.pairKey === key))
      s = apply(s, { kind: "FLIP", tileId: t.tileId, actor: "human" });
  }
  return s;
}
test("52/53 cards: unique IDs, one joker, same-color pair keys and A/K wrap", () => {
  assert.equal(makeDeck().length, 52);
  assert.equal(new Set(makeDeck().map((c) => c.id)).size, 52);
  assert.equal(makeDeck(true).length, 53);
  assert.equal(makeDeck(true).filter((c) => c.isJoker).length, 1);
  assert.equal(pairKey("H-5"), pairKey("D-5"));
  assert.notEqual(pairKey("H-5"), pairKey("S-5"));
  assert.ok(adjacentRank(1, 13, true));
  assert.ok(!adjacentRank(1, 13, false));
});
test("100 seeded shuffles preserve cards and reproducibility", () => {
  for (let seed = 0; seed < 100; seed++) {
    const a = shuffle(makeDeck(), rng(seed));
    assert.deepEqual(a, shuffle(makeDeck(), rng(seed)));
    assert.equal(new Set(a[0].map((c) => c.id)).size, 52);
  }
});
test("100 seeds × 3 pair counts × 4 solo/CPU configurations have valid distributions", () => {
  for (let seed = 0; seed < 100; seed++)
    for (const pairs of [8, 12, 26] as const)
      for (const d of [null, "easy", "normal", "hard"] as const) {
        const s = initial(
          { pairs, mode: d ? "vsCpu" : "solo", difficulty: d },
          seed,
        );
        assert.ok(validSession(s));
        assert.equal(s.tiles.length, pairs * 2);
      }
});
test("mismatch blocks third card, resolution switches only CPU mode", () => {
  for (const mode of ["solo", "vsCpu"] as const) {
    let s = mismatch(
      initial({
        ...config,
        mode,
        difficulty: mode === "solo" ? null : "normal",
      }),
    );
    assert.equal(s.resolution, "mismatch");
    assert.equal(s.attempts.human, 1);
    const original = structuredClone(s);
    const r = reduceMemory(s, {
      kind: "FLIP",
      tileId: s.tiles[2]?.tileId ?? "",
      actor: "human",
    });
    assert.equal(r.ok, false);
    assert.equal(r.state, s);
    assert.deepEqual(s, original);
    s = apply(s, { kind: "RESOLVE" });
    assert.equal(s.pickedTileIds.length, 0);
    assert.equal(s.turn, mode === "solo" ? "human" : "cpu1");
  }
});
test("same tile twice is rejected; matching pair keeps the player turn", () => {
  let s = initial();
  const first = s.tiles[0];
  assert.ok(first);
  s = apply(s, { kind: "FLIP", tileId: first.tileId, actor: "human" });
  assert.equal(
    reduceMemory(s, { kind: "FLIP", tileId: first.tileId, actor: "human" }).ok,
    false,
  );
  const other = s.tiles.find(
    (t) => t.tileId !== first.tileId && t.pairKey === first.pairKey,
  );
  assert.ok(other);
  s = apply(s, { kind: "FLIP", tileId: other.tileId, actor: "human" });
  assert.equal(s.pairsWon.human, 1);
  assert.equal(s.turn, "human");
  assert.equal(s.cpuMemory.length, 0);
});
test("pause/snapshot/resume preserve mismatch and exclude stopped time", () => {
  let s = mismatch(initial());
  s = apply(s, { kind: "PAUSE" }, 3000);
  const save = snapshot(s, 9000);
  assert.equal(save.clock.elapsedMs, 2000);
  assert.equal(save.resolution, "mismatch");
  assert.ok(validSession(save));
  assert.equal(reduceMemory(s, { kind: "RESOLVE" }).ok, false);
  s = apply(save, { kind: "RESUME" }, 10000);
  assert.equal(s.clock.elapsedMs, 2000);
  s = apply(s, { kind: "RESOLVE" }, 10800);
  assert.equal(s.clock.elapsedMs, 2000);
});
test("CPU observation and choice do not depend on undisclosed card identities", () => {
  const s = mismatch(initial({ ...config, mode: "vsCpu", difficulty: "hard" }));
  const hidden = s.tiles.filter((t) => !t.faceUp);
  const a = hidden[0],
    b = hidden[1];
  assert.ok(a && b);
  const altered = structuredClone(s);
  const ca = altered.tiles.find((t) => t.tileId === a.tileId),
    cb = altered.tiles.find((t) => t.tileId === b.tileId);
  assert.ok(ca && cb);
  [ca.cardId, cb.cardId] = [cb.cardId, ca.cardId];
  [ca.pairKey, cb.pairKey] = [cb.pairKey, ca.pairKey];
  assert.deepEqual(observation(s), observation(altered));
  assert.deepEqual(
    chooseCpu(observation(s), s.rng),
    chooseCpu(observation(altered), s.rng),
  );
  assert.ok(!JSON.stringify(observation(s)).includes("cardId"));
});
test("CPU memory capacity: easy2 / normal6 / hard all observed", () => {
  for (const difficulty of ["easy", "normal", "hard"] as const) {
    let s = initial({ ...config, mode: "vsCpu", difficulty });
    const exposed = new Set<string>();
    for (let i = 0; i < 8; i++) {
      if (s.resolution === "mismatch") s = apply(s, { kind: "RESOLVE" });
      if (s.turn === "cpu1") {
        s = { ...s, turn: "human" };
      }
      const tile = s.tiles.find(
        (t) => !t.matched && !t.faceUp && !exposed.has(t.pairKey),
      );
      assert.ok(tile);
      exposed.add(tile.pairKey);
      s = apply(s, { kind: "FLIP", tileId: tile.tileId, actor: "human" });
    }
    assert.equal(
      s.cpuMemory.length,
      difficulty === "easy" ? 2 : difficulty === "normal" ? 6 : 8,
    );
  }
});
test("CPU can finish a complete 26-pair game with no invalid transitions or duplicate cards", () => {
  let s = initial({ mode: "vsCpu", pairs: 26, difficulty: "hard" });
  let operations = 0;
  while (s.phase !== "finished" && operations++ < 3000) {
    if (s.resolution === "mismatch") s = apply(s, { kind: "RESOLVE" });
    else if (s.turn === "cpu1") s = apply(s, { kind: "CPU" });
    else {
      const tile = s.tiles.find((t) => !t.matched && !t.faceUp);
      assert.ok(tile);
      s = apply(s, { kind: "FLIP", tileId: tile.tileId, actor: "human" });
    }
  }
  assert.equal(s.phase, "finished");
  assert.equal(s.pairsWon.human + s.pairsWon.cpu1, 26);
  assert.equal(new Set(s.tiles.map((t) => t.cardId)).size, 52);
});
test("completion records once, separates assisted ranking, and blocks further play", () => {
  const s = finish(initial());
  assert.equal(s.result?.outcome, "completed");
  const data = recordFinished(emptyData(), s);
  assert.equal(data.records.length, 1);
  assert.equal(recordFinished(data, s), data);
  assert.equal(ranking(data.records, config).length, 1);
  assert.equal(ranking(data.records, { ...config, pairs: 12 }).length, 0);
  assert.equal(reduceMemory(s, { kind: "HINT" }).ok, false);
  const assisted = finish(apply(initial(), { kind: "HINT" }));
  const other = recordFinished(emptyData(), assisted);
  assert.equal(other.records.length, 1);
  assert.equal(ranking(other.records, config).length, 0);
});
test("corrupt/future saves are protected; valid snapshot restores; duplicate cards rejected", () => {
  assert.equal(decodeStored("{").blocked, true);
  assert.equal(decodeStored('{"schemaVersion":2}').blocked, true);
  const data = emptyData();
  data.saves.memory = snapshot(initial(), 2000);
  assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
  const bad = structuredClone(data.saves.memory);
  const a = bad.tiles[0],
    b = bad.tiles[1];
  assert.ok(a && b);
  b.cardId = a.cardId;
  assert.equal(validSession(bad), false);
  data.saves.memory = bad;
  assert.equal(decodeStored(JSON.stringify(data)).blocked, true);
});
