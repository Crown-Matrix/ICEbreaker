const sql = require('better-sqlite3')
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');



const db = new sql(path.join(__dirname, '../database/ICEbreaker.db'))
db.pragma('journal_mode = WAL');


function hashPassword(password) {

    let hash = bcrypt.hashSync(password, 12);
    return hash
}

//name convention

//ooo_Oooo
//standard js convention but with an underscore
function initializeUserTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            account_UUID TEXT UNIQUE NOT NULL,
            games_Played INTEGER DEFAULT 0,
            games_Won INTEGER DEFAULT 0,
            games_Finished INTEGER DEFAULT 0,
            account_Creation_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            average_Score REAL DEFAULT NULL,
            last_Login_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            premium_Account INTEGER DEFAULT 0,  
            friend_List TEXT DEFAULT '[]'
        )
    `
    db.prepare(createTableStmt).run()
}

//max username length: 64
//max password length: 64


function protected_sql(func) {
    const transaction = db.transaction(func);
    return (...args) => {
        try {
            return transaction(...args);
        } catch (err) {
            console.error('SQL transaction failed:', err.message);
            throw err; // re-throw so the caller can handle it too
        }
    };
}

// simple reads — no transaction needed
const getAllUsers = () => db.prepare('SELECT * FROM users').all();

const getUserByUsername = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);

// needs transaction — read then write
const createUser = protected_sql((username, password) => {
    if (username.length > 64) {
        throw new Error('Max name length exceeded')
    } else if (password.length > 64) {
        throw new Error('Max password length exceeded')
    }
    const existing = getUserByUsername(username);
    if (existing) throw new Error('Username already taken');
    const info = db.prepare('INSERT INTO users (username, password, account_UUID) VALUES (?, ?, ?)')
        .run(username, hashPassword(password), randomUUID());
    return info.lastInsertRowid;
});

// no transaction needed — single read + bcrypt compare, no write
const passwordMatch = (username, password_attempt) => {
    const user = getUserByUsername(username);
    if (!user) return false;
    return bcrypt.compareSync(password_attempt, user.password);
};


const deleteUser = protected_sql((username) => {
    const existing = getUserByUsername(username);
    if (!existing) throw new Error('User not found');
    db.prepare('DELETE FROM users WHERE username = ?').run(username);
});


const updateGameStats = protected_sql((username,appended_score, gameWon) => {
    
    const query = db.prepare('SELECT average_Score,games_Finished FROM users WHERE username = ?').get(username)
    if (!query) {
        throw new Error('User not found');
    }
    const avg_score = query.average_Score
    const gamesFinished = query.games_Finished
    const new_avg_score = avg_score !== null
        ? (avg_score * gamesFinished + appended_score) / (gamesFinished + 1)
        : appended_score;
        //update average score
    db.prepare('UPDATE users SET average_Score = ?, games_Won = games_Won + ?, games_Finished = games_Finished + 1 WHERE username = ?')
    .run(
        new_avg_score
        , gameWon ? 1 : 0
        , username
    )
    return true
})



const incrementGame = protected_sql( (username) => {
        const query = db.prepare('UPDATE users SET games_Played = games_Played + 1 WHERE username = ?').run(username)
        if (query.changes === 0) {
            throw new Error('User not found');
        }
        return true
})




if (false) { //
module.exports = {
    initializeUserTable,
    getAllUsers,
    getUserByUsername,
    createUser,
    passwordMatch,
    deleteUser,
    updateGameStats,
    incrementGame
}}