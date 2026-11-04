import { useEffect, useState } from "react";
import type { CardId } from "../../app/types.ts";
import type { TableSession, TableAction, KlondikePlace } from "./types.ts";
import { seats } from "./types.ts";
import {
  tableNames,
  tableElapsed,
  nextSeat,
  sevensMoves,
  speedMoves,
  needsSpeedReset,
} from "./engine.ts";
import { getCard, symbols, color, rankLabel, suits } from "../../core/cards.ts";
const names = { human: "あなた", cpu1: "CPU 1", cpu2: "CPU 2", cpu3: "CPU 3" };
const format = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.floor(ms / 1000) % 60).toString().padStart(2, "0")}`;
function Face({ card }: { card: CardId }) {
  const c = getCard(card);
  const rank = c.rank ? rankLabel(c.rank) : "J";
  const sym = c.suit ? symbols[c.suit] : "★";
  return (
    <>
      <span className="card-corner">
        {rank}
        <small>{sym}</small>
      </span>
      <span className="card-pip" aria-hidden="true">
        {sym}
      </span>
      <span className="card-corner bottom" aria-hidden="true">
        {rank}
        <small>{sym}</small>
      </span>
    </>
  );
}
export function CardFace({
  card,
  onClick,
  disabled = false,
  selected = false,
  label,
}: {
  card: CardId;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
}) {
  const c = getCard(card);
  const cls = `playing-card face-up ${c.suit ? color(c.suit) : "red"} ${selected ? "card-selected" : ""}`;
  const name =
    label ??
    (c.suit ? `${symbols[c.suit]} ${rankLabel(c.rank ?? 0)}` : "ジョーカー");
  return onClick ? (
    <button
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={name}
      aria-pressed={selected}
    >
      <Face card={card} />
    </button>
  ) : (
    <div className={cls} role="img" aria-label={name}>
      <Face card={card} />
    </div>
  );
}
function Back({
  index,
  onClick,
  disabled,
  label,
}: {
  index: number;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const cls = "playing-card face-down";
  const content = (
    <span className="card-pattern" aria-hidden="true">
      <span>♠</span>
    </span>
  );
  return onClick ? (
    <button
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? `裏向きカード ${index + 1}番`}
    >
      {content}
    </button>
  ) : (
    <div className={cls} role="img" aria-label={label ?? "裏向きカード"}>
      {content}
    </div>
  );
}
export function TableView({
  session: s,
  act,
  now,
  message,
  onQuit,
  onRules,
  onResume,
  countdown,
}: {
  session: TableSession;
  act: (a: TableAction) => void;
  now: number;
  message: string;
  onQuit: () => void;
  onRules: () => void;
  onResume: () => void;
  countdown: number | null;
}) {
  const [selected, setSelected] = useState<{
    from: KlondikePlace;
    count: number;
  } | null>(null);
  const [speedCard, setSpeedCard] = useState<CardId | null>(null);
  useEffect(() => {
    if (s.gameId === "klondike") setSelected(null);
  }, [s]);
  const playing = s.phase === "playing";
  const move = (to: KlondikePlace) => {
    if (!selected) return;
    act({ kind: "KL_MOVE", ...selected, to });
  };
  const header = (
    <>
      <div className="play-heading">
        <div>
          <p className="eyebrow">
            {s.gameId.toUpperCase()} /{" "}
            {s.gameId === "oldMaid"
              ? "4人対戦"
              : s.gameId === "klondike"
                ? "ドロー1"
                : `CPU ${s.config.difficulty === "easy" ? "初級" : s.config.difficulty === "normal" ? "中級" : "上級"}`}
          </p>
          <h1>{tableNames[s.gameId]}</h1>
        </div>
        <div className="play-clock">
          <span>PLAY TIME</span>
          <strong>{format(tableElapsed(s, now))}</strong>
        </div>
      </div>
      <div className="play-toolbar">
        <button
          onClick={() => (playing ? act({ kind: "PAUSE" }) : onResume())}
          disabled={countdown !== null}
        >
          {playing ? "Ⅱ 一時停止" : "▶ 再開"}
        </button>
        <button onClick={onRules}>ルール</button>
        <button onClick={() => act({ kind: "HINT" })} disabled={!playing}>
          ヒント
        </button>
        {s.gameId === "klondike" && (
          <button
            onClick={() => act({ kind: "KL_UNDO" })}
            disabled={!playing || !s.undoStack.length}
          >
            ↶ 1手戻す
          </button>
        )}
        <button onClick={onQuit}>保存・終了</button>
      </div>
    </>
  );
  return (
    <>
      {header}
      <div className={`felt-table other-table game-${s.gameId}`}>
        <span className="table-label">
          CARD LOUNGE · {tableNames[s.gameId]}
        </span>
        {s.gameId === "klondike" && (
          <>
            <p className="table-instruction">
              移動元のカード →
              置き先ボタンの順に選択。途中の札を選ぶと、その下の束をまとめて動かします。
            </p>
            <p className="scroll-note">
              小さい画面では、卓を左右にスクロールできます。
            </p>
            <div
              className="kl-scroll"
              tabIndex={0}
              role="region"
              aria-label="ソリティア卓・左右にスクロール可能"
            >
              <div className="kl-board">
                <div className="kl-top">
                  <div className="kl-slot">
                    <span>山札 {s.frame.stock.length}</span>
                    <button
                      className="stock-button"
                      disabled={
                        !playing ||
                        (!s.frame.stock.length && !s.frame.waste.length)
                      }
                      onClick={() => act({ kind: "KL_DRAW" })}
                      aria-label={
                        s.frame.stock.length
                          ? "山札を1枚めくる"
                          : "捨て札を山札に戻す"
                      }
                    >
                      {s.frame.stock.length ? (
                        <span className="card-pattern" aria-hidden="true">
                          <span>♠</span>
                        </span>
                      ) : (
                        "↺"
                      )}
                    </button>
                  </div>
                  <div className="kl-slot">
                    <span>捨て札 {s.frame.waste.length}</span>
                    {s.frame.waste.at(-1) ? (
                      <CardFace
                        card={s.frame.waste.at(-1)!}
                        disabled={!playing}
                        selected={selected?.from.zone === "waste"}
                        onClick={() =>
                          setSelected({ from: { zone: "waste" }, count: 1 })
                        }
                      />
                    ) : (
                      <div className="empty-card">—</div>
                    )}
                  </div>
                  <div className="kl-gap" />
                  {suits.map((k) => (
                    <div className="kl-slot" key={k}>
                      <button
                        className="destination"
                        disabled={!playing || !selected}
                        onClick={() => move({ zone: "foundation", suit: k })}
                        aria-label={`${symbols[k]}の組札に置く`}
                      >
                        {symbols[k]} 組札
                      </button>
                      {s.frame.foundations[k].at(-1) ? (
                        <CardFace
                          card={s.frame.foundations[k].at(-1)!}
                          disabled={!playing}
                          selected={
                            selected?.from.zone === "foundation" &&
                            selected.from.suit === k
                          }
                          onClick={() =>
                            setSelected({
                              from: { zone: "foundation", suit: k },
                              count: 1,
                            })
                          }
                        />
                      ) : (
                        <div className="empty-card">{symbols[k]} A</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="kl-columns">
                  {s.frame.tableau.map((col, column) => (
                    <section className="kl-column" key={column}>
                      <button
                        className={`destination ${selected?.from.zone === "tableau" && selected.from.column === column ? "selected-column" : ""}`}
                        disabled={!playing || !selected}
                        aria-label={`第${column + 1}列に置く`}
                        onClick={() => move({ zone: "tableau", column })}
                      >
                        {column + 1}列に置く
                      </button>
                      <div
                        className="kl-stack"
                        style={{
                          height: Math.max(
                            150,
                            (col.down.length + col.up.length - 1) * 28 + 125,
                          ),
                        }}
                      >
                        {col.down.map((_, i) => (
                          <div
                            className="stack-card"
                            key={`down-${i}`}
                            style={{ top: i * 28 }}
                          >
                            <Back index={i} />
                          </div>
                        ))}
                        {col.up.map((card, index) => (
                          <div
                            className="stack-card"
                            key={card}
                            style={{ top: (col.down.length + index) * 28 }}
                          >
                            <CardFace
                              card={card}
                              disabled={!playing}
                              selected={
                                selected?.from.zone === "tableau" &&
                                selected.from.column === column &&
                                index >= col.up.length - selected.count
                              }
                              label={`${symbols[getCard(card).suit ?? "S"]} ${rankLabel(getCard(card).rank ?? 0)}、第${column + 1}列、${col.up.length - index}枚の束`}
                              onClick={() =>
                                setSelected({
                                  from: { zone: "tableau", column },
                                  count: col.up.length - index,
                                })
                              }
                            />
                          </div>
                        ))}
                        {!col.down.length && !col.up.length && (
                          <div className="empty-card">K</div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <p className="table-instruction">
              {selected
                ? `${selected.count}枚を選択中。置き先を選んでください。`
                : "カードを選ぶか、山札をめくってください。"}
              　再循環 {s.frame.redealCount}回 · 操作 {s.moveCount}回
            </p>
          </>
        )}
        {s.gameId === "oldMaid" && (
          <>
            <div className="opponent-grid">
              {seats
                .filter((p) => p !== "human")
                .map((p) => (
                  <div
                    key={p}
                    className={`opponent ${s.turn === p ? "is-turn" : ""}`}
                  >
                    <span>{names[p]}</span>
                    <strong>{s.hands[p].length}枚</strong>
                    <small>
                      {s.finishOrder.includes(p)
                        ? "あがり"
                        : s.turn === p
                          ? "カードを選択中…"
                          : "待機中"}
                    </small>
                  </div>
                ))}
            </div>
            <h2 className="table-turn">
              {s.turn === "human"
                ? `${names[nextSeat("human", s.hands)]}から1枚引いてください`
                : s.hands.human.length
                  ? "CPUの手番です"
                  : "あなたはあがりました。CPUの対戦を見守っています。"}
            </h2>
            {s.turn === "human" && (
              <div className="draw-row" aria-label="相手の裏向きカード">
                {s.hands[nextSeat("human", s.hands)].map((_, i) => (
                  <Back
                    index={i}
                    key={i}
                    disabled={!playing}
                    onClick={() =>
                      act({ kind: "OM_DRAW", actor: "human", targetIndex: i })
                    }
                    label={`${names[nextSeat("human", s.hands)]}の裏向きカード ${i + 1}番`}
                  />
                ))}
              </div>
            )}
            <h3 className="hand-label">
              あなたの手札 · {s.hands.human.length}枚
            </h3>
            <div className="hand-row">
              {[...s.hands.human]
                .sort(
                  (a, b) => (getCard(a).rank ?? 99) - (getCard(b).rank ?? 99),
                )
                .map((c) => (
                  <CardFace key={c} card={c} />
                ))}
            </div>
            <p className="table-instruction">
              ペア除去済み {s.discarded.length}枚 · あがり順：
              {s.finishOrder.map((p) => names[p]).join(" → ") || "まだいません"}
            </p>
          </>
        )}
        {s.gameId === "sevens" && (
          <>
            <div className="opponent-grid">
              {seats.map((p) => (
                <div
                  key={p}
                  className={`opponent ${s.turn === p ? "is-turn" : ""}`}
                >
                  <span>{names[p]}</span>
                  <strong>{s.hands[p].length}枚</strong>
                  <small>
                    {s.finishOrder.includes(p)
                      ? "あがり"
                      : s.turn === p
                        ? "手番"
                        : "待機中"}
                  </small>
                </div>
              ))}
            </div>
            <p className="scroll-note">
              小さい画面では、卓を左右にスクロールできます。
            </p>
            <div
              className="sevens-scroll"
              tabIndex={0}
              role="region"
              aria-label="七並べ卓・左右にスクロール可能"
            >
              <div className="sevens-board">
                {suits.map((k) => (
                  <div className="seven-lane" key={k}>
                    <span className={k === "H" || k === "D" ? "lane-red" : ""}>
                      {symbols[k]}
                    </span>
                    {Array.from({ length: 13 }, (_, i) => {
                      const n = i + 1;
                      const shown = n >= s.lanes[k].low && n <= s.lanes[k].high;
                      return (
                        <div
                          className={`seven-slot ${n === 7 ? "seven-center" : ""}`}
                          key={n}
                        >
                          {shown ? (
                            <CardFace card={`${k}-${n}` as CardId} />
                          ) : (
                            <span>{rankLabel(n)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <h3 className="hand-label">
              あなたの手札 · {s.hands.human.length}枚{" "}
              {s.turn === "human" ? "— 出せる札が光っています" : ""}
            </h3>
            <div className="hand-row sevens-hand">
              {[...s.hands.human]
                .sort(
                  (a, b) =>
                    suits.indexOf(getCard(a).suit ?? "S") -
                      suits.indexOf(getCard(b).suit ?? "S") ||
                    (getCard(a).rank ?? 0) - (getCard(b).rank ?? 0),
                )
                .map((c) => (
                  <span
                    key={c}
                    className={
                      sevensMoves(s.hands.human, s.lanes).includes(c)
                        ? "legal-card"
                        : ""
                    }
                  >
                    <CardFace
                      card={c}
                      disabled={!playing || s.turn !== "human"}
                      onClick={() =>
                        act({ kind: "SV_PLACE", actor: "human", cardId: c })
                      }
                    />
                  </span>
                ))}
            </div>
            <button
              className="table-pass"
              disabled={
                !playing ||
                s.turn !== "human" ||
                (sevensMoves(s.hands.human, s.lanes).length > 0 &&
                  s.voluntaryPasses.human >= 3)
              }
              onClick={() => act({ kind: "SV_PASS", actor: "human" })}
            >
              パス{" "}
              {sevensMoves(s.hands.human, s.lanes).length
                ? `（残り${3 - s.voluntaryPasses.human}回）`
                : "（強制・回数を消費しません）"}
            </button>
            <p className="table-instruction">
              現在：{names[s.turn]} · あがり順：
              {s.finishOrder.map((p) => names[p]).join(" → ") || "まだいません"}
            </p>
          </>
        )}
        {s.gameId === "speed" && (
          <>
            <div className="speed-info">
              <span>
                CPU 補充山 <strong>{s.reserve.cpu1.length}</strong>枚
              </span>
              <span>中央更新 {s.resetCount}回</span>
            </div>
            <div className="speed-visible cpu-visible" aria-label="CPUの公開札">
              {s.visible.cpu1.map((c, i) =>
                c ? (
                  <CardFace key={i} card={c} />
                ) : (
                  <div className="empty-card" key={i}>
                    —
                  </div>
                ),
              )}
            </div>
            <p className="table-instruction">
              自分のカードを選んでから、左または右の中央札を押してください。AとKも隣接します。
            </p>
            <div className="speed-centers">
              {(["human", "cpu1"] as const).map((center, i) => {
                const top = s.centers[center].at(-1);
                const index = s.visible.human.findIndex((c) => c === speedCard);
                const legal = speedMoves(s.visible.human, s.centers).some(
                  (m) => m.visibleIndex === index && m.center === center,
                );
                return (
                  <div
                    key={center}
                    className={`center-slot ${legal ? "legal-center" : ""}`}
                  >
                    <span>{i === 0 ? "左の中央札" : "右の中央札"}</span>
                    {top && (
                      <CardFace
                        card={top}
                        disabled={!playing || index < 0}
                        label={`${i === 0 ? "左" : "右"}の中央札、${symbols[getCard(top).suit ?? "S"]} ${rankLabel(getCard(top).rank ?? 0)}に置く`}
                        onClick={() => {
                          if (index >= 0)
                            act({
                              kind: "SP_PLACE",
                              actor: "human",
                              visibleIndex: index,
                              center,
                            });
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div
              className="speed-visible human-visible"
              aria-label="あなたの公開札"
            >
              {s.visible.human.map((c, i) =>
                c ? (
                  <CardFace
                    key={i}
                    card={c}
                    disabled={!playing}
                    selected={c === speedCard}
                    label={`${i + 1}番目の札、${symbols[getCard(c).suit ?? "S"]} ${rankLabel(getCard(c).rank ?? 0)}`}
                    onClick={() => setSpeedCard(c)}
                  />
                ) : (
                  <div className="empty-card" key={i}>
                    —
                  </div>
                ),
              )}
            </div>
            <div className="speed-info">
              <span>
                あなたの補充山 <strong>{s.reserve.human.length}</strong>枚
              </span>
              <button
                className="table-pass"
                disabled={!playing || !needsSpeedReset(s)}
                onClick={() => act({ kind: "SP_RESET" })}
              >
                中央を更新
              </button>
            </div>
            <p className="table-instruction">
              双方に出せる札がないときは自動で中央更新します。すべて出し切った人が勝ちです。
            </p>
          </>
        )}
        {s.phase === "paused" && (
          <div className="pause-overlay">
            <span>{countdown ?? "Ⅱ"}</span>
            <h2>
              {countdown !== null
                ? "まもなく再開します"
                : "ひと息つきましょう。"}
            </h2>
            <p>タイマーとCPUは停止中です。</p>
            <button
              className="gold-button"
              disabled={countdown !== null}
              onClick={onResume}
            >
              {countdown !== null ? `${countdown}…` : "プレイを再開する →"}
            </button>
          </div>
        )}
      </div>
      <p className="live-message" role="status" aria-live="polite">
        {message}
      </p>
      {s.assistUsed && (
        <p className="play-footnote">
          ヒントまたはUndo使用：補助ありの戦績として記録します。
        </p>
      )}
    </>
  );
}
