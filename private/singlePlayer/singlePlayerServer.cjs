//code to handle single player interactions and logic
// data will be stored in classes and objects, and will be manipulated based on user input and game state

const codeMatrix = require("../../public/js/codeMatrix.js");

const express = require('express');
const app = express();

const { createServer } = require('node:http');
const { join } = require('node:path');
const cookieParser = require("cookie-parser");
app.use(cookieParser());

const { Server } = require('socket.io');
const server = createServer(app);
const io = new Server(server, {
  path: "/singlePlayer/socket" // Set the path for Socket.IO connections
});

const difficultyValues = {
  'easy': 200,
  'medium': 300,
  'hard': 500
}

const DEFAULT_PORT = 3000;
const PORT = process.env.ICEBREAKER_PORT || DEFAULT_PORT;


class SQLManager {
  constructor() {
    let mySQL = require('../admin-js/SQL.cjs');
    for (const [key, value] of Object.entries(mySQL)) {
      this[key] = value;
    }
  }
}

const SQL_Manager_Instance = new SQLManager();



class backEndAdmin {
  constructor() {
    this.activeSessions = new Map(); // Map of sessionId to backEndHandler instances
  }
  addSession(backEndHandlerInstanceArg) {
    this.activeSessions.set(backEndHandlerInstanceArg.sessionId, backEndHandlerInstanceArg);
  }
  removeSession(sessionId) {
    this.activeSessions.delete(sessionId);
  }

  summary() {
    //construct new map with only sessionId and frontEndHandler.gameState
    let summaryMap = new Map();
    this.activeSessions.forEach((handlerInstance, sessionId) => {
      summaryMap.set(sessionId, handlerInstance.frontEndHandler ? handlerInstance.frontEndHandler.gameState : 'no frontEndHandler');
    });
    return summaryMap;
  }

}
let backEndAdminInstance = new backEndAdmin();

class backEndHandler {
  constructor(id, timeframe, ip = null, UUID = null, frontEndHandlerArg = null) {
    this.sessionId = id;
    this.userInfo = {
      ip: ip,
      UUID: UUID
    };
    this.creationTime = Date.now();
    this.roundStartTime = null;
    this.selectedTimeFrame = timeframe;
    this.frontEndHandler = frontEndHandlerArg; //should be shortly assigned by front end handler when it emits initialize_data
    this.totalSequencesUploaded = 0;
    this.databaseWritten = false;
    this.isBanned = false;
  }

  createRound(frontEndHandlerArg) {
    console.log('creating round');

    //generate matrix and solutions
    const matrixSize = 7;
    const maxBufferSize = 9;
    [frontEndHandlerArg.matrix, frontEndHandlerArg.solutions] = codeMatrix.buildMatrix(matrixSize, matrixSize, 5);
    frontEndHandlerArg.gameState = 'active';
    frontEndHandlerArg.rowMode = true; // true for row mode, false for column mode
    frontEndHandlerArg.currentRow = null;
    frontEndHandlerArg.currentCol = null;
    frontEndHandlerArg.selectedTimeFrame = this.selectedTimeFrame; // Set the selected time frame in the front end handler so that the client can display it and use it for the game timer
    frontEndHandlerArg.currentBuffer = []; //[str,str...]
    frontEndHandlerArg.sequence = []; //sequence of node coordinates the user has selected, of the form [{row: int, col: int}, {row: int, col: int}, ...]
    frontEndHandlerArg.maxBufferSize = maxBufferSize;
    frontEndHandlerArg.difficultyValues = difficultyValues;
    frontEndHandlerArg.totalSequencesUploaded = this.totalSequencesUploaded || 0;

    return frontEndHandlerArg;
  }

