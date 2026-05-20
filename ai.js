// AI Pathfinding & Decision Module for Snake Game
window.SnakeAI = {
  currentPath: null, // Shared path list for rendering
  cyclePath: null,   // Ordered array of {x, y}
  cycleIndices: null, // 2D array mapping [x][y] to index in cyclePath

  // Generate Hamiltonian cycle covering all grid cells (only for even W & H)
  resetHamiltonian(W, H, snakeBody) {
    this.cyclePath = [];
    this.cycleIndices = Array.from({ length: W }, () => new Array(H).fill(-1));

    let x = 0;
    let y = 0;
    
    // Generate the path using the serpentine rules
    for (let i = 0; i < W * H; i++) {
      this.cyclePath.push({ x, y });
      this.cycleIndices[x][y] = i;

      // Determine next coordinate in the cycle
      const nextDir = this.getHamiltonianNext(x, y, W, H);
      if (nextDir === 'RIGHT') x++;
      else if (nextDir === 'LEFT') x--;
      else if (nextDir === 'DOWN') y++;
      else if (nextDir === 'UP') y--;
    }
  },

  // Serpentine pattern router for Hamiltonian Cycle
  getHamiltonianNext(x, y, W, H) {
    if (y === 0) {
      if (x < W - 1) return 'RIGHT';
      return 'DOWN';
    }
    if (x === 0) {
      return 'UP';
    }
    if (y % 2 === 1) { // Odd Row
      if (x > 1) return 'LEFT';
      if (y === H - 1) return 'LEFT'; // Go to col 0 at the bottom
      return 'DOWN';
    } else { // Even Row
      if (x < W - 1) return 'RIGHT';
      return 'DOWN';
    }
  },

  // Main Solver entrypoint called by game.js
  solve(W, H, snakeBody, food, algorithm) {
    if (algorithm === 'hamiltonian') {
      return this.solveHamiltonian(W, H, snakeBody, food);
    } else {
      return this.solveSmart(W, H, snakeBody, food);
    }
  },

  // AI Algorithm 1: Hamiltonian Cycle with Safe Shortcutting
  solveHamiltonian(W, H, snakeBody, food) {
    // Generate cycle if not already present
    if (!this.cyclePath) {
      this.resetHamiltonian(W, H, snakeBody);
    }

    const head = snakeBody[0];
    const tail = snakeBody[snakeBody.length - 1];
    const totalCells = W * H;

    const H_idx = this.cycleIndices[head.x][head.y];
    const T_idx = this.cycleIndices[tail.x][tail.y];
    const F_idx = this.cycleIndices[food.x][food.y];

    const neighbors = this.getNeighbors(head, W, H);
    let bestNeighbor = null;
    let minDistanceToFood = Infinity;

    // Helper to compute distance forward along the cycle loop
    const cycleDist = (from, to) => {
      return to >= from ? to - from : to - from + totalCells;
    };

    for (const neighbor of neighbors) {
      const N_idx = this.cycleIndices[neighbor.x][neighbor.y];
      
      // Safety condition: The neighbor must be in the empty section of the cycle
      // which spans forward from head index (H_idx) to tail index (T_idx).
      // This guarantees the head will never collide with any body segment.
      const distToNeighbor = cycleDist(H_idx, N_idx);
      const distToTail = cycleDist(H_idx, T_idx);

      if (distToNeighbor < distToTail) {
        // Find the neighbor that minimizes cycle distance to the food
        const distToFood = cycleDist(N_idx, F_idx);
        if (distToFood < minDistanceToFood) {
          minDistanceToFood = distToFood;
          bestNeighbor = neighbor;
        }
      }
    }

    // Default Fallback: If no shortcut was selected, just follow the strict cycle
    if (!bestNeighbor) {
      const nextIndex = (H_idx + 1) % totalCells;
      bestNeighbor = this.cyclePath[nextIndex];
    }

    // Build the projected path visualization
    const path = [head, bestNeighbor];
    // Project the rest of the cycle towards the food for rendering
    let currIdx = this.cycleIndices[bestNeighbor.x][bestNeighbor.y];
    const targetIdx = F_idx;
    let projCount = 0;
    while (currIdx !== targetIdx && projCount < 100) {
      currIdx = (currIdx + 1) % totalCells;
      path.push(this.cyclePath[currIdx]);
      projCount++;
    }
    this.currentPath = path;

    return {
      direction: this.getDirectionFromMove(head, bestNeighbor),
      status: 'Following Cycle',
      pathLength: path.length - 1
    };
  },

  // AI Algorithm 2: Smart Pathfinder (A* + Tail Lookahead Safety Check)
  solveSmart(W, H, snakeBody, food) {
    const head = snakeBody[0];
    const tail = snakeBody[snakeBody.length - 1];

    // 1. Search for shortest path to food
    const path = this.findShortestPath(head, food, snakeBody, W, H);

    if (path && path.length > 1) {
      // 2. Perform virtual simulation to ensure we don't get trapped
      const simSnake = this.simulateMoveToFood(snakeBody, path);
      const simHead = simSnake[0];
      const simTail = simSnake[simSnake.length - 1];

      // If the snake can still find a path to its tail in the simulated state, it's safe!
      if (this.hasPathBFS(simHead, simTail, simSnake, W, H)) {
        this.currentPath = path;
        return {
          direction: this.getDirectionFromMove(head, path[1]),
          status: 'Shortest Path (A*)',
          pathLength: path.length - 1
        };
      }
    }

    // 3. Fallback: Follow the tail (find longest safe route)
    const nextMove = this.followTail(snakeBody, W, H);
    if (nextMove) {
      this.currentPath = [head, nextMove];
      return {
        direction: this.getDirectionFromMove(head, nextMove),
        status: 'Following Tail',
        pathLength: 1
      };
    }

    // 4. Emergency: Choose any valid neighbor that prevents immediate death
    const neighbors = this.getNeighbors(head, W, H);
    const snakeSet = new Set(snakeBody.map(p => `${p.x},${p.y}`));
    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (!snakeSet.has(key) || (neighbor.x === tail.x && neighbor.y === tail.y)) {
        this.currentPath = [head, neighbor];
        return {
          direction: this.getDirectionFromMove(head, neighbor),
          status: 'Emergency Escape',
          pathLength: 1
        };
      }
    }

    // Absolute dead end
    this.currentPath = null;
    return null;
  },

  // Tail following logic: seek empty spaces while preserving a path to our tail
  followTail(snakeBody, W, H) {
    const head = snakeBody[0];
    const tail = snakeBody[snakeBody.length - 1];
    const neighbors = this.getNeighbors(head, W, H);
    const snakeSet = new Set(snakeBody.map(p => `${p.x},${p.y}`));

    let bestMove = null;
    let maxDist = -1;

    for (const neighbor of neighbors) {
      const key = `${neighbor.x},${neighbor.y}`;
      // Cell must be free (or be the tail segment which moves this frame)
      if (snakeSet.has(key) && !(neighbor.x === tail.x && neighbor.y === tail.y)) continue;

      // Simulate state after moving to this neighbor (no food eaten)
      const simSnake = [neighbor, ...snakeBody.slice(0, -1)];
      const simTail = simSnake[simSnake.length - 1];

      // Verify that after moving, we can still reach our tail
      if (this.hasPathBFS(neighbor, simTail, simSnake, W, H)) {
        // Choose the move that maximizes distance to tail to stall and clear space
        const dist = this.manhattanDistance(neighbor, simTail);
        if (dist > maxDist) {
          maxDist = dist;
          bestMove = neighbor;
        }
      }
    }

    // Emergency follow: if no path has tail safety, maximize distance to tail blindly
    if (!bestMove) {
      for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (snakeSet.has(key) && !(neighbor.x === tail.x && neighbor.y === tail.y)) continue;
        const dist = this.manhattanDistance(neighbor, tail);
        if (dist > maxDist) {
          maxDist = dist;
          bestMove = neighbor;
        }
      }
    }

    return bestMove;
  },

  // A* Shortest Path Algorithm
  findShortestPath(start, goal, snakeBody, W, H) {
    const openList = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const key = p => `${p.x},${p.y}`;
    
    gScore.set(key(start), 0);
    fScore.set(key(start), this.manhattanDistance(start, goal));

    const snakeSet = new Set(snakeBody.map(key));
    const goalKey = key(goal);

    while (openList.length > 0) {
      // Priority queue selection: node with lowest fScore
      openList.sort((a, b) => fScore.get(key(a)) - fScore.get(key(b)));
      const current = openList.shift();
      const currentKey = key(current);

      if (current.x === goal.x && current.y === goal.y) {
        // Reconstruct path array
        const path = [current];
        let curr = current;
        while (cameFrom.has(key(curr))) {
          curr = cameFrom.get(key(curr));
          path.unshift(curr);
        }
        return path;
      }

      const neighbors = this.getNeighbors(current, W, H);
      for (const neighbor of neighbors) {
        const nKey = key(neighbor);

        // Skip occupied cells (unless it is the goal node)
        if (snakeSet.has(nKey) && nKey !== goalKey) continue;

        const tentativeG = gScore.get(currentKey) + 1;
        if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + this.manhattanDistance(neighbor, goal));
          
          if (!openList.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
            openList.push(neighbor);
          }
        }
      }
    }

    return null; // Path unreachable
  },

  // BFS check to verify if a path exists between start and goal
  hasPathBFS(start, goal, snakeBody, W, H) {
    const queue = [start];
    const visited = new Set();
    const key = p => `${p.x},${p.y}`;
    visited.add(key(start));

    const snakeSet = new Set(snakeBody.map(key));
    const goalKey = key(goal);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.x === goal.x && current.y === goal.y) return true;

      const neighbors = this.getNeighbors(current, W, H);
      for (const neighbor of neighbors) {
        const nKey = key(neighbor);
        if (visited.has(nKey)) continue;
        if (snakeSet.has(nKey) && nKey !== goalKey) continue;

        visited.add(nKey);
        queue.push(neighbor);
      }
    }

    return false;
  },

  // Simulate body state after traversing path to food (grow by 1)
  simulateMoveToFood(snakeBody, path) {
    const newSnake = [];
    
    // Add path cells in reverse order (new head -> path nodes)
    for (let i = path.length - 1; i >= 0; i--) {
      newSnake.push(path[i]);
    }

    // Append original body segments up to length + 1 (since we ate food)
    let origIdx = 0;
    while (newSnake.length < snakeBody.length + 1 && origIdx < snakeBody.length) {
      newSnake.push(snakeBody[origIdx]);
      origIdx++;
    }

    return newSnake;
  },

  // Utility: get valid orthogonal grid neighbors
  getNeighbors(pos, W, H) {
    const results = [];
    const dirs = [
      { x: 0, y: -1 }, // UP
      { x: 0, y: 1 },  // DOWN
      { x: -1, y: 0 }, // LEFT
      { x: 1, y: 0 }   // RIGHT
    ];

    for (const d of dirs) {
      const nx = pos.x + d.x;
      const ny = pos.y + d.y;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        results.push({ x: nx, y: ny });
      }
    }
    return results;
  },

  // Utility: calculate Manhattan distance
  manhattanDistance(p1, p2) {
    return Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  },

  // Translate movement offsets into direction labels
  getDirectionFromMove(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 1) return 'RIGHT';
    if (dx === -1) return 'LEFT';
    if (dy === 1) return 'DOWN';
    if (dy === -1) return 'UP';
    return 'RIGHT';
  }
};
