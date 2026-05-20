// Grid & Dimension constants
const GRID_SIZE = 20;
const CANVAS_SIZE = 560;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE; // 28px

// Game State variables
let snake = [];
let food = { x: 0, y: 0 };
let direction = 'RIGHT';
let nextDirection = 'RIGHT';
let score = 0;
let highScore = parseInt(localStorage.getItem('snake_high_score')) || 0;
let isGameOver = false;
let isPaused = false;
let isAutopilot = false;
let gameStarted = false; // New state to prevent instant death on load
let speedLevel = 3; // 1 to 5
let lastTickTime = 0;
let particles = [];
let stepCount = 0;
let lastFpsTime = 0;
let decisionCount = 0;
let decisionsPerSecVal = 0;

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Polyfill for CanvasRenderingContext2D.prototype.roundRect for older browser engines
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (r === undefined) r = 0;
    let radii;
    if (typeof r === 'number') {
      radii = { tl: r, tr: r, br: r, bl: r };
    } else if (Array.isArray(r)) {
      if (r.length === 1) radii = { tl: r[0], tr: r[0], br: r[0], bl: r[0] };
      else if (r.length === 2) radii = { tl: r[0], tr: r[1], br: r[0], bl: r[1] };
      else if (r.length === 3) radii = { tl: r[0], tr: r[1], br: r[2], bl: r[1] };
      else radii = { tl: r[0], tr: r[1], br: r[2], bl: r[3] };
    } else {
      radii = Object.assign({ tl: 0, tr: 0, br: 0, bl: 0 }, r);
    }
    this.beginPath();
    this.moveTo(x + radii.tl, y);
    this.lineTo(x + w - radii.tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
    this.lineTo(x + w, y + h - radii.br);
    this.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
    this.lineTo(x + radii.bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
    this.lineTo(x, y + radii.tl);
    this.quadraticCurveTo(x, y, x + radii.tl, y);
    this.closePath();
    return this;
  };
}

// UI Elements
const scoreVal = document.getElementById('scoreVal');
const highScoreVal = document.getElementById('highScoreVal');
const fillRateVal = document.getElementById('fillRateVal');
const fillRateProgress = document.getElementById('fillRateProgress');
const autopilotToggle = document.getElementById('autopilotToggle');
const aiSettings = document.getElementById('aiSettings');
const algorithmSelect = document.getElementById('algorithmSelect');
const algoDesc = document.getElementById('algoDesc');
const speedRange = document.getElementById('speedRange');
const speedLabel = document.getElementById('speedLabel');
const pausePlayBtn = document.getElementById('pausePlayBtn');
const manualControlsHelpBtn = document.getElementById('manualControlsHelpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const canvasOverlay = document.getElementById('canvasOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');
const restartBtn = document.getElementById('restartBtn');

// AI Telemetry UI
const aiStatus = document.getElementById('aiStatus');
const pathLength = document.getElementById('pathLength');
const decisionsPerSec = document.getElementById('decisionsPerSec');

// Particle Class
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.radius = Math.random() * 3 + 1;
    this.alpha = 1;
    this.color = color;
    this.decay = Math.random() * 0.03 + 0.02;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fill();
    ctx.restore();
  }
}

// Direction offsets
const DIR_OFFSETS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

// Initialize Game
function init() {
  // Set high score label
  highScoreVal.textContent = String(highScore).padStart(3, '0');
  
  // Event Listeners
  window.addEventListener('keydown', handleKeyDown);
  autopilotToggle.addEventListener('change', handleAutopilotChange);
  algorithmSelect.addEventListener('change', handleAlgorithmChange);
  speedRange.addEventListener('input', handleSpeedChange);
  pausePlayBtn.addEventListener('click', togglePause);
  manualControlsHelpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
  closeHelpBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
  restartBtn.addEventListener('click', resetGame);

  // Touch controls for mobile devices
  let touchStartX = 0;
  let touchStartY = 0;
  canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (isPaused || isAutopilot || isGameOver) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const threshold = 30; // minimum swipe distance

    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > threshold) {
        if (dx > 0 && direction !== 'LEFT') { nextDirection = 'RIGHT'; gameStarted = true; }
        else if (dx < 0 && direction !== 'RIGHT') { nextDirection = 'LEFT'; gameStarted = true; }
      }
    } else {
      if (Math.abs(dy) > threshold) {
        if (dy > 0 && direction !== 'UP') { nextDirection = 'DOWN'; gameStarted = true; }
        else if (dy < 0 && direction !== 'DOWN') { nextDirection = 'UP'; gameStarted = true; }
      }
    }
  }, { passive: true });

  // Initialize game state
  resetGame();

  // Start loop
  requestAnimationFrame(gameLoop);
}