  validateSequenceData(sequence_data) {
    let rowMode = true;
    for (let i = 0; i < sequence_data.length; i++) {
      const node = sequence_data[i];
      if (i !== 0) {
        if (rowMode) {
          if (node.row !== sequence_data[i - 1].row) {
            return false;
          }
        } else { //col mode
          if (node.col !== sequence_data[i - 1].col) {
            return false;
          }
        }
      }
      rowMode = !rowMode; //toggle mode for next node
      //final validation to ensure coordinates are within bounds of the matrix
      if (this.frontEndHandler.matrix === null || this.frontEndHandler.matrix.length === 0 || this.frontEndHandler.matrix[0].length === 0) { 
        return false; //matrix is not initialized or empty, cannot validate coordinates
      }
      if (node.row < 0 || node.row >= this.frontEndHandler.matrix.length || node.col < 0 || node.col >= this.frontEndHandler.matrix[0].length) {
        return false;
      }
    }
    return true;
  }
  convertSequenceToBuffer(sequence_data, matrix) {
    try {
      let buffer = []; //['str','str'...]
      for (let i = 0; i < sequence_data['sequence'].length; i++) {
        const node = sequence_data['sequence'][i];
        buffer.push(matrix[node.row][node.col]);
      }
      return buffer;
    } catch (err) {
      console.error('Error converting sequence to buffer:', err);
      return [];
    }
  }

