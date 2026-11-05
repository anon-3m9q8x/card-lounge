import type {
  CardId,
  Suit,
  Actor,
  Difficulty,
  RngState,
  Outcome,
  Rank,
} from "../../app/types.ts";
import type {
  TableSession,
  TableGameId,
  TableAction,
  TableBase,
  KlondikeSession,
  KlondikeFrame,
  KlondikePlace,
  OldMaidSession,
  Participant,
  Lane,
  SpeedSession,
} from "./types.ts";
import { seats } from "./types.ts";
import {
  makeDeck,
  getCard,
  color,
  shuffle,
  rng,
  sessionId,
  adjacentRank,
  suits,
  nextRng,
} from "../../core/cards.ts";
import { createDaifugo, daifugoHint, stepDaifugo } from "./daifugo.ts";
import { createUno, unoHint, stepUno } from "./uno.ts";
export const tableNames = {
  klondike: "ソリティア",
  oldMaid: "ババ抜き",
  sevens: "七並べ",
  speed: "スピード",
  daifugo: "大富豪",
  uno: "UNO",
};
export const tableElapsed = (s: TableBase, now: number) =>
  s.clock.elapsedMs +
  (s.phase === "playing" && s.clock.lastStartedAt !== null
    ? Math.max(0, now - s.clock.lastStartedAt)
    : 0);