// Reset Game State
function resetGame() {
  // Initial Snake in middle of board facing right
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];
  direction = 'RIGHT';
  nextDirection = 'RIGHT';
  score = 0;
  isGameOver = false;
  gameStarted = false; // Reset game started state
  canvasOverlay.classList.add('hidden');
  updateUI();
  placeFood();
  particles = [];
  stepCount = 0;

  // If autopilot, re-initialize Hamiltonian path if necessary
  if (isAutopilot && algorithmSelect.value === 'hamiltonian') {
    if (window.SnakeAI && window.SnakeAI.resetHamiltonian) {
      window.SnakeAI.resetHamiltonian(GRID_SIZE, GRID_SIZE, snake);
    }
  }
}

// Place food on an empty grid cell
function placeFood() {
  const maxScore = GRID_SIZE * GRID_SIZE;
  if (snake.length >= maxScore) {
    // Perfect win! Snake fills the grid.
    triggerGameWin();
    return;
  }

  let emptyCells = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (!isCellOccupied(x, y)) {
        emptyCells.push({ x, y });
      }
    }
  }

  if (emptyCells.length > 0) {
    const randIdx = Math.floor(Math.random() * emptyCells.length);
    food = emptyCells[randIdx];
  }
}

// Check if coordinate is part of snake body
function isCellOccupied(x, y) {
  return snake.some(segment => segment.x === x && segment.y === y);
}

// Keyboard input handler
function handleKeyDown(e) {
  if (isGameOver) {
    if (e.code === 'Space') resetGame();
    return;
  }

  // Universal keys
  if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyA') {
    autopilotToggle.checked = !autopilotToggle.checked;
    autopilotToggle.dispatchEvent(new Event('change'));
    e.preventDefault();
    return;
  }

  if (isPaused || isAutopilot) return;

  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
      if (direction !== 'DOWN') {
        nextDirection = 'UP';
        gameStarted = true;
      }
      break;
    case 'ArrowDown':
    case 'KeyS':
      if (direction !== 'UP') {
        nextDirection = 'DOWN';
        gameStarted = true;
      }
      break;
    case 'ArrowLeft':
    case 'KeyA':
      if (direction !== 'RIGHT') {
        nextDirection = 'LEFT';
        gameStarted = true;
      }
      break;
    case 'ArrowRight':
    case 'KeyD':
      if (direction !== 'LEFT') {
        nextDirection = 'RIGHT';
        gameStarted = true;
      }
      break;
  }
}

// UI Event Handlers
function handleAutopilotChange() {
  isAutopilot = autopilotToggle.checked;
  if (isAutopilot) {
    gameStarted = true; // Start game on autopilot toggle
    aiSettings.classList.remove('hidden');
    // If starting autopilot, build Hamiltonian Cycle if needed
    if (algorithmSelect.value === 'hamiltonian' && window.SnakeAI && window.SnakeAI.resetHamiltonian) {
      window.SnakeAI.resetHamiltonian(GRID_SIZE, GRID_SIZE, snake);
    }
  } else {
    aiSettings.classList.add('hidden');
    aiStatus.textContent = 'Idle';
    pathLength.textContent = '-';
  }
}

function handleAlgorithmChange() {
  const algo = algorithmSelect.value;
  if (algo === 'smart') {
    algoDesc.textContent = 'A* pathfinding with lookahead simulation to avoid getting trapped.';
  } else {
    algoDesc.textContent = 'Guaranteed 100% win rate by generating a grid-spanning loop. Slower but perfect.';
    if (window.SnakeAI && window.SnakeAI.resetHamiltonian) {
      window.SnakeAI.resetHamiltonian(GRID_SIZE, GRID_SIZE, snake);
    }
  }
}

function handleSpeedChange() {
  speedLevel = parseInt(speedRange.value);
  const labels = ['Very Slow (4 FPS)', 'Slow (8 FPS)', 'Normal (15 FPS)', 'Fast (30 FPS)', 'Super Solver (Hyper)'];
  speedLabel.textContent = labels[speedLevel - 1];
}

function togglePause() {
  isPaused = !isPaused;
  pausePlayBtn.textContent = isPaused ? 'RESUME' : 'PAUSE';
}

// Frame ticks control (Autopilot vs Manual Speed)
function getTickInterval() {
  // Speed level to ms interval mapping
  switch (speedLevel) {
    case 1: return 250; // 4 FPS
    case 2: return 125; // 8 FPS
    case 3: return 66;  // 15 FPS
    case 4: return 33;  // 30 FPS
    case 5: return 5;   // Hyper Speed (very fast tick rate)
  }
}

