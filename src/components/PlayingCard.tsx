import type { CardId } from "../app/types.ts";
import { getCard, symbols, rankLabel, color } from "../core/cards.ts";
interface Props {
  cardId: CardId;
  index: number;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onClick: () => void;
}
export function PlayingCard({
  cardId,
  index,
  faceUp,
  matched,
  disabled,
  onClick,
}: Props) {
  const card = faceUp ? getCard(cardId) : null;
  const rank = card?.rank ? rankLabel(card.rank) : "";
  const suit = card?.suit ? symbols[card.suit] : "";
  return (
    <button
      type="button"
      className={`playing-card ${faceUp ? "face-up" : "face-down"} ${card?.suit ? color(card.suit) : ""} ${matched ? "matched" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={
        faceUp
          ? `${suit} ${rank}${matched ? "、ペア成立" : ""}`
          : `裏向きカード ${index + 1}番`
      }
      aria-pressed={faceUp}
    >
      {faceUp ? (
        <>
          <span className="card-corner">
            {rank}
            <small>{suit}</small>
          </span>
          <span className="card-pip" aria-hidden="true">
            {suit}
          </span>
          <span className="card-corner bottom" aria-hidden="true">
            {rank}
            <small>{suit}</small>
          </span>
        </>
      ) : (
        <span className="card-pattern" aria-hidden="true">
          <span>♠</span>
        </span>
      )}
    </button>
  );
}
