import type { TableSession, KlondikeFrame, Participant } from "./types.ts";
import { seats } from "./types.ts";
import { makeDeck, getCard, color, suits } from "../../core/cards.ts";
import type { CardId } from "../../app/types.ts";
import { speedMoves } from "./engine.ts";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const deck = new Set<string>(makeDeck(true).map((c) => c.id));
const cards = (v: unknown): v is CardId[] =>
  Array.isArray(v) && v.every((c) => typeof c === "string" && deck.has(c));
const unique = (a: readonly unknown[]) => new Set(a).size === a.length;
const participants = (v: unknown): v is Participant[] =>
  Array.isArray(v) &&
  unique(v) &&
  v.every((p) => seats.includes(p as Participant));
const hands = (v: unknown) => object(v) && seats.every((p) => cards(v[p]));
const allCards = (a: CardId[], joker = false) =>
  a.length === (joker ? 53 : 52) &&
  unique(a) &&
  a.every((c) => deck.has(c) && (joker || c !== "JOKER"));
function frame(v: unknown): v is KlondikeFrame {
  if (
    !object(v) ||
    !cards(v.stock) ||
    !cards(v.waste) ||
    !object(v.foundations) ||
    !suits.every((k) => cards((v.foundations as Record<string, unknown>)[k])) ||
    !Array.isArray(v.tableau) ||
    v.tableau.length !== 7 ||
    !v.tableau.every((c) => object(c) && cards(c.down) && cards(c.up)) ||
    !count(v.redealCount) ||
    !count(v.moveCount)
  )
    return false;
  const f = v as unknown as KlondikeFrame;
  const all = [
    ...f.stock,
    ...f.waste,
    ...suits.flatMap((k) => f.foundations[k]),
    ...f.tableau.flatMap((c) => [...c.down, ...c.up]),
  ];
  if (!allCards(all)) return false;
  for (const k of suits)
    if (f.foundations[k].some((c, i) => c !== `${k}-${i + 1}`)) return false;
  for (const c of f.tableau) {
    if (c.down.length && !c.up.length) return false;
    for (let i = 1; i < c.up.length; i++) {
      const a = c.up[i - 1],
        b = c.up[i];
      if (!a || !b) return false;
      const x = getCard(a),
        y = getCard(b);
      if (
        !x.rank ||
        !y.rank ||
        !x.suit ||
        !y.suit ||
        x.rank !== y.rank + 1 ||
        color(x.suit) === color(y.suit)
      )
        return false;
    }
  }
  return true;
}
export function validTableSession(v: unknown): v is TableSession {
  try {
    return validate(v);
  } catch {
    return false;
  }
}
function validate(v: unknown): v is TableSession {
  if (
    !object(v) ||
    v.schemaVersion !== 1 ||
    !["klondike", "oldMaid", "sevens", "speed"].includes(String(v.gameId)) ||
    typeof v.sessionId !== "string" ||
    !v.sessionId ||
    !["playing", "paused", "finished"].includes(String(v.phase)) ||
    !time(v.createdAt) ||
    !time(v.updatedAt) ||
    v.updatedAt < v.createdAt ||
    !count(v.moveCount) ||
    !count(v.hintCount) ||
    typeof v.assistUsed !== "boolean" ||
    (v.hintCount > 0 && !v.assistUsed) ||
    !object(v.config) ||
    !["easy", "normal", "hard"].includes(String(v.config.difficulty))
  )
    return false;
  if (
    !object(v.clock) ||
    !time(v.clock.elapsedMs) ||
    !(v.clock.lastStartedAt === null || time(v.clock.lastStartedAt)) ||
    (v.phase === "playing") !== (v.clock.lastStartedAt !== null)
  )
    return false;
  if (
    !object(v.rng) ||
    !count(v.rng.seed) ||
    !count(v.rng.state) ||
    v.rng.seed < 1 ||
    v.rng.state < 1 ||
    v.rng.seed > 0xffffffff ||
    v.rng.state > 0xffffffff
  )
    return false;
  if ((v.phase === "finished") !== (v.result !== null)) return false;
  if (
    v.result !== null &&
    (!object(v.result) ||
      !["completed", "win", "loss", "draw"].includes(
        String(v.result.outcome),
      ) ||
      !time(v.result.elapsedMs) ||
      v.result.elapsedMs !== v.clock.elapsedMs ||
      !time(v.result.finishedAt) ||
      !(v.result.score === null || time(v.result.score)) ||
      !object(v.result.stats) ||
      !Object.values(v.result.stats).every(time))
  )
    return false;
  if (v.gameId === "klondike") {
    if (
      !frame(v.frame) ||
      !Array.isArray(v.undoStack) ||
      v.undoStack.length > 10 ||
      !v.undoStack.every(frame) ||
      v.frame.moveCount !== v.moveCount
    )
      return false;
    const s = v as unknown as Extract<TableSession, { gameId: "klondike" }>;
    const complete = suits.every((k) => s.frame.foundations[k].length === 13);
    return (
      complete === (s.phase === "finished") &&
      (!s.result || s.result.outcome === "completed")
    );
  }
  if (v.gameId === "oldMaid" || v.gameId === "sevens") {
    if (
      !hands(v.hands) ||
      !participants(v.finishOrder) ||
      !seats.includes(v.turn as Participant)
    )
      return false;
    if (v.gameId === "oldMaid") {
      if (!cards(v.discarded) || v.discarded.length % 2) return false;
      const s = v as unknown as Extract<TableSession, { gameId: "oldMaid" }>;
      if (
        !allCards([...seats.flatMap((p) => s.hands[p]), ...s.discarded], true)
      )
        return false;
      for (let i = 0; i < s.discarded.length; i += 2) {
        const a = s.discarded[i],
          b = s.discarded[i + 1];
        if (
          !a ||
          !b ||
          a === "JOKER" ||
          b === "JOKER" ||
          getCard(a).rank !== getCard(b).rank
        )
          return false;
      }
      if (seats.some((p) => !unique(s.hands[p].map((c) => getCard(c).rank))))
        return false;
      const active = seats.filter((p) => s.hands[p].length);
      if (s.phase === "finished") {
        const loser = active[0];
        return (
          active.length === 1 &&
          !!loser &&
          s.hands[loser].length === 1 &&
          s.hands[loser][0] === "JOKER" &&
          s.finishOrder.length === 4 &&
          s.finishOrder.at(-1) === loser &&
          s.result?.outcome === (loser === "human" ? "loss" : "win")
        );
      }
      return (
        active.length >= 2 &&
        active.includes(s.turn) &&
        s.finishOrder.every((p) => s.hands[p].length === 0) &&
        seats.every((p) => s.hands[p].length > 0 || s.finishOrder.includes(p))
      );
    }
    if (
      !object(v.lanes) ||
      !suits.every((k) => {
        const b = (v.lanes as Record<string, unknown>)[k];
        return (
          object(b) &&
          count(b.low) &&
          count(b.high) &&
          b.low >= 1 &&
          b.low <= 7 &&
          b.high >= 7 &&
          b.high <= 13
        );
      }) ||
      !count(v.stalledTurns)
    )
      return false;
    for (const key of ["voluntaryPasses", "forcedPasses"])
      if (
        !object(v[key]) ||
        !seats.every((p) => count((v[key] as Record<string, unknown>)[p]))
      )
        return false;
    const s = v as unknown as Extract<TableSession, { gameId: "sevens" }>;
    const placed: CardId[] = suits.flatMap((k) =>
      Array.from(
        { length: s.lanes[k].high - s.lanes[k].low + 1 },
        (_, i) => `${k}-${s.lanes[k].low + i}` as CardId,
      ),
    );
    if (
      !allCards([...placed, ...seats.flatMap((p) => s.hands[p])]) ||
      seats.some((p) => s.voluntaryPasses[p] > 3) ||
      s.finishOrder.some((p) => s.hands[p].length > 0) ||
      seats.some((p) => !s.hands[p].length && !s.finishOrder.includes(p))
    )
      return false;
    if (s.phase === "finished")
      return (
        placed.length === 52 &&
        s.finishOrder.length === 4 &&
        s.result?.outcome === (s.finishOrder[0] === "human" ? "win" : "loss")
      );
    return placed.length < 52 && s.hands[s.turn].length > 0;
  }
  if (
    !object(v.reserve) ||
    !object(v.visible) ||
    !object(v.centers) ||
    !count(v.resetCount) ||
    !(v.lastActor === null || v.lastActor === "human" || v.lastActor === "cpu1")
  )
    return false;
  for (const p of ["human", "cpu1"]) {
    if (
      !cards(v.reserve[p]) ||
      v.reserve[p].length > 21 ||
      !cards(v.centers[p]) ||
      v.centers[p].length === 0 ||
      !Array.isArray(v.visible[p]) ||
      v.visible[p].length !== 4 ||
      !v.visible[p].every(
        (c: unknown) => c === null || (typeof c === "string" && deck.has(c)),
      )
    )
      return false;
  }
  const s = v as unknown as Extract<TableSession, { gameId: "speed" }>;
  const all = [
    ...s.reserve.human,
    ...s.reserve.cpu1,
    ...s.centers.human,
    ...s.centers.cpu1,
    ...s.visible.human.filter((c): c is CardId => c !== null),
    ...s.visible.cpu1.filter((c): c is CardId => c !== null),
  ];
  if (!allCards(all)) return false;
  if (
    (s.reserve.human.length && s.visible.human.includes(null)) ||
    (s.reserve.cpu1.length && s.visible.cpu1.includes(null))
  )
    return false;
  const h = s.visible.human.filter(Boolean).length,
    c = s.visible.cpu1.filter(Boolean).length;
  const humanDone = !s.reserve.human.length && !h,
    cpuDone = !s.reserve.cpu1.length && !c;
  const stalled =
    !s.reserve.human.length &&
    !s.reserve.cpu1.length &&
    !speedMoves(s.visible.human, s.centers).length &&
    !speedMoves(s.visible.cpu1, s.centers).length;
  if (s.phase === "finished") {
    const expected = humanDone
      ? "win"
      : cpuDone
        ? "loss"
        : stalled
          ? h < c
            ? "win"
            : h > c
              ? "loss"
              : "draw"
          : null;
    return expected !== null && s.result?.outcome === expected;
  }
  return !humanDone && !cpuDone && !stalled;
}
