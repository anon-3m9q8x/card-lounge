/**
 * UNO(1人 + CPU3人)
 * - 108枚: 4色 × (0が1枚、1〜9・スキップ・リバース・ドロー2が各2枚) + ワイルド4枚 + ワイルドドロー4が4枚。
 * - 7枚ずつ配り、山札の上から数字札を1枚めくって開始。最初の手番はあなた。
 * - 場の一番上と「色」か「数字・記号」が同じ札、またはワイルド系を出せる。
 * - 出せない・出さないときは山札から1枚引く。引いた札が出せるならその札を出すか、パスを選ぶ。
 * - スキップ: 次の人を飛ばす。リバース: 順番が逆回り。ドロー2/ワイルドドロー4: 次の人が2枚/4枚引いて番を飛ばされる。
 *   (重ね出し・チャレンジ・UNO宣言忘れの罰はなし。残り1枚になると自動で「UNO」を表示)
 * - 最初に手札をなくした人の勝ち。
 */
import type { Difficulty, RngState } from "../../app/types.ts";
import type {
  Participant,
  TableAction,
  TableBase,
  UnoCardId,
  UnoColor,
  UnoSession,
} from "./types.ts";
import { seats } from "./types.ts";
import { nextRng, shuffle } from "../../core/cards.ts";

export const unoColors: UnoColor[] = ["R", "Y", "G", "B"];
export const unoColorNames: Record<UnoColor, string> = {
  R: "赤",
  Y: "黄",
  G: "緑",
  B: "青",
};
export type UnoKind =
  "number" | "skip" | "reverse" | "draw2" | "wild" | "draw4";
export interface UnoCard {
  id: UnoCardId;
  color: UnoColor | null;
  kind: UnoKind;
  value: number | null;
}
export function makeUnoDeck(): UnoCardId[] {
  const ids: UnoCardId[] = [];
  for (const c of unoColors) {
    ids.push(`${c}0-1`);
    for (let n = 1; n <= 9; n++) ids.push(`${c}${n}-1`, `${c}${n}-2`);
    for (const k of ["S", "R", "D"]) ids.push(`${c}${k}-1`, `${c}${k}-2`);
  }
  for (let i = 1; i <= 4; i++) ids.push(`W-${i}`, `W4-${i}`);
  return ids;
}
const deckSet = new Set(makeUnoDeck());
export function unoCard(id: UnoCardId): UnoCard {
  if (!deckSet.has(id)) throw Error("不正なUNO札です");
  if (id.startsWith("W4-"))
    return { id, color: null, kind: "draw4", value: null };
  if (id.startsWith("W-"))
    return { id, color: null, kind: "wild", value: null };
  const color = id[0] as UnoColor;
  const code = id.slice(1, id.indexOf("-"));
  if (code === "S") return { id, color, kind: "skip", value: null };
  if (code === "R") return { id, color, kind: "reverse", value: null };
  if (code === "D") return { id, color, kind: "draw2", value: null };
  return { id, color, kind: "number", value: Number(code) };
}
export const unoLabel = (id: UnoCardId): string => {
  const c = unoCard(id);
  const face =
    c.kind === "number"
      ? String(c.value)
      : {
          skip: "スキップ",
          reverse: "リバース",
          draw2: "ドロー2",
          wild: "ワイルド",
          draw4: "ワイルドドロー4",
        }[c.kind];
  return c.color ? `${unoColorNames[c.color]}の${face}` : face;
};
/** 出せるか: ワイルド系は常に可。色が現在色と同じ、または数字・記号が場札と同じ */
export function unoPlayable(
  id: UnoCardId,
  top: UnoCardId,
  color: UnoColor,
): boolean {
  const c = unoCard(id),
    t = unoCard(top);
  if (c.kind === "wild" || c.kind === "draw4") return true;
  if (c.color === color) return true;
  if (c.kind === "number") return t.kind === "number" && t.value === c.value;
  return c.kind === t.kind;
}
export function unoMoves(s: UnoSession, actor: Participant): UnoCardId[] {
  const top = s.discard.at(-1);
  if (!top) return [];
  const hand = s.drawn && actor === s.turn ? [s.drawn] : s.hands[actor];
  return hand.filter((c) => unoPlayable(c, top, s.color));
}
const step = (s: UnoSession, from: Participant, k: number): Participant => {
  const i = seats.indexOf(from);
  return seats[(((i + s.direction * k) % 4) + 4) % 4]!;
};
export const unoNext = (s: UnoSession) => step(s, s.turn, 1);

