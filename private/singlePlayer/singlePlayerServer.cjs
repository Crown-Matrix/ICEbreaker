//code to handle single player interactions and logic
// data will be stored in classes and objects, and will be manipulated based on user input and game state

const codeMatrix = require("../../public/js/codeMatrix.js");

const express = require('express');
const app = express();

const { createServer } = require('node:http');
const { join } = require('node:path');

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
}
let backEndAdminInstance = new backEndAdmin();

class backEndHandler {
  constructor(id, timeframe, ip = null, frontEndHandlerArg = null) {
    this.sessionId = id;
    this.userInfo = {
      ip: ip
    };
    this.creationTime = Date.now();
    this.roundStartTime = null;
    this.selectedTimeFrame = timeframe;
    this.frontEndHandler = frontEndHandlerArg; //should be shortly assigned by front end handler when it emits initialize_data
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
        const node = sequence_data['sequence']  [i];
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
    if (backEndHandlerInstance.roundStartTime + backEndHandlerInstance.selectedTimeFrame * 1000 + toleranceMS < Date.now()) {
      //reject the end round attempt and mark the round as lost due to time out, this can help prevent cheating by trying to end the round after the time limit has been exceeded, while still providing a small grace period to account for any minor timing issues
      // If the current time has exceeded the round start time plus the selected time frame, then the player has run out of time and loses the round
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
    
    //TODO process sequence data and verify its validity for anti cheat purposes, determine score, outcome, etc and send it all back to the front end
    // verify the sequence data by ensuring the row/column mode is being followed, and the coordinates are valid
    // convert the sequence data to a buffer using the backEnd saved matrix and the sequence of coordinates
    // use this buffer to compute which solutions were installed

    let solution_result_json = codeMatrix.checkforSolutions(bufferString, frontEndHandlerArg.solutions)
    
    let scoreGained = 0;
    let all_solved = true;
    for (const [i, v] of Object.entries(solution_result_json)) {
      if (v) {
        scoreGained += difficultyValues[i] || 0; // Add the corresponding score for the solution type, default to 0 if type is unrecognized
      } else {
        all_solved = false;
      }
    }
    
    // from those results, compute, the round result, resultType, and scoreGained
    // transmit those back to the front end via json
    return {
      roundResult: all_solved ? 'won' : 'lost', //'[won,lost]'
      resultType: all_solved ? 'all_uploaded' : 'buffer_full', //[buffer_full, timeout, all_uploaded]
      scoreGained: scoreGained, //some integer score based on the user's performance in the round, can be 0 if they lost, or some positive integer if they won, the scoring system can be based on factors like time taken to solve, number of moves, etc
      message: "Round ended successfully."
    };
  }
}

app.use(express.static('public'));
process.env


io.on('connection', async (socket) => {

  console.log('USER CONNECTED TO SINGLE PLAYER - ID:', socket.id);

  const defaultTimeFrame = 60; // Default time frame in seconds

  let backEndHandlerInstance =
    new backEndHandler(
      socket.id,
      defaultTimeFrame,
      socket.handshake.address,
      null
    );

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

      socket.emit('initialization_success', { message: 'FrontEndHandler successfully initialized.' });
      console.log(
        'Front end handler successfully initialized for socket ID:',
        socket.id
      );

      function gameLoopInit() {
        // wait for user start socket event
        socket.on('start_game', () => {
          console.log('Start game event received for socket ID:', socket.id);
          console.log('Current game state:', backEndHandlerInstance.frontEndHandler.gameState);

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
          }
          socket.emit('start_game_response', { frontEndHandler: backEndHandlerInstance.frontEndHandler, accepted: true });
          console.log('Game successfully started for socket ID:', socket.id);
        });

        socket.on('frontEndHandler_update', (data) => {
          console.log('Front end handler update received for socket ID:', socket.id);
          // Validate the incoming data before updating the front end handler
          const immutableKeys = ['matrix', 'solutions', 'sequence', 'gameState', 'maxBufferSize','difficultyValues']; //keys that should not be directly manipulated by the client, server will always overwrite these with trusted values, anti-cheat
          const clientOnlyKeys = ['FXVolume','BGVolume','savedMatrixHeaderHTML','savedMainColWidth','animating',]; //keys that we delete from the info to avoid messing with, server does not have to care about these properties
          const objectKeys = new Set(['matrix', 'solutions', 'sequence']); // reference types need deep compare
          
          immutableKeys.forEach(key => {
            const incomingVal = data.frontEndHandler[key];
            const trustedVal = backEndHandlerInstance.frontEndHandler[key];

            const isDifferent = objectKeys.has(key)
              ? JSON.stringify(incomingVal) !== JSON.stringify(trustedVal)
              : incomingVal !== trustedVal;

            if (isDifferent) {
              console.warn(`Tampering attempt detected for key "${key}" from socket ID: ${socket.id}.`);
            }
            data.frontEndHandler[key] = trustedVal; // always overwrite with trusted value regardless
          });
          clientOnlyKeys.forEach(key => {
            delete data.frontEndHandler[key]; //less work for server, also avoids accidentally overwriting user preferencesc
          });

          if (data.frontEndHandler) {
            backEndHandlerInstance.frontEndHandler = data.frontEndHandler;
          } else {
          }
        });

        socket.on('end_game', (sequence_data) => {
          console.log('End game event received for socket ID:', socket.id);
          let round_results = backEndHandlerInstance.endRound(backEndHandlerInstance, sequence_data);
          backEndHandlerInstance.frontEndHandler.gameState = round_results.roundResult;
          socket.emit('end_game_response', round_results);
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

app.get('/', (req, res) => {
  //temp redirect to single player page for testing
  res.redirect('/singlePlayer');
});

app.get('/singlePlayer', (req, res) => {
  // Serve singlePlayer html
  res.status(200).sendFile('singlePlayer/singlePlayerIndex.html', { root: "./public" });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
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