const rank = (c: CardId) => getCard(c).rank ?? 0;
const suit = (c: CardId) => getCard(c).suit;
const handMap = (): Record<Participant, CardId[]> => ({
  human: [],
  cpu1: [],
  cpu2: [],
  cpu3: [],
});
const counters = () => ({ human: 0, cpu1: 0, cpu2: 0, cpu3: 0 });
const lanes = (): Record<Suit, Lane> => ({
  S: { low: 7, high: 7 },
  H: { low: 7, high: 7 },
  D: { low: 7, high: 7 },
  C: { low: 7, high: 7 },
});
export function removePairs(hand: readonly CardId[]): {
  hand: CardId[];
  discarded: CardId[];
} {
  const remaining: CardId[] = [];
  const discarded: CardId[] = [];
  for (const card of hand) {
    const i =
      card === "JOKER"
        ? -1
        : remaining.findIndex((c) => c !== "JOKER" && rank(c) === rank(card));
    if (i < 0) remaining.push(card);
    else {
      const other = remaining.splice(i, 1)[0];
      if (other) discarded.push(other, card);
    }
  }
  return { hand: remaining, discarded };
}
export function nextSeat(
  p: Participant,
  hands: Record<Participant, CardId[]>,
): Participant {
  const index = seats.indexOf(p);
  for (let i = 1; i <= 4; i++) {
    const candidate = seats[(index + i) % 4];
    if (candidate && hands[candidate].length) return candidate;
  }
  return p;
}
function base(
  id: TableGameId,
  seed: number,
  difficulty: Difficulty,
  now: number,
  sid: string,
): TableBase {
  return {
    schemaVersion: 1,
    sessionId: sid,
    gameId: id,
    phase: "playing",
    createdAt: now,
    updatedAt: now,
    clock: { elapsedMs: 0, lastStartedAt: now },
    rng: rng(seed),
    config: { difficulty },
    moveCount: 0,
    hintCount: 0,
    assistUsed: false,
    result: null,
  };
}
export function createTable(
  gameId: TableGameId,
  seed: number,
  difficulty: Difficulty = "normal",
  now = Date.now(),
  sid = sessionId(),
): TableSession {
  const b = base(gameId, seed, difficulty, now, sid);
  if (gameId === "daifugo") return createDaifugo(b);
  if (gameId === "uno") return createUno(b);
  const [deck, r] = shuffle(
    makeDeck(gameId === "oldMaid").map((c) => c.id),
    b.rng,
  );
  b.rng = r;
  if (gameId === "klondike") {
    const tableau = Array.from({ length: 7 }, (_, i) => {
      const cards = deck.splice(-i - 1);
      const top = cards.pop();
      if (!top) throw Error("配札失敗");
      return { down: cards, up: [top] };
    });
    return {
      ...b,
      gameId,
      frame: {
        stock: deck,
        waste: [],
        foundations: { S: [], H: [], D: [], C: [] },
        tableau,
        redealCount: 0,
        moveCount: 0,
      },
      undoStack: [],
    };
  }
  if (gameId === "speed") {
    const human = deck.splice(-26),
      cpu1 = deck;
    const prepare = (hand: CardId[]) => {
      const visible = hand.splice(-4);
      const top = hand.pop();
      if (!top) throw Error("配札失敗");
      return { visible, reserve: hand, center: [top] };
    };
    const h = prepare(human),
      c = prepare(cpu1);
    return {
      ...b,
      gameId,
      reserve: { human: h.reserve, cpu1: c.reserve },
      visible: { human: h.visible, cpu1: c.visible },
      centers: { human: h.center, cpu1: c.center },
      resetCount: 0,
      lastActor: null,
    };
  }
  const hands = handMap();
  let index = 0;
  while (deck.length) {
    const seat = seats[index++ % 4],
      c = deck.pop();
    if (seat && c) hands[seat].push(c);
  }
  if (gameId === "oldMaid") {
    const discarded: CardId[] = [];
    const finishOrder: Participant[] = [];
    for (const p of seats) {
      const filtered = removePairs(hands[p]);
      discarded.push(...filtered.discarded);
      let random: RngState;
      [hands[p], random] = shuffle(filtered.hand, b.rng);
      b.rng = random;
      if (!hands[p].length) finishOrder.push(p);
    }
    const s: OldMaidSession = {
      ...b,
      gameId,
      hands,
      discarded,
      turn: hands.human.length ? "human" : nextSeat("human", hands),
      finishOrder,
    };
    finishOldMaid(s, now);
    return s;
  }
  let diamond: Participant = "human";
  for (const p of seats) {
    if (hands[p].includes("D-7")) diamond = p;
    hands[p] = hands[p].filter((c) => rank(c) !== 7);
  }
  return {
    ...b,
    gameId: "sevens",
    hands,
    lanes: lanes(),
    turn: nextSeat(diamond, hands),
    finishOrder: [],
    voluntaryPasses: counters(),
    forcedPasses: counters(),
    stalledTurns: 0,
  };
}
function finish(
  s: TableSession,
  outcome: Outcome,
  now: number,
  stats: Record<string, number>,
  score: number | null = null,
) {
  const elapsedMs = tableElapsed(s, now);
  s.phase = "finished";
  s.clock = { elapsedMs, lastStartedAt: null };
  s.result = {
    outcome,
    elapsedMs,
    finishedAt: now,
    score,
    stats: { moves: s.moveCount, ...stats },
  };
}
function finishOldMaid(s: OldMaidSession, now: number) {
  const active = seats.filter((p) => s.hands[p].length);
  if (active.length === 1) {
    const loser = active[0];
    if (!loser || s.hands[loser].length !== 1 || s.hands[loser][0] !== "JOKER")
      throw Error("カードの整合性に問題があります");
    if (!s.finishOrder.includes(loser)) s.finishOrder.push(loser);
    finish(s, loser === "human" ? "loss" : "win", now, {
      rank: s.finishOrder.indexOf("human") + 1,
      loser: seats.indexOf(loser),
    });
  }
}
export function sevensMoves(
  hand: readonly CardId[],
  board: Record<Suit, Lane>,
): CardId[] {
  return hand.filter((c) => {
    const k = suit(c);
    return k && (rank(c) === board[k].low - 1 || rank(c) === board[k].high + 1);
  });
}
export function chooseSevens(
  ownHand: readonly CardId[],
  board: Record<Suit, Lane>,
  difficulty: Difficulty,
  initial: RngState,
): { cardId: CardId | null; rng: RngState } {
  const legal = sevensMoves(ownHand, board).sort(
    (a, b) =>
      suits.indexOf(suit(a) ?? "S") - suits.indexOf(suit(b) ?? "S") ||
      rank(a) - rank(b),
  );
  if (!legal.length) return { cardId: null, rng: initial };
  if (difficulty === "easy") {
    const [n, r] = nextRng(initial);
    return { cardId: legal[Math.floor(n * legal.length)] ?? null, rng: r };
  }
  const score = (c: CardId) => {
    const k = suit(c);
    if (!k) return 0;
    const next = structuredClone(board);
    const n = rank(c);
    next[k].low = Math.min(next[k].low, n) as Rank;
    next[k].high = Math.max(next[k].high, n) as Rank;
    const rest = ownHand.filter((x) => x !== c);
    const immediate = sevensMoves(rest, next).length;
    if (difficulty === "normal") return immediate;
    let chain = 0;
    for (const direction of [-1, 1])
      for (let j = 1; j <= 4; j++) {
        const candidate = `${k}-${n + direction * j}`;
        if (rest.includes(candidate as CardId)) chain++;
        else break;
      }
    return (
      chain * 100 + immediate * 10 + ownHand.filter((x) => suit(x) === k).length
    );
  };
  legal.sort((a, b) => score(b) - score(a));
  return { cardId: legal[0] ?? null, rng: initial };
}
export function speedMoves(
  visible: readonly (CardId | null)[],
  centers: Record<Actor, CardId[]>,
): { visibleIndex: number; center: Actor }[] {
  const moves: { visibleIndex: number; center: Actor }[] = [];
  visible.forEach((c, i) => {
    if (c)
      for (const center of ["human", "cpu1"] as const) {
        const top = centers[center].at(-1);
        if (top && adjacentRank(rank(c), rank(top), true))
          moves.push({ visibleIndex: i, center });
      }
  });
  return moves;
}
function settleSpeed(s: SpeedSession, now: number) {
  for (const actor of ["human", "cpu1"] as const)
    if (!s.reserve[actor].length && s.visible[actor].every((c) => c === null)) {
      finish(s, actor === "human" ? "win" : "loss", now, {
        resets: s.resetCount,
        stalemate: 0,
      });
      return;
    }
  if (
    !s.reserve.human.length &&
    !s.reserve.cpu1.length &&
    !speedMoves(s.visible.human, s.centers).length &&
    !speedMoves(s.visible.cpu1, s.centers).length
  ) {
    const a = s.visible.human.filter(Boolean).length,
      b = s.visible.cpu1.filter(Boolean).length;
    finish(s, a < b ? "win" : a > b ? "loss" : "draw", now, {
      resets: s.resetCount,
      stalemate: 1,
      humanRemaining: a,
      cpuRemaining: b,
    });
  }
}
function placeEqual(a: KlondikePlace, b: KlondikePlace) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function pile(frame: KlondikeFrame, p: KlondikePlace): CardId[] {
  if (p.zone === "waste") return frame.waste;
  if (p.zone === "foundation") return frame.foundations[p.suit] ?? [];
  return frame.tableau[p.column]?.up ?? [];
}
export function legalKlondike(
  f: KlondikeFrame,
  from: KlondikePlace,
  to: KlondikePlace,
  count: number,
): boolean {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    placeEqual(from, to) ||
    to.zone === "waste" ||
    (from.zone === "foundation" && to.zone === "foundation")
  )
    return false;
  if (
    from.zone === "tableau" &&
    (!Number.isInteger(from.column) || !f.tableau[from.column])
  )
    return false;
  if (
    to.zone === "tableau" &&
    (!Number.isInteger(to.column) || !f.tableau[to.column])
  )
    return false;
  const source = pile(f, from),
    destination = pile(f, to);
  if (count > source.length || (from.zone !== "tableau" && count !== 1))
    return false;
  const cards = source.slice(-count);
  const head = cards[0];
  if (!head) return false;
  for (let i = 1; i < cards.length; i++) {
    const a = cards[i - 1],
      b = cards[i];
    if (
      !a ||
      !b ||
      rank(a) !== rank(b) + 1 ||
      color(suit(a) ?? "S") === color(suit(b) ?? "S")
    )
      return false;
  }
  const top = destination.at(-1);
  if (to.zone === "foundation")
    return (
      count === 1 &&
      suit(head) === to.suit &&
      rank(head) === (top ? rank(top) + 1 : 1)
    );
  return top
    ? rank(head) === rank(top) - 1 &&
        color(suit(head) ?? "S") !== color(suit(top) ?? "S")
    : rank(head) === 13;
}
export function klondikeHint(s: KlondikeSession): TableAction | null {
  const sources: KlondikePlace[] = [
    { zone: "waste" },
    ...s.frame.tableau.map((_, column) => ({
      zone: "tableau" as const,
      column,
    })),
  ];
  for (const from of sources)
    for (const k of suits) {
      const to: KlondikePlace = { zone: "foundation", suit: k };
      if (legalKlondike(s.frame, from, to, 1))
        return { kind: "KL_MOVE", from, to, count: 1 };
    }
  const candidates: { action: TableAction; score: number }[] = [];
  for (const from of sources) {
    const cards = pile(s.frame, from);
    for (let count = 1; count <= cards.length; count++)
      for (let column = 0; column < 7; column++) {
        const to: KlondikePlace = { zone: "tableau", column };
        if (legalKlondike(s.frame, from, to, count)) {
          const reveals =
            from.zone === "tableau" &&
            count === cards.length &&
            !!s.frame.tableau[from.column]?.down.length;
          const empty = s.frame.tableau[column]?.up.length === 0;
          if (
            from.zone === "tableau" &&
            !reveals &&
            empty &&
            count === cards.length
          )
            continue;
          candidates.push({
            action: { kind: "KL_MOVE", from, to, count },
            score: reveals ? 3 : empty ? 2 : from.zone === "waste" ? 1 : 0,
          });
        }
      }
  }
  candidates.sort((a, b) => b.score - a.score);
  return (
    candidates[0]?.action ??
    (s.frame.stock.length || s.frame.waste.length ? { kind: "KL_DRAW" } : null)
  );
}
export function tableHint(s: TableSession): string {
  if (s.gameId === "klondike") {
    const h = klondikeHint(s);
    if (!h)
      return "見えている合法手がありません。別の配置をUndoで検討できます。";
    if (h.kind === "KL_DRAW")
      return "山札をめくるか、捨て札を山札へ戻してください。";
    if (h.kind === "KL_MOVE") {
      const name = (p: KlondikePlace) =>
        p.zone === "waste"
          ? "捨て札"
          : p.zone === "foundation"
            ? `${p.suit}の組札`
            : `${p.column + 1}列目`;
      return `${name(h.from)}の${h.count}枚を${name(h.to)}へ移せます。`;
    }
  }
  if (s.gameId === "daifugo") return daifugoHint(s);
  if (s.gameId === "uno") return unoHint(s);
  if (s.gameId === "oldMaid")
    return "次に手札が残る相手の裏向きカードから、1枚を選んでください。ジョーカーの位置は分かりません。";
  if (s.gameId === "sevens") {
    const legal = sevensMoves(s.hands.human, s.lanes);
    return legal.length
      ? `${legal.join("、")} を出せます。`
      : "出せる札がありません。強制パスできます。";
  }
  if (s.gameId === "speed") {
    const legal = speedMoves(s.visible.human, s.centers)[0];
    return legal
      ? `${legal.visibleIndex + 1}番目の札を${legal.center === "human" ? "左" : "右"}の中央札へ出せます。`
      : "出せる札がありません。双方が手詰まりなら中央を更新できます。";
  }
  return "見えているカードから手を考えましょう。";
}
export type TableResult =
  | { ok: true; state: TableSession; message: string }
  | { ok: false; state: TableSession; error: string };