export function createUno(b: TableBase): UnoSession {
  const [deck, r] = shuffle(makeUnoDeck(), b.rng);
  const hands: Record<Participant, UnoCardId[]> = {
    human: [],
    cpu1: [],
    cpu2: [],
    cpu3: [],
  };
  for (let i = 0; i < 7; i++)
    for (const p of seats) {
      const c = deck.pop();
      if (c) hands[p].push(c);
    }
  // 最初の場札は数字札(記号・ワイルドは山札の底へ戻す)
  let top = deck.pop();
  while (top && unoCard(top).kind !== "number") {
    deck.unshift(top);
    top = deck.pop();
  }
  if (!top) throw Error("配札失敗");
  for (const p of seats) hands[p] = sortHand(hands[p]);
  return {
    ...b,
    rng: r,
    gameId: "uno",
    hands,
    drawPile: deck,
    discard: [top],
    color: unoCard(top).color ?? "R",
    direction: 1,
    turn: "human",
    drawn: null,
    lastEvent: "none",
  };
}
/** 手札は色→数字→記号の順に並べる(表示のため。並び自体に意味はない) */
export function sortHand(hand: readonly UnoCardId[]): UnoCardId[] {
  const key = (id: UnoCardId) => {
    const c = unoCard(id);
    const ci = c.color ? unoColors.indexOf(c.color) : 4;
    const ki =
      c.kind === "number"
        ? (c.value ?? 0)
        : { skip: 10, reverse: 11, draw2: 12, wild: 13, draw4: 14 }[c.kind];
    return ci * 100 + ki;
  };
  return [...hand].sort((a, b) => key(a) - key(b) || a.localeCompare(b));
}
/** 山札から1枚。空なら場札の一番上以外を混ぜて山札にする */
function drawOne(s: UnoSession): UnoCardId | null {
  if (!s.drawPile.length && s.discard.length > 1) {
    const top = s.discard.pop()!;
    const [deck, r] = shuffle(s.discard, s.rng);
    s.rng = r;
    s.drawPile = deck;
    s.discard = [top];
  }
  return s.drawPile.pop() ?? null;
}
function give(s: UnoSession, p: Participant, n: number): number {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const c = drawOne(s);
    if (!c) break;
    s.hands[p].push(c);
    got++;
  }
  s.hands[p] = sortHand(s.hands[p]);
  return got;
}
function favoriteColor(hand: readonly UnoCardId[]): UnoColor | null {
  const counts = unoColors.map(
    (k) => hand.filter((c) => unoCard(c).color === k).length,
  );
  const max = Math.max(...counts);
  return max > 0 ? unoColors[counts.indexOf(max)]! : null;
}
/** CPUの選択(自分の手札・場札・各人の枚数だけを見る) */
export function chooseUno(
  s: UnoSession,
  actor: Participant,
  difficulty: Difficulty,
  initial: RngState,
): { cardId: UnoCardId | null; color: UnoColor; rng: RngState } {
  let rng = initial;
  const legal = unoMoves(s, actor);
  const rest = (id: UnoCardId) => s.hands[actor].filter((c) => c !== id);
  const pickColor = (id: UnoCardId): UnoColor => {
    const fav = favoriteColor(rest(id));
    if (fav && difficulty !== "easy") return fav;
    const [n, r] = nextRng(rng);
    rng = r;
    return fav && n < 0.5 ? fav : unoColors[Math.floor(n * 4)]!;
  };
  if (!legal.length) return { cardId: null, color: s.color, rng };
  let choice: UnoCardId;
  if (difficulty === "easy") {
    const [n, r] = nextRng(rng);
    rng = r;
    choice = legal[Math.floor(n * legal.length)]!;
  } else {
    const nextCount = s.hands[step(s, actor, 1)].length;
    const fav = favoriteColor(s.hands[actor]);
    const score = (id: UnoCardId) => {
      const c = unoCard(id);
      const attack =
        c.kind === "draw2" ||
        c.kind === "skip" ||
        c.kind === "draw4" ||
        c.kind === "reverse";
      let v = 0;
      if (c.kind === "wild" || c.kind === "draw4") v -= 50; // ワイルド系は温存
      if (c.color && c.color === fav) v += 10;
      if (c.kind === "number") v += (c.value ?? 0) * 0.5; // 大きい数字から減らす
      if (difficulty === "hard") {
        if (nextCount <= 2 && attack) v += 80; // あがりそうな相手を止める
        if (s.hands[actor].length <= 3 && attack) v += 20;
      } else if (attack) v += 5;
      return v;
    };
    choice = [...legal].sort((a, b) => score(b) - score(a))[0]!;
  }
  const c = unoCard(choice);
  const color = c.color ?? pickColor(choice);
  return { cardId: choice, color, rng };
}
export function unoHint(s: UnoSession): string {
  if (s.turn !== "human") return "相手の番です。";
  const legal = unoMoves(s, "human");
  if (s.drawn)
    return legal.length
      ? `引いた ${unoLabel(s.drawn)} を出せます。出さないならパスできます。`
      : "引いた札は出せません。パスしてください。";
  return legal.length
    ? `${unoLabel(legal[0]!)} を出せます(場の色: ${unoColorNames[s.color]})。`
    : "出せる札がありません。山札から1枚引いてください。";
}
function finishUno(s: UnoSession, winner: Participant, now: number) {
  const elapsedMs =
    s.clock.elapsedMs +
    (s.phase === "playing" && s.clock.lastStartedAt !== null
      ? Math.max(0, now - s.clock.lastStartedAt)
      : 0);
  s.phase = "finished";
  s.drawn = null;
  s.clock = { elapsedMs, lastStartedAt: null };
  s.result = {
    outcome: winner === "human" ? "win" : "loss",
    elapsedMs,
    finishedAt: now,
    score: null,
    stats: {
      moves: s.moveCount,
      winner: seats.indexOf(winner),
      cardsLeft: s.hands.human.length,
    },
  };
}
const nameOf = (p: Participant) =>
  p === "human" ? "あなた" : `CPU ${p.slice(3)}`;

