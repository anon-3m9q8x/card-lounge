import test from "node:test";
import assert from "node:assert/strict";
import { createTable, reduceTable } from "../src/games/table/engine.ts";
import { validTableSession } from "../src/games/table/validate.ts";
import type {
  DaifugoSession,
  TableAction,
  TableSession,
  UnoSession,
} from "../src/games/table/types.ts";
import {
  beats,
  chooseDaifugo,
  daifugoMoves,
  validCombo,
} from "../src/games/table/daifugo.ts";
import {
  chooseUno,
  makeUnoDeck,
  unoMoves,
  unoPlayable,
} from "../src/games/table/uno.ts";
import {
  emptyData,
  decodeStored,
  recordFinished,
} from "../src/core/storage.ts";
import { saveGame, gameSnapshot } from "../src/games/engine.ts";
import type { CardId } from "../src/app/types.ts";

function apply<T extends TableSession>(s: T, a: TableAction, now = 2000): T {
  const r = reduceTable(s, a, now);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.ok(validTableSession(r.state), JSON.stringify(r.state));
  return r.state as T;
}
function reject(s: TableSession, a: TableAction) {
  const r = reduceTable(s, a, 2000);
  assert.equal(r.ok, false);
  return r.ok ? "" : r.error;
}
const df = (seed = 1): DaifugoSession => {
  const s = createTable("daifugo", seed, "normal", 1000, "df-" + seed);
  if (s.gameId !== "daifugo") throw Error();
  return s;
};
const uno = (seed = 1): UnoSession => {
  const s = createTable("uno", seed, "normal", 1000, "uno-" + seed);
  if (s.gameId !== "uno") throw Error();
  return s;
};

test("大富豪: 初期配札・保存の往復(100シード)", () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = df(seed);
    assert.ok(validTableSession(s));
    assert.equal(
      Object.values(s.hands).reduce((n, h) => n + h.length, 0),
      53,
    );
    assert.ok(s.hands[s.turn].includes("D-3"));
    const data = emptyData();
    saveGame(data, s, 1500);
    assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
    assert.ok(validTableSession(gameSnapshot(s, 1500)));
  }
});

test("大富豪: 組の判定・強さ・ジョーカー・革命", () => {
  assert.ok(validCombo(["S-5", "H-5"]));
  assert.ok(validCombo(["S-5", "JOKER"]));
  assert.ok(!validCombo(["S-5", "H-6"]));
  assert.ok(!validCombo(["S-5", "H-5", "D-5", "C-5", "JOKER"]));
  assert.ok(beats(["S-2"], ["S-1"], false), "2はAより強い");
  assert.ok(beats(["S-1"], ["S-13"], false), "AはKより強い");
  assert.ok(!beats(["S-3"], ["S-4"], false));
  assert.ok(beats(["S-3"], ["S-4"], true), "革命中は3が強い");
  assert.ok(beats(["JOKER"], ["S-2"], false));
  assert.ok(beats(["JOKER"], ["S-3"], true), "ジョーカーは革命中も最強");
  assert.ok(!beats(["S-2"], ["JOKER"], false));
  assert.ok(!beats(["S-9", "H-9"], ["S-5"], false), "枚数違いは出せない");
});

function arrange(
  s: DaifugoSession,
  hands: Partial<Record<keyof DaifugoSession["hands"], CardId[]>>,
) {
  const used = new Set(Object.values(hands).flat());
  for (const p of ["human", "cpu1", "cpu2", "cpu3"] as const)
    s.hands[p] = hands[p] ?? [];
  const rest = [...Object.values(df(99).hands).flat()].filter(
    (c) => !used.has(c),
  );
  s.pile = rest;
  s.field = null;
  s.passed = [];
  s.finishOrder = [];
  s.turn = "human";
  assert.ok(validTableSession(s), "テスト局面が不正です");
  return s;
}

test("大富豪: パスで場が流れ、出した人が親になる", () => {
  let s = arrange(df(), {
    human: ["S-5", "S-9"],
    cpu1: ["H-4", "H-6"],
    cpu2: ["D-4", "D-6"],
    cpu3: ["C-4", "C-6"],
  });
  s = apply(s, { kind: "DF_PLAY", actor: "human", cards: ["S-9"] });
  assert.equal(s.turn, "cpu1");
  assert.match(
    reject(s, { kind: "DF_PLAY", actor: "cpu1", cards: ["H-6"] }),
    /強い/,
  );
  s = apply(s, { kind: "DF_PASS", actor: "cpu1" });
  s = apply(s, { kind: "DF_PASS", actor: "cpu2" });
  s = apply(s, { kind: "DF_PASS", actor: "cpu3" });
  assert.equal(s.field, null);
  assert.equal(s.turn, "human");
  assert.match(reject(s, { kind: "DF_PASS", actor: "human" }), /親/);
});

