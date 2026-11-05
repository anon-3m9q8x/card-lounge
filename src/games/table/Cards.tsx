import type { CardId } from "../../app/types.ts";
import { getCard, symbols, color, rankLabel } from "../../core/cards.ts";
/** 表向きのトランプ1枚(卓ゲーム共通) */
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
export function Back({
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
