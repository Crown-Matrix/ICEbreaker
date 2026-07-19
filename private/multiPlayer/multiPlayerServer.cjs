// multiPlayerServer.cjs

const { join } = require('path');
const os = require('os');

const { SQL_Manager_Instance, PORT, codeMatrix, express, app, createServer, cookieParser, Server, server, multiPlayer } = require(join(__dirname, '../admin-js/server-core.cjs'));
const SERVER_START_TIME = Date.now();
const io = new Server(server, {
  path: "/multiPlayer/socket"
});

const difficultyValues = require(join(__dirname, '../Server-Imports/multiPlayer/difficultyValues.json'));
const { backEndAdminInstance } = require(join(__dirname, '../Server-Imports/General/backEndAdmin.cjs'));
multiPlayer.backEndAdminInstance = backEndAdminInstance

app.get('/multiPlayer', (req, res) => {
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const queries = req.query;
  res.status(200).sendFile('multiPlayer/multiPlayerReference.html', { root: "./public" }, (err) => {
    if (err) {
      console.error('Error sending multiPlayerTitle.html:', err);
      res.status(500).send('Internal Server Error');
    }
  });
});

app.get('/multiPlayer/reference', (req, res) => {
  res.status(200).sendFile('multiPlayer/multiPlayerReference.html', { root: "./public" });
});

app.get('/multiPlayer/result', (req, res) => {
  res.status(200).sendFile('multiPlayer/multiPlayerResult.html', { root: "./public" });
});

const MATRIX_SIZE = 7;
const MAX_BUFFER_SIZE = 9;
const ROUND_START_DELAY_MS = 505; // mirrors single player's animation buffer
const TOLERANCE_MS = 50;

// ---- shared helpers (matrix-agnostic versions of singlePlayerServer.cjs's backEndHandler methods) ----

function validateSequenceData(sequence_data, matrix) {
  let rowMode = true;
  for (let i = 0; i < sequence_data.length; i++) {
    const node = sequence_data[i];
    if (i !== 0) {
      if (rowMode) {
        if (node.row !== sequence_data[i - 1].row) return false;
      } else {
        if (node.col !== sequence_data[i - 1].col) return false;
      }
    }
    rowMode = !rowMode;
    if (!matrix || matrix.length === 0 || matrix[0].length === 0) return false;
    if (node.row < 0 || node.row >= matrix.length || node.col < 0 || node.col >= matrix[0].length) return false;
  }
  return true;
}

function convertSequenceToBuffer(sequence_data, matrix) {
  try {
    let buffer = [];
    for (let i = 0; i < sequence_data.length; i++) {
      const node = sequence_data[i];
      buffer.push(matrix[node.row][node.col]);
    }
    return buffer;
  } catch (err) {
    console.error('Error converting sequence to buffer:', err);
    return [];
  }
}

function scoreToEddies(score) {
  // same formula as single player: y = mx + b, m = 3/100, b = 25
  return Math.floor((3 * score) / 100) + 25;
}


class Match {
  constructor(playerA, playerB, selectedTimeFrame) {
    this.id = `${playerA.socket.id}-${playerB.socket.id}-${Date.now()}`;
    this.players = [playerA, playerB];
    this.selectedTimeFrame = selectedTimeFrame;
    this.matchStartTime = Date.now() + ROUND_START_DELAY_MS;
    this.matchEndTime = this.matchStartTime + selectedTimeFrame * 1000;
    this.roundCache = []; // roundCache[i] = { matrix, solutions } — generated once, shared by index
    this.cancelled = false;
    this.ended = false;

    for (const p of this.players) {
      p.currentMatch = this;
      p.matchScore = 0;
      p.roundIndex = 0;
      p.totalSequencesUploaded = 0;
      p.databaseWritten = false;
      p.isBanned = false;
      p.frontEndHandler = null;
    }

    //finalize even if a client never sends a final end_game near the deadline
    this.finalizeTimeout = setTimeout(() => {
      this.finalize('timeout');
    }, (this.matchEndTime - Date.now()) + TOLERANCE_MS + 250);
  }

  getOpponent(player) {
    return this.players.find(p => p !== player);
  }

  getRound(index) {
    if (!this.roundCache[index]) {
      const [matrix, solutions] = codeMatrix.buildMatrix(MATRIX_SIZE, MATRIX_SIZE, 5);
      this.roundCache[index] = { matrix, solutions };
    }
    return this.roundCache[index];
  }

  isTimeUp() {
    return Date.now() >= this.matchEndTime;
  }