test("大富豪: 8切りで場が流れ、あがった順に称号", () => {
  let s = arrange(df(), {
    human: ["S-8", "S-3"],
    cpu1: ["H-4", "H-6"],
    cpu2: ["D-4", "D-6"],
    cpu3: ["C-4", "C-6"],
  });
  s = apply(s, { kind: "DF_PLAY", actor: "human", cards: ["S-8"] });
  assert.equal(s.field, null);
  assert.equal(s.turn, "human");
  assert.equal(s.lastEvent, "eight");
  s = apply(s, { kind: "DF_PLAY", actor: "human", cards: ["S-3"] });
  assert.deepEqual(s.finishOrder, ["human"]);
  assert.equal(s.turn, "cpu1");
});

test("大富豪: 4枚出しで革命", () => {
  const s = arrange(df(), {
    human: ["S-5", "H-5", "D-5", "C-5", "S-12"],
    cpu1: ["H-4", "H-6"],
    cpu2: ["D-4", "D-6"],
    cpu3: ["C-4", "C-6"],
  });
  const t = apply(s, {
    kind: "DF_PLAY",
    actor: "human",
    cards: ["S-5", "H-5", "D-5", "C-5"],
  });
  assert.equal(t.revolution, true);
  assert.equal(t.lastEvent, "revolution");
});

test("大富豪: CPUだけで最後まで進み、正しく記録される(300局)", () => {
  for (let seed = 0; seed < 300; seed++) {
    const diff = (["easy", "normal", "hard"] as const)[seed % 3];
    let s = createTable(
      "daifugo",
      seed,
      diff,
      1000,
      "sim-" + seed,
    ) as DaifugoSession;
    let guard = 0;
    while (s.phase !== "finished") {
      assert.ok(guard++ < 2000, "終局しません");
      let a: TableAction = { kind: "CPU" };
      if (s.turn === "human") {
        const c = chooseDaifugo(s, "human", "normal", s.rng);
        a = c.cards
          ? { kind: "DF_PLAY", actor: "human", cards: c.cards }
          : { kind: "DF_PASS", actor: "human" };
      }
      s = apply(s, a);
    }
    assert.equal(s.finishOrder.length, 4);
    const data = recordFinished(emptyData(), s);
    assert.equal(
      data.records[0]?.stats.rank,
      s.finishOrder.indexOf("human") + 1,
    );
    assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
  }
});

test("大富豪: 合法手の列挙はすべて場に勝てる", () => {
  const moves = daifugoMoves(
    ["S-3", "H-3", "S-9", "JOKER"],
    ["D-7", "C-7"],
    false,
  );
  assert.ok(moves.length > 0);
  for (const m of moves) assert.ok(beats(m, ["D-7", "C-7"], false));
  assert.ok(moves.some((m) => m.includes("S-9") && m.includes("JOKER")));
});

test("UNO: 108枚・初期配札・保存の往復(100シード)", () => {
  assert.equal(makeUnoDeck().length, 108);
  assert.equal(new Set(makeUnoDeck()).size, 108);
  for (let seed = 0; seed < 100; seed++) {
    const s = uno(seed);
    assert.ok(validTableSession(s));
    for (const h of Object.values(s.hands)) assert.equal(h.length, 7);
    assert.match(s.discard[0]!, /^[RYGB]\d-/);
    const data = emptyData();
    saveGame(data, s, 1500);
    assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
  }
});

function unoArrange(
  s: UnoSession,
  hands: Partial<Record<keyof UnoSession["hands"], string[]>>,
  top: string,
) {
  const used = new Set([...Object.values(hands).flat(), top]);
  for (const p of ["human", "cpu1", "cpu2", "cpu3"] as const)
    s.hands[p] = hands[p] ?? [];
  s.drawPile = makeUnoDeck().filter((c) => !used.has(c));
  s.discard = [top];
  s.color = top[0] as UnoSession["color"];
  s.turn = "human";
  s.direction = 1;
  s.drawn = null;
  assert.ok(validTableSession(s), "テスト局面が不正です");
  return s;
}

