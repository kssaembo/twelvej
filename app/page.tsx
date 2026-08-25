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
  type Event,
  type GameState,
  type SavedFlow,
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
  useEffect(() => {
    const click = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("button");
      if (button) audio.tone(button.closest(".concept-cards") ? "card" : "click");
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
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
  if (game) return <GameBoard game={game} setGame={setGame} names={names} net="practice" finish={() => setGame(null)} exit={() => { if (confirm("메인 화면으로 돌아가면 현재까지 하던 작업과 게임이 모두 초기화됩니다. 이동하시겠습니까?")) back(); }} />;
  return <main className="join-screen practice-screen"><button className="corner-back corner-right" onClick={() => { if (confirm("메인 화면으로 돌아가면 현재까지 하던 작업과 게임이 모두 초기화됩니다. 이동하시겠습니까?")) back(); }}>메인 화면</button><section className="join-card-large practice-card"><Logo /><small>PRACTICE MATCH</small><h1>둘이서 십이장기를<br />연습해 보세요.</h1><div className="practice-names"><input value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} aria-label="첫 번째 플레이어 이름"/><b>VS</b><input value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} aria-label="두 번째 플레이어 이름"/></div><button className="primary connect-button" onClick={() => { void audio.setEnabled(true); audio.cue("start"); setGame(newGame(`practice-${Date.now()}`)); }}>연습경기 시작</button></section></main>;
}
function TeacherIntro({ complete, back }: { complete: () => void; back: () => void }) {
  const [slide, setSlide] = useState(0);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [exitConfirm, setExitConfirm] = useState(false);
  const cards = slide === 0 ? [
    ["문제 해결 절차", "문제란 해결할 일이나 상황을 말하고, 문제를 효율적으로 해결하기 위해 순서에 맞게 차례대로 처리하는 것을 문제 해결 절차라고 합니다."],
    ["알고리즘", "컴퓨터 용어로 사용되며, 컴퓨터가 어떤 일을 수행하기 위한 단계적 방법입니다."],
  ] : [
    ["자연어", "일상생활에서 사용하는 일상적인 언어로 알고리즘을 표현하는 방법입니다."],
    ["의사 코드", "자연어를 컴퓨터가 이해할 수 있는 언어처럼 사용해 알고리즘의 절차를 표현하는 방법입니다."],
    ["순서도", "미리 약속된 기호와 화살표를 사용하여 알고리즘의 흐름과 순서를 그림으로 표현하는 방법입니다."],
  ];
  return <main className="teacher-intro">
    <button className="intro-back" onClick={() => setExitConfirm(true)}>← 메인 화면</button>
    <section className="intro-stage">
      <small>CLASS INTRO · 0{slide + 1}/04</small>
      {slide < 2 && <><h1>{slide === 0 ? "문제 해결 절차와 알고리즘" : "알고리즘을 표현하는 방법"}</h1><p>카드를 눌러 개념을 확인해 보세요.</p><div className={`concept-cards count-${cards.length}`}>{cards.map((card, i) => <button key={card[0]} className={flipped.includes(i) ? "flipped" : ""} onClick={() => setFlipped((x) => x.includes(i) ? x.filter((n) => n !== i) : [...x, i])}><span className="concept-front"><b>{card[0]}</b><small>TOUCH TO LEARN</small><i className="click-cue">☝</i></span><span className="concept-back"><b>{card[0]}</b><p>{card[1]}</p><i className="click-cue">↶</i></span></button>)}</div></>}
      {slide === 2 && <><h1>순서도 예시</h1><p>순서도는 시작과 끝, 처리, 판단을 약속된 도형과 화살표로 연결해 문제 해결의 순서를 한눈에 보여 줍니다.</p><div className="intro-flow"><span>시작</span><i>↓</i><b>게임 상황 확인</b><i>↓</i><em>이동할 수 있는가?</em><i>↓ YES</i><b>말 이동</b><i>↓</i><span>끝</span></div></>}
      {slide === 3 && <div className="intro-finale"><p>십이장기 게임을 통해</p><p>전략과 알고리즘을 알아가고</p><strong>마지막 최후의 승자가 돼라.</strong></div>}
      <div className="intro-nav"><button disabled={!slide} onClick={() => { setSlide(slide - 1); setFlipped([]); }}>← 이전</button><div>{[0,1,2,3].map(i => <i className={i === slide ? "on" : ""} key={i} />)}</div><button onClick={() => { if (slide === 3) complete(); else { setSlide(slide + 1); setFlipped([]); } }}>{slide === 3 ? "새 수업 만들기 →" : "다음 →"}</button></div>
    </section>
    {exitConfirm && <ConfirmDialog title="인트로를 종료할까요?" message="인트로를 종료하고 메인화면으로 나가시겠습니까?" confirm="메인 화면으로" onConfirm={back} onCancel={() => setExitConfirm(false)} />}
  </main>;
}
function ConfirmDialog({ title, message, confirm, onConfirm, onCancel }: { title: string; message: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="service-confirm" role="dialog" aria-modal="true"><div><small>PLEASE CONFIRM</small><h3>{title}</h3><p>{message}</p><span><button onClick={onCancel}>취소</button><button className="danger-confirm" onClick={onConfirm}>{confirm}</button></span></div></div>;
}
function Teacher({ back }: { back: () => void }) {
  const [intro, setIntro] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [restore, setRestore] = useState("");
  const [net, setNet] = useState("offline");
  const [bulk, setBulk] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [qr, setQr] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const peer = useRef<Peer | null>(null),
    conns = useRef(new Map<string, DataConnection>()),
    sessionRef = useRef<Session | null>(null);
  const save = (s: Session) => {
    const normalized = { ...s, players: s.players.map((p) => ({ ...p, score: p.win * 2 + p.loss })) };
    sessionRef.current = normalized;
    setSession(normalized);
    localStorage.setItem(sessionKey(normalized.code), JSON.stringify(normalized));
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
      if (id && !s.arenas[id]) s.arenas[id] = { id, number: Number(d.number || 0), status: String(d.status || "ready"), lastSeen: Date.now() };
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
          win.score += 2;
        }
        if (lose) {
          lose.loss++;
          lose.games++;
          lose.score += 1;
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
  if (intro) return <TeacherIntro complete={() => setIntro(false)} back={back} />;
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
          <button className="ghost" onClick={() => setResetConfirm(true)}>
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
            className="end-game-button"
            onClick={() => {
              if (!confirm("게임을 종료하시겠습니까? 진행 중인 경기는 승점에 반영되지 않습니다.")) return;
              const s = { ...session, status: "ended" as const };
              save(s);
              broadcast({ type: "SESSION_STATE", session: safeSession(s) });
            }}
          >
            게임 종료
          </button>
          {session.status === "ended" && <button className="timer-result-button" disabled={!session.matches.length} onClick={() => setShowResults(true)}>🏆 결과 공개</button>}
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
          <small className="qr-click-hint">QR코드를 클릭하면 확대됩니다.</small>
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
        <article className="panel match-dashboard">
          <div className="panel-head">
            <div>
              <small>03 · MATCH RESULTS</small>
              <h2>{session.matches.length}경기 완료</h2>
            </div>
          </div>
          <div className="match-dashboard-grid"><div className="mini-ranking"><b>플레이어 순위</b>{[...session.players].sort((a,b)=>b.score-a.score).map((p,i)=><div key={p.id}><strong>{i+1}</strong><span>{p.name}</span><small>{p.games}경기</small><em>{p.win}승 {p.loss}패</em></div>)}</div><div className="result-log"><b>게임 결과 로그</b>{session.matches.slice().reverse().map((m)=>{ const winner=session.players.find(p=>p.id===m.playerIds[m.winner]); const loser=session.players.find(p=>p.id===m.playerIds[m.winner===0?1:0]); return <div key={m.matchId}><span><b>{winner?.name}</b> 승리</span><em>VS {loser?.name}</em><small>{m.turns}턴 · {m.counted ? "반영" : "미반영"}</small></div>})}</div></div>
        </article>
      </section>
      <section className="live-arena-strip"><div className="strip-title"><small>LIVE ARENAS</small><h2>{arenas.length}대 연결</h2></div><div className="arena-card-grid">{arenas.length ? arenas.sort((a,b)=>a.number-b.number).map((a)=><article key={a.id} className={Date.now()-a.lastSeen<25000 ? "connected" : "disconnected"}><strong>{String(a.number).padStart(2,"0")}</strong><b>{a.status === "playing" ? "진행 중" : "대기"}</b><small>{a.players?.map(id=>session.players.find(p=>p.id===id)?.name).join(" VS ") || "플레이어 대기"}</small></article>) : <div className="empty">아직 연결된 경기장이 없습니다.</div>}</div>
      </section>
      {showResults && (
        <ResultsOverlay session={session} reset={() => { localStorage.removeItem(sessionKey(session.code)); peer.current?.destroy(); back(); }} />
      )}
      {qrExpanded && <div className="qr-lightbox" onClick={() => setQrExpanded(false)}><button aria-label="확대 QR 코드 닫기">×</button><img src={qr} alt={`확대된 수업 코드 ${session.code} QR 코드`} /><b>{session.code}</b></div>}
      {resetConfirm && <ConfirmDialog title="게임을 초기화할까요?" message="현재 수업과 경기 정보를 초기화하고 메인 화면으로 이동합니다." confirm="초기화하고 이동" onCancel={() => setResetConfirm(false)} onConfirm={() => { localStorage.removeItem(sessionKey(session.code)); peer.current?.destroy(); back(); }} />}
    </main>
  );
}
function ResultsOverlay({ session, reset }: { session: Session; reset: () => void }) {
  const [detail, setDetail] = useState<Player | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  useEffect(() => { void audio.playResultBgm(); return () => audio.stopResultBgm(); }, []);
  const players = session.players;
  const ranked = [...players].sort((a, b) => b.score - a.score || b.win - a.win || a.name.localeCompare(b.name));
  const podium = [ranked[1], ranked[0], ranked[2]];
  const copyResults = () => { const rows = [["순위","이름","경기","승","패","승점"], ...ranked.map((p,i)=>[i+1,p.name,p.games,p.win,p.loss,p.score])]; navigator.clipboard.writeText(rows.map(r=>r.join("\t")).join("\n")); };
  return (
    <div className="results-screen">
      <div className="celebration" aria-hidden>{Array.from({length:28},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,animationDelay:`${(i%9)*-.23}s`,animationDuration:`${2.4+(i%5)*.3}s`}} />)}</div>
      <button className="results-reset" onClick={() => setResetConfirm(true)}>메인 화면(게임 초기화)</button>
      <div className="result-copy-box"><button onClick={copyResults}>게임 결과 복사하기</button><small>이 버튼을 클릭한 후 한셀/엑셀에 가서 붙여넣기 하세요. 게임 결과를 저장할 수 있습니다.</small></div>
      <div className="results-title"><small>CLASSROOM FINAL RANKING</small><h2>오늘의 십이장기 타이틀</h2></div>
      <div className="podium">
        {podium.map((player, i) => player && (
          <article className={`rank r${[2, 1, 3][i]}`} key={player.id} onClick={() => setDetail(player)}>
            <img src={`/images/ranks/medal_rank_${[2, 1, 3][i]}.png`} alt={`${[2, 1, 3][i]}위 메달`} />
            <h3>{player.name}</h3><p>{player.win}승 · {player.score}점</p>
          </article>
        ))}
      </div>
      <div className="leaderboard">
        {ranked.map((p, i) => <button key={p.id} onClick={() => setDetail(p)}><strong>{i + 1}</strong><span>{p.name}</span><small>{p.games}경기 · {p.win}승 · {p.loss}패</small><b>{p.score}점</b></button>)}
      </div>
      <p className="best-move-message">내가 했던 최고의 한 수(알고리즘)를 찾아보세요.</p>
      {detail && <div className="record-detail"><button onClick={() => setDetail(null)}>×</button><h3>{detail.name}의 경기 전적</h3>{session.matches.filter(m=>m.playerIds.includes(detail.id)).map(m=>{ const other=m.playerIds.find(id=>id!==detail.id); const won=m.playerIds[m.winner]===detail.id; return <div key={m.matchId}><b>{won ? "승리" : "패배"}</b><span>VS {players.find(p=>p.id===other)?.name}</span><small>TURN {m.turns} · {m.counted ? "승점 반영" : "미반영"}</small></div>})}</div>}
      {resetConfirm && <ConfirmDialog title="게임 결과를 초기화할까요?" message="게임 결과와 학급 정보가 모두 초기화되고 메인 화면으로 이동합니다." confirm="초기화하고 이동" onCancel={() => setResetConfirm(false)} onConfirm={reset} />}
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
        number,
          status: gameRef.current ? "playing" : "ready",
          matchId: gameRef.current?.matchId,
          turnNumber: gameRef.current?.turnNumber,
        }),
      10000,
    );
    return () => window.clearInterval(timer);
  }, [arenaId, number]);
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
          void audio.setEnabled(true);
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
    void audio.setEnabled(true);
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
        records={players.map((id) => session.players.find((p) => p.id === id)) as [Player | undefined, Player | undefined]}
        net={net}
        finish={() => {
          setGame(null);
          setPlayers(["", ""]);
        }}
        exit={() => { if (confirm("메인 화면으로 돌아가면 현재까지 하던 작업과 게임이 모두 초기화됩니다. 이동하시겠습니까?")) { client.current?.destroy(); localStorage.removeItem(`${arenaKey(code)}-${arenaId}`); localStorage.removeItem(`${arenaKey(code)}-outbox`); back(); } }}
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
          <button className="text-back corner-back corner-right" onClick={() => { if (confirm("메인 화면으로 돌아가면 현재까지 하던 작업과 게임이 모두 초기화됩니다. 이동하시겠습니까?")) { client.current?.destroy(); localStorage.removeItem(`${arenaKey(code)}-${arenaId}`); localStorage.removeItem(`${arenaKey(code)}-outbox`); back(); } }}>
            메인 화면
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
          {session.status === "setup" && <p className="teacher-start-hint">선생님이 게임 시작을 하면 활성화됩니다.</p>}
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
  records,
  exit,
}: {
  game: GameState;
  setGame: (g: GameState) => void;
  names: [string, string];
  net: string;
  finish: () => void;
  records?: [Player | undefined, Player | undefined];
  exit?: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [prisoner, setPrisoner] = useState<number | null>(null);
  const baseFlow: Event[] = [{ type: "TURN_STARTED", label: "START" }, { type: "BOARD_INSPECTED", label: "게임 상황 확인" }];
  const [liveEvents, setLiveEvents] = useState<[Event[], Event[]]>([[...baseFlow], [...baseFlow]]);
  const [gallerySide, setGallerySide] = useState<Side | null>(null);
  const [openFlow, setOpenFlow] = useState<SavedFlow | null>(null);
  useEffect(() => {
    setLiveEvents((current) => { const next: [Event[], Event[]] = [[...current[0]], [...current[1]]]; next[game.turn] = [...baseFlow]; return next; });
    setSelected(null); setPrisoner(null);
  }, [game.turn, game.turnNumber]);
  useEffect(() => { if (game.winner !== null) setGallerySide(game.winner); }, [game.winner]);
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
      const actor = game.turn;
      const completed = next.lastEvents[actor];
      completed.slice(liveEvents[actor].length).forEach((_, step) => setTimeout(() => setLiveEvents((current) => { const copy: [Event[], Event[]] = [[...current[0]], [...current[1]]]; copy[actor] = completed.slice(0, liveEvents[actor].length + step + 1); return copy; }), 180 * (step + 1)));
      audio.tone(p ? "capture" : "move");
      if (before && next.board[i]?.kind !== before.kind) audio.cue("promote");
      if (next.winner !== null) audio.cue("victory");
      setGame(next);
      setSelected(null);
    } else if (prisoner !== null && legal.includes(i)) {
      const next = dropPiece(game, prisoner, i);
      const actor = game.turn;
      const completed = next.lastEvents[actor];
      completed.slice(liveEvents[actor].length).forEach((_, step) => setTimeout(() => setLiveEvents((current) => { const copy: [Event[], Event[]] = [[...current[0]], [...current[1]]]; copy[actor] = completed.slice(0, liveEvents[actor].length + step + 1); return copy; }), 180 * (step + 1)));
      audio.tone("move");
      if (next.winner !== null) audio.cue("victory");
      setGame(next);
      setPrisoner(null);
    } else if (p?.owner === game.turn) {
      audio.tone("select");
      setSelected(i);
      setPrisoner(null);
      setLiveEvents((current) => { const copy: [Event[], Event[]] = [[...current[0]], [...current[1]]]; copy[game.turn] = [...baseFlow, { type: "PIECE_SELECTED", label: `${pieceInfo[p.kind].symbol}(${pieceInfo[p.kind].name}) 선택` }]; return copy; });
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
        {exit ? <button className="game-main-button" onClick={exit}>메인 화면</button> : <span>완료 턴 자동 저장</span>}
      </header>
      <div className="game-layout">
        <Flow
          name={names[0]}
          active={game.turn === 0}
          events={liveEvents[0]}
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
              if (game.turn === 0) { setPrisoner(i); setSelected(null); const p = game.captured[0][i]; setLiveEvents((current) => [[...baseFlow, { type: "PIECE_SELECTED", label: `포로 ${pieceInfo[p.kind].symbol}(${pieceInfo[p.kind].name}) 선택` }], current[1]]); }
            }}
          />
          <div className="top-player">
            {names[0]} <span>{game.turn === 0 ? "YOUR TURN" : "WAIT"}</span>
          </div>
          <div className="game-board">
            {game.board.map((p, i) => (
              <button
                key={i}
                className={`${selected === i ? "selected" : ""} ${legal.includes(i) ? "legal" : ""} ${i < 3 ? "end-zone zone-top" : i > 8 ? "end-zone zone-bottom" : ""}`}
                onClick={() => tap(i)}
              >
                {p && (
                  <span className={`piece p${p.owner}`}>
                    {pieceInfo[p.kind].symbol}
                    <small>{pieceInfo[p.kind].name}</small>
                    {pieceInfo[p.kind].dirs.map(([r,c], d) => <i key={d} className={`dir d${r}${c}`} />)}
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
              if (game.turn === 1) { setPrisoner(i); setSelected(null); const p = game.captured[1][i]; setLiveEvents((current) => [current[0], [...baseFlow, { type: "PIECE_SELECTED", label: `포로 ${pieceInfo[p.kind].symbol}(${pieceInfo[p.kind].name}) 선택` }]]); }
            }}
          />
          <p className="hint">
            {prisoner !== null
              ? "포로를 내려놓을 빛나는 빈칸을 선택하세요."
              : selected !== null
                ? "이동할 빛나는 칸을 선택하세요."
                : "플레이어 학생, 장기판 위의 말을 이동하거나 포로로 잡힌 말을 배치하세요."}
          </p>
        </section>
        <Flow
          name={names[1]}
          active={game.turn === 1}
          events={liveEvents[1]}
          save={() => saveFlow(1)}
          count={game.saved.filter((x) => x.playerId === "1").length}
        />
      </div>
      {game.winner !== null && (
        <div className="modal match-finish-modal">
          <div className="dialog win finish-summary">
            <h2 className="winner-message">{names[game.winner]} 승리!</h2>
            <p>
              {game.reason === "KING_SURVIVED"
                ? "王이 상대 진영에서 한 턴 생존했습니다."
                : "상대의 王을 포획했습니다."}
            </p>
            <div className="result-stats">
              <span>{game.turnNumber}턴</span>
            </div>
          </div>
          {gallerySide !== null && <AlgorithmGallery side={gallerySide} name={names[gallerySide]} opponent={names[gallerySide === 0 ? 1 : 0]} outcome={gallerySide === game.winner ? "승리" : "패배"} flows={game.saved.filter((x) => x.playerId === String(gallerySide))} open={setOpenFlow} next={() => { const other: Side = gallerySide === 0 ? 1 : 0; if (gallerySide === game.winner) setGallerySide(other); else finish(); }} final={gallerySide !== game.winner} />}
          {openFlow && <div className="flow-lightbox"><button onClick={() => setOpenFlow(null)}>×</button><FlowPreview flow={openFlow} /><button onClick={() => { const side = Number(openFlow.playerId) as Side; downloadFlow(openFlow, names[side], names[side === 0 ? 1 : 0], side === game.winner ? "승리" : "패배"); }}>이미지 저장</button></div>}
        </div>
      )}
    </main>
  );
}
function FlowPreview({ flow }: { flow: SavedFlow }) {
  return <div className="flow-preview"><small>TURN {flow.turn}</small>{flowNodes(flow.events).map((node, i) => <div key={i}><span className={node.shape}>{node.label}</span>{node.answer && <b>{node.answer}</b>}{i < flow.events.length - 1 && <i>↓</i>}</div>)}</div>;
}
function AlgorithmGallery({ side, name, opponent, outcome, flows, open, next, final }: { side: Side; name: string; opponent: string; outcome: string; flows: SavedFlow[]; open: (flow: SavedFlow) => void; next: () => void; final: boolean }) {
  const [selected, setSelected] = useState<number[]>([]);
  const complete = () => { flows.filter(f => selected.includes(f.timestamp)).forEach(f => downloadFlow(f, name, opponent, outcome)); next(); };
  return <aside className={`algorithm-gallery gallery-side-${side}`}><small>{side === 0 ? "TOP PLAYER" : "BOTTOM PLAYER"}</small><h3>{name}의 저장한 알고리즘</h3><p>썸네일을 누르면 확대됩니다. 저장할 항목의 원형 체크 버튼을 선택해 주세요.</p><div>{flows.length ? flows.map((flow) => <article className="algorithm-thumb" key={flow.timestamp}><button className="thumb-preview" onClick={() => open(flow)}><strong>TURN {flow.turn}</strong><span>{flowNodes(flow.events).slice(0,5).map((node,i)=><i className={node.shape} key={i}>{node.label}</i>)}</span><small>눌러서 크게 보기</small></button><button className={`flow-check ${selected.includes(flow.timestamp) ? "checked" : ""}`} onClick={() => setSelected(x => x.includes(flow.timestamp) ? x.filter(n=>n!==flow.timestamp) : [...x,flow.timestamp])} aria-label={`턴 ${flow.turn} 저장 선택`}>{selected.includes(flow.timestamp) ? "✓" : ""}</button></article>) : <div className="no-flows">저장한 알고리즘이 없습니다.</div>}</div><button className="gallery-next" onClick={complete}>{selected.length ? `선택한 ${selected.length}개 저장 완료` : final ? "건너뛰고 다음 경기 준비" : "건너뛰기 →"}</button></aside>;
}
function downloadFlow(flow: SavedFlow, name: string, opponent: string, outcome: string) {
  const nodes = flowNodes(flow.events), canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = Math.max(700, nodes.length * 105 + 170);
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  ctx.fillStyle = "#07131d"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.textAlign = "center"; ctx.fillStyle = "#ffbf4c"; ctx.font = "700 26px sans-serif"; ctx.fillText(`${name} · TURN ${flow.turn} 알고리즘`, 450, 55);
  nodes.forEach((node, i) => { const y = 100 + i * 105; ctx.fillStyle = node.shape === "decision" ? "#3c321f" : "#102d3b"; ctx.strokeStyle = node.shape === "decision" ? "#ffbf4c" : "#00d7ff"; ctx.lineWidth = 3; ctx.fillRect(225,y,450,62); ctx.strokeRect(225,y,450,62); ctx.fillStyle = "white"; ctx.font = "600 20px sans-serif"; ctx.fillText(node.label,450,y+39); if (node.answer) { ctx.fillStyle="#ffbf4c"; ctx.fillText(node.answer,710,y+39); } if (i<nodes.length-1) { ctx.fillStyle="#77a1b0"; ctx.fillText("↓",450,y+91); } });
  const link = document.createElement("a"); link.download = `${name}(${opponent}, ${flow.turn}턴, ${outcome}).png`; link.href = canvas.toDataURL("image/png"); link.click();
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
          className={`captured-piece p${side}`}
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
  const titles = ["십이장기란?", "게임 말 알아보기", "포획과 포로", "내 행동이 알고리즘", "실제 수업에서 활용", "영상으로 더 쉽게 배우기"];
  const pieceCopy = [
    ["king", "王(왕)", "상하좌우와 대각선, 모든 방향으로 한 칸 이동합니다. 상대 진영에서 다음 자신의 턴까지 살아남아도 승리합니다."],
    ["general", "將(장)", "상하좌우 직선 방향으로 한 칸 이동합니다. 공격과 수비를 모두 맡는 핵심 말입니다."],
    ["elephant", "相(상)", "대각선 네 방향으로 한 칸 이동합니다. 빈틈을 비스듬히 파고드는 말입니다."],
    ["chick", "子(자)", "앞으로 한 칸만 이동합니다. 상대 진영 끝에 도착하면 즉시 侯(후)로 승급합니다."],
    ["hen", "侯(후)", "뒤쪽 대각선을 제외한 여섯 방향으로 한 칸 이동합니다. 포획되면 다시 子(자)가 됩니다."],
  ] as const;
  return (
    <div className="manual">
      <button className="manual-close" onClick={close}>
        ×
      </button>
      <div className="manual-copy">
        <small>HOW TO PLAY · 0{slide + 1}/06</small>
        <h2>{titles[slide]}</h2>
        {slide === 0 && <><p>상대 王(왕)을 잡거나, 자신의 王(왕)이 상대 진영에서 한 턴을 생존하면 승리합니다. 3×4 장기판에서 말의 방향, 포획과 재배치를 활용해 상대보다 먼저 승리 조건을 만드세요.</p><div className="manual-flow"><span>START</span><i>→</i><span>상황 확인</span><i>→</i><span className="diamond">승리 전략?</span><i>→</i><span>TURN END</span></div></>}
        {slide === 1 && <><div className="piece-guide-grid">{pieceCopy.map(([kind, label, copy]) => <article key={kind}><div className="guide-piece"><span className="piece p1">{pieceInfo[kind].symbol}{pieceInfo[kind].dirs.map(([r,c], i) => <i key={i} className={`dir d${r}${c}`} />)}</span></div><div><h3>{label}</h3><p>{copy}</p></div></article>)}</div><p className="editable-note">※ 말의 이름은 교사가 수정할 수 있습니다.</p></>}
        {slide === 2 && <div className="manual-detail"><p>상대 말을 잡으면 그 말은 나의 포로가 됩니다. 포로는 잡은 직후가 아니라 <b>다음 자신의 턴부터</b> 빈칸에 배치할 수 있으며, 포로 배치도 한 턴으로 계산됩니다.</p><p>侯(후)를 포획하면 강한 상태가 유지되지 않고 <b>子(자)로 돌아와 포로로 사용</b>합니다. 포로를 어디에 배치할지까지 생각하면 새로운 공격과 방어 경로를 만들 수 있습니다.</p></div>}
        {slide === 3 && <><p>게임에서 말을 선택하고, 이동 가능 여부를 판단하고, 이동·포획·승급하는 모든 과정이 차례대로 기록됩니다. 한 턴이 끝나면 내가 실행한 문제 해결 절차가 실제 <b>순서도(알고리즘)</b>로 완성됩니다.</p><div className="manual-flow"><span>게임 상황 확인</span><i>→</i><span>子 선택</span><i>→</i><span className="diamond">이동 가능?</span><i>→</i><span>이동 실행</span></div></>}
        {slide === 4 && <div className="class-steps"><p><b>1.</b> 교사 운영 페이지에서 ‘새 수업 만들기’를 누르고 4자리 코드를 기억합니다. 화면이 종료되어도 같은 코드로 복구할 수 있습니다.</p><p><b>2.</b> 플레이어를 등록하고 QR 또는 코드로 태블릿을 연결합니다. 두 명이 한 대를 사용하므로 학급 학생 수의 절반만큼 태블릿이 필요합니다.</p><p><b>3.</b> 교사가 태블릿 일련번호를 직접 지정하고 연결 상태와 선수 이름을 확인합니다.</p><p><b>4.</b> 타이머를 지정해 게임을 시작합니다. 종료 후 결과는 자동 집계되며 결과 공개 화면에서 순위를 확인합니다.</p><p><b>주의.</b> 타이머 종료 시점에 진행 중인 게임은 승점에 반영되지 않습니다.</p></div>}
        {slide === 5 && <div className="youtube-guide"><span>▶</span><p>유튜브에서 <b>“지니어스 게임 십이장기 규칙”</b>으로 검색해 영상을 함께 시청하면 말의 이동과 승리 조건을 더 쉽게 이해할 수 있습니다.</p></div>}
        <div className="manual-nav">
          <button disabled={!slide} onClick={() => setSlide(slide - 1)}>
            ← 이전
          </button>
          <div>
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={i === slide ? "on" : ""} />
              ))}
          </div>
          <button onClick={() => slide === 5 ? close() : setSlide(slide + 1)}>
            {slide === 5 ? "완료" : "다음 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
