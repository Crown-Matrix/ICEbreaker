const sql = require('better-sqlite3')
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');



const db = new sql(path.join(__dirname, '../database/ICEbreaker.db'))
db.pragma('journal_mode = WAL');


function hashPassword(password) {

    function bcrypt_hash(data) {
        let hash = bcrypt.hashSync(data, 12);
        return hash;
    }

    const bytes = bcrypt_hash(password);
    return bytes
}


function initializeUserTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            Account_UUID_8 TEXT UNIQUE NOT NULL,
            Games_Played INTEGER DEFAULT 0,
            Games_Won INTEGER DEFAULT 0,
            Games_Finished INTEGER DEFAULT 0,
            Account_Creation_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            Average_Score REAL DEFAULT NULL,
            Last_Login_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            Premium_Account INTEGER DEFAULT 0,
            Friend_List TEXT DEFAULT '[]'
        )
    `
    db.prepare(createTableStmt).run()
}



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
    const existing = getUserByUsername(username);
    if (existing) throw new Error('Username already taken');
    const info = db.prepare('INSERT INTO users (username, password, Account_UUID_8) VALUES (?, ?, ?)')
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





module.exports = {
    initializeUserTable,
    getAllUsers,
    getUserByUsername,
    createUser,
    passwordMatch,
    deleteUser
}
