import { useEffect, useState } from "react";
import type { TableAction, UnoCardId, UnoColor, UnoSession } from "./types.ts";
import { seats } from "./types.ts";
import {
  unoCard,
  unoColorNames,
  unoColors,
  unoLabel,
  unoMoves,
  unoNext,
} from "./uno.ts";

const names = { human: "あなた", cpu1: "CPU 1", cpu2: "CPU 2", cpu3: "CPU 3" };
const glyph = (id: UnoCardId) => {
  const c = unoCard(id);
  return c.kind === "number"
    ? String(c.value)
    : { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "✦", draw4: "+4" }[c.kind];
};

export function UnoCardView({
  id,
  onClick,
  disabled = false,
  selected = false,
  small = false,
}: {
  id: UnoCardId;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
}) {
  const c = unoCard(id);
  const cls = `uno-card uno-${c.color ?? "W"} ${small ? "uno-small" : ""} ${selected ? "card-selected" : ""}`;
  const g = glyph(id);
  const inner = (
    <>
      <span className="uno-corner">{g}</span>
      <span className="uno-center" aria-hidden="true">
        <span>{g}</span>
      </span>
      <span className="uno-corner bottom" aria-hidden="true">
        {g}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={unoLabel(id)}
      aria-pressed={selected}
    >
      {inner}
    </button>
  ) : (
    <div className={cls} role="img" aria-label={unoLabel(id)}>
      {inner}
    </div>
  );
}

export function UnoTable({
  s,
  act,
  playing,
}: {
  s: UnoSession;
  act: (a: TableAction) => void;
  playing: boolean;
}) {
  const [wild, setWild] = useState<UnoCardId | null>(null);
  useEffect(() => {
    setWild(null);
  }, [s.turn, s.hands.human]);
  const myTurn = s.turn === "human" && playing;
  const legal = new Set(myTurn ? unoMoves(s, "human") : []);
  const top = s.discard.at(-1)!;
  const play = (id: UnoCardId) => {
    if (!unoCard(id).color) setWild(id);
    else act({ kind: "UN_PLAY", actor: "human", cardId: id });
  };
  const pickColor = (color: UnoColor) => {
    if (!wild) return;
    act({ kind: "UN_PLAY", actor: "human", cardId: wild, color });
    setWild(null);
  };
  const next = unoNext(s);
  return (
    <>
      <div className="opponent-grid">
        {seats
          .filter((p) => p !== "human")
          .map((p) => (
            <div
              key={p}
              className={`opponent ${s.turn === p && s.phase !== "finished" ? "is-turn" : ""}`}
            >
              <span>{names[p]}</span>
              <strong>{s.hands[p].length}枚</strong>
              <small>
                {s.hands[p].length === 1
                  ? "UNO！"
                  : s.turn === p
                    ? "手番"
                    : next === p
                      ? "次の番"
                      : "待機中"}
              </small>
            </div>
          ))}
      </div>
      <div className="uno-center-row">
        <div className="uno-pile">
          <span>山札 {s.drawPile.length}枚</span>
          <button
            type="button"
            className="uno-card uno-back"
            disabled={!myTurn || !!s.drawn}
            onClick={() => act({ kind: "UN_DRAW", actor: "human" })}
            aria-label="山札から1枚引く"
          >
            <span className="uno-back-mark" aria-hidden="true">
              ◐
            </span>
          </button>
        </div>
        <div className="uno-pile">
          <span>場札</span>
          <UnoCardView id={top} />
        </div>
        <div className="uno-state">
          <span className={`uno-chip uno-${s.color}`}>
            場の色: {unoColorNames[s.color]}
          </span>
          <span className="uno-direction">
            {s.direction === 1 ? "↻ 時計回り" : "↺ 逆回り"}
          </span>
          {s.lastEvent !== "none" && (
            <span className="uno-event">
              {
                {
                  skip: "スキップ！",
                  reverse: "リバース！",
                  draw2: "ドロー2！",
                  wild: "ワイルド！",
                  draw4: "ワイルドドロー4！",
                }[s.lastEvent]
              }
            </span>
          )}
        </div>
      </div>
      <h2 className="table-turn">
        {s.turn === "human"
          ? s.drawn
            ? `引いた ${unoLabel(s.drawn)} を出すか、パスしてください`
            : legal.size
              ? `${unoColorNames[s.color]}の札か、同じ数字・記号を出しましょう`
              : "出せる札がありません。山札から1枚引いてください"
          : `${names[s.turn]}が考えています…`}
      </h2>
      {wild && (
        <div className="uno-picker" role="group" aria-label="次の色を選ぶ">
          <span>次の色を選んでください</span>
          {unoColors.map((k) => (
            <button
              key={k}
              type="button"
              className={`uno-chip uno-${k}`}
              onClick={() => pickColor(k)}
            >
              {unoColorNames[k]}
            </button>
          ))}
          <button type="button" onClick={() => setWild(null)}>
            やめる
          </button>
        </div>
      )}
      <h3 className="hand-label">
        あなたの手札 · {s.hands.human.length}枚
        {s.hands.human.length === 1 ? " — UNO！" : ""}
      </h3>
      <div className="hand-row uno-hand">
        {s.hands.human.map((c) => (
          <span
            key={c}
            className={`${legal.has(c) ? "legal-card" : ""} ${s.drawn === c ? "uno-drawn" : ""}`}
          >
            <UnoCardView
              id={c}
              selected={wild === c}
              disabled={!myTurn || !legal.has(c)}
              onClick={() => play(c)}
            />
          </span>
        ))}
      </div>
      {s.drawn && myTurn && (
        <button
          className="table-pass"
          onClick={() => act({ kind: "UN_PASS", actor: "human" })}
        >
          出さずにパス
        </button>
      )}
      <p className="table-instruction">
        捨て札 {s.discard.length}枚 ·
        光っている札が出せます。ワイルドは出したあとに色を選びます。
      </p>
    </>
  );
}