export function stepUno(
  s: UnoSession,
  action: TableAction,
  now: number,
): string | { error: string } {
  let actor: Participant;
  let kind: "play" | "draw" | "pass";
  let cardId: UnoCardId | null = null;
  let chosenColor: UnoColor | undefined;
  if (action.kind === "CPU") {
    if (s.turn === "human") return { error: "あなたの番です。" };
    actor = s.turn;
    const choice = chooseUno(s, actor, s.config.difficulty, s.rng);
    s.rng = choice.rng;
    if (choice.cardId) {
      kind = "play";
      cardId = choice.cardId;
      chosenColor = choice.color;
    } else kind = s.drawn ? "pass" : "draw";
  } else if (action.kind === "UN_PLAY") {
    actor = action.actor;
    kind = "play";
    cardId = action.cardId;
    chosenColor = action.color;
  } else if (action.kind === "UN_DRAW") {
    actor = action.actor;
    kind = "draw";
  } else if (action.kind === "UN_PASS") {
    actor = action.actor;
    kind = "pass";
  } else return { error: "このゲームでは使えない操作です。" };
  if (actor !== s.turn) return { error: "あなたの手番ではありません。" };
  s.lastEvent = "none";
  const name = nameOf(actor);
  if (kind === "draw") {
    if (s.drawn)
      return { error: "すでに1枚引いています。出すかパスしてください。" };
    const c = drawOne(s);
    s.moveCount++;
    if (!c) {
      s.turn = step(s, actor, 1);
      return `山札がないため、${name}の番を飛ばしました。`;
    }
    s.hands[actor] = sortHand([...s.hands[actor], c]);
    const top = s.discard.at(-1)!;
    if (unoPlayable(c, top, s.color)) {
      s.drawn = c;
      return actor === "human"
        ? `${unoLabel(c)} を引きました。出すかパスを選んでください。`
        : `${name}が1枚引きました。`;
    }
    s.turn = step(s, actor, 1);
    return actor === "human"
      ? `${unoLabel(c)} を引きました。出せないので次の番へ。`
      : `${name}が1枚引いて、番を終えました。`;
  }
  if (kind === "pass") {
    if (!s.drawn) return { error: "パスは山札から1枚引いた後にできます。" };
    s.drawn = null;
    s.moveCount++;
    s.turn = step(s, actor, 1);
    return `${name}はパスしました。`;
  }
  if (!cardId || !s.hands[actor].includes(cardId))
    return { error: "手札にない札は出せません。" };
  if (s.drawn && cardId !== s.drawn)
    return { error: "引いた札だけ出せます。出さないならパスしてください。" };
  const top = s.discard.at(-1)!;
  if (!unoPlayable(cardId, top, s.color))
    return {
      error: `その札は出せません。${unoColorNames[s.color]}の札か、同じ数字・記号、ワイルドを出してください。`,
    };
  const c = unoCard(cardId);
  if (!c.color && (!chosenColor || !unoColors.includes(chosenColor)))
    return { error: "ワイルドの次の色を選んでください。" };
  const played = cardId;
  s.hands[actor] = s.hands[actor].filter((x) => x !== played);
  s.discard.push(played);
  s.color = c.color ?? chosenColor!;
  s.drawn = null;
  s.moveCount++;
  if (!s.hands[actor].length) {
    finishUno(s, actor, now);
    return `${name}が最後の1枚を出してあがりました。`;
  }
  let note = `${name}が${unoLabel(played)}を出しました。`;
  if (!c.color) note += ` 次の色は${unoColorNames[s.color]}。`;
  if (c.kind === "skip") {
    s.lastEvent = "skip";
    const skipped = step(s, actor, 1);
    s.turn = step(s, actor, 2);
    note += ` ${nameOf(skipped)}の番を飛ばします。`;
  } else if (c.kind === "reverse") {
    s.lastEvent = "reverse";
    s.direction = s.direction === 1 ? -1 : 1;
    s.turn = step(s, actor, 1);
    note += " 順番が逆回りになりました。";
  } else if (c.kind === "draw2" || c.kind === "draw4") {
    s.lastEvent = c.kind;
    const target = step(s, actor, 1);
    const got = give(s, target, c.kind === "draw2" ? 2 : 4);
    s.turn = step(s, actor, 2);
    note += ` ${nameOf(target)}が${got}枚引いて番を飛ばされました。`;
  } else {
    if (c.kind === "wild") s.lastEvent = "wild";
    s.turn = step(s, actor, 1);
  }
  if (s.hands[actor].length === 1) note += ` ${name}「UNO！」`;
  return note;
}