  // normal match end — both players wound down naturally, or safety-net timer fired
  async finalize(reason = 'normal') {
    if (this.ended || this.cancelled) return;
    this.ended = true;
    clearTimeout(this.finalizeTimeout);

    const [pA, pB] = this.players;
    const scoreA = pA.matchScore || 0;
    const scoreB = pB.matchScore || 0;

    let winner = null, draw = false;
    if (scoreA === scoreB) {
      draw = true;
    } else {
      winner = scoreA > scoreB ? pA : pB;
    }

    for (const p of this.players) {
      const opp = this.getOpponent(p);
      const won = draw ? false : (p === winner);
      p.socket.emit('match_result', {
        success: true,
        won,
        draw,
        yourScore: p.matchScore || 0,
        opponentScore: opp.matchScore || 0,
        opponentName: opp.socket.playerName,
        reason,
      });
      await this.writeStatsFor(p, won);
    }
  }

  // "losing player disconnected" path — remaining player wins automatically
  async forceFinalizeFromDisconnect(disconnector, remaining) {
    if (this.ended || this.cancelled) return;
    this.ended = true;
    clearTimeout(this.finalizeTimeout);

    remaining.socket.emit('match_result', {
      success: true,
      won: true,
      draw: false,
      yourScore: remaining.matchScore || 0,
      opponentScore: disconnector.matchScore || 0,
      opponentName: disconnector.socket.playerName,
      reason: 'opponent_disconnected',
    });

    await this.writeStatsFor(remaining, true);
    await this.writeStatsFor(disconnector, false);
  }

  // "winning player disconnected" path — void the match, no stats for either side
  voidFromDisconnect(disconnector, remaining) {
    if (this.ended || this.cancelled) return;
    this.cancelled = true;
    clearTimeout(this.finalizeTimeout);

    remaining.socket.emit('match_cancelled', {
      success: false,
      message: 'Your opponent disconnected while ahead on score. Match voided — no stats recorded.',
    });
  }

  async writeStatsFor(player, won) {
    if (player.isGuest || player.databaseWritten || player.isBanned) return;
    player.databaseWritten = true;
    try {
      const username = SQL_Manager_Instance.getUsernameFromUUID(player.identity.UUID);
      const score = player.matchScore || 0;
      SQL_Manager_Instance.updateGameStats(username, score, 'mp', won);
      SQL_Manager_Instance.addEddies(username, scoreToEddies(score));
    } catch (err) {
      console.error('Error writing multiplayer stats for player:', player.identity.UUID, err);
    }
  }
}

// ---- Player / Matchmaker: matchmaking-time logic, extended with match-runtime fields ----

class Player {
  constructor(socket, ipAddress) {
    this.socket = socket;
    this.selectedTimeFrame = null;
    this.avgScore = null;
    this.winRate = null;
    this.skillIndex = null;
    this.identity = {
      ipAddress: ipAddress,
      UUID: socket.UUID,
    };
    this.queuedAt = null;
    socket.playerObj = this;

    // match-runtime state, (re)populated by Match constructor once paired
    this.currentMatch = null;
    this.matchScore = 0;
    this.roundIndex = 0;
    this.totalSequencesUploaded = 0;
    this.databaseWritten = false;
    this.isBanned = false;
    this.frontEndHandler = null;
    this.isGuest = socket.guestMode;
  }

  calculateSkillIndex() {
    const winRateDamp = 0.1;
    this.skillIndex =
      this.avgScore / ((winRateDamp + (1 - this.winRate)) * (1000 / this.selectedTimeFrame));
    return this.skillIndex;
  }
}

class Matchmaker {
  constructor(timeFrame) {
    this.selectedTimeFrame = timeFrame;
    this.players = [];
  }

  addPlayer(player) {
    player.queuedAt = player.queuedAt ?? Date.now();
    this.players.push(player);
  }

  removePlayer(player) {
    this.players = this.players.filter((p) => p !== player);
  }

  sortPlayersBySkill(players) {
    return [...players].sort((a, b) => a.skillIndex - b.skillIndex);
  }

  pulse() {
    const sorted = this.sortPlayersBySkill(this.players);

    for (let i = 0; i < sorted.length - 1; i++) {
      const playerA = sorted[i];
      const playerB = sorted[i + 1];

      if (!this.players.includes(playerA) || !this.players.includes(playerB)) continue;
      this.createMatch(playerA, playerB);
      this.removePlayer(playerA);
      this.removePlayer(playerB);
    }
  }

  createMatch(playerA, playerB) {
    const match = new Match(playerA, playerB, this.selectedTimeFrame);
    console.log(`Match created [${match.id}]: ${playerA.socket.playerName} vs ${playerB.socket.playerName}`);

    for (const player of match.players) {
      const opponent = match.getOpponent(player);
      registerMatchHandlers(player, match);
      player.socket.emit('matchmake_found', {
        success: true,
        message: 'Match found! Starting game...',
        opponent: opponent.socket.playerName,
        matchEndTime: match.matchEndTime,
        selectedTimeFrame: match.selectedTimeFrame,
      });
    }
  }
}