  endRound(backEndHandlerInstance, sequence_data) {
    const toleranceMS = 50; // Allow a small tolerance to account for any minor delays in processing the end round request, this can help prevent unfair losses due to timing issues while still enforcing the time limit

    let frontEndHandlerArg = backEndHandlerInstance.frontEndHandler;
    if (frontEndHandlerArg.gameState !== 'active' && frontEndHandlerArg.gameState !== 'ending') {
      console.warn('Attempted to end round that is not active for session ID:', backEndHandlerInstance.sessionId);
      return {
        roundResult: 'init',
        scoreGained: 0,
        resultType: 'error',
        message: 'No active round to end.'
      };
    }

    /*
following is the logic for handling the end of a round of a signed in user, skip this for guest accounts, frontend report is enough for guests
games_finished += 1, incrementGame() handles this
update average score using the formula in the function: updateGameStats() handles that
there is no win condition for single player, just put false for that parameter just incase
add eddies to user account based on scoreToEddies()
*/
    console.log('about to check time inequality?');
    console.log(backEndHandlerInstance.roundStartTime + backEndHandlerInstance.selectedTimeFrame * 1000 + toleranceMS, "<", Date.now(), '=', backEndHandlerInstance.roundStartTime + backEndHandlerInstance.selectedTimeFrame * 1000 + toleranceMS < Date.now());
    console.log({
      roundStartTime: backEndHandlerInstance.roundStartTime,
      selectedTimeFrame: backEndHandlerInstance.selectedTimeFrame,
      now: Date.now(),
      expiresAt:
        backEndHandlerInstance.roundStartTime +
        backEndHandlerInstance.selectedTimeFrame * 1000 +
        toleranceMS
    });
    if (backEndHandlerInstance.roundStartTime + backEndHandlerInstance.selectedTimeFrame * 1000 + toleranceMS < Date.now()) {
      //reject the end round attempt and mark the round as lost due to time out, this can help prevent cheating by trying to end the round after the time limit has been exceeded, while still providing a small grace period to account for any minor timing issues
      // If the current time has exceeded the round start time plus the selected time frame, then the player has run out of time and loses the round

      //this used to be where database was updated, its now a seperate socket io call triggered directly by timer, user has no incentive to want to hack that because it simply means they dont get to receive their rewards
      console.log("DATABASE WRITE - TIMEOUT FALLBACK BLOCK")
      console.log("DATABASEWRITTEN STATUS BEFORE CHECK: ", backEndHandlerInstance.databaseWritten);
      if (!backEndHandlerInstance.isGuest && !backEndHandlerInstance.databaseWritten) {// Only write to the database for signed in users who haven't already triggered a database write for this round, this can help prevent duplicate writes if the user tries to trigger multiple database writes for the same round, while still allowing guests to trigger the event without causing any issues since it will simply not perform any database operations for guests
        if (backEndHandlerInstance.isBanned) {return } //banned usrs shoudlnt get any database writes
        backEndHandlerInstance.databaseWritten = true
        let score = backEndHandlerInstance.score || 0; //get the user's score for the round, this should have been calculated and stored in the front end handler during gameplay, if not, we can default to 0
        let userUUID = backEndHandlerInstance.userInfo.UUID;
        let username = SQL_Manager_Instance.getUsernameFromUUID(userUUID);
        SQL_Manager_Instance.updateGameStats(username, score, 'sp', false);
        SQL_Manager_Instance.addEddies(username, backEndHandlerInstance.scoreToEddies(score)); //add eddies based on the score they achieved in the round, even if they lost, to reward them for their performance and encourage continued play
      } else if (backEndHandlerInstance.isGuest) {
        console.log('skipping database write cuz guest account')
      }
      return {
        roundResult: 'lost',
        scoreGained: 0,
        resultType: 'timeout',
        message: 'Time is up! Unclaimed points lost.'
      };
    }
    //examples of valid sequence data: 
    // [ { "row": 0, "col": 0 }, { "row": 1, "col": 0 }, { "row": 1, "col": 1 }, { "row": 2, "col": 1 }, { "row": 2, "col": 2 }, { "row": 3, "col": 2 }, { "row": 3, "col": 3 }, { "row": 4, "col": 3 }, { "row": 4, "col": 4 } ]
    // [ { "row": 0, "col": 3 }, { "row": 5, "col": 3 }, { "row": 5, "col": 1 }, { "row": 2, "col": 1 }, { "row": 2, "col": 6 }, { "row": 6, "col": 6 }, { "row": 6, "col": 0 }, { "row": 1, "col": 0 }, { "row": 1, "col": 5 } ]
    //if row_mode, ensure top node has same row
    // if col_mode, ensure top node has same column
    //ensure all coordinates are valid within matrix size


    if (!this.validateSequenceData(sequence_data)) {
      console.warn('Invalid sequence data received for session ID:', backEndHandlerInstance.sessionId);
      return {
        roundResult: 'lost',
        scoreGained: 0,
        resultType: 'error',
        message: 'Invalid sequence data'
      };
    }

    let convertedBuffer = this.convertSequenceToBuffer(sequence_data, frontEndHandlerArg.matrix);
    let bufferString = convertedBuffer.join('');

    //process sequence data and verify its validity for anti cheat purposes, determine score, outcome, etc and send it all back to the front end
    // verify the sequence data by ensuring the row/column mode is being followed, and the coordinates are valid
    // convert the sequence data to a buffer using the backEnd saved matrix and the sequence of coordinates
    // use this buffer to compute which solutions were installed

    let solution_result_json = codeMatrix.checkforSolutions(bufferString, frontEndHandlerArg.solutions)
    let sequencesUploadedCount = 0;

    let scoreGained = 0;
    let all_solved = true;
    for (const [i, v] of Object.entries(solution_result_json)) {
      if (v) {
        sequencesUploadedCount++;
        scoreGained += difficultyValues[i] || 0; // Add the corresponding score for the solution type, default to 0 if type is unrecognized
      } else {
        all_solved = false;
      }
    }

    // from those results, compute, the round result, resultType, and scoreGained
    // transmit those back to the front end via json

    backEndHandlerInstance.score = (backEndHandlerInstance.score || 0) + scoreGained; //keep a running total of the user's score across rounds in the front end handler, this can be used for end game stats and to reward users based on their overall performance
    return {
      roundResult: all_solved ? 'won' : 'lost', //'[won,lost]'
      resultType: all_solved ? 'all_uploaded' : 'buffer_full', //[buffer_full, timeout, all_uploaded]
      scoreGained: scoreGained, //some integer score based on the user's performance in the round, can be 0 if they lost, or some positive integer if they won, the scoring system can be based on factors like time taken to solve, number of moves, etc
      sequencesUploaded: sequencesUploadedCount, //number of solutions uploaded based on the user's buffer, this can be used by the front end to display feedback to the user about how many solutions they successfully uploaded with their sequence
      message: "Round ended successfully."
    };
  }


