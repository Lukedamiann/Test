const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

const GRID_SIZE = 20;
const CELL = canvas.width / GRID_SIZE;
const STEP_MS = 110;

const BEST_KEY = "snake-best-score";

let snake, direction, nextDirection, food, score, best, running, paused, loopId;

function resetState() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  score = 0;
  running = false;
  paused = false;
  placeFood();
  updateScore();
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

function placeFood() {
  let candidate;
  do {
    candidate = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    };
  } while (snake.some((seg) => seg.x === candidate.x && seg.y === candidate.y));
  food = candidate;
}

function updateScore() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function drawFood() {
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  ctx.fillStyle = "#facc15";
  ctx.font = `bold ${CELL * 0.85}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", cx, cy + 1);
}

function drawHat(x, y) {
  const cx = x * CELL + CELL / 2;
  const topY = y * CELL;

  ctx.fillStyle = "#111827";
  ctx.fillRect(cx - CELL * 0.55, topY - CELL * 0.1, CELL * 1.1, CELL * 0.16);
  ctx.fillRect(cx - CELL * 0.32, topY - CELL * 0.55, CELL * 0.64, CELL * 0.48);

  ctx.fillStyle = "#facc15";
  ctx.fillRect(cx - CELL * 0.32, topY - CELL * 0.2, CELL * 0.64, CELL * 0.1);
}

function draw() {
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawFood();

  snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#4ade80" : "#22c55e";
    ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
  });

  drawHat(snake[0].x, snake[0].y);
}

function tick() {
  if (paused) return;

  direction = nextDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  const hitWall = head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE;
  const hitSelf = snake.some((seg) => seg.x === head.x && seg.y === head.y);

  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 1;
    updateScore();
    placeFood();
  } else {
    snake.pop();
  }

  draw();
}

function gameOver() {
  running = false;
  clearInterval(loopId);
  if (score > best) {
    best = score;
    saveBest(best);
    updateScore();
  }
  showOverlay(`Game over — score ${score}. Press any arrow key to restart`);
}

function startGame() {
  resetState();
  best = loadBest();
  updateScore();
  running = true;
  hideOverlay();
  draw();
  clearInterval(loopId);
  loopId = setInterval(tick, STEP_MS);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  showPauseState();
}

function showPauseState() {
  if (paused) {
    showOverlay("Paused — press space to resume");
  } else {
    hideOverlay();
  }
}

const KEY_DIRECTIONS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    e.preventDefault();
    togglePause();
    return;
  }

  const dir = KEY_DIRECTIONS[e.key];
  if (!dir) return;
  e.preventDefault();

  if (!running) {
    startGame();
    return;
  }
  if (paused) return;

  const isReverse = dir.x === -direction.x && dir.y === -direction.y;
  if (!isReverse) {
    nextDirection = dir;
  }
});

best = loadBest();
resetState();
updateScore();
draw();
showOverlay("Press any arrow key to start");
