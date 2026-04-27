export const COLS = 7;
export const ROWS = 6;

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function createGame() {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let turn = 'red';
  let winner = null;
  let isDraw = false;
  let lastDrop = null; // { row, col } of last placement

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function checkWin(row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;
      for (let i = 1; i < 4; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (inBounds(r, c) && grid[r][c] === color) count++;
        else break;
      }
      for (let i = 1; i < 4; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (inBounds(r, c) && grid[r][c] === color) count++;
        else break;
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function isFull() {
    for (let c = 0; c < COLS; c++) if (grid[0][c] === null) return false;
    return true;
  }

  function columnAvailable(col) {
    return col >= 0 && col < COLS && grid[0][col] === null;
  }

  function dropPiece(col) {
    if (winner || isDraw) return false;
    if (!columnAvailable(col)) return false;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][col] === null) { row = r; break; }
    }
    if (row === -1) return false;
    grid[row][col] = turn;
    lastDrop = { row, col };
    if (checkWin(row, col, turn)) {
      winner = turn;
    } else if (isFull()) {
      isDraw = true;
    } else {
      turn = turn === 'red' ? 'black' : 'red';
    }
    return true;
  }

  return {
    dropPiece,
    columnAvailable,
    state: () => ({ grid, turn, winner, isDraw, lastDrop })
  };
}