// Game Loop
function gameLoop(timestamp) {
  if (!lastTickTime) {
    lastTickTime = timestamp;
    lastFpsTime = timestamp;
  }

  // Speed level 5 runs multiple updates per frame to look instantaneous
  const interval = getTickInterval();
  const elapsed = timestamp - lastTickTime;

  if (!isPaused && !isGameOver) {
    if (speedLevel === 5) {
      // Run up to 6 updates per frame to clear the grid in a flash
      let stepsThisFrame = 0;
      while (timestamp - lastTickTime >= interval && stepsThisFrame < 6) {
        update();
        lastTickTime += interval;
        stepsThisFrame++;
      }
    } else if (elapsed >= interval) {
      update();
      lastTickTime = timestamp - (elapsed % interval);
    }
  }

  // Calculate Decisions/Telemetry rate
  if (timestamp - lastFpsTime >= 1000) {
    decisionsPerSecVal = decisionCount;
    decisionCount = 0;
    lastFpsTime = timestamp;
  }

  // Physics update for particles (runs every frame for smooth fading)
  particles.forEach((p, idx) => {
    p.update();
    if (p.alpha <= 0) particles.splice(idx, 1);
  });

  draw();
  requestAnimationFrame(gameLoop);
}

// Physics Update
function update() {
  if (!gameStarted) return; // Do not update physics if game has not started

  if (isAutopilot) {
    runAI();
  } else {
    direction = nextDirection;
  }

  // Calculate new Head position
  const offset = DIR_OFFSETS[direction];
  const newHead = {
    x: snake[0].x + offset.x,
    y: snake[0].y + offset.y
  };

  // Collision checks
  if (
    newHead.x < 0 || newHead.x >= GRID_SIZE ||
    newHead.y < 0 || newHead.y >= GRID_SIZE ||
    isBodyCollision(newHead)
  ) {
    triggerGameOver();
    return;
  }

  // Add new head
  snake.unshift(newHead);

  // Check food eating
  if (newHead.x === food.x && newHead.y === food.y) {
    score++;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('snake_high_score', highScore);
    }
    // Explode neon particles at food position
    spawnParticles(
      food.x * CELL_SIZE + CELL_SIZE / 2,
      food.y * CELL_SIZE + CELL_SIZE / 2,
      '#ff0055' // Neon Magenta
    );
    placeFood();
    updateUI();
  } else {
    // Pop tail
    snake.pop();
  }

  stepCount++;
}

// Check collision with snake body (excluding tail end which moves out of way)
function isBodyCollision(pos) {
  // When moving, the tail segment will leave the grid, so collision with it is safe
  // unless we just ate food and the body size increases (handled implicitly)
  for (let i = 0; i < snake.length - 1; i++) {
    if (snake[i].x === pos.x && snake[i].y === pos.y) return true;
  }
  return false;
}

// Request directions from the AI module
function runAI() {
  if (!window.SnakeAI) {
    aiStatus.textContent = 'Awaiting script...';
    return;
  }

  decisionCount++;
  const result = window.SnakeAI.solve(
    GRID_SIZE,
    GRID_SIZE,
    snake,
    food,
    algorithmSelect.value
  );

  if (result && result.direction) {
    direction = result.direction;
    aiStatus.textContent = result.status || 'Active';
    pathLength.textContent = result.pathLength !== undefined ? result.pathLength : '-';
  } else {
    aiStatus.textContent = 'No Move Found';
    pathLength.textContent = '0';
  }

  decisionsPerSec.textContent = isPaused ? '0' : String(decisionsPerSecVal);
}

// Particle System Spawner
function spawnParticles(x, y, color) {
  for (let i = 0; i < 15; i++) {
    particles.push(new Particle(x, y, color));
  }
}

