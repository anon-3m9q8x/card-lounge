/**
 * 大富豪(1人 + CPU3人)
 * - 53枚(ジョーカー1枚)を4人に配る。ダイヤの3を持つ人から始める。
 * - 強さ: 3 < 4 < … < K < A < 2 < ジョーカー。革命中は3〜2の並びが逆転(ジョーカーは常に最強)。
 * - 出せる組: 1枚、または同じ数字の2〜4枚(ジョーカーは不足分の代わりに使える)。
 * - 場と同じ枚数で、より強い組だけを出せる。出せない・出さないときはパス。
 *   一度パスした人は、その場が流れるまで出せない。最後に出した人以外が全員パスすると場が流れる。
 * - 8切り: 8を含む組を出すと場が流れ、出した人から再開。
 * - 革命: 4枚の組を出すと強さが逆転(もう一度4枚で戻る)。
 * - 先にあがった順に 大富豪 → 富豪 → 貧民 → 大貧民。
 */
import type { CardId, Difficulty, RngState } from "../../app/types.ts";
import type {
  DaifugoSession,
  Participant,
  TableAction,
  TableBase,
} from "./types.ts";
import { seats } from "./types.ts";
import { getCard, makeDeck, nextRng, shuffle } from "../../core/cards.ts";

export const daifugoTitles = ["大富豪", "富豪", "貧民", "大貧民"] as const;

const rankOf = (c: CardId) => getCard(c).rank;
/** 革命なしの強さ(3=3 … K=13, A=14, 2=15)。ジョーカーは16 */
export function strength(c: CardId): number {
  const r = rankOf(c);
  if (r === null) return 16;
  return r === 1 ? 14 : r === 2 ? 15 : r;
}
const naturals = (cards: readonly CardId[]) =>
  cards.filter((c) => c !== "JOKER");
const isJokerSingle = (cards: readonly CardId[]) =>
  cards.length === 1 && cards[0] === "JOKER";

/** 組として成立しているか(1枚、または同じ数字2〜4枚。ジョーカーは代用可) */
export function validCombo(cards: readonly CardId[]): boolean {
  if (cards.length < 1 || cards.length > 4) return false;
  if (new Set(cards).size !== cards.length) return false;
  const n = naturals(cards);
  if (cards.length - n.length > 1) return false;
  if (!n.length) return isJokerSingle(cards);
  const r = rankOf(n[0]!);
  return n.every((c) => rankOf(c) === r);
}
/** 組の数字の強さ(ジョーカー単騎は16) */
export function comboStrength(cards: readonly CardId[]): number {
  const n = naturals(cards);
  return n.length ? strength(n[0]!) : 16;
}
/** 場の組に対して出せるか */
export function beats(
  play: readonly CardId[],
  field: readonly CardId[] | null,
  revolution: boolean,
): boolean {
  if (!validCombo(play)) return false;
  if (!field) return true;
  if (play.length !== field.length) return false;
  if (isJokerSingle(field)) return false;
  if (isJokerSingle(play)) return true;
  const a = comboStrength(play),
    b = comboStrength(field);
  return revolution ? a < b : a > b;
}
const hasEight = (cards: readonly CardId[]) =>
  naturals(cards).some((c) => rankOf(c) === 8);

/** 手札から出せる組をすべて挙げる(スートの違いは区別しない: 各数字につき枚数ごと1通り) */
export function daifugoMoves(
  hand: readonly CardId[],
  field: readonly CardId[] | null,
  revolution: boolean,
): CardId[][] {
  const joker = hand.includes("JOKER");
  const byRank = new Map<number, CardId[]>();
  for (const c of hand) {
    const r = rankOf(c);
    if (r === null) continue;
    byRank.set(r, [...(byRank.get(r) ?? []), c]);
  }
  const sizes = field ? [field.length] : [1, 2, 3, 4];
  const moves: CardId[][] = [];
  for (const size of sizes) {
    for (const group of byRank.values()) {
      if (group.length >= size) moves.push(group.slice(0, size));
      else if (joker && group.length + 1 === size)
        moves.push([...group, "JOKER"]);
    }
    if (size === 1 && joker) moves.push(["JOKER"]);
  }
  return moves
    .filter((m) => beats(m, field, revolution))
    .sort(
      (a, b) =>
        order(a, revolution) - order(b, revolution) || a.length - b.length,
    );
}
/** 弱い順に並べるための値(革命中は逆。ジョーカーは常に最後) */
function order(cards: readonly CardId[], revolution: boolean) {
  const s = comboStrength(cards);
  if (s === 16) return 100;
  return revolution ? 20 - s : s;
}

