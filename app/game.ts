export type Side = 0 | 1;
export type Kind = "king" | "general" | "elephant" | "chick" | "hen";
export type Piece = {
  id: string;
  kind: Kind;
  owner: Side;
  capturedOnTurn?: number;
};
export type Board = Array<Piece | null>;
export type Event = {
  type: string;
  label?: string;
  answer?: "YES" | "NO";
  tag?: string;
};
export type SavedFlow = {
  turn: number;
  playerId: string;
  events: Event[];
  boardBefore: Board;
  boardAfter: Board;
  timestamp: number;
  tags: string[];
};
export type GameState = {
  matchId: string;
  board: Board;
  turn: Side;
  turnNumber: number;
  captured: [Piece[], Piece[]];
  kingPending: [boolean, boolean];
  saved: SavedFlow[];
  lastEvents: [Event[], Event[]];
  winner: Side | null;
  reason: string | null;
  startedAt: number;
};
export const pieceInfo: Record<
  Kind,
  { name: string; symbol: string; dirs: number[][] }
> = {
  king: {
    name: "왕",
    symbol: "王",
    dirs: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ],
  },
  general: {
    name: "장",
    symbol: "將",
    dirs: [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ],
  },
  elephant: {
    name: "상",
    symbol: "相",
    dirs: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
  },
  chick: { name: "자", symbol: "子", dirs: [[-1, 0]] },
  hen: {
    name: "후",
    symbol: "侯",
    dirs: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, 0],
    ],
  },
};
const P = (id: string, kind: Kind, owner: Side): Piece => ({ id, kind, owner });
export const initialBoard = (): Board => [
  P("a-e", "elephant", 0),
  P("a-k", "king", 0),
  P("a-g", "general", 0),
  null,
  P("a-c", "chick", 0),
  null,
  null,
  P("b-c", "chick", 1),
  null,
  P("b-g", "general", 1),
  P("b-k", "king", 1),
  P("b-e", "elephant", 1),
];
export function newGame(matchId = crypto.randomUUID()): GameState {
  return {
    matchId,
    board: initialBoard(),
    turn: Math.random() < 0.5 ? 0 : 1,
    turnNumber: 1,
    captured: [[], []],
    kingPending: [false, false],
    saved: [],
    lastEvents: [[], []],
    winner: null,
    reason: null,
    startedAt: Date.now(),
  };
}
export function legalMoves(s: GameState, index: number) {
  const p = s.board[index];
  if (!p || p.owner !== s.turn) return [];
  const r = Math.floor(index / 3),
    c = index % 3;
  return pieceInfo[p.kind].dirs
    .map(([dr, dc]) => {
      const rr = r + (p.owner === 0 ? -dr : dr),
        cc = c + dc;
      return rr >= 0 && rr < 4 && cc >= 0 && cc < 3 ? rr * 3 + cc : -1;
    })
    .filter((i) => i >= 0 && s.board[i]?.owner !== p.owner);
}
export function legalDrops(s: GameState, p: Piece) {
  return s.board
    .map((x, i) => ({ x, i }))
    .filter(
      ({ x, i }) =>
        !x && (p.owner === 0 ? Math.floor(i / 3) < 3 : Math.floor(i / 3) > 0),
    )
    .map((x) => x.i);
}
const start = (p: Piece): Event[] => [
  { type: "TURN_STARTED", label: "START" },
  { type: "BOARD_INSPECTED", label: "게임 상황 확인" },
  { type: "PIECE_SELECTED", label: `${pieceInfo[p.kind].symbol} 선택` },
];
function finishTurn(
  s: GameState,
  actor: Side,
  events: Event[],
  boardBefore: Board,
) {
  const next: Side = actor === 0 ? 1 : 0;
  events.push(
    {
      type: "WIN_CONDITION_CHECKED",
      label: "승리 조건을 만족했는가?",
      answer: s.winner !== null ? "YES" : "NO",
    },
    { type: "TURN_ENDED", label: "TURN END" },
  );
  s.lastEvents[actor] = events;
  s.turnNumber++;
  s.turn = next;
  if (s.winner === null && s.kingPending[next]) {
    s.winner = next;
    s.reason = "KING_SURVIVED";
    events.splice(events.length - 2, 1, {
      type: "WIN_CONDITION_CHECKED",
      label: "王이 상대 진영에서 생존했는가?",
      answer: "YES",
      tag: "WINNING_TURN",
    });
  }
  const king = s.board.find((x) => x?.owner === actor && x.kind === "king");
  if (king) {
    const idx = s.board.indexOf(king),
      enemy =
        actor === 0 ? Math.floor(idx / 3) === 3 : Math.floor(idx / 3) === 0;
    if (enemy && !s.kingPending[actor]) {
      s.kingPending[actor] = true;
      events.splice(events.length - 1, 0, {
        type: "KING_ENTERED_ENEMY_ZONE",
        label: "王이 상대 진영에 진입",
        tag: "KING_ENTERED_ENEMY_ZONE",
      });
    }
  }
  return {
    ...s,
    board: [...s.board],
    captured: [[...s.captured[0]], [...s.captured[1]]],
    lastEvents: [[...s.lastEvents[0]], [...s.lastEvents[1]]],
    kingPending: [...s.kingPending] as [boolean, boolean],
    _before: boardBefore,
  } as GameState;
}
export function movePiece(state: GameState, from: number, to: number) {
  const s = structuredClone(state) as GameState,
    p = s.board[from]!;
  if (!legalMoves(s, from).includes(to)) return state;
  const before = structuredClone(s.board),
    target = s.board[to],
    events = start(p);
  events.push(
    { type: "DESTINATION_SELECTED", label: direction(from, to, p.owner) },
    { type: "MOVE_EXECUTED", label: "이동 실행" },
    {
      type: "CONDITION_CHECKED",
      label: "상대 말이 있는가?",
      answer: target ? "YES" : "NO",
    },
  );
  s.board[from] = null;
  if (target) {
    const prisoner: { kind: Kind } = {
      kind: target.kind === "hen" ? "chick" : target.kind,
    };
    s.captured[p.owner].push({
      ...target,
      kind: prisoner.kind,
      owner: p.owner,
      capturedOnTurn: s.turnNumber,
    });
    events.push({
      type: "PIECE_CAPTURED",
      label: `상대 ${pieceInfo[target.kind].symbol} 포획`,
      tag: "CAPTURE",
    });
    if (target.kind === "king") {
      s.winner = p.owner;
      s.reason = "KING_CAPTURED";
      events.push({
        type: "MATCH_ENDED",
        label: "상대 王 포획 · 승리",
        tag: "KING_CAPTURED",
      });
    }
  }
  const row = Math.floor(to / 3),
    promotion =
      p.kind === "chick" &&
      ((p.owner === 0 && row === 3) || (p.owner === 1 && row === 0));
  s.board[to] = { ...p, kind: promotion ? "hen" : p.kind };
  events.push({
    type: "CONDITION_CHECKED",
    label: "상대 진영인가?",
    answer: promotion ? "YES" : "NO",
  });
  if (promotion)
    events.push({
      type: "PIECE_PROMOTED",
      label: "子 → 侯 승급",
      tag: "PROMOTION",
    });
  return finishTurn(s, p.owner, events, before);
}
export function dropPiece(state: GameState, capturedIndex: number, to: number) {
  const s = structuredClone(state) as GameState,
    p = s.captured[s.turn][capturedIndex];
  if (!p || p.capturedOnTurn === s.turnNumber || !legalDrops(s, p).includes(to))
    return state;
  const before = structuredClone(s.board),
    events = start(p);
  events.push(
    { type: "DESTINATION_SELECTED", label: `빈칸 ${to + 1} 선택` },
    { type: "PIECE_DROPPED", label: `포로 ${pieceInfo[p.kind].symbol} 배치` },
  );
  s.board[to] = { ...p, id: `drop-${crypto.randomUUID()}` };
  s.captured[s.turn].splice(capturedIndex, 1);
  return finishTurn(s, p.owner, events, before);
}
export function flowNodes(events: Event[]) {
  return events.map((e) => ({
    label: e.label || e.type,
    shape:
      e.type === "TURN_STARTED" || e.type === "TURN_ENDED"
        ? "terminal"
        : e.type.includes("CONDITION") || e.type.includes("WIN_CONDITION")
          ? "decision"
          : "process",
    answer: e.answer,
  }));
}
export function direction(a: number, b: number, o: Side) {
  const dr = Math.floor(b / 3) - Math.floor(a / 3),
    dc = (b % 3) - (a % 3),
    f = o === 1 ? -dr : dr;
  return `${f > 0 ? "앞" : f < 0 ? "뒤" : ""}${dc > 0 ? " 오른쪽" : dc < 0 ? " 왼쪽" : ""} 1칸`.trim();
}