export function reduceTable(
  previous: TableSession,
  action: TableAction,
  now = Date.now(),
): TableResult {
  const fail = (error: string): TableResult => ({
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
  if (previous.phase !== "playing") return fail("一時停止中です。");
  if (action.kind === "PAUSE")
    return {
      ok: true,
      state: {
        ...previous,
        phase: "paused",
        updatedAt: now,
        clock: { elapsedMs: tableElapsed(previous, now), lastStartedAt: null },
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
      message: tableHint(previous),
    };
  const s = structuredClone(previous);
  s.updatedAt = now;
  let message = "カードを動かしました。";
  if (s.gameId === "daifugo" || s.gameId === "uno") {
    const r =
      s.gameId === "daifugo"
        ? stepDaifugo(s, action, now)
        : stepUno(s, action, now);
    if (typeof r !== "string") return fail(r.error);
    return { ok: true, state: s, message: r };
  }
  if (s.gameId === "klondike") {
    if (action.kind === "KL_UNDO") {
      const frame = s.undoStack.pop();
      if (!frame) return fail("戻せる手がありません。");
      s.frame = frame;
      s.moveCount = frame.moveCount;
      s.assistUsed = true;
      return {
        ok: true,
        state: s,
        message: "1手戻しました。時間は戻りません。",
      };
    }
    if (action.kind !== "KL_DRAW" && action.kind !== "KL_MOVE")
      return fail("このゲームでは使えない操作です。");
    const before = structuredClone(s.frame);
    if (action.kind === "KL_DRAW") {
      const top = s.frame.stock.pop();
      if (top) s.frame.waste.push(top);
      else if (s.frame.waste.length) {
        s.frame.stock = [...s.frame.waste].reverse();
        s.frame.waste = [];
        s.frame.redealCount++;
      } else return fail("山札も捨て札も空です。");
    } else {
      if (!legalKlondike(s.frame, action.from, action.to, action.count))
        return fail(
          "その移動はできません。列は降順・交互色、空列はK、組札は同スートのAからです。",
        );
      const source = pile(s.frame, action.from),
        dest = pile(s.frame, action.to);
      dest.push(...source.splice(-action.count));
      if (action.from.zone === "tableau") {
        const col = s.frame.tableau[action.from.column];
        if (col && !col.up.length && col.down.length) {
          const card = col.down.pop();
          if (card) col.up.push(card);
        }
      }
    }
    s.undoStack = [...s.undoStack, before].slice(-10);
    s.moveCount++;
    s.frame.moveCount = s.moveCount;
    if (suits.every((k) => s.frame.foundations[k].length === 13))
      finish(s, "completed", now, { foundations: 52 }, 52);
  } else if (s.gameId === "oldMaid") {
    let actor: Participant, index: number;
    if (action.kind === "CPU") {
      if (s.turn === "human") return fail("あなたの番です。");
      actor = s.turn;
      const target = nextSeat(actor, s.hands);
      const [n, r] = nextRng(s.rng);
      s.rng = r;
      index = Math.floor(n * s.hands[target].length);
    } else if (action.kind === "OM_DRAW") {
      actor = action.actor;
      index = action.targetIndex;
    } else return fail("このゲームでは使えない操作です。");
    if (actor !== s.turn) return fail("あなたの手番ではありません。");
    const target = nextSeat(actor, s.hands);
    if (
      target === actor ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= s.hands[target].length
    )
      return fail("引く位置が不正です。");
    const card = s.hands[target].splice(index, 1)[0];
    if (!card) return fail("カードがありません。");
    s.hands[actor].push(card);
    const filtered = removePairs(s.hands[actor]);
    s.hands[actor] = filtered.hand;
    s.discarded.push(...filtered.discarded);
    for (const p of [target, actor])
      if (!s.hands[p].length && !s.finishOrder.includes(p))
        s.finishOrder.push(p);
    const [hand, r] = shuffle(s.hands[actor], s.rng);
    s.hands[actor] = hand;
    s.rng = r;
    s.moveCount++;
    finishOldMaid(s, now);
    if (s.phase !== "finished") s.turn = nextSeat(actor, s.hands);
    message = filtered.discarded.length
      ? "ペアが揃い、手札から取り除きました。"
      : "1枚引きました。";
  } else if (s.gameId === "sevens") {
    let actor: Participant,
      cardId: CardId | null = null;
    let pass = false;
    if (action.kind === "CPU") {
      if (s.turn === "human") return fail("あなたの番です。");
      actor = s.turn;
      const choice = chooseSevens(
        s.hands[actor],
        s.lanes,
        s.config.difficulty,
        s.rng,
      );
      s.rng = choice.rng;
      cardId = choice.cardId;
      pass = cardId === null;
    } else if (action.kind === "SV_PLACE") {
      actor = action.actor;
      cardId = action.cardId;
    } else if (action.kind === "SV_PASS") {
      actor = action.actor;
      pass = true;
    } else return fail("このゲームでは使えない操作です。");
    if (actor !== s.turn) return fail("あなたの手番ではありません。");
    const legal = sevensMoves(s.hands[actor], s.lanes);
    if (pass) {
      if (legal.length) {
        if (s.voluntaryPasses[actor] >= 3)
          return fail("自発パスは3回までです。");
        s.voluntaryPasses[actor]++;
        s.stalledTurns = 0;
      } else {
        s.forcedPasses[actor]++;
        s.stalledTurns++;
      }
      message = legal.length
        ? "自発パスを使いました。"
        : "出せる札がないため強制パスしました。";
    } else {
      if (!cardId || !legal.includes(cardId))
        return fail(
          "その札は出せません。各スートの端から連続する数字だけ出せます。",
        );
      const k = suit(cardId);
      if (!k) return fail("スートが不正です。");
      s.lanes[k].low = Math.min(s.lanes[k].low, rank(cardId)) as Rank;
      s.lanes[k].high = Math.max(s.lanes[k].high, rank(cardId)) as Rank;
      s.hands[actor] = s.hands[actor].filter((c) => c !== cardId);
      s.stalledTurns = 0;
      if (!s.hands[actor].length && !s.finishOrder.includes(actor))
        s.finishOrder.push(actor);
    }
    s.moveCount++;
    const active = seats.filter((p) => s.hands[p].length);
    if (!active.length)
      finish(s, s.finishOrder[0] === "human" ? "win" : "loss", now, {
        rank: s.finishOrder.indexOf("human") + 1,
      });
    else {
      if (s.stalledTurns >= active.length)
        return fail(
          "全員が置けない不整合な局面です。保存を保護して進行を停止しました。",
        );
      s.turn = nextSeat(actor, s.hands);
    }
  } else {
    let move: Extract<TableAction, { kind: "SP_PLACE" }>;
    if (action.kind === "SP_RESET") {
      if (
        speedMoves(s.visible.human, s.centers).length ||
        speedMoves(s.visible.cpu1, s.centers).length
      )
        return fail("どちらかに出せる札があるため中央更新できません。");
      let placed = false;
      for (const actor of ["human", "cpu1"] as const) {
        const card = s.reserve[actor].pop();
        if (card) {
          s.centers[actor].push(card);
          placed = true;
        }
      }
      if (!placed) {
        settleSpeed(s, now);
        if (s.phase !== "finished") return fail("補充できません。");
      } else {
        s.resetCount++;
        s.moveCount++;
        settleSpeed(s, now);
      }
      return { ok: true, state: s, message: "中央札を更新しました。" };
    }
    if (action.kind === "CPU") {
      const legal = speedMoves(s.visible.cpu1, s.centers);
      if (!legal.length) return fail("CPUに合法手がありません。");
      let index = 0;
      if (s.config.difficulty === "easy") {
        const [n, r] = nextRng(s.rng);
        s.rng = r;
        index = Math.floor(n * legal.length);
      }
      const chosen = legal[index];
      if (!chosen) return fail("出せる札がありません。");
      move = { kind: "SP_PLACE", actor: "cpu1", ...chosen };
    } else if (action.kind === "SP_PLACE") move = action;
    else return fail("このゲームでは使えない操作です。");
    if (
      !["human", "cpu1"].includes(move.actor) ||
      !["human", "cpu1"].includes(move.center)
    )
      return fail("参加者または中央札が不正です。");
    const legal = speedMoves(s.visible[move.actor], s.centers);
    if (
      !legal.some(
        (m) => m.visibleIndex === move.visibleIndex && m.center === move.center,
      )
    )
      return fail("場札が変わりました。この札は今は出せません。");
    const card = s.visible[move.actor][move.visibleIndex];
    if (!card) return fail("カードがありません。");
    s.centers[move.center].push(card);
    s.visible[move.actor][move.visibleIndex] =
      s.reserve[move.actor].pop() ?? null;
    s.lastActor = move.actor;
    s.moveCount++;
    settleSpeed(s, now);
  }
  return {
    ok: true,
    state: s,
    message: s.phase === "finished" ? "ゲーム終了です。" : message,
  };
}
export function needsSpeedReset(s: SpeedSession) {
  return (
    s.phase === "playing" &&
    !speedMoves(s.visible.human, s.centers).length &&
    !speedMoves(s.visible.cpu1, s.centers).length
  );
}