const handMap = (): Record<Participant, CardId[]> => ({
  human: [],
  cpu1: [],
  cpu2: [],
  cpu3: [],
});

export function createDaifugo(b: TableBase): DaifugoSession {
  const [deck, r] = shuffle(
    makeDeck(true).map((c) => c.id),
    b.rng,
  );
  const hands = handMap();
  deck.forEach((c, i) => hands[seats[i % 4]!].push(c));
  const first = seats.find((p) => hands[p].includes("D-3")) ?? "human";
  return {
    ...b,
    rng: r,
    gameId: "daifugo",
    hands,
    field: null,
    pile: [],
    passed: [],
    turn: first,
    finishOrder: [],
    revolution: false,
    lastEvent: "none",
  };
}

function finishDaifugo(s: DaifugoSession, now: number) {
  const elapsedMs =
    s.clock.elapsedMs +
    (s.phase === "playing" && s.clock.lastStartedAt !== null
      ? Math.max(0, now - s.clock.lastStartedAt)
      : 0);
  const rank = s.finishOrder.indexOf("human") + 1;
  s.phase = "finished";
  s.clock = { elapsedMs, lastStartedAt: null };
  s.result = {
    outcome: rank === 1 ? "win" : "loss",
    elapsedMs,
    finishedAt: now,
    score: null,
    stats: { moves: s.moveCount, rank, revolution: s.revolution ? 1 : 0 },
  };
}
const active = (s: DaifugoSession) => seats.filter((p) => s.hands[p].length);
function nextActive(s: DaifugoSession, from: Participant): Participant {
  const i = seats.indexOf(from);
  for (let k = 1; k <= 4; k++) {
    const p = seats[(i + k) % 4]!;
    if (s.hands[p].length) return p;
  }
  return from;
}
function clearField(s: DaifugoSession) {
  if (s.field) s.pile.push(...s.field.cards);
  s.field = null;
  s.passed = [];
}
/** 手番を次の人へ。最後に出した人まで一周したら(または全員パスなら)場を流す */
function advance(s: DaifugoSession, from: Participant) {
  const i = seats.indexOf(from);
  for (let k = 1; k <= 4; k++) {
    const p = seats[(i + k) % 4]!;
    if (!s.hands[p].length || s.passed.includes(p)) continue;
    if (s.field && p === s.field.by) {
      clearField(s);
      s.lastEvent = "clear";
    }
    s.turn = p;
    return;
  }
  // 出した人があがっていて、残り全員がパスした
  const owner = s.field?.by ?? from;
  clearField(s);
  s.lastEvent = "clear";
  s.turn = nextActive(s, owner);
}