// Render Logic
function draw() {
  // Clear Canvas
  ctx.fillStyle = '#030407';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    const pos = i * CELL_SIZE;
    // vertical
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, CANVAS_SIZE);
    ctx.stroke();
    // horizontal
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(CANVAS_SIZE, pos);
    ctx.stroke();
  }

  // Draw AI Path overlay if Autopilot is active
  if (isAutopilot && window.SnakeAI && window.SnakeAI.currentPath) {
    drawAIPath(window.SnakeAI.currentPath);
  }

  // Draw Food (High-Visibility Glowing Core & Ring)
  ctx.save();
  const radius = CELL_SIZE / 2.2; // Slightly larger for better visibility
  const foodX = food.x * CELL_SIZE + CELL_SIZE / 2;
  const foodY = food.y * CELL_SIZE + CELL_SIZE / 2;

  // Outer glow ring
  ctx.strokeStyle = '#ff0055';
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 15;
  ctx.shadowColor = '#ff0055';
  ctx.beginPath();
  ctx.arc(foodX, foodY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // White glowing center core
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.arc(foodX, foodY, radius / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Draw Snake
  snake.forEach((segment, idx) => {
    ctx.save();
    
    // Head color is Cyan, Body scales down to Blue/Purple
    const fraction = idx / snake.length;
    let r, g, b;
    if (idx === 0) {
      ctx.fillStyle = '#00f0ff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00f0ff';
    } else {
      // Color interpolation from Neon Cyan (0, 240, 255) to Neon Purple (189, 0, 255)
      r = Math.floor(189 * fraction);
      g = Math.floor(240 * (1 - fraction));
      b = 255;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    }

    const padding = idx === 0 ? 1 : 2 + (fraction * 4); // taper size towards tail
    const size = CELL_SIZE - padding * 2;
    const x = segment.x * CELL_SIZE + padding;
    const y = segment.y * CELL_SIZE + padding;

    // Rounded rectangle draw function
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, idx === 0 ? 6 : 4);
    ctx.fill();

    // Head specific features: Techy white eyes
    if (idx === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      const eyeSize = 3;
      let leftEye = { x: 0, y: 0 };
      let rightEye = { x: 0, y: 0 };

      // position eyes based on current direction
      if (direction === 'RIGHT') {
        leftEye = { x: x + size - 8, y: y + 5 };
        rightEye = { x: x + size - 8, y: y + size - 8 };
      } else if (direction === 'LEFT') {
        leftEye = { x: x + 5, y: y + 5 };
        rightEye = { x: x + 5, y: y + size - 8 };
      } else if (direction === 'UP') {
        leftEye = { x: x + 5, y: y + 5 };
        rightEye = { x: x + size - 8, y: y + 5 };
      } else if (direction === 'DOWN') {
        leftEye = { x: x + 5, y: y + size - 8 };
        rightEye = { x: x + size - 8, y: y + size - 8 };
      }

      ctx.beginPath();
      ctx.arc(leftEye.x, leftEye.y, eyeSize, 0, Math.PI * 2);
      ctx.arc(rightEye.x, rightEye.y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  });

  // Draw food eaten particles
  particles.forEach(p => p.draw());

  // Draw Start Hint if game not started
  if (!gameStarted) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.font = '600 13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.fillText('PRESS W/A/S/D OR ACTIVATE AUTOPILOT TO START', CANVAS_SIZE / 2, CANVAS_SIZE - 25);
    ctx.restore();
  }
}

// Draw the path planned by AI solver
function drawAIPath(path) {
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.shadowBlur = 4;
  ctx.shadowColor = '#00f0ff';
  ctx.beginPath();

  // Start from snake head center
  const startX = path[0].x * CELL_SIZE + CELL_SIZE / 2;
  const startY = path[0].y * CELL_SIZE + CELL_SIZE / 2;
  ctx.moveTo(startX, startY);

  for (let i = 1; i < path.length; i++) {
    const nextX = path[i].x * CELL_SIZE + CELL_SIZE / 2;
    const nextY = path[i].y * CELL_SIZE + CELL_SIZE / 2;
    ctx.lineTo(nextX, nextY);
  }
  ctx.stroke();
  ctx.restore();
}

// UI State Updater
function updateUI() {
  scoreVal.textContent = String(score).padStart(3, '0');
  highScoreVal.textContent = String(highScore).padStart(3, '0');

  // Fill Rate Percentage
  const maxScore = GRID_SIZE * GRID_SIZE;
  const rate = (snake.length / maxScore) * 100;
  fillRateVal.textContent = rate.toFixed(1) + '%';
  fillRateProgress.style.width = rate + '%';
}

// Handle Game Over
function triggerGameOver() {
  isGameOver = true;
  overlayTitle.textContent = 'GAME OVER';
  overlayTitle.style.color = 'var(--neon-magenta)';
  overlayTitle.style.textShadow = '0 0 10px rgba(255, 0, 85, 0.6)';
  overlayMessage.textContent = `Score: ${score} | Press Restart or Space`;
  canvasOverlay.classList.remove('hidden');
}

// Handle Perfect Win
function triggerGameWin() {
  isGameOver = true;
  overlayTitle.textContent = 'PERFECT SOLVE!';
  overlayTitle.style.color = 'var(--neon-green)';
  overlayTitle.style.textShadow = '0 0 10px rgba(57, 255, 20, 0.6)';
  overlayMessage.textContent = 'Snake filled 100% of the grid!';
  canvasOverlay.classList.remove('hidden');
}

// Boot up game
window.addEventListener('DOMContentLoaded', init);
