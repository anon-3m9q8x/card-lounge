import { useState } from "react";
import type { GameRecord, Difficulty } from "../../app/types.ts";
import type { TableGameId, TableRecord } from "./types.ts";
import { tableNames } from "./engine.ts";
const time = (ms: number) =>
  `${Math.floor(ms / 60000)}分${Math.floor(ms / 1000) % 60}秒`;
export function TableRecords({ records }: { records: GameRecord[] }) {
  const [game, setGame] = useState<TableGameId>("klondike");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const selected = records.filter((r): r is TableRecord => r.gameId === game);
  const filtered = selected.filter(
    (r) =>
      !r.assisted &&
      (r.outcome === "win" || r.outcome === "completed") &&
      (game === "klondike" ||
        game === "oldMaid" ||
        r.config.difficulty === difficulty),
  );
  const ranked = [...filtered]
    .sort((a, b) =>
      game === "sevens"
        ? (a.stats.rank ?? 4) - (b.stats.rank ?? 4) || a.elapsedMs - b.elapsedMs
        : a.elapsedMs - b.elapsedMs ||
          (a.stats.moves ?? 0) - (b.stats.moves ?? 0),
    )
    .slice(0, 10);
  let streak = 0,
    best = 0;
  for (const r of [...selected].sort((a, b) => a.finishedAt - b.finishedAt)) {
    streak = !r.assisted && r.outcome === "win" ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  return (
    <section className="panel records-panel">
      <h2>ほかのゲームのローカルランキング</h2>
      <div className="config-form">
        <label>
          ゲーム
          <select
            aria-label="ランキングのゲーム"
            value={game}
            onChange={(e) => setGame(e.target.value as TableGameId)}
          >
            {Object.entries(tableNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {(game === "sevens" || game === "speed") && (
          <label>
            CPUの難易度
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">初級</option>
              <option value="normal">中級</option>
              <option value="hard">上級</option>
            </select>
          </label>
        )}
      </div>
      {game === "oldMaid" ? (
        <p className="subtle">
          補助なし通算 {selected.filter((r) => !r.assisted).length}戦 · 勝利{" "}
          {selected.filter((r) => !r.assisted && r.outcome === "win").length}回
          · 現在 {streak}連勝 · 最高 {best}
          連勝。ババ抜きはタイム順位ではなく連勝・通算勝利を記録します。
        </p>
      ) : ranked.length ? (
        <ol className="ranking-list">
          {ranked.map((r) => (
            <li key={r.sessionId}>
              <span>
                {r.configLabel}
                {r.stats.stalemate === 1 ? " · 手詰まり判定" : ""}
              </span>
              <strong>
                {game === "sevens" ? `${r.stats.rank}位 · ` : ""}
                {time(r.elapsedMs)}
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-copy">
          この設定の補助なしクリア・勝利はまだありません。
        </p>
      )}
      <p className="subtle">
        同じゲーム・設定のみを比較します。ヒントやUndo使用時の結果は戦績には残りますが、通常ランキングには含めません。
      </p>
    </section>
  );
}