/** CPUの選択(自分の手札と場・各人の枚数だけを見る) */
export function chooseDaifugo(
  s: DaifugoSession,
  actor: Participant,
  difficulty: Difficulty,
  initial: RngState,
): { cards: CardId[] | null; rng: RngState } {
  const hand = s.hands[actor];
  const field = s.field?.cards ?? null;
  const moves = daifugoMoves(hand, field, s.revolution);
  if (!moves.length) return { cards: null, rng: initial };
  if (difficulty === "easy") {
    const [n, r] = nextRng(initial);
    return { cards: moves[Math.floor(n * moves.length)] ?? null, rng: r };
  }
  const left = hand.length;
  const opponentsLow = seats.some(
    (p) => p !== actor && s.hands[p].length > 0 && s.hands[p].length <= 2,
  );
  // 出し切れるなら出す
  const finisher = moves.find((m) => m.length === left);
  if (finisher) return { cards: finisher, rng: initial };
  const expensive = (m: CardId[]) =>
    m.includes("JOKER") ||
    (s.revolution ? comboStrength(m) <= 4 : comboStrength(m) >= 15);
  if (!field) {
    // 親: 弱い数字を、まとめて出せるならまとめて出す
    const candidates = moves.filter((m) => !expensive(m) || left <= 3);
    const pool = candidates.length ? candidates : moves;
    const weakest = order(pool[0]!, s.revolution);
    const sameRank = pool.filter((m) => order(m, s.revolution) === weakest);
    const pick = sameRank.sort((a, b) => b.length - a.length)[0]!;
    if (difficulty === "hard") {
      // 弱い札が多いなら革命を狙う
      const quad = moves.find((m) => m.length === 4 && !m.includes("JOKER"));
      const weak = hand.filter((c) => c !== "JOKER" && strength(c) <= 7).length;
      if (quad && !s.revolution && weak >= left / 2)
        return { cards: quad, rng: initial };
    }
    return { cards: pick, rng: initial };
  }
  // 子: できるだけ弱い組で返す。強い札は終盤か、相手があがりそうなときだけ
  const cheap = moves.filter((m) => !expensive(m));
  if (cheap.length) {
    if (difficulty === "hard") {
      const eight = cheap.find((m) => hasEight(m));
      if (eight && left > 2) return { cards: eight, rng: initial };
    }
    return { cards: cheap[0]!, rng: initial };
  }
  if (left <= 4 || opponentsLow || difficulty === "hard")
    return { cards: moves[0]!, rng: initial };
  return { cards: null, rng: initial };
}

export function daifugoHint(s: DaifugoSession): string {
  if (s.turn !== "human") return "相手の番です。";
  const moves = daifugoMoves(
    s.hands.human,
    s.field?.cards ?? null,
    s.revolution,
  );
  if (!moves.length) return "出せる組がありません。パスしてください。";
  const label = (m: CardId[]) =>
    m.map((c) => (c === "JOKER" ? "ジョーカー" : describe(c))).join("・");
  return `${label(moves[0]!)} を出せます${s.revolution ? "(革命中: 弱い数字ほど強い)" : ""}。`;
}
const describe = (c: CardId) => {
  const card = getCard(c);
  const r = card.rank;
  const label =
    r === 1
      ? "A"
      : r === 11
        ? "J"
        : r === 12
          ? "Q"
          : r === 13
            ? "K"
            : String(r);
  return `${{ S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit ?? "S"]}${label}`;
};

