import type { Card, CardId, Rank, Suit, RngState } from "../app/types.ts";
export const suits: Suit[] = ["S", "H", "D", "C"];
export const symbols: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};
export const color = (s: Suit): "red" | "black" =>
  s === "H" || s === "D" ? "red" : "black";
export const rankLabel = (rank: number): string =>
  ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] ?? String(rank);
export function makeDeck(joker = false): Card[] {
  const cards: Card[] = suits.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}-${i + 1}` as CardId,
      suit,
      rank: (i + 1) as Rank,
      isJoker: false,
    })),
  );
  if (joker) cards.push({ id: "JOKER", suit: null, rank: null, isJoker: true });
  return cards;
}
export const getCard = (id: CardId): Card => {
  const c = makeDeck(true).find((c) => c.id === id);
  if (!c) throw Error("不正なカードです");
  return c;
};
export const pairKey = (id: CardId): string => {
  const c = getCard(id);
  if (!c.suit || !c.rank) throw Error("ペアに使えないカードです");
  return `${color(c.suit)}-${c.rank}`;
};
export function rng(seed: number): RngState {
  const n = seed >>> 0 || 0x6d2b79f5;
  return { seed: n, state: n };
}
export function nextRng(state: RngState): [number, RngState] {
  let x = state.state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return [x / 2 ** 32, { ...state, state: x }];
}
export function shuffle<T>(
  input: readonly T[],
  initial: RngState,
): [T[], RngState] {
  const result = [...input];
  let state = initial;
  for (let i = result.length - 1; i > 0; i--) {
    const [n, next] = nextRng(state);
    state = next;
    const j = Math.floor(n * (i + 1));
    const a = result[i],
      b = result[j];
    if (a === undefined || b === undefined) throw Error("山札が不正です");
    result[i] = b;
    result[j] = a;
  }
  return [result, state];
}
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}
export function sessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function adjacentRank(a: number, b: number, wrap: boolean): boolean {
  return Math.abs(a - b) === 1 || (wrap && Math.abs(a - b) === 12);
}