  scoreToEddies(score) {
    // formula: eddies = ((3/100) * score) + 25: y = mx + b, where m = 3/100 (3 eddies per multiple of 100) and b = 25 (base eddies for participating in the round)
    // designed to ensure integer output since score is always a multiple of 100
    let eddies = Math.floor((3 * score) / 100) + 25;
    return eddies;
  }
}



app.use((req, res, next) => {
  let ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  let sessionToken = req.cookies.sessionToken

  let UUID = sessionToken ?
    SQL_Manager_Instance.sessionTokenToUUID(sessionToken) : null;

  let isUserBanned = UUID ?
    SQL_Manager_Instance.isUUIDBanned(UUID) : false;

  if (isUserBanned) {
    console.warn('Banned user attempted to access path:', req.path, 'UUID:', UUID);
    return res.status(403).sendFile('/auth/banned.html', { root: './public' });
  }

  if (
    req.path === '/banned' ||
    req.path === '/favicon.ico' ||
    req.path.startsWith('/.well-known/')
  ) {
    return next();
  }

  if (!ip) {
    console.warn('No IP address found in request for path:', req.path);
    return res.status(400).send('Bad Request: No IP address found');
  }

  if (SQL_Manager_Instance.isIPBanned(ip)) {
    console.warn('Banned IP attempted to access path:', req.path, 'IP:', ip);
    return res.status(403).sendFile('/auth/banned.html', { root: './public' });
  }
  next();
});



app.use(express.static('public'));




io.use((socket, next) => {

  //get ip:
  let ip = socket.handshake.address || socket.request.headers['x-forwarded-for']?.split(',')[0].trim() || socket.request.socket.remoteAddress;
  if (!ip) {
    console.warn('No IP address found in socket handshake for socket ID:', socket.id);
    return next(new Error('No IP address found in socket handshake')); // Reject the connection with an error message
  }

  if (SQL_Manager_Instance.isIPBanned(ip)) {
    return next(new Error('banned'));
  }



  let sessionToken = SQL_Manager_Instance.auth.getSessionTokenFromRequest(socket.request);
  
  console.log('Session token received in socket handshake:', sessionToken);
  if (!sessionToken) {
    socket.isGuest = true; //treat user as guest if no session token is found, this will allow them to play the game but with limited features and no ability to save progress or earn rewards, this can help encourage users to create an account and log in for a better experience while still allowing casual play without an account
    return next(); // Allow the connection to proceed as a guest, but log a warning about the missing session token
  }
  const verifiedUUID = SQL_Manager_Instance.sessionTokenToUUID(sessionToken);
   if (!verifiedUUID) {
      //token exists but isnt valid, not a big deal
        socket.isGuest = true;
        return next();
    }
    const isUUIDBanned = SQL_Manager_Instance.isUUIDBanned(verifiedUUID);
    if (isUUIDBanned) {
      console.warn('Banned user attempted to connect via socket. UUID:', verifiedUUID);
      return next(new Error('banned'));
    }
  socket.UUID = verifiedUUID; // Attach the associated user ID to the request object for use in route handlers
  socket.isGuest = false
  console.log('Valid session token found in request, serving single player page');
  next();
});