/** 1手進める。sは複製済み。成功ならメッセージ、失敗なら{error} */
export function stepDaifugo(
  s: DaifugoSession,
  action: TableAction,
  now: number,
): string | { error: string } {
  let actor: Participant;
  let cards: CardId[] | null = null;
  if (action.kind === "CPU") {
    if (s.turn === "human") return { error: "あなたの番です。" };
    actor = s.turn;
    const choice = chooseDaifugo(s, actor, s.config.difficulty, s.rng);
    s.rng = choice.rng;
    cards = choice.cards;
  } else if (action.kind === "DF_PLAY") {
    actor = action.actor;
    cards = [...action.cards];
  } else if (action.kind === "DF_PASS") {
    actor = action.actor;
  } else return { error: "このゲームでは使えない操作です。" };
  if (actor !== s.turn) return { error: "あなたの手番ではありません。" };
  s.lastEvent = "none";
  const name = actor === "human" ? "あなた" : `CPU ${actor.slice(3)}`;
  if (!cards) {
    if (!s.field) return { error: "親は1組以上を出してください。" };
    s.passed.push(actor);
    s.moveCount++;
    advance(s, actor);
    return `${name}はパスしました。${(s.lastEvent as DaifugoSession["lastEvent"]) === "clear" ? "場が流れました。" : ""}`;
  }
  if (!cards.every((c) => s.hands[actor].includes(c)))
    return { error: "手札にない札は出せません。" };
  if (!validCombo(cards))
    return {
      error:
        "1枚か、同じ数字の2〜4枚を選んでください(ジョーカーは代用できます)。",
    };
  const field = s.field?.cards ?? null;
  if (field && cards.length !== field.length)
    return { error: `場と同じ${field.length}枚で出してください。` };
  if (!beats(cards, field, s.revolution))
    return {
      error: s.revolution
        ? "革命中です。場より弱い数字(3が最強側)を出してください。"
        : "場より強い数字を出してください。",
    };
  const chosen = cards;
  s.hands[actor] = s.hands[actor].filter((c) => !chosen.includes(c));
  if (s.field) s.pile.push(...s.field.cards);
  s.field = { cards: chosen, by: actor };
  s.moveCount++;
  let note = "";
  if (chosen.length === 4) {
    s.revolution = !s.revolution;
    s.lastEvent = "revolution";
    note = s.revolution
      ? " 革命！ 強さが逆転しました。"
      : " 革命返し！ 強さが元に戻りました。";
  }
  if (!s.hands[actor].length && !s.finishOrder.includes(actor)) {
    s.finishOrder.push(actor);
    note += ` ${name}があがり(${daifugoTitles[s.finishOrder.length - 1]})。`;
  }
  const left = active(s);
  if (left.length <= 1) {
    for (const p of left) if (!s.finishOrder.includes(p)) s.finishOrder.push(p);
    clearField(s);
    finishDaifugo(s, now);
    return `ゲーム終了です。${note}`;
  }
  if (hasEight(chosen)) {
    clearField(s);
    s.lastEvent = "eight";
    s.turn = s.hands[actor].length ? actor : nextActive(s, actor);
    return `${name}が出しました。8切り！ 場が流れました。${note}`;
  }
  advance(s, actor);
  return `${name}が${chosen.length}枚出しました。${note}`;
}

/** 保存データの検証(共通部分は呼び出し側で確認済み) */
export function validDaifugo(v: Record<string, unknown>): boolean {
  const s = v as unknown as DaifugoSession;
  const deck = new Set<string>(makeDeck(true).map((c) => c.id));
  const list = (x: unknown): x is CardId[] =>
    Array.isArray(x) && x.every((c) => typeof c === "string" && deck.has(c));
  if (
    !s.hands ||
    typeof s.hands !== "object" ||
    !seats.every((p) => list(s.hands[p])) ||
    !list(s.pile) ||
    !(
      s.field === null ||
      (typeof s.field === "object" &&
        list(s.field.cards) &&
        seats.includes(s.field.by))
    ) ||
    !Array.isArray(s.passed) ||
    !s.passed.every((p) => seats.includes(p)) ||
    new Set(s.passed).size !== s.passed.length ||
    !Array.isArray(s.finishOrder) ||
    !s.finishOrder.every((p) => seats.includes(p)) ||
    new Set(s.finishOrder).size !== s.finishOrder.length ||
    !seats.includes(s.turn) ||
    typeof s.revolution !== "boolean" ||
    !["none", "eight", "revolution", "clear"].includes(String(s.lastEvent))
  )
    return false;
  const all = [
    ...seats.flatMap((p) => s.hands[p]),
    ...s.pile,
    ...(s.field?.cards ?? []),
  ];
  if (all.length !== 53 || new Set(all).size !== 53) return false;
  if (s.field && !validCombo(s.field.cards)) return false;
  // 最下位(大貧民)だけは札を残したまま終局する
  const outs =
    s.phase === "finished" ? s.finishOrder.slice(0, 3) : s.finishOrder;
  if (outs.some((p) => s.hands[p].length > 0)) return false;
  if (seats.some((p) => !s.hands[p].length && !s.finishOrder.includes(p)))
    return false;
  if (s.phase === "finished")
    return (
      s.finishOrder.length === 4 &&
      s.field === null &&
      s.result?.outcome === (s.finishOrder[0] === "human" ? "win" : "loss")
    );
  return (
    active(s).length >= 2 &&
    s.hands[s.turn].length > 0 &&
    !s.passed.includes(s.turn) &&
    (s.field !== null || s.passed.length === 0)
  );
}
