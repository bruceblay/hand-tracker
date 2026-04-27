export const BOARD_W = 10;
export const BOARD_H = 20;

export const PIECES = [
  { color: '#4dd0e1', rotations: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]]
  ]},
  { color: '#fdd835', rotations: [
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]]
  ]},
  { color: '#ab47bc', rotations: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]]
  ]},
  { color: '#66bb6a', rotations: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]]
  ]},
  { color: '#ef5350', rotations: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]]
  ]},
  { color: '#ffa726', rotations: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]]
  ]},
  { color: '#42a5f5', rotations: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]]
  ]}
];

const DROP_INTERVAL = 700;
const SCORE_PER_LINES = [0, 100, 300, 500, 800];

function randomPiece() {
  return { type: Math.floor(Math.random() * 7), rot: 0, x: 3, y: 0 };
}

export function createGame() {
  const grid = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));
  let current = null;
  let next = randomPiece();
  let score = 0;
  let gameOver = false;
  let dropTimer = 0;

  function pieceCells(piece) {
    return PIECES[piece.type].rotations[piece.rot]
      .map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
  }

  function collides(piece) {
    for (const [cx, cy] of pieceCells(piece)) {
      if (cx < 0 || cx >= BOARD_W || cy >= BOARD_H) return true;
      if (cy >= 0 && grid[cy][cx]) return true;
    }
    return false;
  }

  function spawn() {
    current = next;
    next = randomPiece();
    if (collides(current)) gameOver = true;
  }

  function lock() {
    for (const [cx, cy] of pieceCells(current)) {
      if (cy >= 0 && cy < BOARD_H) grid[cy][cx] = PIECES[current.type].color;
    }
    clearLines();
    current = null;
  }

  function clearLines() {
    let cleared = 0;
    for (let y = BOARD_H - 1; y >= 0; y--) {
      if (grid[y].every(c => c !== null)) {
        grid.splice(y, 1);
        grid.unshift(Array(BOARD_W).fill(null));
        cleared++;
        y++;
      }
    }
    score += SCORE_PER_LINES[cleared] ?? 0;
  }

  function tryMove(dx, dy) {
    if (!current || gameOver) return false;
    const test = { ...current, x: current.x + dx, y: current.y + dy };
    if (collides(test)) return false;
    current = test;
    return true;
  }

  function tryRotate(dir) {
    if (!current || gameOver) return false;
    const newRot = (current.rot + (dir === 'cw' ? 1 : 3)) % 4;
    const test = { ...current, rot: newRot };
    if (collides(test)) return false;
    current = test;
    return true;
  }

  function moveTo(targetX) {
    if (!current || gameOver) return;
    while (current.x < targetX && tryMove(1, 0));
    while (current.x > targetX && tryMove(-1, 0));
  }

  function setPositionFraction(t) {
    if (!current || gameOver) return;
    const dxs = PIECES[current.type].rotations[current.rot].map(([dx]) => dx);
    const minDx = Math.min(...dxs);
    const maxDx = Math.max(...dxs);
    const minPieceX = -minDx;
    const maxPieceX = (BOARD_W - 1) - maxDx;
    const targetX = Math.round(t * (maxPieceX - minPieceX) + minPieceX);
    moveTo(targetX);
  }

  function hardDrop() {
    if (!current || gameOver) return;
    while (tryMove(0, 1));
    lock();
  }

  function tick(dtMs) {
    if (gameOver) return;
    if (!current) { spawn(); return; }
    dropTimer += dtMs;
    if (dropTimer >= DROP_INTERVAL) {
      dropTimer -= DROP_INTERVAL;
      if (!tryMove(0, 1)) lock();
    }
  }

  return {
    tick,
    moveTo,
    setPositionFraction,
    tryRotate,
    hardDrop,
    state: () => ({
      grid,
      current,
      next,
      score,
      gameOver,
      cells: current ? pieceCells(current) : []
    })
  };
}
