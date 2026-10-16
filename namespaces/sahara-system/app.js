const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BOARD_SIZE = 15;

function createEmptyBoard() {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
}

// Check for 5-in-a-row
function checkWin(board, r, c) {
    const player = board[r][c];
    if (player === 0) return false;
    const directions = [
        [[0, 1], [0, -1]],   // Horizontal
        [[1, 0], [-1, 0]],   // Vertical
        [[1, 1], [-1, -1]],  // Diagonal \
        [[1, -1], [-1, 1]]   // Diagonal /
    ];
    for (const dir of directions) {
        let count = 1;
        for (const [dr, dc] of dir) {
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === player) {
                count++;
                nr += dr;
                nc += dc;
            }
        }
        if (count >= 5) return true;
    }
    return false;
}

// Evaluate board for brute force
function evaluateCell(board, r, c, player) {
    const opponent = player === 1 ? 2 : 1;
    const directions = [
        [0, 1],   // Horizontal
        [1, 0],   // Vertical
        [1, 1],   // Diagonal \
        [1, -1]   // Diagonal /
    ];
    let score = 0;
    for (const [dr, dc] of directions) {
        let countPlayer = 0;
        let countOpponent = 0;
        let emptySide = 0;
        for (let i = -4; i <= 4; i++) {
            if (i === 0) continue;
            let nr = r + i * dr;
            let nc = c + i * dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                if (board[nr][nc] === player) countPlayer++;
                else if (board[nr][nc] === opponent) countOpponent++;
                else emptySide++;
            }
        }
        if (countPlayer > 0 && countOpponent === 0) {
            score += Math.pow(10, countPlayer);
        } else if (countOpponent > 0 && countPlayer === 0) {
            score += Math.pow(10, countOpponent) * 0.8; // defend slightly less than attack
        }
    }
    return score;
}

// Brute-force/evaluation next move planner
function getBotMove(board, player) {
    let bestScore = -Infinity;
    let bestMoves = [];

    // Brute force evaluate every empty spot
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] === 0) {
                // If this is a winning move, take it immediately
                board[r][c] = player;
                if (checkWin(board, r, c)) {
                    board[r][c] = 0;
                    return { r, c };
                }
                board[r][c] = 0;

                // If opponent can win next turn, we must block it immediately
                const opponent = player === 1 ? 2 : 1;
                board[r][c] = opponent;
                if (checkWin(board, r, c)) {
                    board[r][c] = 0;
                    return { r, c }; // high priority block
                }
                board[r][c] = 0;

                // naive evaluation heuristic
                let score = evaluateCell(board, r, c, player);
                if (score > bestScore) {
                    bestScore = score;
                    bestMoves = [{ r, c }];
                } else if (score === bestScore) {
                    bestMoves.push({ r, c });
                }
            }
        }
    }

    if (bestMoves.length === 0) {
        // Find first empty cell
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0) return { r, c };
            }
        }
    }

    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

const server = http.createServer((req, res) => {
    // Serve HTML page
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Gomoku (Five-in-a-Row) vs Brute-Force Bot</title>
    <style>
        body { font-family: sans-serif; text-align: center; background-color: #f0f0f0; margin-top: 20px; }
        #board { display: inline-grid; grid-template-columns: repeat(${BOARD_SIZE}, 30px); background-color: #f1c40f; padding: 10px; border: 2px solid #d35400; border-radius: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .cell { width: 30px; height: 30px; border: 1px solid #d35400; display: flex; align-items: center; justify-content: center; cursor: pointer; box-sizing: border-box; position: relative; }
        .cell::before { content: ""; width: 1px; height: 100%; background: #d35400; position: absolute; left: 50%; top: 0; z-index: 1; }
        .cell::after { content: ""; height: 1px; width: 100%; background: #d35400; position: absolute; top: 50%; left: 0; z-index: 1; }
        .stone { width: 24px; height: 24px; border-radius: 50%; z-index: 2; box-shadow: 1px 1px 3px rgba(0,0,0,0.5); }
        .black { background-color: #2c3e50; }
        .white { background-color: #ffffff; }
        #status { font-size: 20px; font-weight: bold; margin: 20px; min-height: 24px; }
        button { font-size: 16px; padding: 8px 16px; cursor: pointer; background: #e67e22; color: white; border: none; border-radius: 4px; }
        button:hover { background: #d35400; }
    </style>
</head>
<body>
    <h2>Gomoku (Five-in-a-Row) vs Brute-Force Bot</h2>
    <div id="status">Your Turn (Black)</div>
    <div id="board"></div>
    <div style="margin-top: 20px;">
        <button onclick="resetGame()">Reset Game</button>
    </div>

    <script>
        const size = ${BOARD_SIZE};
        let board = Array(size).fill(null).map(() => Array(size).fill(0));
        let gameOver = false;

        function render() {
            const boardEl = document.getElementById('board');
            boardEl.innerHTML = '';
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.onclick = () => makeMove(r, c);
                    if (board[r][c] !== 0) {
                        const stone = document.createElement('div');
                        stone.className = 'stone ' + (board[r][c] === 1 ? 'black' : 'white');
                        cell.appendChild(stone);
                    }
                    boardEl.appendChild(cell);
                }
            }
        }

        async function makeMove(r, c) {
            if (board[r][c] !== 0 || gameOver) return;
            board[r][c] = 1; // Black (Player)
            render();
            
            // Check win
            let statusEl = document.getElementById('status');
            const checkRes = await fetch('/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ board, r, c })
            }).then(r => r.json());

            if (checkRes.win) {
                statusEl.innerText = "You Win! 🎉";
                gameOver = true;
                return;
            }

            statusEl.innerText = "Bot's Turn...";
            
            // Get Bot Move
            const botRes = await fetch('/bot-move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ board, player: 2 })
            }).then(r => r.json());

            if (botRes.r !== undefined) {
                board[botRes.r][botRes.c] = 2; // White (Bot)
                render();
                
                const botCheck = await fetch('/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ board, r: botRes.r, c: botRes.c })
                }).then(r => r.json());

                if (botCheck.win) {
                    statusEl.innerText = "Bot Wins! 🤖";
                    gameOver = true;
                } else {
                    statusEl.innerText = "Your Turn (Black)";
                }
            } else {
                statusEl.innerText = "It's a draw! 🤝";
                gameOver = true;
            }
        }

        function resetGame() {
            board = Array(size).fill(null).map(() => Array(size).fill(0));
            gameOver = false;
            document.getElementById('status').innerText = "Your Turn (Black)";
            render();
        }

        render();
    </script>
</body>
</html>
        `);
    } else if (req.method === 'POST' && req.url === '/check') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const win = checkWin(data.board, data.r, data.c);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ win }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/bot-move') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const move = getBotMove(data.board, data.player);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(move));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server is running on port \${PORT}\`);
});
