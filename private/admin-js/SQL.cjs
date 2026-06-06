const sql = require('better-sqlite3')
const path = require('path');
const bcrypt = require('bcrypt');
const { randomUUID, hash } = require('crypto');




const db = new sql(path.join(__dirname, '../database/ICEbreaker.db'))
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');


function hashPassword(password) {
    const SALT_ROUNDS = 12;
    let hash = bcrypt.hashSync(password, SALT_ROUNDS);
    return hash
}

//name convention:
//ooo_Oooo
//standard js convention but with an underscore

function initializeUserTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            account_UUID TEXT UNIQUE NOT NULL,
            sp_games_Played INTEGER DEFAULT 0,
            mp_games_Played INTEGER DEFAULT 0,
            mp_games_Won INTEGER DEFAULT 0,
            sp_games_Finished INTEGER DEFAULT 0,
            mp_games_Finished INTEGER DEFAULT 0,
            account_Creation_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            sp_average_Score REAL DEFAULT NULL,
            mp_average_Score REAL DEFAULT NULL,
            last_Login_Date TEXT DEFAULT CURRENT_TIMESTAMP,
            account_Tier INTEGER DEFAULT 0,
            eddies INTEGER DEFAULT 0
        )
    `
    db.prepare(createTableStmt).run()
}


`
    Account Tiers:
0 - default, no extra perks
1 - VIP, ability to use emotes / costs eddies or irl money
2 - PREMIUM, ability to use emotes + animation skips + opponent distractions in multiplayer / costs only irl money
`


function initializeFriendsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS friends (
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, friend_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (friend_id) REFERENCES users(id)    
        )
    `
    db.prepare(createTableStmt).run()
}


function initializeSessionsTable() {
    const createTableStmt = `
        CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY,
        account_UUID TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL DEFAULT (DATETIME('now', '+7 days')),
        FOREIGN KEY (account_UUID) REFERENCES users(account_UUID)
        )
    `
    db.prepare(createTableStmt).run()
}

//max username length: 64
//max password length: 64
//session lifespan: 7 days

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


const updateGameStats = protected_sql((username, appended_score, gameType, gameWon ) => {

    const query = db.prepare(`SELECT ${gameType}_average_Score,${gameType}_games_Finished FROM users WHERE username = ?`).get(username)
    if (!query) {
        throw new Error('User not found');
    }
    if (gameType === 'sp') {
        gameWon = false; //there is no win condition for single player, so we can just set this to false to avoid any issues with the games_Won stat
    }
    const avg_score = query[`${gameType}_average_Score`];
    const gamesFinished = query[`${gameType}_games_Finished`];
    const new_avg_score = avg_score !== null
        ? (avg_score * gamesFinished + appended_score) / (gamesFinished + 1)
        : appended_score;
    //update average score
    db.prepare(`UPDATE users SET ${gameType}_average_Score = ?,mp_games_Won = mp_games_Won + ?, ${gameType}_games_Finished = ${gameType}_games_Finished + 1 WHERE username = ?`)
        .run(
            new_avg_score
            , (gameWon && gameType === 'mp')  ? 1 : 0
            , username
        )
    return true
});



const incrementGame = protected_sql((username, gameType) => {
    if (gameType !== 'sp' && gameType !== 'mp') {
        throw new Error('Invalid game type');
    }
    const query = db.prepare(`UPDATE users SET ${gameType}_games_Played = ${gameType}_games_Played + 1 WHERE username = ?`).run(username);
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
})


const scoreToEddies = (score /*should be a multiple of 100*/) => {
    const eddies = (Math.floor(score / 100) * 3) + 25
    //
    return eddies
}

const sendFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    // Check if the friend request already exists
    try {
        const existingRequest = db.prepare(`
        SELECT * FROM friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
    `).get(userId, friendId, friendId, userId);
        if (existingRequest) {
            if (existingRequest.user_id == userId) {
                //request has already been sent by the user
                return false
            } else if (existingRequest.user_id == friendId) {
                //request has already been sent from the receiver
                //automatically accept the request
                db.prepare("UPDATE friends SET status = 'accepted' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)").run(userId, friendId, friendId, userId)
                return true;
            }
        }
    } catch (error) {
        console.error('Error checking existing friend request:', error);
        throw error;
    }

    // Insert the new friend request
    try {
        db.prepare('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)').run(userId, friendId);
    } catch (error) {
        console.error('Error inserting friend request:', error);
        throw error;
    }
    return true;
});