export function validUno(v: Record<string, unknown>): boolean {
  const s = v as unknown as UnoSession;
  const list = (x: unknown): x is UnoCardId[] =>
    Array.isArray(x) && x.every((c) => typeof c === "string" && deckSet.has(c));
  if (
    !s.hands ||
    typeof s.hands !== "object" ||
    !seats.every((p) => list(s.hands[p])) ||
    !list(s.drawPile) ||
    !list(s.discard) ||
    !s.discard.length ||
    !unoColors.includes(s.color) ||
    (s.direction !== 1 && s.direction !== -1) ||
    !seats.includes(s.turn) ||
    !(
      s.drawn === null ||
      (typeof s.drawn === "string" && deckSet.has(s.drawn))
    ) ||
    !["none", "skip", "reverse", "draw2", "wild", "draw4"].includes(
      String(s.lastEvent),
    )
  )
    return false;
  const all = [
    ...seats.flatMap((p) => s.hands[p]),
    ...s.drawPile,
    ...s.discard,
  ];
  if (all.length !== 108 || new Set(all).size !== 108) return false;
  const top = unoCard(s.discard.at(-1)!);
  if (top.color && top.color !== s.color) return false;
  const empty = seats.filter((p) => !s.hands[p].length);
  if (s.phase === "finished") {
    const winner = empty[0];
    return (
      empty.length === 1 &&
      !!winner &&
      s.drawn === null &&
      s.result?.outcome === (winner === "human" ? "win" : "loss")
    );
  }
  if (empty.length) return false;
  if (s.drawn !== null) {
    if (!s.hands[s.turn].includes(s.drawn)) return false;
    if (!unoPlayable(s.drawn, s.discard.at(-1)!, s.color)) return false;
  }
  return true;
}
