// not implemented yet ; will eventually handle all multiplayer interactions and logic
//multiPlayerServer.cjs


const { join } = require('path');

const os = require('os');



const { SQL_Manager_Instance, PORT, codeMatrix, express, app, createServer, cookieParser, Server, server, singlePlayer } = require(join(__dirname, '../admin-js/server-core.cjs'));
const SERVER_START_TIME = Date.now();


const difficultyValues = require(join(__dirname, '../Server-Imports/multiPlayer/difficultyValues.json'));

const io = new Server(server, {
  path: "/multiPlayer/socket"
});