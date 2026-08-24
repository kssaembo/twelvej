"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { DataConnection, Peer } from "peerjs";
import { createHost, connectArena, type NetMessage } from "./network";
import { audio } from "./audio";
import {
  dropPiece,
  flowNodes,
  legalDrops,
  legalMoves,
  movePiece,
  newGame,
  pieceInfo,
  type GameState,
  type Side,
} from "./game";
type Player = {
  id: string;
  name: string;
  win: number;
  draw: number;
  loss: number;
  score: number;
  games: number;
};
type Arena = {
  id: string;
  number: number;
  status: string;
  lastSeen: number;
  players?: string[];
  matchId?: string;
};
type Match = {
  matchId: string;
  arenaId: string;
  playerIds: [string, string];
  winner: Side;
  turns: number;
  completedAt: number;
  counted: boolean;
  reason: string;
};
type Session = {
  code: string;
  title: string;
  players: Player[];
  arenas: Record<string, Arena>;
  matches: Match[];
  active: Record<
    string,
    {
      matchId: string;
      arenaId: string;
      playerIds: [string, string];
      startedAt: number;
    }
  >;
  status: "setup" | "running" | "ended";
  duration: number;
  startedAt: number | null;
};
const emptyPlayer = (name: string, i: number): Player => ({
  id: `p-${i + 1}`,
  name,
  win: 0,
  draw: 0,
  loss: 0,
  score: 0,
  games: 0,
});
const makeCode = () => String(Math.floor(1000 + Math.random() * 9000));
const blankSession = (code = makeCode()): Session => ({
  code,
  title: "우리 반 십이장기",
  players: [],
  arenas: {},
  matches: [],
  active: {},
  status: "setup",
  duration: 20 * 60_000,
  startedAt: null,
});
const sessionKey = (c: string) => `twelve-host-${c}`;
const arenaKey = (c: string) => `twelve-arena-${c}`;
export default function App() {
  const params =
    typeof location !== "undefined"
      ? new URLSearchParams(location.search)
      : null;
  const initial = ["arena", "teacher", "practice"].includes(params?.get("mode") || "")
    ? params!.get("mode")!
    : "home";
  const [view, setView] = useState(initial);
  const [manual, setManual] = useState(false);
  const navigate = (v: string, code?: string) => {
    history.pushState(
      {},
      "",
      v === "home"
        ? location.pathname
        : `?mode=${v}${code ? `&code=${code}` : ""}`,
    );
    setView(v);
  };
  return (
    <>
      {view === "home" && (
        <Home
          teacher={() => navigate("teacher")}
          arena={() => navigate("arena")}
          practice={() => navigate("practice")}
          manual={() => setManual(true)}
        />
      )}{" "}
      {view === "teacher" && <Teacher back={() => navigate("home")} />}{" "}
      {view === "arena" && <ArenaClient back={() => navigate("home")} />}{" "}
      {view === "practice" && <Practice back={() => navigate("home")} />}{" "}
      {manual && <Manual close={() => setManual(false)} />}
    </>
  );
}
function SoundControl() {
  const [enabled, setEnabled] = useState(() => audio.isEnabled());
  const [volume, setVolume] = useState(() => audio.getVolume());
  return (
    <div className={`sound-control ${enabled ? "on" : ""}`}>
      <button onClick={async () => { const next = !enabled; setEnabled(next); await audio.setEnabled(next); }} aria-label={enabled ? "BGM 일시정지" : "BGM 재생"}>{enabled ? "Ⅱ" : "▶"}</button>
      <b>BGM</b>
      <input aria-label="BGM 음량" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { const next = Number(e.target.value); setVolume(next); audio.setVolume(next); }} />
    </div>
  );
}
function Home({
  teacher,
  arena,
  practice,
  manual,
}: {
  teacher: () => void;
  arena: () => void;
  practice: () => void;
  manual: () => void;
}) {
  return (
    <main className="landing">
      <nav>
        <Logo home />
      </nav>
      <section className="hero">
        <div className="eyebrow">지니어스 게임을 학급에서 즐겁게 해보세요</div>
        <h1>
          전략 게임
          <br />
          <em>십이장기</em>
        </h1>
        <p>
          한 수 한 수가 알고리즘이 되는 전략 보드게임.
          <br />
          연결이 끊겨도 마지막 턴부터 이어집니다.
        </p>
        <div className="actions">
          <button className="primary" onClick={teacher}>
            교사 운영 페이지 <b>→</b>
          </button>
          <button className="secondary" onClick={arena}>
            학생 경기장 접속
          </button>
          <button className="secondary practice-button" onClick={practice}>연습경기</button>
          <button className="secondary" onClick={manual}>
            설명서
          </button>
        </div>
        <div className="status">
          <strong>5학년 실과 컴퓨터와 문제 해결</strong>
          <small>5,6학년 실과 컴퓨터 단원, 창체 학급 놀이, 문제 해결, 추론</small>
        </div>
      </section>
      <SoundControl />
    </main>
  );
}
function Logo({ home = false }: { home?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark"><img src="/images/branding/emblem_twelve.png" alt="" /></span>
      <span>
        {home ? "더 지니어스 한 학급 놀이" : "TWELVE"}
        {!home && <><br /><small>ALGORITHM BOARD GAME</small></>}
      </span>
    </div>
  );
}
function Practice({ back }: { back: () => void }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState<[string, string]>(["플레이어 1", "플레이어 2"]);
  if (game) return <GameBoard game={game} setGame={setGame} names={names} net="practice" finish={() => setGame(null)} />;
  return <main className="join-screen practice-screen"><button className="corner-back" onClick={back}>← 메인 화면</button><section className="join-card-large practice-card"><Logo /><small>PRACTICE MATCH</small><h1>둘이서 십이장기를<br />연습해 보세요.</h1><div className="practice-names"><input value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} aria-label="첫 번째 플레이어 이름"/><b>VS</b><input value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} aria-label="두 번째 플레이어 이름"/></div><button className="primary connect-button" onClick={() => { audio.cue("start"); setGame(newGame(`practice-${Date.now()}`)); }}>연습경기 시작</button></section></main>;
}
function Teacher({ back }: { back: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [restore, setRestore] = useState("");
  const [net, setNet] = useState("offline");
  const [bulk, setBulk] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [qr, setQr] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const peer = useRef<Peer | null>(null),
    conns = useRef(new Map<string, DataConnection>()),
    sessionRef = useRef<Session | null>(null);
  const save = (s: Session) => {
    sessionRef.current = s;
    setSession(s);
    localStorage.setItem(sessionKey(s.code), JSON.stringify(s));
  };
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    if (!session) return;
    const url = `${location.origin}${location.pathname}?mode=arena&code=${session.code}`;
    QRCode.toDataURL(url, {
      width: 260,
      margin: 1,
      color: { dark: "#07131d", light: "#ffffff" },
    }).then(setQr);
    let alive = true;
    createHost(
      session.code,
      (c) => {
        c.on("open", () => {
          conns.current.set(c.peer, c);
          c.send({
            type: "WELCOME",
            session: safeSession(sessionRef.current ?? session),
          });
        });
        c.on("data", (d) => handle(c, d as NetMessage));
        c.on("close", () => conns.current.delete(c.peer));
      },
      setNet,
    ).then((p) => {
      if (alive) {
        peer.current = p;
      } else p.destroy();
    });
    return () => {
      alive = false;
      peer.current?.destroy();
      peer.current = null;
    };
  }, [session?.code]);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => {
      if (session.status === "running" && session.startedAt) {
        const r = Math.max(
          0,
          session.duration - (Date.now() - session.startedAt),
        );
        setRemaining(r);
        if (!r) {
          const s = { ...session, status: "ended" as const };
          save(s);
          broadcast({ type: "SESSION_STATE", session: safeSession(s) });
        }
      } else setRemaining(session.duration);
    }, 500);
    return () => clearInterval(t);
  }, [session]);
  function broadcast(m: NetMessage) {
    conns.current.forEach((c) => c.open && c.send(m));
  }
  function handle(c: DataConnection, d: NetMessage) {
    const current = sessionRef.current;
    if (!current) return;
    const s = structuredClone(current);
    if (d.type === "REGISTER_ARENA") {
      const arenaId = String(d.arenaId || c.peer);
      s.arenas[arenaId] = {
        id: arenaId,
        number: Number(d.number || 0),
        status: "ready",
        lastSeen: Date.now(),
      };
      c.send({ type: "WELCOME", session: safeSession(s) });
      save(s);
    }
    if (d.type === "HEARTBEAT") {
      const id = String(d.arenaId || "");
      if (s.arenas[id]) {
        s.arenas[id].lastSeen = Date.now();
        s.arenas[id].status = String(d.status || s.arenas[id].status);
        save(s);
      }
    }
    if (d.type === "MATCH_START_REQUEST") {
      const ids = d.playerIds as [string, string],
        arenaId = String(d.arenaId),
        busy = Object.values(s.active).some((m) =>
          m.playerIds.some((id) => ids.includes(id)),
        );
      if (s.status !== "running")
        return c.send({
          type: "MATCH_REJECTED",
          reason:
            s.status === "ended"
              ? "수업 시간이 종료되었습니다."
              : "교사가 아직 수업을 시작하지 않았습니다.",
        });
      if (busy || ids[0] === ids[1])
        return c.send({
          type: "MATCH_REJECTED",
          reason: "선택한 학생이 다른 경기 중이거나 중복 선택되었습니다.",
        });
      const matchId = crypto.randomUUID();
      s.active[matchId] = {
        matchId,
        arenaId,
        playerIds: ids,
        startedAt: Date.now(),
      };
      if (s.arenas[arenaId])
        Object.assign(s.arenas[arenaId], {
          status: "playing",
          players: ids,
          matchId,
        });
      save(s);
      c.send({ type: "MATCH_APPROVED", match: s.active[matchId] });
    }
    if (d.type === "MATCH_RESULT") {
      const m = d.match as Match;
      if (s.matches.some((x) => x.matchId === m.matchId))
        return c.send({ type: "RESULT_ACCEPTED", matchId: m.matchId });
      const counted = s.status !== "ended" && !!s.active[m.matchId];
      if (counted) {
        m.counted = true;
        s.matches.push(m);
        const win = s.players.find((p) => p.id === m.playerIds[m.winner]),
          lose = s.players.find(
            (p) => p.id === m.playerIds[m.winner === 0 ? 1 : 0],
          );
        if (win) {
          win.win++;
          win.games++;
          win.score += 3;
        }
        if (lose) {
          lose.loss++;
          lose.games++;
        }
      }
      delete s.active[m.matchId];
      const a = s.arenas[m.arenaId];
      if (a)
        Object.assign(a, {
          status: "ready",
          players: undefined,
          matchId: undefined,
        });
      save(s);
      c.send({
        type: counted ? "RESULT_ACCEPTED" : "SESSION_CLOSED",
        matchId: m.matchId,
      });
    }
  }
  if (!session)
    return (
      <main className="join-screen">
        <section className="join-card-large">
          <Logo />
          <small>TEACHER ACCESS</small>
          <h1>
            수업을 시작하거나
            <br />
            기존 수업을 복구하세요.
          </h1>
          <div className="join-options">
            <button
              className="primary"
              onClick={() => {
                const s = blankSession();
                setCode(s.code);
                save(s);
              }}
            >
              새 수업 만들기
            </button>
            <div>
              <input
                inputMode="numeric"
                maxLength={4}
                value={restore}
                onChange={(e) =>
                  setRestore(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="4자리 수업 코드"
              />
              <button
                onClick={() => {
                  const x = localStorage.getItem(sessionKey(restore));
                  if (x) save(JSON.parse(x));
                }}
              >
                수업 복구
              </button>
            </div>
            <p className="restore-help">페이지가 불안정하게 종료되었을 경우 기존 학급 코드를 입력하고 게임을 이어서 진행하세요.</p>
          </div>
          <button className="text-back" onClick={back}>
            ← 메인으로
          </button>
        </section>
      </main>
    );
  const mins = Math.floor(remaining / 60000),
    secs = Math.floor((remaining % 60000) / 1000),
    arenas = Object.values(session.arenas);
  return (
    <main className="dashboard">
      <header>
        <Logo />
        <div>
          <span className={`online ${net}`}>
            ● {net === "online" ? "경기장 접속 가능" : "연결 준비 중"}
          </span>
          <button className="ghost" onClick={() => { if (confirm("클릭 시 게임이 초기화됩니다. 정말 종료하시겠습니까?")) { localStorage.removeItem(sessionKey(session.code)); peer.current?.destroy(); back(); } }}>
            메인 화면(게임 초기화)
          </button>
        </div>
      </header>
      <div className="teacher-bar">
        <div>
          <small>CLASS CODE</small>
          <b>{session.code}</b>
          <span>교사 복구 코드와 학생 방 코드가 같습니다.</span>
        </div>
        <div className="timer-display">
          <small>CLASS TIMER</small>
          <b>
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </b>
          <button
            disabled={session.status === "ended"}
            onClick={() => {
              const pausing = session.status === "running";
              const s = {
                ...session,
                status: pausing ? ("setup" as const) : ("running" as const),
                duration:
                  pausing && session.startedAt
                    ? Math.max(
                        0,
                        session.duration - (Date.now() - session.startedAt),
                      )
                    : session.duration,
                startedAt: pausing ? null : Date.now(),
              };
              save(s);
              broadcast({ type: "SESSION_STATE", session: safeSession(s) });
            }}
          >
            {session.status === "running" ? "일시정지" : "게임 시작"}
          </button>
          <button
            onClick={() => {
              const s = { ...session, status: "ended" as const };
              save(s);
              broadcast({ type: "SESSION_STATE", session: safeSession(s) });
            }}
          >
            게임 종료
          </button>
        </div>
      </div>
      {session.status === "ended" && (
        <div className="session-ended">
          <b>수업 시간이 종료되었습니다.</b>
          <span>
            현재 진행 중인 게임은 끝까지 플레이할 수 있지만 전적에는 반영되지
            않습니다.
          </span>
        </div>
      )}
      <section className="teacher-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <small>01 · PLAYERS</small>
              <h2>플레이어 {session.players.length}명</h2>
            </div>
          </div>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder="학생 이름을 줄바꿈으로 한꺼번에 추가"
          />
          <button
            className="add-bulk"
            onClick={() => {
              const names = bulk
                  .split(/[\n,]+/)
                  .map((x) => x.trim())
                  .filter(Boolean),
                s = {
                  ...session,
                  players: [
                    ...session.players,
                    ...names.map((n, i) =>
                      emptyPlayer(n, session.players.length + i),
                    ),
                  ],
                };
              setBulk("");
              save(s);
              broadcast({ type: "ROSTER", session: safeSession(s) });
            }}
          >
            명단 추가
          </button>
          <div className="player-list">
            {session.players.map((p) => (
              <div className="player-row" key={p.id}>
                <span className="avatar">{p.name[0]}</span>
                <b>{p.name}</b>
                <small>
                  {p.win}승 · {p.score}점
                </small>
                <button
                  onClick={() =>
                    save({
                      ...session,
                      players: session.players.filter((x) => x.id !== p.id),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </article>
        <article className="panel qr-panel">
          <small>02 · STUDENT ACCESS</small>
          <h2>경기장 접속</h2>
          {qr && <button className="qr-zoom-button" onClick={() => setQrExpanded(true)} aria-label="QR 코드 크게 보기"><img src={qr} alt={`수업 코드 ${session.code} QR 코드`} /></button>}
          <b>{session.code}</b>
          <button
            onClick={() =>
              navigator.clipboard.writeText(
                `${location.origin}${location.pathname}?mode=arena&code=${session.code}`,
              )
            }
          >
            경기장 링크 복사
          </button>
          <p>태블릿마다 경기장 번호를 선택하면 자동 연결됩니다.</p>
        </article>
        <article className="panel arena-status">
          <div className="panel-head">
            <div>
              <small>03 · LIVE ARENAS</small>
              <h2>{arenas.length}대 연결</h2>
            </div>
          </div>
          {arenas.length ? (
            arenas
              .sort((a, b) => a.number - b.number)
              .map((a) => (
                <div className="arena-row" key={a.id}>
                  <strong>{String(a.number).padStart(2, "0")}</strong>
                  <div>
                    <b>경기장 {String(a.number).padStart(2, "0")}</b>
                    <small>
                      {a.players
                        ?.map(
                          (id) =>
                            session.players.find((p) => p.id === id)?.name,
                        )
                        .join(" VS ") || "플레이어 대기"}
                    </small>
                  </div>
                  <span
                    className={
                      Date.now() - a.lastSeen < 25000 ? "live" : "lost"
                    }
                  >
                    {a.status === "playing" ? "진행 중" : "대기"}
                  </span>
                </div>
              ))
          ) : (
            <div className="empty">아직 연결된 경기장이 없습니다.</div>
          )}
        </article>
      </section>
      <section className="match-strip">
        <div>
          <small>MATCH RESULTS</small>
          <h2>{session.matches.length}경기 완료</h2>
          <button
            className="result-reveal"
            disabled={!session.matches.length}
            onClick={() => setShowResults(true)}
          >
            결과 공개
          </button>
        </div>
        {session.matches
          .slice(-5)
          .reverse()
          .map((m) => (
            <div key={m.matchId}>
              <b>
                {
                  session.players.find((p) => p.id === m.playerIds[m.winner])
                    ?.name
                }{" "}
                승리
              </b>
              <span>
                TURN {m.turns} ·{" "}
                {m.counted ? "전적 반영" : "시간 종료 후 미반영"}
              </span>
            </div>
          ))}
      </section>
      {showResults && (
        <ResultsOverlay players={session.players} close={() => setShowResults(false)} />
      )}
      {qrExpanded && <div className="qr-lightbox" onClick={() => setQrExpanded(false)}><button aria-label="확대 QR 코드 닫기">×</button><img src={qr} alt={`확대된 수업 코드 ${session.code} QR 코드`} /><b>{session.code}</b></div>}
    </main>
  );
}
function ResultsOverlay({ players, close }: { players: Player[]; close: () => void }) {
  const ranked = [...players].sort((a, b) => b.score - a.score || b.win - a.win || a.name.localeCompare(b.name));
  const podium = [ranked[1], ranked[0], ranked[2]];
  return (
    <div className="results-screen">
      <button className="results-close" onClick={close} aria-label="결과 화면 닫기">×</button>
      <div className="results-title"><small>CLASSROOM FINAL RANKING</small><h2>오늘의 알고리즘 마스터</h2></div>
      <div className="podium">
        {podium.map((player, i) => player && (
          <article className={`rank r${[2, 1, 3][i]}`} key={player.id}>
            <img src={`/images/ranks/medal_rank_${[2, 1, 3][i]}.png`} alt={`${[2, 1, 3][i]}위 메달`} />
            <h3>{player.name}</h3><p>{player.win}승 · {player.score}점</p>
          </article>
        ))}
      </div>
      <div className="leaderboard">
        {ranked.slice(0, 8).map((p, i) => <div key={p.id}><strong>{i + 1}</strong><span>{p.name}</span><small>{p.games}경기 · {p.win}승</small><b>{p.score}점</b></div>)}
      </div>
    </div>
  );
}
function safeSession(s: Session) {
  return {
    code: s.code,
    title: s.title,
    players: s.players,
    status: s.status,
    duration: s.duration,
    startedAt: s.startedAt,
  };
}
function ArenaClient({ back }: { back: () => void }) {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState(params.get("code") || "");
  const [number, setNumber] = useState(0);
  const [session, setSession] = useState<ReturnType<typeof safeSession> | null>(
    null,
  );
  const [net, setNet] = useState("offline");
  const [arenaId] = useState(
    () => localStorage.getItem("twelve-arena-id") || crypto.randomUUID(),
  );
  const [players, setPlayers] = useState<[string, string]>(["", ""]);
  const [game, setGame] = useState<GameState | null>(null);
  const [notice, setNotice] = useState("");
  const client = useRef<Awaited<ReturnType<typeof connectArena>> | null>(null);
  const gameRef = useRef<GameState | null>(null);
  useEffect(() => {
    localStorage.setItem("twelve-arena-id", arenaId);
  }, [arenaId]);
  useEffect(() => {
    gameRef.current = game;
    if (game && code)
      localStorage.setItem(
        `${arenaKey(code)}-${arenaId}`,
        JSON.stringify({ game, players, number }),
      );
  }, [game, players, number, code]);
  useEffect(() => {
    const timer = window.setInterval(
      () =>
        client.current?.send({
          type: "HEARTBEAT",
          arenaId,
          status: gameRef.current ? "playing" : "ready",
          matchId: gameRef.current?.matchId,
          turnNumber: gameRef.current?.turnNumber,
        }),
      10000,
    );
    return () => window.clearInterval(timer);
  }, [arenaId]);
  function connect() {
    if (code.length !== 4 || !number) return;
    client.current?.destroy();
    connectArena(
      code,
      (d) => {
        if (d.type === "WELCOME" || d.type === "ROSTER") {
          setSession(d.session as ReturnType<typeof safeSession>);
          setNotice("");
        }
        if (d.type === "SESSION_STATE") {
          setSession(d.session as ReturnType<typeof safeSession>);
        }
        if (d.type === "MATCH_REJECTED") setNotice(String(d.reason));
        if (d.type === "MATCH_APPROVED") {
          const m = d.match as { matchId: string };
          const g = newGame(m.matchId);
          audio.cue("start");
          setGame(g);
        }
        if (d.type === "RESULT_ACCEPTED") {
          localStorage.removeItem(`${arenaKey(code)}-outbox`);
          setNotice("결과가 교사 전광판에 반영되었습니다.");
        }
        if (d.type === "SESSION_CLOSED") {
          localStorage.removeItem(`${arenaKey(code)}-outbox`);
          setNotice(
            "수업 시간이 종료되어 이 경기 결과는 전적에 반영되지 않았습니다.",
          );
        }
      },
      setNet,
    ).then((c) => {
      client.current = c;
      setTimeout(() => {
        c.send({ type: "REGISTER_ARENA", arenaId, number });
        const out = localStorage.getItem(`${arenaKey(code)}-outbox`);
        if (out) c.send(JSON.parse(out));
      }, 500);
    });
  }
  function request() {
    client.current?.send({
      type: "MATCH_START_REQUEST",
      arenaId,
      number,
      playerIds: players,
    });
  }
  function complete(g: GameState) {
    if (g.winner === null) return;
    const match: Match = {
      matchId: g.matchId,
      arenaId,
      playerIds: players,
      winner: g.winner,
      turns: g.turnNumber,
      completedAt: Date.now(),
      counted: false,
      reason: g.reason || "KING_CAPTURED",
    };
    const msg = { type: "MATCH_RESULT", match };
    localStorage.setItem(`${arenaKey(code)}-outbox`, JSON.stringify(msg));
    client.current?.send(msg);
  }
  if (game && session) {
    return (
      <GameBoard
        game={game}
        setGame={(g) => {
          setGame(g);
          if (g.winner !== null && game.winner === null) complete(g);
        }}
        names={
          players.map(
            (id) =>
              session.players.find((p) => p.id === id)?.name || "플레이어",
          ) as [string, string]
        }
        net={net}
        finish={() => {
          setGame(null);
          setPlayers(["", ""]);
        }}
      />
    );
  }
  if (!session)
    return (
      <main className="join-screen">
        <section className="join-card-large">
          <Logo />
          <small>ARENA CONNECTION</small>
          <h1>경기장에 접속하세요.</h1>
          <input
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="4자리 수업 코드"
          />
          <div className="arena-number-row">
            <div className="arena-numbers">
              {Array.from({ length: 16 }, (_, i) => (
                <button
                  className={number === i + 1 ? "on" : ""}
                  key={i}
                  onClick={() => setNumber(i + 1)}
                >
                  {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <p className="arena-number-help">선생님께서 태블릿 번호를 지정해 주세요.<br />학생들이 임의로 지정할 경우 태블릿 번호가 중복될 수 있습니다.</p>
          </div>
          <button
            className="primary connect-button"
            disabled={code.length !== 4 || !number}
            onClick={connect}
          >
            경기장 연결
          </button>
          <button className="text-back corner-back" onClick={back}>
            ← 메인 화면
          </button>
          <p>
            {net === "reconnecting"
              ? "교사 화면을 찾는 중입니다…"
              : "수업 코드를 입력한 후 이 태블릿의 경기장 번호를 선택하세요."}
          </p>
        </section>
      </main>
    );
  const stored = localStorage.getItem(`${arenaKey(code)}-${arenaId}`);
  return (
    <main className="join-screen">
      <section className="lobby-card">
        <div className="lobby-top">
          <div>
            <small>ARENA {String(number).padStart(2, "0")}</small>
            <h1>도전자 두 명을 선택하세요.</h1>
          </div>
          <span className={`online ${net}`}>
            ● {net === "online" ? "교사 화면 연결됨" : "연결 복구 중"}
          </span>
        </div>
        {session.status === "ended" && (
          <div className="session-ended">
            <b>수업 시간이 종료되었습니다.</b>
            <span>새 경기를 시작할 수 없습니다.</span>
          </div>
        )}
        <div className="student-grid">
          {session.players.map((p) => (
            <button
              key={p.id}
              className={players.includes(p.id) ? "selected-student" : ""}
              onClick={() => {
                if (players[0] === p.id) setPlayers(["", players[1]]);
                else if (players[1] === p.id) setPlayers([players[0], ""]);
                else if (!players[0]) setPlayers([p.id, players[1]]);
                else if (!players[1]) setPlayers([players[0], p.id]);
              }}
            >
              <span>{p.name[0]}</span>
              <b>{p.name}</b>
              <small>
                {p.win}승 · {p.score}점
              </small>
            </button>
          ))}
        </div>
        <div className="lobby-action">
          <div>
            <b>
              {session.players.find((p) => p.id === players[0])?.name ||
                "플레이어 A"}
            </b>
            <span>VS</span>
            <b>
              {session.players.find((p) => p.id === players[1])?.name ||
                "플레이어 B"}
            </b>
          </div>
          <button
            disabled={
              !players[0] ||
              !players[1] ||
              session.status !== "running" ||
              net !== "online"
            }
            onClick={request}
          >
            두 선수 확인 · 경기 시작
          </button>
          {stored && (
            <button
              className="resume"
              onClick={() => {
                const x = JSON.parse(stored);
                setPlayers(x.players);
                setNumber(x.number);
                setGame(x.game);
              }}
            >
              직전 완료 턴에서 경기 복구
            </button>
          )}
          <p>{notice}</p>
        </div>
      </section>
    </main>
  );
}
function GameBoard({
  game,
  setGame,
  names,
  net,
  finish,
}: {
  game: GameState;
  setGame: (g: GameState) => void;
  names: [string, string];
  net: string;
  finish: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [prisoner, setPrisoner] = useState<number | null>(null);
  const legal = useMemo(
    () =>
      selected !== null
        ? legalMoves(game, selected)
        : prisoner !== null
          ? legalDrops(game, game.captured[game.turn][prisoner])
          : [],
    [game, selected, prisoner],
  );
  function tap(i: number) {
    const p = game.board[i];
    if (selected !== null && legal.includes(i)) {
      const before = game.board[selected];
      const next = movePiece(game, selected, i);
      audio.tone(p ? "capture" : "move");
      if (before && next.board[i]?.kind !== before.kind) audio.cue("promote");
      if (next.winner !== null) audio.cue("victory");
      setGame(next);
      setSelected(null);
    } else if (prisoner !== null && legal.includes(i)) {
      const next = dropPiece(game, prisoner, i);
      audio.tone("move");
      if (next.winner !== null) audio.cue("victory");
      setGame(next);
      setPrisoner(null);
    } else if (p?.owner === game.turn) {
      audio.tone("select");
      setSelected(i);
    }
  }
  function saveFlow(side: Side) {
    const events = game.lastEvents[side];
    if (!events.length) return;
    audio.tone("save");
    setGame({
      ...game,
      saved: [
        ...game.saved,
        {
          turn: game.turnNumber - 1,
          playerId: String(side),
          events,
          boardBefore: [],
          boardAfter: game.board,
          timestamp: Date.now(),
          tags: events.flatMap((e) => (e.tag ? [e.tag] : [])),
        },
      ],
    });
  }
  return (
    <main className="game">
      <header>
        <span className={`online ${net}`}>
          ● {net === "online" ? "교사 연결됨" : "로컬 게임 · 연결 복구 중"}
        </span>
        <div>
          <small>ARENA</small>
          <b>TURN {String(game.turnNumber).padStart(2, "0")}</b>
        </div>
        <span>완료 턴 자동 저장</span>
      </header>
      <div className="game-layout">
        <Flow
          name={names[0]}
          active={game.turn === 0}
          events={game.lastEvents[0]}
          flipped
          save={() => saveFlow(0)}
          count={game.saved.filter((x) => x.playerId === "0").length}
        />
        <section className="board-zone">
          <Captured
            side={0}
            game={game}
            flipped
            pick={(i) => {
              if (game.turn === 0) setPrisoner(i);
            }}
          />
          <div className="top-player">
            {names[0]} <span>{game.turn === 0 ? "YOUR TURN" : "WAIT"}</span>
          </div>
          <div className="game-board">
            {game.board.map((p, i) => (
              <button
                key={i}
                className={`${selected === i ? "selected" : ""} ${legal.includes(i) ? "legal" : ""}`}
                onClick={() => tap(i)}
              >
                {p && (
                  <span className={`piece p${p.owner}`}>
                    {pieceInfo[p.kind].symbol}
                    <small>{pieceInfo[p.kind].name}</small>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="bottom-player">
            {names[1]} <span>{game.turn === 1 ? "YOUR TURN" : "WAIT"}</span>
          </div>
          <Captured
            side={1}
            game={game}
            pick={(i) => {
              if (game.turn === 1) setPrisoner(i);
            }}
          />
          <p className="hint">
            {prisoner !== null
              ? "포로를 내려놓을 빛나는 빈칸을 선택하세요."
              : selected !== null
                ? "이동할 빛나는 칸을 선택하세요."
                : `${names[game.turn]} 학생, 말 또는 포로를 선택하세요.`}
          </p>
        </section>
        <Flow
          name={names[1]}
          active={game.turn === 1}
          events={game.lastEvents[1]}
          save={() => saveFlow(1)}
          count={game.saved.filter((x) => x.playerId === "1").length}
        />
      </div>
      {game.winner !== null && (
        <div className="modal">
          <div className="dialog win">
            <small>MATCH COMPLETE · AUTO SENT</small>
            <h2>{names[game.winner]} 승리!</h2>
            <p>
              {game.reason === "KING_SURVIVED"
                ? "王이 상대 진영에서 한 턴 생존했습니다."
                : "상대의 王을 포획했습니다."}
            </p>
            <div className="result-stats">
              <span>{game.turnNumber}턴</span>
              <span>저장한 알고리즘 {game.saved.length}개</span>
            </div>
            <button className="primary" onClick={finish}>
              다음 경기 준비
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
function Captured({
  side,
  game,
  pick,
  flipped,
}: {
  side: Side;
  game: GameState;
  pick: (i: number) => void;
  flipped?: boolean;
}) {
  return (
    <div className={`captured ${flipped ? "flipped" : ""}`}>
      <small>포로</small>
      {game.captured[side].map((p, i) => (
        <button
          disabled={p.capturedOnTurn === game.turnNumber}
          onClick={() => pick(i)}
          key={p.id}
        >
          {pieceInfo[p.kind].symbol}
        </button>
      ))}
    </div>
  );
}
function Flow({
  name,
  active,
  events,
  flipped,
  save,
  count,
}: {
  name: string;
  active: boolean;
  events: GameState["lastEvents"][0];
  flipped?: boolean;
  save: () => void;
  count: number;
}) {
  const nodes = flowNodes(
    events.length
      ? events
      : [
          { type: "TURN_STARTED", label: "START" },
          { type: "BOARD_INSPECTED", label: "게임 상황 확인" },
        ],
  );
  return (
    <aside
      className={`flow ${active ? "active" : ""} ${flipped ? "flipped" : ""}`}
    >
      <div className="flow-head">
        <div>
          <small>ALGORITHM FLOW</small>
          <h3>{name}</h3>
        </div>
        <span>{active ? "NOW" : "WAIT"}</span>
      </div>
      <div className="nodes">
        {nodes.map((n, i) => (
          <div key={i}>
            <div className={`node ${n.shape}`}>{n.label}</div>
            {n.answer && (
              <b className={`branch ${n.answer.toLowerCase()}`}>{n.answer}</b>
            )}
            {i < nodes.length - 1 && <div className="arrow">↓</div>}
          </div>
        ))}
      </div>
      <button className="save" onClick={save}>
        ★ 이 턴 저장 · {count}
      </button>
    </aside>
  );
}
function Manual({ close }: { close: () => void }) {
  const [slide, setSlide] = useState(0);
  const data = [
    {
      t: "십이장기란?",
      p: "상대 王을 잡거나, 자신의 王이 상대 진영에서 한 턴 생존하면 승리합니다.",
    },
    {
      t: "다섯 가지 말",
      p: "將은 직선, 相은 대각선, 王은 여덟 방향, 子는 앞으로 이동하며 승급하면 侯가 됩니다.",
    },
    {
      t: "포획과 포로",
      p: "잡은 말은 다음 자신의 턴부터 빈칸에 내려놓을 수 있습니다. 포로 배치도 한 턴입니다.",
    },
    {
      t: "子에서 侯로",
      p: "子가 상대 진영에 도착하면 즉시 侯로 승급하고, 잡히면 다시 子가 됩니다.",
    },
    {
      t: "내 행동이 알고리즘",
      p: "평소처럼 플레이하세요. 선택·조건·결과가 실제 순서도 기호로 자동 기록됩니다.",
    },
  ][slide];
  return (
    <div className="manual">
      <button className="manual-close" onClick={close}>
        ×
      </button>
      <div className="manual-copy">
        <small>HOW TO PLAY · 0{slide + 1}/05</small>
        <h2>{data.t}</h2>
        <p>{data.p}</p>
        <div className="manual-flow">
          <span>START</span>
          <i>→</i>
          <span>말 선택</span>
          <i>→</i>
          <span className="diamond">조건?</span>
          <i>→</i>
          <span>턴 종료</span>
        </div>
        <div className="manual-nav">
          <button disabled={!slide} onClick={() => setSlide(slide - 1)}>
            ← 이전
          </button>
          <div>
            {data &&
              [0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={i === slide ? "on" : ""} />
              ))}
          </div>
          <button disabled={slide === 4} onClick={() => setSlide(slide + 1)}>
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
}