const acceptFriendRequest = protected_sql((userId, friendId) => {
    if (userId === friendId) throw new Error('Cannot send friend request to yourself');
    try {
        const existingRequest = db.prepare(`
        SELECT * FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).get(friendId, userId);

        if (!existingRequest) {
            // No pending request found
            return false;
        }

        // Update the friend request to accepted
        db.prepare("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(friendId, userId);
        return true;
    } catch (error) {
        console.error('Error accepting friend request:', error);
        throw error;
    }
});


const friendsCount = (userId) => db.prepare(`
    SELECT COUNT(*) AS count FROM friends 
    WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
`).get(userId, userId).count;



const addTestingData = () => {
    const testUsers = [
        { username: 'alice', password: 'password123' },
        { username: 'bob', password: 'password456' },
        { username: 'charlie', password: 'password789' },
    ];

    testUsers.forEach(user => {
        try {
            createUser(user.username, user.password);
            console.log(`Created user: ${user.username}`);
        } catch (err) {
            console.error(`Error creating user ${user.username}:`, err.message);
        }
    });

    const alice = getUserByUsername('alice');
    const bob = getUserByUsername('bob');
    const charlie = getUserByUsername('charlie');

    sendFriendRequest(alice.id, bob.id);
    sendFriendRequest(charlie.id, alice.id);
    acceptFriendRequest(alice.id, charlie.id);
    console.log('Friend requests/accepts sent')
}


const wipeDatabase = () => {
    db.pragma('foreign_keys = OFF');
    db.prepare('DROP TABLE IF EXISTS friends').run();
    db.prepare('DROP TABLE IF EXISTS users').run();
    db.pragma('foreign_keys = ON');
    initializeUserTable();
    initializeFriendsTable();
    initializeSessionsDatabase();
    console.log('Database wiped and re-initialized');
}


const addEddies = protected_sql((username, eddiesToAdd) => {
    const query = db.prepare('UPDATE users SET eddies = eddies + ? WHERE username = ?').run(eddiesToAdd, username);
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
})



const getUsernameFromUUID = (UUID) => {
    const query = db.prepare('SELECT username FROM users WHERE account_UUID = ?').get(UUID)

    if (!query) {
        throw new Error('user not found!')
    }

    return query.username
}

const updateLastLoginDate = protected_sql((username) => {
    const query = db.prepare('UPDATE users SET last_Login_Date = CURRENT_TIMESTAMP WHERE username = ?').run(username);
    if (query.changes === 0) {
        throw new Error('User not found');
    }
    return true
});




//auth

const createSessionToken = (UUID) => {
    //create session token to write

    let opaque = hash('sha512', crypto.randomBytes(32)).toString('hex');
    
    // write opaque with UUID

    db.prepare(`
        INSERT INTO sessions (session_token,account_UUID)
        VALUES (?,?)
    `).run(opaque,UUID)

    return opaque //to give back to user for http-only cookie storage
}

const sessionTokenToUUID = (token) => {
    //check if token exists, grab UUID if exists and is not expired
    //if expired, delete the token and return null, user will have to log in again to get a new token
    const query = db.prepare(`
        SELECT account_UUID, (DATETIME('now') >= expires_at) as is_expired
        FROM sessions
        WHERE session_token = ?
        `).get(token);


    if (!query) return null; //token not found, user is not authenticated

    if (query.is_expired) {
        //token is expired, delete it
        db.prepare(`
            DELETE FROM sessions
            WHERE session_token = ?
        `).run(token);

        return null;
    }

    return query.account_UUID
}


const deleteSessionTokenFromUUID = (UUID) => {
    const query = db.prepare('DELETE FROM sessions WHERE account_UUID = ?').run(UUID)
    if (query.changes == 0) {throw new Error('Session token not found')}
    return query.changes
}


const deleteSessionToken = (token) => {
    const query = db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
    if (query.changes == 0) {throw new Error('Session token not found')}
    return query.changes
}


const clearExpiredSessionTokens = () => {
    const query = db.prepare('DELETE FROM sessions WHERE expires_at <= DATETIME("now")').run();
    return query.changes
}


const clearAllSessionTokens = () => {
    const query = db.prepare('DELETE FROM sessions').run();
    return query.changes
}
// single player flow:


//user starts game
// incrementGame ran to increase games played
//user finishes game
//available data: username || UUID, score, game_finished(implied true), can also calculate eddie from score



const bob = '583f5934-d403-42c1-ae75-67b6fa4f5831'

module.exports = {
    db,
    bob,
    initializeUserTable,
    initializeFriendsTable,
    initializeSessionsTable,
    getAllUsers,
    getUserByUsername,
    createUser,
    passwordMatch,
    deleteUser,
    updateGameStats,
    incrementGame,
    friendsCount,
    sendFriendRequest,
    acceptFriendRequest,
    scoreToEddies,
    addTestingData,
    wipeDatabase,
    getUsernameFromUUID,
    addEddies,
    updateLastLoginDate,
    createSessionToken,
    sessionTokenToUUID,
    deleteSessionTokenFromUUID,
    deleteSessionToken,
    clearExpiredSessionTokens,
    clearAllSessionTokens
}