io.on('connection', async (socket) => {

  console.log('USER CONNECTED TO SINGLE PLAYER - ID:', socket.id);

  const defaultTimeFrame = 60; // Default time frame in seconds
  //may be updated by user automatically based on their past preferences

  let backEndHandlerInstance =
    new backEndHandler(
      socket.id,
      defaultTimeFrame,
      socket.handshake.address,
      socket.isGuest ? null : socket.UUID
    );
  backEndHandlerInstance.isGuest = socket.isGuest; // Store guest status in the handler instance for easy access during gameplay, this can be used to conditionally allow or restrict certain features based on whether the user is a guest or signed in, e.g., saving progress, earning rewards, etc.


  try {
    await Promise.race([
      // Wait for initialize_data
      new Promise((resolve) => {
        socket.once('initialize_data', (data) => {
          backEndHandlerInstance.frontEndHandler =
            data.frontEndHandler ?? null;
          resolve();
        });
      }),
      // Timeout promise
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Initialization timeout"));
        }, 5000);
      })
    ]);
    // If we reach here, it means initialization attempt is completed (either success or timeout)

    if (backEndHandlerInstance.frontEndHandler) {
      backEndAdminInstance.addSession(backEndHandlerInstance);
      socket.once('disconnect', (reason) => {

        const clientSides = ['transport close', 'transport error', 'ping timeout'];
        const serverSides = ['server namespace disconnect', 'forced server close', 'server shutting down'];

        backEndAdminInstance.removeSession(socket.id);
        if (clientSides.includes(reason)) {
          console.log(`Client side disconnect for socket ${socket.id}. Reason: ${reason}`);
        } else if (serverSides.includes(reason)) {
          console.log(`Server side disconnect for socket ${socket.id}. Reason: ${reason}`);
        } else {
          console.log(`Unknown disconnect reason for socket ${socket.id}. Reason: ${reason}`);
        }

        // any other cleanup, e.g. saving score, clearing timers, etc.
      });
      // client side disconnect reasons //
      //    transport close — user closed the tab, navigated away, or lost connectiontransport close — user closed the tab, navigated away, or lost connection
      //    transport error — network error / connection dropped
      //    ping timeout — client stopped responding to heartbeat pings
      //server side disconnect reason //

      //    server namespace disconnect — you called socket.disconnect(true)
      //    forced server close — server shut down or crashed
      //    server shutting down — server is closing all connections

      socket.emit('initialization_success', { message: 'FrontEndHandler successfully initialized.' });
      backEndHandlerInstance.frontEndHandler.isGuest = backEndHandlerInstance.isGuest; // Ensure the front end handler has the correct guest status for use in the front end during gameplay, this can be used to conditionally allow or restrict certain features based on whether the user is a guest or signed in, e.g., saving progress, earning rewards, etc.
      socket.emit('isGuestStatus', { isGuest: backEndHandlerInstance.isGuest }); // Inform the front end of the user's guest status, this can be used to conditionally allow or restrict certain features based on whether the user is a guest or signed in, e.g., saving progress, earning rewards, etc.
      function gameLoopInit() {
        // wait for user start socket event
        socket.on('start_game', () => {
          console.log('Start game event received')


          if (backEndHandlerInstance.frontEndHandler.gameState === 'active') {
            console.warn('Game already active for socket ID:', socket.id);
            socket.emit('start_game_response', { message: 'Game already active. Please finish the current game before starting a new one.', accepted: false });
            return;
          }

          const isFirstRound = backEndHandlerInstance.frontEndHandler.gameState === 'init';
          let updatedFrontEndHandler = backEndHandlerInstance.createRound(backEndHandlerInstance.frontEndHandler);
          backEndHandlerInstance.frontEndHandler = updatedFrontEndHandler;
          if (isFirstRound) { //only reset time for the first round

            backEndHandlerInstance.roundStartTime = Date.now() + 505; //505 ms, delay to give frontend time to animate new round transition
            //if updating this number, update the setTimeout delay in singlePlayerFrontend.js too

            backEndHandlerInstance.frontEndHandler.score = 0; //initialize score for the first round, following rounds will add to it

            if (!backEndHandlerInstance.isGuest) {
              var username = SQL_Manager_Instance.getUsernameFromUUID(socket.UUID); //TODO implement this to obviously not be hardcoded as a test
              SQL_Manager_Instance.incrementGame(username, 'sp');
            }
          }
          socket.emit('start_game_response', { frontEndHandler: backEndHandlerInstance.frontEndHandler, accepted: true });
        });

        socket.on('frontEndHandler_update', (data) => {
          if (backEndHandlerInstance.isBanned) { return }

          const banLengthDays = 10 / 1440; //10 minutes expressed in days, since the SQL ban function uses days as the unit for ban length
          // 0 represents a kick
          // Infinity, undefined, null represents an indefinite ban
          // NaN, negative numbers will be rejected
          // not guardrailed for random strings or booleans or wtv, dont do it
          // save us the computational power and just give it a proper input

          // Validate the incoming data before updating the front end handler
          const immutableKeys = ['matrix', 'solutions', 'gameState', 'maxBufferSize', 'difficultyValues', 'totalSequencesUploaded', 'isGuest']; //keys that should not be directly manipulated by the client, server will always overwrite these with trusted values, anti-cheat
          const clientOnlyKeys = ['FXVolume', 'BGVolume', 'savedMatrixHeaderHTML', 'savedMainColWidth', 'animating', 'fullscreen']; //keys that we delete from the info to avoid messing with, server does not have to care about these properties
          const objectKeys = new Set(['matrix', 'solutions']); // reference types need deep compare
          const tamperCheckKeys = ['matrix', 'solutions', 'gameState', 'maxBufferSize', 'isGuest']; //keys we want to specifically check for tampering attempts in the console, this can help us identify if users are trying to manipulate critical game data from the client side, while still allowing some flexibility for non-critical data that doesn't impact game integrity, this can be adjusted based on what we want to monitor for potential cheating or manipulation

          for (const key of immutableKeys) {
            const incomingVal = data.frontEndHandler[key];
            const trustedVal = backEndHandlerInstance.frontEndHandler[key];

            if (tamperCheckKeys.includes(key)) {
              const isDifferent = objectKeys.has(key)
                ? JSON.stringify(incomingVal) !== JSON.stringify(trustedVal)
                : incomingVal !== trustedVal;

              if (isDifferent) {
                console.warn(`Tampering attempt detected for key "${key}" from socket ID: ${socket.id}.`);
                try {
                  SQL_Manager_Instance.banUser(socket.handshake.address, socket.UUID ?? null, `Tampering: "${key}"`, banLengthDays);
                } catch (error) {
                  if (error.message.includes('already banned')) {
                    console.warn(`User with socket ID: ${socket.id} is already banned.`);
                  } else {
                    console.error(`Error banning user: ${error.message}`);
                  }
                }
                backEndHandlerInstance.databaseWritten = true; //user doesnt get any further database writes
                backEndHandlerInstance.isBanned = true; //mark the user as banned in the handler instance to prevent any further game interactions during this session, this can help mitigate potential damage from tampering attempts by immediately restricting the user's ability to continue playing or manipulating the game after a tampering attempt is detected
                const reason = 'Client Tampering Detected'

                const createBanMessage = (reason,dayLength) => {
                    if (dayLength < 1) {
                      //convert to minutes
                      const minuteLength = dayLength * 1440


                      return reason + '. ' + `You have been banned for ${minuteLength} ${minuteLength === 1 ? 'minute' : 'minutes'}`
                    }

                    if (dayLength === 0) { //kick
                      return reason + ': You have been kicked.'
                    }

                    if (dayLength >= 1) {
                      return reason + '. ' + `You have been banned for ${dayLength} ${dayLength === 1 ? 'day' : 'days'}`
                    }
                }


                socket.emit('banned', { reason: createBanMessage(reason,banLengthDays), message:'banned' , length: banLengthDays });
                setTimeout(() => socket.disconnect(true), 200); //race condition prevention for emit('banned') latency
                break; // exit the loop after handling the tampering attempt to prevent multiple bans or redundant processing
              }
            }

            data.frontEndHandler[key] = trustedVal;
          }

          if (data.frontEndHandler) {
            backEndHandlerInstance.frontEndHandler = data.frontEndHandler;
          } else {
            console.warn('Invalid front end handler update received for socket ID:', socket.id);
          }
        });

        socket.on('end_game', (sequence_data) => {
          console.log('End game event received for socket ID:', socket.id);
          let round_results = backEndHandlerInstance.endRound(backEndHandlerInstance, sequence_data);
          backEndHandlerInstance.frontEndHandler.gameState = round_results.roundResult;
          backEndHandlerInstance.totalSequencesUploaded += round_results.sequencesUploaded || 0; //keep a running total of sequences uploaded across rounds, this is used for end game stats in the result page
          socket.emit('end_game_response', round_results);
        });

        socket.once('database_write', (data) => {
          console.log('Database write event received for socket ID:', socket.id);
          let score = backEndHandlerInstance.score || 0; //get the user's score for the round, this should have been calculated and stored in the front end handler during gameplay, if not, we can default to 0

          if (!backEndHandlerInstance.isGuest && !backEndHandlerInstance.databaseWritten) {// Only write to the database for signed in users who haven't already triggered a database write for this round, this can help prevent duplicate writes if the user tries to trigger multiple database writes for the same round, while still allowing guests to trigger the event without causing any issues since it will simply not perform any database operations for guests
            backEndHandlerInstance.databaseWritten = true
            let userUUID = backEndHandlerInstance.userInfo.UUID;
            let username = SQL_Manager_Instance.getUsernameFromUUID(userUUID);
            SQL_Manager_Instance.updateGameStats(username, score, 'sp', false);
            SQL_Manager_Instance.addEddies(username, backEndHandlerInstance.scoreToEddies(score)); //add eddies based on the score they achieved in the round, even if they lost, to reward them for their performance and encourage continued play
          } else if (backEndHandlerInstance.isGuest) {
            console.log('skipping database write cuz guest account #2')
          }

        });

        socket.on('timeframe_update', (data) => {
          if (data.timeframe && typeof data.timeframe === 'number' && data.timeframe > 0 && backEndHandlerInstance.frontEndHandler.gameState !== 'active') { // Only allow time frame updates if the game is not currently active
            backEndHandlerInstance.selectedTimeFrame = data.timeframe;
            socket.emit('timeframe_update_response', { message: 'Time frame successfully updated.', accepted: true });
          } else {
            socket.emit('timeframe_update_response', { message: 'Invalid time frame update.', accepted: false });
          }
        });
      }
      gameLoopInit();
    } else {

      console.warn(
        'Invalid FrontEndHandler message: FrontEndHandler not successfully initialized for socket ID:',
        socket.id
      );
      throw new Error('Invalid FrontEndHandler message: FrontEndHandler not successfully initialized.');
    }

  } catch (err) {
    console.warn(
      'Failed to initialize front end handler for socket ID:',
      socket.id
    );
    socket.emit('initialization_error', { message: err.message });
    socket.disconnect(true);
    backEndAdminInstance.removeSession(socket.id);
  }
});