test("UNO: 出せる札の判定とワイルドの色指定", () => {
  assert.ok(unoPlayable("R3-1", "R7-1", "R"));
  assert.ok(unoPlayable("B7-1", "R7-1", "R"));
  assert.ok(!unoPlayable("B3-1", "R7-1", "R"));
  assert.ok(unoPlayable("W-1", "R7-1", "R"));
  assert.ok(unoPlayable("GS-1", "RS-1", "R"));
  let s = unoArrange(
    uno(),
    {
      human: ["W-1", "B3-1"],
      cpu1: ["G1-1", "G2-1"],
      cpu2: ["G3-1", "G4-1"],
      cpu3: ["G5-1", "G6-1"],
    },
    "R7-1",
  );
  assert.match(
    reject(s, { kind: "UN_PLAY", actor: "human", cardId: "W-1" }),
    /色/,
  );
  s = apply(s, { kind: "UN_PLAY", actor: "human", cardId: "W-1", color: "B" });
  assert.equal(s.color, "B");
  assert.equal(s.turn, "cpu1");
});

test("UNO: スキップ・リバース・ドロー2", () => {
  const base = {
    cpu1: ["G1-1", "G2-1"],
    cpu2: ["G3-1", "G4-1"],
    cpu3: ["G5-1", "G6-1"],
  };
  let s = unoArrange(uno(), { human: ["RS-1", "B3-1"], ...base }, "R7-1");
  s = apply(s, { kind: "UN_PLAY", actor: "human", cardId: "RS-1" });
  assert.equal(s.turn, "cpu2");
  s = unoArrange(uno(), { human: ["RR-1", "B3-1"], ...base }, "R7-1");
  s = apply(s, { kind: "UN_PLAY", actor: "human", cardId: "RR-1" });
  assert.equal(s.direction, -1);
  assert.equal(s.turn, "cpu3");
  s = unoArrange(uno(), { human: ["RD-1", "B3-1"], ...base }, "R7-1");
  s = apply(s, { kind: "UN_PLAY", actor: "human", cardId: "RD-1" });
  assert.equal(s.hands.cpu1.length, 4);
  assert.equal(s.turn, "cpu2");
});

test("UNO: 引いた札は出すかパス、引く前のパスは不可", () => {
  let s = unoArrange(
    uno(),
    {
      human: ["B3-1", "B4-1"],
      cpu1: ["G1-1", "G2-1"],
      cpu2: ["G3-1", "G4-1"],
      cpu3: ["G5-1", "G6-1"],
    },
    "R7-1",
  );
  assert.match(reject(s, { kind: "UN_PASS", actor: "human" }), /引いた後/);
  // 次に引く札(出せる)を山札の一番上へ
  s.drawPile = [...s.drawPile.filter((c) => c !== "R1-1"), "R1-1"];
  s = apply(s, { kind: "UN_DRAW", actor: "human" });
  assert.equal(s.drawn, "R1-1");
  assert.match(
    reject(s, { kind: "UN_PLAY", actor: "human", cardId: "B3-1" }),
    /引いた札/,
  );
  s = apply(s, { kind: "UN_PASS", actor: "human" });
  assert.equal(s.turn, "cpu1");
  assert.equal(s.hands.human.length, 3);
});

test("UNO: CPUだけで最後まで進み、正しく記録される(300局)", () => {
  for (let seed = 0; seed < 300; seed++) {
    const diff = (["easy", "normal", "hard"] as const)[seed % 3];
    let s = createTable("uno", seed, diff, 1000, "u-" + seed) as UnoSession;
    let guard = 0;
    while (s.phase !== "finished") {
      assert.ok(guard++ < 5000, "終局しません");
      let a: TableAction = { kind: "CPU" };
      if (s.turn === "human") {
        const c = chooseUno(s, "human", "normal", s.rng);
        a = c.cardId
          ? {
              kind: "UN_PLAY",
              actor: "human",
              cardId: c.cardId,
              color: c.color,
            }
          : s.drawn
            ? { kind: "UN_PASS", actor: "human" }
            : { kind: "UN_DRAW", actor: "human" };
      }
      s = apply(s, a);
      if (s.phase !== "finished" && s.turn !== "human")
        assert.ok(
          unoMoves(s, s.turn).every((c) => s.hands[s.turn].includes(c)),
        );
    }
    const data = recordFinished(emptyData(), s);
    assert.equal(decodeStored(JSON.stringify(data)).blocked, false);
  }
});
