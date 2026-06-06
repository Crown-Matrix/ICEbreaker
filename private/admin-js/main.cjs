//import modules
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

// bring up console
const prompt = () => {
    rl.question('Enter command: ', (command) => {
        if (command === 'help') {
            console.log('help - Show this help message');
            console.log('exit - Exit the admin console');
            console.log('shutdown - Shutdown the server');
        } else if (command === 'exit') {
            console.log('Exiting...');
            rl.close();e
            return;
        } else if (command === 'shutdown') {
            console.log('Shutting down...');
            rl.close();
            process.exit(0);
        } else {
            try {
                let db = singlePlayer.SQL_Manager_Instance.db;
                let sql = singlePlayer.SQL_Manager_Instance;
                let bob = sql.bob;
                let result = eval(command);
                if (result !== undefined) {
                    console.log(result);
                } else {
                    console.log('Command executed successfully (but with no output)');
                }
            } catch (error) {
                console.error('Error executing command:', error);
            }
        }
        prompt(); // loop by recursing
    });
};

setTimeout(() => prompt(), 100);