app.use(express.json()); // Middleware to parse JSON bodies from incoming requests

app.post('/auth/log-out', (req, res) => {
  const sessionToken = SQL_Manager_Instance.auth.getSessionTokenFromRequest(req);
  if (sessionToken) {
    SQL_Manager_Instance.deleteSessionToken(sessionToken); // Invalidate the session token on the server side to log the user out
  }
  res.clearCookie('sessionToken'); // Clear the session token cookie on the client side
  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/auth/log-out', (req, res) => {
  res.status(200).sendFile('auth/log-out.html', { root: './public' });
});

app.get('/auth/log-in', (req, res) => {
  res.status(200).sendFile('auth/log-in.html', { root: './public' });
});

app.get('/auth/sign-up', (req, res) => {
  res.status(200).sendFile('auth/sign-up.html', { root: './public' });
});

app.post('/auth/log-in', async (req, res) => {
  // check if username and password pair is valid
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const isValid = await SQL_Manager_Instance.passwordMatch(username, password);
  if (isValid) {
    const userUUID = SQL_Manager_Instance.getUUIDFromUsername(username);
    const sessionToken = SQL_Manager_Instance.createSessionTokenForUUID(userUUID);
    SQL_Manager_Instance.auth.sendSessionTokenAsCookie(res, sessionToken);
    return res.status(200).json({ message: 'Logged in successfully' });
  } else {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }
});