const matchmakers = new Map();
function getMatchmaker(timeFrame) {
  if (!matchmakers.has(timeFrame)) {
    matchmakers.set(timeFrame, new Matchmaker(timeFrame));
  }
  return matchmakers.get(timeFrame);
}

setInterval(() => {
  for (const mm of matchmakers.values()) {
    mm.pulse();
  }
}, 2000);

// ---- per-match game loop — registered once a Match exists for a player ----

function registerMatchHandlers(player, match) {
  const socket = player.socket;

  socket.on('start_game', () => {
    if (match.cancelled || match.ended || player.isBanned) return;

    if (player.frontEndHandler && player.frontEndHandler.gameState === 'active') {
      socket.emit('start_game_response', {
        message: 'Game already active. Please finish the current round before starting a new one.',
        accepted: false,
      });
      return;
    }

    if (match.isTimeUp()) {
      socket.emit('start_game_response', { accepted: false, message: 'Match time has ended.' });
      return;
    }

    const isFirstRound = player.roundIndex === 0 && !player.frontEndHandler;
    const round = match.getRound(player.roundIndex);

    const feh = {
      matrix: round.matrix,
      solutions: round.solutions,
      gameState: 'active',
      rowMode: true,
      currentRow: null,
      currentCol: null,
      selectedTimeFrame: match.selectedTimeFrame,
      currentBuffer: [],
      sequence: [],
      maxBufferSize: MAX_BUFFER_SIZE,
      difficultyValues,
      totalSequencesUploaded: player.totalSequencesUploaded,
      isGuest: player.isGuest,
    };
    player.frontEndHandler = feh;

    if (isFirstRound && !player.isGuest) {
      const username = SQL_Manager_Instance.getUsernameFromUUID(player.identity.UUID);
      SQL_Manager_Instance.incrementGame(username, 'mp');
    }

    socket.emit('start_game_response', {
      frontEndHandler: feh,
      accepted: true,
      matchEndTime: match.matchEndTime,
    });
  });

  const ANTI_CHEAT_ENABLED = false; // TODO: flip back on once the matrix false-positive is root-caused

  socket.on('frontEndHandler_update', (data) => {
    if (player.isBanned || !player.frontEndHandler || !data.frontEndHandler) return;

    const banLengthDays = 10 / 1440;
    const immutableKeys = ['matrix', 'solutions', 'gameState', 'maxBufferSize', 'difficultyValues', 'totalSequencesUploaded', 'isGuest'];
    const tamperCheckKeys = ['matrix', 'solutions', 'gameState', 'maxBufferSize', 'isGuest'];
    const objectKeys = new Set(['matrix', 'solutions']);

    for (const key of immutableKeys) {
      const incomingVal = data.frontEndHandler[key];
      const trustedVal = player.frontEndHandler[key];

      if (tamperCheckKeys.includes(key)) {
        const isDifferent = objectKeys.has(key)
          ? JSON.stringify(incomingVal) !== JSON.stringify(trustedVal)
          : incomingVal !== trustedVal;

        if (isDifferent) {
          if (ANTI_CHEAT_ENABLED) {
            console.warn(`Tampering attempt detected for key "${key}" from socket ID: ${socket.id}.`);
            try {
              SQL_Manager_Instance.banUser(socket.handshake.address, player.identity.UUID ?? null, `Tampering: "${key}"`, banLengthDays);
            } catch (error) {
              if (!error.message.includes('already banned')) {
                console.error(`Error banning user: ${error.message}`);
              }
            }
            player.isBanned = true;
            player.databaseWritten = true;
            socket.emit('banned', {
              reason: `Client Tampering Detected. You have been banned for ${banLengthDays * 1440} minutes`,
              message: 'banned',
              length: banLengthDays,
            });
            setTimeout(() => socket.disconnect(true), 200);
            return;
          } else {
            // anti-cheat off — log it so we can diagnose later, but don't punish
            console.log(`[anti-cheat disabled] "${key}" mismatch from socket ${socket.id}. Incoming:`, incomingVal, 'Trusted:', trustedVal);
          }
        }
      }

      data.frontEndHandler[key] = trustedVal; // always force-sync, mismatch or not — client can't smuggle bad values either way
    }

    player.frontEndHandler = data.frontEndHandler;
  });

  socket.on('end_game', (data) => {
    if (player.isBanned || match.cancelled || match.ended) return;
    const feh = player.frontEndHandler;
    if (!feh || (feh.gameState !== 'active' && feh.gameState !== 'ending')) {
      socket.emit('end_game_response', { roundResult: 'init', scoreGained: 0, resultType: 'error', message: 'No active round to end.' });
      return;
    }

    const sequence_data = data.sequence;
    const timedOut = match.isTimeUp();

    if (!timedOut) {
      if (!validateSequenceData(sequence_data, feh.matrix)) {
        socket.emit('end_game_response', { roundResult: 'lost', scoreGained: 0, resultType: 'error', message: 'Invalid sequence data' });
        return;
      }

      const buffer = convertSequenceToBuffer(sequence_data, feh.matrix);
      const solution_result_json = codeMatrix.checkforSolutions(buffer.join(''), feh.solutions);

      let scoreGained = 0, sequencesUploadedCount = 0, all_solved = true;
      for (const [k, v] of Object.entries(solution_result_json)) {
        if (v) {
          sequencesUploadedCount++;
          scoreGained += difficultyValues[k] || 0;
        } else {
          all_solved = false;
        }
      }

      player.matchScore += scoreGained;
      player.totalSequencesUploaded += sequencesUploadedCount;
      player.roundIndex += 1;
      feh.gameState = all_solved ? 'won' : 'lost';

      socket.emit('end_game_response', {
        roundResult: all_solved ? 'won' : 'lost',
        resultType: all_solved ? 'all_uploaded' : 'buffer_full',
        scoreGained,
        sequencesUploaded: sequencesUploadedCount,
        message: 'Round ended successfully.',
      });
    } else {
      feh.gameState = 'lost';
      socket.emit('end_game_response', { roundResult: 'lost', scoreGained: 0, resultType: 'timeout', message: 'Time is up!' });
    }

    maybeFinalizeMatch(match);
  });

  socket.once('database_write', () => {
    // no-op for multiplayer — stats are already written by Match.finalize() /
    // forceFinalizeFromDisconnect(). Listener kept so the client's existing
    // emit (from timerWaiting) doesn't just vanish into an unhandled event.
  });
}

