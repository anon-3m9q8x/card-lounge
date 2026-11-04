import { createTable, removePairs } from "../src/games/table/engine.ts";
import { gameSnapshot, saveGame } from "../src/games/engine.ts";
import { emptyData } from "../src/core/storage.ts";
import { makeDeck, suits } from "../src/core/cards.ts";
import { validTableSession } from "../src/games/table/validate.ts";
import type { CardId } from "../src/app/types.ts";
const now = Date.now();
const kl = createTable("klondike", 1, "normal", now, "fixture-kl");
if (kl.gameId !== "klondike") throw Error();
kl.frame.stock = [];
kl.frame.waste = [];
kl.frame.tableau = Array.from({ length: 7 }, (_, i) => ({
  down: [],
  up: i < 4 ? [`${suits[i]}-13` as CardId] : [],
}));
for (const k of suits)
  kl.frame.foundations[k] = Array.from(
    { length: 12 },
    (_, i) => `${k}-${i + 1}` as CardId,
  );
const om = createTable("oldMaid", 1, "normal", now, "fixture-om");
if (om.gameId !== "oldMaid") throw Error();
om.hands = { human: ["H-1"], cpu1: ["S-1", "JOKER"], cpu2: [], cpu3: [] };
om.discarded = removePairs(
  makeDeck()
    .map((c) => c.id)
    .filter((c) => c !== "S-1" && c !== "H-1"),
).discarded;
om.finishOrder = ["cpu2", "cpu3"];
om.turn = "human";
const sv = createTable("sevens", 1, "hard", now, "fixture-sv");
if (sv.gameId !== "sevens") throw Error();
sv.hands = { human: ["S-1"], cpu1: ["H-1"], cpu2: ["D-1"], cpu3: ["C-1"] };
for (const k of suits) sv.lanes[k] = { low: 2, high: 13 };
sv.finishOrder = [];
sv.turn = "human";
const sp = createTable("speed", 1, "easy", now, "fixture-sp");
if (sp.gameId !== "speed") throw Error();
sp.visible = {
  human: ["H-8", null, null, null],
  cpu1: ["C-2", "C-4", "D-10", "C-12"],
};
const used: CardId[] = ["H-8", "C-2", "C-4", "D-10", "C-12", "H-7", "C-10"];
const rest = makeDeck()
  .map((c) => c.id)
  .filter((c) => !used.includes(c));
sp.reserve = { human: [], cpu1: rest.slice(0, 21) };
sp.centers = { human: [...rest.slice(21), "H-7"], cpu1: ["C-10"] };
const initial = ["klondike", "oldMaid", "sevens", "speed"].map((id) =>
  createTable(
    id as "klondike" | "oldMaid" | "sevens" | "speed",
    41,
    "easy",
    now,
    "initial-" + id,
  ),
);
const data = emptyData();
for (const s of [...initial]) saveGame(data, s, now);
for (const s of [kl, om, sv, sp, ...initial])
  if (!validTableSession(s)) throw Error("Invalid fixture " + s.gameId);
console.log(
  JSON.stringify({
    winning: Object.fromEntries(
      [kl, om, sv, sp].map((s) => [s.gameId, gameSnapshot(s, now)]),
    ),
    initial: data,
  }),
);