app.get('/', (req, res) => {
  //temp redirect to single player page for testing
  res.redirect('/singlePlayer');
});

app.get('/singlePlayer', (req, res) => {
  const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const queries = req.query;
  const testing_mode = queries.testing === 'true'; // Access the testing query parameter, e.g., /singlePlayer?testing=true
  // Serve singlePlayer html
  if (testing_mode) {
    res.status(200).sendFile('singlePlayer/singlePlayerIndex.html', { root: "./public" });
  } else {
    res.status(200).sendFile('singlePlayer/singlePlayerReference.html', { root: "./public" }, (err) => {
      if (err) {
        console.error('Error sending singlePlayerTitle.html:', err);
        res.status(500).send('Internal Server Error');
      } else {
        //console.log('singlePlayerTitle.html sent successfully to IP:', userIp);
      }
    });
  }
});

app.get('/singlePlayer/reference', (req, res) => {
  res.status(200).sendFile('singlePlayer/singlePlayerReference.html', { root: "./public" });
});
app.get('/singlePlayer/admin', (req, res) => {
  res.status(418).send('COFFEE REQUEST RECEIVED...  CHECK CONSOLE');
});

app.get('/singlePlayer/result', (req, res) => {
  res.status(200).sendFile('singlePlayer/singlePlayerResult.html', { root: "./public" });
});

