import type { GameSession, GameAction } from "./games/engine.ts";
import {
  reduceGame,
  elapsedGame,
  saveGame,
  gameTitle,
} from "./games/engine.ts";
import {
  createTable,
  needsSpeedReset,
  speedMoves,
} from "./games/table/engine.ts";
import { validTableSession } from "./games/table/validate.ts";
import { TableView } from "./games/table/View.tsx";
import type { OldMaidReveal } from "./games/table/View.tsx";
import { nextSeat } from "./games/table/engine.ts";
import { TableRecords } from "./games/table/Records.tsx";
import type { Difficulty } from "./app/types.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameId,
  MemoryConfig,
  StoredData,
  Settings,
} from "./app/types.ts";
import { games } from "./games/registry.ts";
import { createMemory } from "./games/memory/engine.ts";
import { randomSeed } from "./core/cards.ts";
import {
  loadStored,
  persist,
  validSession,
  recordFinished,
  ranking,
  configLabel,
  STORAGE_KEY,
} from "./core/storage.ts";
import { PlayingCard } from "./components/PlayingCard.tsx";
import { Dialog } from "./components/Dialog.tsx";
const route = (): string => {
  const path = location.hash.replace(/^#\/?/, "");
  return [
    "home",
    "games",
    "records",
    "settings",
    ...games.map((g) => `play/${g.id}`),
  ].includes(path) || path.startsWith("result/")
    ? path || "home"
    : "home";
};
const formatTime = (ms: number): string =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${Math.floor(ms / 1000) % 60 < 10 ? "0" : ""}${Math.floor(ms / 1000) % 60}`;
const outcomes = {
  completed: "クリア",
  win: "勝利",
  loss: "敗北",
  draw: "引き分け",
};
export default function App() {
  const [initial] = useState(loadStored);
  const [data, setData] = useState(initial.data);
  const [session, setSession] = useState<GameSession | null>(null);
  const live = useRef<{
    data: StoredData;
    session: GameSession | null;
    blocked: boolean;
  }>({ data: initial.data, session: null, blocked: initial.blocked });
  const [warning, setWarning] = useState(initial.warning);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(route);
  const pageRef = useRef(page);
  const [setup, setSetup] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameId>("memory");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [countdown, setCountdown] = useState<number | null>(null);
  // ババ抜き: 引く→(そろえば)ペアを見せる→捨てる、の間を置くための画面だけの状態
  const [reveal, setReveal] = useState<OldMaidReveal | null>(null);
  const revealSeq = useRef(0);
  const afterReveal = useRef<string | null>(null);
  const [rules, setRules] = useState<GameId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [config, setConfig] = useState<MemoryConfig>({
    mode: "solo",
    pairs: 8,
    difficulty: null,
  });
  const [now, setNow] = useState(Date.now());
  const [osDark, setOsDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const movePage = useCallback((next: string) => {
    pageRef.current = next;
    setPage(next);
    if (route() !== next) location.hash = `/${next}`;
    window.scrollTo({ top: 0 });
  }, []);
  const commit = useCallback(
    (nextData: StoredData, nextSession: GameSession | null) => {
      live.current.data = nextData;
      live.current.session = nextSession;
      setData(nextData);
      setSession(nextSession);
      if (!live.current.blocked) {
        const error = persist(nextData);
        if (error) setWarning(error);
      }
    },
    [],
  );
  const act = useCallback(
    (action: GameAction) => {
      const previous = live.current.session;
      if (!previous) return;
      const result = reduceGame(previous, action);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (
        !(result.state.gameId === "memory"
          ? validSession(result.state)
          : validTableSession(result.state))
      ) {
        setWarning(
          "状態に矛盾があるため操作を止めました。保存データは変更しません。",
        );
        return;
      }
      let nextData = structuredClone(live.current.data);
      if (result.state.phase === "finished")
        nextData = recordFinished(nextData, result.state);
      else saveGame(nextData, result.state, Date.now());
      let staged = false;
      if (
        previous.gameId === "oldMaid" &&
        result.state.gameId === "oldMaid" &&
        (action.kind === "CPU" || action.kind === "OM_DRAW")
      ) {
        const actor = previous.turn,
          target = nextSeat(actor, previous.hands);
        const pair = result.state.discarded.slice(previous.discarded.length);
        const had = new Set(previous.hands[actor]);
        const card = [...result.state.hands[actor], ...pair].find(
          (c) => !had.has(c),
        );
        if (card) {
          staged = true;
          setReveal({
            seq: ++revealSeq.current,
            actor,
            target,
            card,
            pair: pair.length ? pair : null,
            stage: "draw",
          });
        }
      }
      commit(nextData, result.state);
      setMessage(result.message);
      if (result.state.phase === "finished") {
        if (staged) afterReveal.current = `result/${result.state.sessionId}`;
        else movePage(`result/${result.state.sessionId}`);
      }
    },
    [commit, movePage],
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setOsDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const requestResume = () => {
    if (live.current.session?.gameId === "speed") setCountdown(3);
    else act({ kind: "RESUME" });
  };
  useEffect(() => {
    if (countdown === null) return;
    const t = setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1);
      else {
        setCountdown(null);
        if (!document.hidden) act({ kind: "RESUME" });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, act]);
  useEffect(() => {
    if (pending || rules || !page.startsWith("play/")) setCountdown(null);
  }, [pending, rules, page]);
  useEffect(() => {
    if (!session || session.phase !== "playing" || !page.startsWith("play/"))
      return;
    if (session.gameId === "memory") {
      if (session.resolution === "mismatch") {
        const t = setTimeout(() => act({ kind: "RESOLVE" }), 800);
        return () => clearTimeout(t);
      }
      if (session.turn === "cpu1") {
        const t = setTimeout(() => act({ kind: "CPU" }), 600);
        return () => clearTimeout(t);
      }
    } else if (
      session.gameId === "oldMaid" &&
      session.turn !== "human" &&
      !reveal
    ) {
      const t = setTimeout(() => act({ kind: "CPU" }), 700);
      return () => clearTimeout(t);
    } else if (session.gameId === "sevens" && session.turn !== "human") {
      const delay = { easy: 1100, normal: 750, hard: 500 }[
        session.config.difficulty
      ];
      const t = setTimeout(() => act({ kind: "CPU" }), delay);
      return () => clearTimeout(t);
    }
  }, [session, page, act, reveal]);
  // 引いた札を見せる(0.95秒) → ペアがそろったら並べて見せる(1.3秒) → 捨て札へ(0.45秒)
  useEffect(() => {
    if (!reveal) return;
    const paused =
      live.current.session?.gameId === "oldMaid" &&
      live.current.session.phase === "paused";
    if (paused) return;
    const ms =
      reveal.stage === "draw"
        ? 950
        : reveal.stage === "pair"
          ? 1300
          : reveal.pair
            ? 450
            : 600;
    const t = setTimeout(() => {
      setReveal((r) => {
        if (!r || r.seq !== reveal.seq) return r;
        if (r.stage === "draw") return { ...r, stage: r.pair ? "pair" : "out" };
        if (r.stage === "pair") return { ...r, stage: "out" };
        return null;
      });
    }, ms);
    return () => clearTimeout(t);
  }, [reveal, session?.phase]);
  useEffect(() => {
    if (!reveal && afterReveal.current) {
      const to = afterReveal.current;
      afterReveal.current = null;
      movePage(to);
    }
  }, [reveal, movePage]);
  useEffect(() => {
    if (!page.startsWith("play/oldMaid")) {
      setReveal(null);
    }
  }, [page]);
  // One clock owner for Speed. Human input never postpones the CPU's due time.
  const speedPhase = session?.gameId === "speed" ? session.phase : null;
  const speedDifficulty =
    session?.gameId === "speed" ? session.config.difficulty : null;
  useEffect(() => {
    if (speedPhase !== "playing" || !speedDifficulty || page !== "play/speed")
      return;
    const delay = { easy: 1100, normal: 700, hard: 400 }[speedDifficulty];
    let cpuAt = Date.now() + delay;
    let resetAt = 0;
    const timer = setInterval(() => {
      const current = live.current.session;
      if (
        !current ||
        current.gameId !== "speed" ||
        current.phase !== "playing" ||
        document.hidden
      )
        return;
      const now = Date.now();
      if (needsSpeedReset(current)) {
        if (now >= resetAt) {
          resetAt = now + 150;
          act({ kind: "SP_RESET" });
        }
        return;
      }
      if (now >= cpuAt) {
        cpuAt = now + delay;
        if (speedMoves(current.visible.cpu1, current.centers).length)
          act({ kind: "CPU" });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [speedPhase, speedDifficulty, page, act]);
  useEffect(() => {
    const onHash = () => {
      const target = route();
      const current = live.current.session;
      if (
        pageRef.current.startsWith("play/") &&
        target !== pageRef.current &&
        current &&
        current.phase !== "finished"
      ) {
        history.replaceState(null, "", `#/${pageRef.current}`);
        if (current.phase === "playing") act({ kind: "PAUSE" });
        setPending(target);
      } else {
        pageRef.current = target;
        setPage(target);
      }
    };
    const onHidden = () => {
      if (document.hidden) setCountdown(null);
      if (document.hidden && live.current.session?.phase === "playing")
        act({ kind: "PAUSE" });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (live.current.session && live.current.session.phase !== "finished") {
        e.preventDefault();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setCountdown(null);
        live.current.blocked = true;
        if (live.current.session?.phase === "playing") act({ kind: "PAUSE" });
        setWarning(
          "別のタブで保存が変更されました。競合を避けるため、このタブからの保存を停止しました。再読み込みで最新の保存を取得できます。",
        );
      }
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("storage", onStorage);
    };
  }, [act]);
  const navigate = (target: string) => {
    if (
      page.startsWith("play/") &&
      session &&
      session.phase !== "finished" &&
      target !== page
    ) {
      if (session.phase === "playing") act({ kind: "PAUSE" });
      setPending(target);
    } else movePage(target);
  };
  const leave = (save: boolean) => {
    const nextData = structuredClone(live.current.data);
    const current = live.current.session;
    if (save && current) saveGame(nextData, current, Date.now());
    else if (current) delete nextData.saves[current.gameId];
    commit(nextData, null);
    setPending(null);
    movePage(pending ?? "home");
  };
  const start = () => {
    try {
      const next =
        selectedGame === "memory"
          ? createMemory(config, randomSeed())
          : createTable(selectedGame, randomSeed(), difficulty);
      const nextData = structuredClone(live.current.data);
      saveGame(nextData, next, Date.now());
      commit(nextData, next);
      setSetup(false);
      setOverwrite(false);
      setMessage("同じ数字・同じ色のペアを見つけましょう。");
      movePage(`play/${next.gameId}`);
    } catch {
      setWarning(
        "安全な乱数を利用できません。HTTPSまたはlocalhostで開いてください。",
      );
    }
  };
  const openSetup = (id: GameId) => {
    setSelectedGame(id);
    setSetup(true);
  };
  const resume = (id: GameId = "memory") => {
    const saved = live.current.data.saves[id];
    if (
      !saved ||
      !(saved.gameId === "memory"
        ? validSession(saved)
        : validTableSession(saved))
    ) {
      setWarning("この保存からは再開できません。");
      return;
    }
    commit(live.current.data, structuredClone(saved));
    setMessage("再開ボタンを押すと続きからプレイできます。");
    movePage(`play/${id}`);
  };
  const settings = data.settings;
  const updateSettings = (next: Settings) =>
    commit({ ...live.current.data, settings: next }, live.current.session);
  const resolvedTheme =
    settings.appTheme === "system"
      ? osDark
        ? "dark"
        : "light"
      : settings.appTheme;
  const resultRecord = page.startsWith("result/")
    ? data.records.find((r) => r.sessionId === page.slice(7))
    : undefined;
  const winCount = data.records.filter(
    (r) => r.outcome === "win" || r.outcome === "completed",
  ).length;
  const currentRules = games.find((g) => g.id === rules);
  const rank = ranking(data.records, config);
  return (
    <div
      className="app"
      data-theme={resolvedTheme}
      data-table={settings.tableTheme}
      data-back={settings.cardBackTheme}
      data-motion={settings.reducedMotion}
    >
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#/home"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-mark">♠</span>
          <span>
            Card Lounge<small>YOUR PRIVATE CARD TABLE</small>
          </span>
        </a>
        <p className="nav-label">LOUNGE</p>
        <nav aria-label="メインナビゲーション">
          {[
            ["home", "⌂", "ホーム"],
            ["games", "▦", "ゲームを選ぶ"],
            ["records", "◷", "戦績・ランキング"],
            ["settings", "⚙", "設定"],
          ].map(([id, icon, label]) => (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={page === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(id ?? "home");
              }}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="lounge-chip">♣ ローカルで楽しむ</span>
          <p>
            会員登録・外部通信なし。
            <br />
            あなたのペースで、ひと勝負。
          </p>
          <small>5 GAMES · LOCAL PLAY</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="header">
          <span className="header-location">
            THE LOUNGE <i>/</i>{" "}
            {page.startsWith("play")
              ? "プレイ"
              : page === "settings"
                ? "設定"
                : page === "records"
                  ? "戦績"
                  : page.startsWith("result")
                    ? "結果"
                    : "ようこそ"}
          </span>
          <div className="header-actions">
            <span className="status-dot" />{" "}
            <span className="private-label">PRIVATE TABLE</span>
            <button
              className="theme-toggle"
              onClick={() =>
                updateSettings({
                  ...settings,
                  appTheme: resolvedTheme === "dark" ? "light" : "dark",
                })
              }
              aria-label={
                resolvedTheme === "dark" ? "ライトモードへ" : "ダークモードへ"
              }
            >
              {resolvedTheme === "dark" ? "☼" : "☾"}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {warning && (
            <div className="warning" role="status">
              {warning}
            </div>
          )}
          {(page === "home" || page === "games") && (
            <>
              {page === "home" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <p className="eyebrow">A LITTLE BREAK. A GOOD HAND.</p>
                      <h1>
                        静かなひとときに、
                        <br />
                        <em>一枚の楽しみを。</em>
                      </h1>
                      <p>
                        お気に入りのゲームで、心地よい時間を。
                        <br />
                        あなただけのカードラウンジへ、ようこそ。
                      </p>
                      <button
                        className="gold-button"
                        onClick={() => openSetup("memory")}
                      >
                        神経衰弱をはじめる <span>↗</span>
                      </button>
                      <div className="hero-note">
                        <span>♦</span> 登録不要 <i /> 端末内でプレイ <i />{" "}
                        5ゲーム対応
                      </div>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="table-ring" />
                      <div className="decor-card card-one">
                        <span>
                          A<small>♠</small>
                        </span>
                        <b>♠</b>
                      </div>
                      <div className="decor-card card-two">
                        <span>
                          K<small>♥</small>
                        </span>
                        <b>♥</b>
                      </div>
                      <div className="decor-card card-three">
                        <span>
                          Q<small>♣</small>
                        </span>
                        <b>♣</b>
                      </div>
                      <span className="hero-art-label">
                        THE PERFECT LITTLE ESCAPE
                      </span>
                    </div>
                  </section>
                  <div className="home-summary">
                    <div>
                      <span>この端末のプレイ</span>
                      <strong>
                        {data.records.length}
                        <small> 回</small>
                      </strong>
                    </div>
                    <div>
                      <span>クリア・勝利</span>
                      <strong>
                        {winCount}
                        <small> 回</small>
                      </strong>
                    </div>
                    <div>
                      <span>保存したゲーム</span>
                      <strong>
                        {Object.keys(data.saves).length}
                        <small> 件</small>
                      </strong>
                    </div>
                    <div>
                      <span>現在の実装</span>
                      <strong>
                        5 <small>/ 5ゲーム</small>
                      </strong>
                    </div>
                  </div>
                  {data.saves.memory && (
                    <section className="resume-card">
                      <div className="resume-symbol">♦</div>
                      <div>
                        <small>WELCOME BACK</small>
                        <h2>前回の神経衰弱を、続きから。</h2>
                        <p>
                          {configLabel(data.saves.memory.config)} ·{" "}
                          {formatTime(data.saves.memory.clock.elapsedMs)} ·{" "}
                          {data.saves.memory.pairsWon.human}ペア獲得
                        </p>
                      </div>
                      <button onClick={() => resume("memory")}>
                        再開する →
                      </button>
                    </section>
                  )}
                </>
              )}
              <div className="section-heading">
                <div>
                  <p className="eyebrow">FIND YOUR FAVORITE</p>
                  <h2>今日は、どの一局にしますか。</h2>
                </div>
                <span className="subtle">5つのゲームをプレイできます</span>
              </div>
              <div className="game-grid">
                {games.map((g) => (
                  <article
                    className={`game-card ${g.available ? "available" : ""}`}
                    key={g.id}
                  >
                    <div className={`game-art art-${g.id}`} aria-hidden="true">
                      <span className="mini-card">{g.symbol}</span>
                      <span className="mini-card mini-second">{g.symbol}</span>
                    </div>
                    <div className="game-card-body">
                      <div className="game-card-meta">
                        <span>{g.english}</span>
                        <span className={`badge ${g.available ? "ready" : ""}`}>
                          {g.available ? "プレイ可能" : "準備中"}
                        </span>
                      </div>
                      <h3>{g.name}</h3>
                      <p>{g.description}</p>
                      <div className="game-card-footer">
                        <span>{g.people}</span>
                        <button onClick={() => setRules(g.id)}>ルール ↗</button>
                      </div>
                      <button
                        className={
                          g.available ? "gold-button" : "coming-button"
                        }
                        disabled={!g.available}
                        onClick={() => openSetup(g.id)}
                      >
                        {g.available ? "プレイする →" : "今後の実装対象"}
                      </button>
                      {data.saves[g.id] && (
                        <button
                          className="resume-game-button"
                          onClick={() => resume(g.id)}
                        >
                          保存したゲームを再開 →
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <section className="quiet-note">
                <span>♧</span>
                <div>
                  <h3>自分のペースで、楽しむために。</h3>
                  <p>
                    戦績と中断データはこのブラウザに保存されます。オンライン対戦・現金・賭け金はありません。
                  </p>
                </div>
              </section>
            </>
          )}
          {(page === "home" || page === "games") &&
            games
              .filter((g) => g.id !== "memory" && data.saves[g.id])
              .map((g) => (
                <section className="resume-card" key={g.id}>
                  <div className="resume-symbol">{g.symbol}</div>
                  <div>
                    <small>WELCOME BACK</small>
                    <h2>{g.name}の続きをプレイ</h2>
                    <p>
                      {formatTime(data.saves[g.id]?.clock.elapsedMs ?? 0)} ·
                      中断データあり
                    </p>
                  </div>
                  <button onClick={() => resume(g.id)}>再開する →</button>
                </section>
              ))}
          {page === "play/memory" &&
            (session &&
            session.gameId === "memory" &&
            session.phase !== "finished" ? (
              <>
                <div className="play-heading">
                  <div>
                    <p className="eyebrow">
                      MEMORY / {configLabel(session.config)}
                    </p>
                    <h1>神経衰弱</h1>
                  </div>
                  <div className="play-clock">
                    <span>PLAY TIME</span>
                    <strong>{formatTime(elapsedGame(session, now))}</strong>
                  </div>
                </div>
                <div className="play-toolbar">
                  <button
                    onClick={() =>
                      act({
                        kind: session.phase === "paused" ? "RESUME" : "PAUSE",
                      })
                    }
                  >
                    {session.phase === "paused" ? "▶ 再開" : "Ⅱ 一時停止"}
                  </button>
                  <button
                    onClick={() => {
                      if (session.phase === "playing") act({ kind: "PAUSE" });
                      setRules("memory");
                    }}
                  >
                    ルール
                  </button>
                  <button
                    disabled={
                      session.phase !== "playing" ||
                      session.turn !== "human" ||
                      session.resolution !== "idle"
                    }
                    onClick={() => act({ kind: "HINT" })}
                  >
                    ヒント
                  </button>
                  <button onClick={() => navigate("home")}>保存・終了</button>
                </div>
                <div className="match-summary">
                  <span
                    className={session.turn === "human" ? "turn-active" : ""}
                  >
                    あなた <strong>{session.pairsWon.human}</strong>ペア
                  </span>
                  {session.config.mode === "vsCpu" && (
                    <span
                      className={session.turn === "cpu1" ? "turn-active" : ""}
                    >
                      CPU <strong>{session.pairsWon.cpu1}</strong>ペア
                    </span>
                  )}
                  <span>
                    試行 <strong>{session.attempts.human}</strong>回
                  </span>
                  <span>
                    {session.phase === "paused"
                      ? "一時停止中"
                      : session.turn === "human"
                        ? "あなたの番"
                        : "CPUが考え中…"}
                  </span>
                </div>
                <div className="felt-table">
                  <span className="table-label">CARD LOUNGE · MEMORY</span>
                  <div
                    className={`memory-grid pairs-${session.config.pairs}`}
                    aria-label="神経衰弱のカード"
                  >
                    {session.tiles.map((tile, i) => (
                      <PlayingCard
                        key={tile.tileId}
                        index={i}
                        cardId={tile.cardId}
                        faceUp={tile.faceUp}
                        matched={tile.matched}
                        disabled={
                          session.phase !== "playing" ||
                          session.turn !== "human" ||
                          session.resolution !== "idle" ||
                          tile.faceUp ||
                          tile.matched
                        }
                        onClick={() =>
                          act({
                            kind: "FLIP",
                            tileId: tile.tileId,
                            actor: "human",
                          })
                        }
                      />
                    ))}
                  </div>
                  {session.phase === "paused" && (
                    <div className="pause-overlay">
                      <span>Ⅱ</span>
                      <h2>ひと息つきましょう。</h2>
                      <p>タイマーとCPUの動きは停止中です。</p>
                      <button
                        className="gold-button"
                        onClick={() => act({ kind: "RESUME" })}
                      >
                        プレイを再開する →
                      </button>
                    </div>
                  )}
                </div>
                <p className="live-message" role="status" aria-live="polite">
                  {message}
                </p>
                <p className="play-footnote">
                  同じ数字・同じ色でペア成立。♥＋♦ / ♠＋♣　
                  {session.assistUsed &&
                    "· ヒント使用：補助ありの戦績として記録"}
                </p>
              </>
            ) : (
              <section className="empty-state">
                <h1>ゲームを再開しましょう。</h1>
                <p>
                  保存データがあれば再開できます。新しいゲームも始められます。
                </p>
                {data.saves.memory && (
                  <button onClick={() => resume("memory")}>
                    保存したゲームを開く
                  </button>
                )}
                <button
                  className="gold-button"
                  onClick={() => openSetup("memory")}
                >
                  新しくはじめる
                </button>
              </section>
            ))}
          {page.startsWith("play/") &&
            page !== "play/memory" &&
            (session &&
            session.gameId !== "memory" &&
            page === `play/${session.gameId}` &&
            (session.phase !== "finished" ||
              (session.gameId === "oldMaid" && !!reveal)) ? (
              <TableView
                session={session}
                reveal={session.gameId === "oldMaid" ? reveal : null}
                onSkipReveal={() => setReveal(null)}
                act={act}
                now={now}
                message={message}
                countdown={countdown}
                onResume={requestResume}
                onQuit={() => navigate("home")}
                onRules={() => {
                  setCountdown(null);
                  if (session.phase === "playing") act({ kind: "PAUSE" });
                  setRules(session.gameId);
                }}
              />
            ) : (
              <section className="empty-state">
                <h1>保存したゲームを再開</h1>
                {games
                  .filter((g) => g.id !== "memory" && page === `play/${g.id}`)
                  .map((g) => (
                    <div key={g.id}>
                      <p>{g.name}</p>
                      {data.saves[g.id] && (
                        <button onClick={() => resume(g.id)}>再開する</button>
                      )}
                      <button
                        className="gold-button"
                        onClick={() => openSetup(g.id)}
                      >
                        新しくはじめる
                      </button>
                    </div>
                  ))}
              </section>
            ))}
          {page.startsWith("result/") && (
            <section className="result-panel">
              {resultRecord ? (
                <>
                  <p className="eyebrow">A GOOD GAME, WELL PLAYED.</p>
                  <div className="result-symbol">♦</div>
                  <h1>{outcomes[resultRecord.outcome]}</h1>
                  <p>
                    {gameTitle(resultRecord.gameId)}
                    {resultRecord.stats.stalemate === 1
                      ? " · 手詰まり判定"
                      : ""}
                  </p>
                  <p>おつかれさまでした。次の一局も、自分のペースで。</p>
                  <div className="result-metrics">
                    <div>
                      <span>プレイ時間</span>
                      <strong>{formatTime(resultRecord.elapsedMs)}</strong>
                    </div>
                    <div>
                      <span>
                        {resultRecord.gameId === "memory"
                          ? "獲得ペア"
                          : "操作回数"}
                      </span>
                      <strong>
                        {resultRecord.gameId === "memory"
                          ? resultRecord.stats.humanPairs
                          : resultRecord.stats.moves}
                      </strong>
                    </div>
                    <div>
                      <span>
                        {resultRecord.gameId === "memory"
                          ? "試行回数"
                          : resultRecord.stats.rank
                            ? "着順"
                            : "ヒント回数"}
                      </span>
                      <strong>
                        {resultRecord.gameId === "memory"
                          ? resultRecord.stats.attempts
                          : (resultRecord.stats.rank ?? resultRecord.hints)}
                      </strong>
                    </div>
                  </div>
                  <p className="subtle">
                    {resultRecord.configLabel} ·{" "}
                    {resultRecord.assisted
                      ? "補助あり（通常ランキング対象外）"
                      : "補助なし"}{" "}
                    · この端末の記録
                  </p>
                  <button
                    className="gold-button"
                    onClick={() => openSetup(resultRecord.gameId)}
                  >
                    もう一度プレイ →
                  </button>
                  <button onClick={() => navigate("records")}>
                    戦績を見る
                  </button>
                </>
              ) : (
                <>
                  <h1>記録が見つかりません</h1>
                  <button onClick={() => navigate("home")}>ホームへ</button>
                </>
              )}
            </section>
          )}
          {page === "records" && (
            <>
              <p className="eyebrow">YOUR LOCAL RECORDS</p>
              <h1>一局ずつ、積み重ねる。</h1>
              <p className="subtle">
                このブラウザで完了した5ゲームの記録です。中断したゲームは成績に含めません。
              </p>
              <div className="panel records-panel">
                <div className="section-heading">
                  <h2>直近の戦績</h2>
                  <span>{data.records.length}回</span>
                </div>
                {!data.records.length ? (
                  <p className="empty-copy">
                    まだ記録がありません。最初の一局を楽しみましょう。
                  </p>
                ) : (
                  <ul className="record-list">
                    {[...data.records]
                      .reverse()
                      .slice(0, 20)
                      .map((r) => (
                        <li key={r.sessionId}>
                          <span className="record-symbol">♦</span>
                          <div>
                            <strong>
                              {outcomes[r.outcome]}{" "}
                              <small>
                                {r.assisted ? "補助あり" : "補助なし"}
                              </small>
                            </strong>
                            <p>
                              {gameTitle(r.gameId)} · {r.configLabel} ·{" "}
                              {new Date(r.finishedAt).toLocaleDateString(
                                "ja-JP",
                              )}
                            </p>
                          </div>
                          <strong>{formatTime(r.elapsedMs)}</strong>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div className="panel records-panel">
                <h2>神経衰弱のローカルランキング</h2>
                <p className="subtle">
                  同じ設定・補助なしのクリア／勝利を比較します。1人用は時間順、CPU対戦は獲得ペア数順。上位10件。
                </p>
                <ConfigForm config={config} onChange={setConfig} />
                {rank.length ? (
                  <ol className="ranking-list">
                    {rank.map((r) => (
                      <li key={r.sessionId}>
                        <span>{configLabel(r.config)}</span>
                        <strong>
                          {r.config.mode === "solo"
                            ? formatTime(r.elapsedMs)
                            : `${r.stats.humanPairs}ペア · ${formatTime(r.elapsedMs)}`}
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-copy">
                    この設定のランキング記録はありません。
                  </p>
                )}
              </div>
            </>
          )}
          {page === "records" && <TableRecords records={data.records} />}
          {page === "settings" && (
            <>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h1>心地よい卓を、あなたに。</h1>
              <p className="subtle">
                表示設定は保存されます。卓面はサイトのライト／ダークとは独立しています。
              </p>
              <div className="settings-grid">
                <section className="panel settings-panel">
                  <h2>卓のスキン</h2>
                  <div className="theme-options">
                    {(
                      [
                        ["emerald", "エメラルド"],
                        ["midnight", "ミッドナイト"],
                        ["burgundy", "バーガンディ"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className={`table-swatch swatch-${id}`}
                        aria-pressed={settings.tableTheme === id}
                        onClick={() =>
                          updateSettings({ ...settings, tableTheme: id })
                        }
                      >
                        <span />
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel settings-panel">
                  <h2>カードの裏面</h2>
                  <div className="theme-options">
                    {(
                      [
                        ["royal", "ロイヤル"],
                        ["geometric", "ジオメトリック"],
                        ["classic", "クラシック"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className="back-swatch"
                        aria-pressed={settings.cardBackTheme === id}
                        onClick={() =>
                          updateSettings({ ...settings, cardBackTheme: id })
                        }
                      >
                        <span
                          className={`preview-back preview-${id}`}
                          aria-hidden="true"
                        >
                          ♠
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel settings-panel">
                  <h2>サイトの表示</h2>
                  <label>
                    テーマ
                    <select
                      value={settings.appTheme}
                      onChange={(e) =>
                        updateSettings({
                          ...settings,
                          appTheme: e.target.value as Settings["appTheme"],
                        })
                      }
                    >
                      <option value="dark">ダーク</option>
                      <option value="light">ライト</option>
                      <option value="system">OS連動</option>
                    </select>
                  </label>
                  <label>
                    動きを抑える
                    <select
                      value={settings.reducedMotion}
                      onChange={(e) =>
                        updateSettings({
                          ...settings,
                          reducedMotion: e.target
                            .value as Settings["reducedMotion"],
                        })
                      }
                    >
                      <option value="system">OS連動</option>
                      <option value="on">常に抑える</option>
                      <option value="off">通常</option>
                    </select>
                  </label>
                  <p className="subtle">
                    音声なし。効果音・実績は今後の実装対象です。ゲームは5種類プレイできます。
                  </p>
                </section>
              </div>
            </>
          )}
          <footer>
            <span>♠ CARD LOUNGE</span>
            <span>静かな時間に、一枚の楽しみを。 · 5ゲーム対応</span>
          </footer>
        </main>
      </div>
      {setup && (
        <Dialog
          title={`${gameTitle(selectedGame)}のテーブル設定`}
          onClose={() => setSetup(false)}
        >
          <p className="dialog-copy">
            {games.find((g) => g.id === selectedGame)?.rules[0]}
          </p>
          {selectedGame === "memory" ? (
            <ConfigForm config={config} onChange={setConfig} />
          ) : selectedGame === "sevens" || selectedGame === "speed" ? (
            <div className="config-form">
              <label>
                CPUの難易度
                <select
                  aria-label="CPUの難易度"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="easy">初級</option>
                  <option value="normal">中級</option>
                  <option value="hard">上級</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="subtle">
              {selectedGame === "klondike"
                ? "ドロー1・山札の再循環は無制限。"
                : "4人対戦・CPUの選択は公平なランダムです。"}
            </p>
          )}
          <button
            className="gold-button full-width"
            onClick={() => {
              if (live.current.data.saves[selectedGame]) setOverwrite(true);
              else start();
            }}
          >
            この設定ではじめる →
          </button>
          <p className="dialog-note">
            {selectedGame === "memory"
              ? "初級：記憶2枚 / 中級：6枚 / 上級：観測済みの全未一致札"
              : selectedGame === "speed"
                ? "AとKも隣接。再開時は3・2・1の後にプレイが始まります。"
                : "合法手と勝利条件はルール画面で確認できます。"}
          </p>
        </Dialog>
      )}
      {overwrite && (
        <Dialog
          title="保存したゲームを置き換えますか？"
          onClose={() => setOverwrite(false)}
        >
          <p className="dialog-copy">
            このゲームの中断データは、新しいゲームで置き換わります。他のゲームの保存は保持します。
          </p>
          <div className="dialog-actions">
            <button onClick={() => setOverwrite(false)}>キャンセル</button>
            <button className="gold-button" onClick={start}>
              新しくはじめる
            </button>
          </div>
        </Dialog>
      )}
      {rules && currentRules && (
        <Dialog
          title={`${currentRules.name}のルール`}
          onClose={() => setRules(null)}
        >
          <ol className="rules-list">
            {currentRules.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <button className="full-width" onClick={() => setRules(null)}>
            閉じる
          </button>
        </Dialog>
      )}
      {pending && (
        <Dialog
          title="このゲームを終了しますか？"
          onClose={() => setPending(null)}
        >
          <p className="dialog-copy">
            保存して、いつでも続きから再開できます。未完了のゲームは戦績に含めません。
          </p>
          <div className="quit-options">
            <button className="gold-button" onClick={() => leave(true)}>
              保存して終了
            </button>
            <button onClick={() => leave(false)}>保存せず終了</button>
            <button onClick={() => setPending(null)}>キャンセル</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function ConfigForm({
  config,
  onChange,
}: {
  config: MemoryConfig;
  onChange: (config: MemoryConfig) => void;
}) {
  return (
    <div className="config-form">
      <label>
        モード
        <select
          aria-label="モード"
          value={config.mode}
          onChange={(e) =>
            onChange({
              ...config,
              mode: e.target.value === "solo" ? "solo" : "vsCpu",
              difficulty: e.target.value === "solo" ? null : "normal",
            })
          }
        >
          <option value="solo">1人で楽しむ</option>
          <option value="vsCpu">CPUと対戦</option>
        </select>
      </label>
      <label>
        ペア数
        <select
          aria-label="ペア数"
          value={config.pairs}
          onChange={(e) =>
            onChange({
              ...config,
              pairs: Number(e.target.value) as MemoryConfig["pairs"],
            })
          }
        >
          <option value="8">8ペア / 16枚</option>
          <option value="12">12ペア / 24枚</option>
          <option value="26">26ペア / 52枚</option>
        </select>
      </label>
      {config.mode === "vsCpu" && (
        <label>
          CPUの難易度
          <select
            aria-label="CPUの難易度"
            value={config.difficulty ?? "normal"}
            onChange={(e) =>
              onChange({
                ...config,
                difficulty: e.target.value as NonNullable<
                  MemoryConfig["difficulty"]
                >,
              })
            }
          >
            <option value="easy">初級</option>
            <option value="normal">中級</option>
            <option value="hard">上級</option>
          </select>
        </label>
      )}
    </div>
  );
}
