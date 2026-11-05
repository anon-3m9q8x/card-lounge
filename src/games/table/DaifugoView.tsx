import { useEffect, useMemo, useState } from "react";
import type { CardId } from "../../app/types.ts";
import type { DaifugoSession, TableAction } from "./types.ts";
import { seats } from "./types.ts";
import {
  beats,
  daifugoMoves,
  daifugoTitles,
  strength,
  validCombo,
} from "./daifugo.ts";
import { CardFace } from "./Cards.tsx";

const names = { human: "あなた", cpu1: "CPU 1", cpu2: "CPU 2", cpu3: "CPU 3" };

export function DaifugoTable({
  s,
  act,
  playing,
}: {
  s: DaifugoSession;
  act: (a: TableAction) => void;
  playing: boolean;
}) {
  const [picked, setPicked] = useState<CardId[]>([]);
  // 手番や場が変わったら選択を解除
  useEffect(() => {
    setPicked((p) => p.filter((c) => s.hands.human.includes(c)));
  }, [s.hands.human]);
  useEffect(() => {
    setPicked([]);
  }, [s.turn, s.field]);
  const myTurn = s.turn === "human" && playing;
  const field = s.field?.cards ?? null;
  const moves = useMemo(
    () => daifugoMoves(s.hands.human, field, s.revolution),
    [s.hands.human, field, s.revolution],
  );
  const usable = new Set(moves.flat());
  const canPlay =
    myTurn &&
    picked.length > 0 &&
    validCombo(picked) &&
    beats(picked, field, s.revolution);
  const hand = [...s.hands.human].sort(
    (a, b) => strength(a) - strength(b) || a.localeCompare(b),
  );
  const toggle = (c: CardId) =>
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const status = (p: keyof typeof names) => {
    const i = s.finishOrder.indexOf(p);
    if (i >= 0) return `あがり・${daifugoTitles[i]}`;
    if (s.turn === p) return "手番";
    if (s.passed.includes(p)) return "パス";
    return "待機中";
  };
  return (
    <>
      <div className="opponent-grid">
        {seats.map((p) => (
          <div
            key={p}
            className={`opponent ${s.turn === p && s.phase !== "finished" ? "is-turn" : ""} ${s.passed.includes(p) ? "is-passed" : ""}`}
          >
            <span>{names[p]}</span>
            <strong>{s.hands[p].length}枚</strong>
            <small>{status(p)}</small>
          </div>
        ))}
      </div>
      <div className={`df-field ${s.revolution ? "df-revolution" : ""}`}>
        <div className="df-badges">
          {s.revolution && <span className="df-badge">革命中 · 3が最強側</span>}
          {s.lastEvent === "eight" && <span className="df-badge">8切り！</span>}
          {s.lastEvent === "revolution" && (
            <span className="df-badge">
              {s.revolution ? "革命！" : "革命返し！"}
            </span>
          )}
          {s.lastEvent === "clear" && (
            <span className="df-badge quiet">場が流れました</span>
          )}
        </div>
        {s.field ? (
          <>
            <p className="df-owner">{names[s.field.by]}が出した組</p>
            <div className="df-cards" aria-label="場の札">
              {s.field.cards.map((c) => (
                <CardFace key={c} card={c} />
              ))}
            </div>
          </>
        ) : (
          <p className="df-empty">場は空です。親が好きな組を出せます。</p>
        )}
        <p className="df-pile">流れた札 {s.pile.length}枚</p>
      </div>
      <h2 className="table-turn">
        {s.turn === "human"
          ? s.field
            ? `${s.field.cards.length}枚で、場より${s.revolution ? "弱い" : "強い"}数字を出すかパス`
            : "あなたが親です。出す組を選んでください"
          : s.hands.human.length
            ? `${names[s.turn]}が考えています…`
            : "あなたはあがりました。CPUの対戦を見守っています。"}
      </h2>
      <h3 className="hand-label">
        あなたの手札 · {s.hands.human.length}枚
        {myTurn ? " — 出せる札が光っています。札を選んでから「出す」" : ""}
      </h3>
      <div className="hand-row df-hand">
        {hand.map((c) => (
          <span key={c} className={myTurn && usable.has(c) ? "legal-card" : ""}>
            <CardFace
              card={c}
              selected={picked.includes(c)}
              disabled={!myTurn}
              onClick={() => toggle(c)}
            />
          </span>
        ))}
      </div>
      <div className="df-actions">
        <button
          className="table-pass df-play"
          disabled={!canPlay}
          onClick={() =>
            act({ kind: "DF_PLAY", actor: "human", cards: picked })
          }
        >
          選んだ{picked.length ? `${picked.length}枚` : "札"}を出す
        </button>
        <button
          className="table-pass"
          disabled={!myTurn || !s.field}
          onClick={() => act({ kind: "DF_PASS", actor: "human" })}
        >
          パス{s.field && !moves.length ? "(出せる組がありません)" : ""}
        </button>
      </div>
      <p className="table-instruction">
        あがり順：
        {s.finishOrder
          .map((p, i) => `${names[p]}(${daifugoTitles[i]})`)
          .join(" → ") || "まだいません"}
      </p>
    </>
  );
}