app.get('/singlePlayer/auth/:page', (req, res) => {
  const allowed = ['log-in', 'log-out', 'sign-up'];
  const page = req.params.page;

  if (!allowed.includes(page)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(`auth/${page}.html`, { root: './public' });
});


app.get('/auth/sign-up', (req, res) => {
  res.status(200).sendFile('auth/sign-up.html', { root: './public' });
});

app.post('/auth/sign-up', (req, res) => {
  //check if username taken
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  const username_existence = SQL_Manager_Instance.getUserByUsername(username)

  if (!username_existence) {
    let newUUID = SQL_Manager_Instance.createUser(username, password);
    return res.status(201).cookie('sessionToken', SQL_Manager_Instance.createSessionTokenForUUID(newUUID)).json({
      message: 'User created successfully.',
      UUID: newUUID,
    })
  } else {
    return res.status(409).json({ message: 'username already taken!' })
  }
})

app.get('/auth/checkForUsername/:username', async (req, res) => {
  try {
    const username = req.params.username?.trim().toLowerCase();
    console.log(username)

    if (!username || username.length < 3) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const user = await SQL_Manager_Instance.getUserByUsername(username);

    return res.status(200).json({
      available: !user
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get('/banned', (req, res) => {
  res.status(403).sendFile('/auth/banned.html', { root: './public' });
});


// Start the server

server. listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(' ') //newline
});


//Browser opens index.html
//        ↓
//Connects to main server via WebSocket
//        ↓
//Server creates unique game session backEndHandler class instance
//        ↓
//Frontend talks directly to that session instance via WebSocket, sending user input and receiving game state updates
//        ↓
//Player leaves/disconnects
//        ↓
//Session destroyed

//if this file is being required(), return the backend admin isntance
module.exports = {
  backEndAdminInstance,
  SQL_Manager_Instance
};