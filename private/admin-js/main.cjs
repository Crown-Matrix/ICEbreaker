
//create /database folder if it doesn't exist
const fs = require('fs');
const path = require('path');

const databasePath = path.join(__dirname, '../database');
if (!fs.existsSync(databasePath)) {
    fs.mkdirSync(databasePath);
}

singlePlayer = require('../singlePlayer/singlePlayerServer.cjs')
//multiPlayer = require('../multiPlayer/multiPlayerServer.cjs')
singlePlayerAdminInstance = singlePlayer.backEndAdminInstance;



//console.log('multiPlayerAdmin:', multiPlayer.backEndAdminInstance);