function maybeFinalizeMatch(match) {
  if (match.ended || match.cancelled) return;
  if (!match.isTimeUp()) return;
  const bothDone = match.players.every(p => !p.frontEndHandler || p.frontEndHandler.gameState !== 'active');
  if (bothDone) {
    match.finalize('normal');
  }
}

// ---- connection / auth / matchmaking entry point ----

io.on('connection', (socket) => {
  console.log('A user connected to the multiplayer server.');

  const sessionCookie = SQL_Manager_Instance.auth.getSessionTokenFromRequest(socket.handshake);
  socket.guestMode = !sessionCookie;
  socket.UUID = socket.guestMode ? null : SQL_Manager_Instance.sessionTokenToUUID(sessionCookie);
  console.log('Socket UUID:', socket.UUID);

  const fetched_user_data = socket.UUID ? SQL_Manager_Instance.getUserByUUID(socket.UUID) : null;
  const winRate = fetched_user_data ? fetched_user_data.winRate : NaN;
  const avgScore = fetched_user_data ? fetched_user_data.avgScore : NaN;
  socket.playerName = socket.guestMode ? 'Guest' : (fetched_user_data ? fetched_user_data.username : 'Unknown');

  const player_obj = new Player(socket, socket.handshake.address);
  player_obj.winRate = winRate;
  player_obj.avgScore = avgScore;

  socket.on('disconnect', () => {
    console.log('A user disconnected from the multiplayer server.');

    const mm = matchmakers.get(player_obj.selectedTimeFrame);
    if (mm) mm.removePlayer(player_obj);

    const match = player_obj.currentMatch;
    if (!match || match.ended || match.cancelled) return;

    const opponent = match.getOpponent(player_obj);
    if (!opponent) return;

    const disconnectorScore = player_obj.matchScore || 0;
    const opponentScore = opponent.matchScore || 0;

    if (disconnectorScore > opponentScore) {
      match.voidFromDisconnect(player_obj, opponent);
    } else {
      match.forceFinalizeFromDisconnect(player_obj, opponent);
    }
  });

  socket.once('matchmake', (data) => {
    console.log('Matchmaking request received:', data);

    const selectedTimeFrame = parseFloat(data.selectedTimeFrame);
    if (isNaN(selectedTimeFrame)) {
      console.error('Invalid selectedTimeFrame:', data.selectedTimeFrame);
      socket.emit('matchmake_found', { success: false, message: 'Invalid time frame selected.' });
      return;
    }
    player_obj.selectedTimeFrame = selectedTimeFrame;

    if (socket.guestMode) {
      player_obj.skillIndex = 0;
    } else if (isNaN(player_obj.winRate) || isNaN(player_obj.avgScore)) {
      console.warn('Missing player stats for UUID:', socket.UUID, '— defaulting skillIndex to 0.');
      player_obj.skillIndex = 0;
    } else {
      player_obj.calculateSkillIndex();
    }

    const mm = getMatchmaker(selectedTimeFrame);
    mm.addPlayer(player_obj);

    socket.emit('matchmake_queued', { success: true, message: 'Searching for a match...' });
  });
});



module.exports = { Player, Matchmaker, Match, getMatchmaker };