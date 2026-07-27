// hard-db.cjs


const { join } = require("path");
const { SQL_Manager_Instance } = require(join(__dirname,"./server-core.cjs"));
const sql = SQL_Manager_Instance.sql



const TABLE_ORDER = ["users", "friends", "sessions", "banned"];


const { execFileSync } = require('child_process');

function runResetWal() {
    const scriptPath = join(__dirname, '../../personal/shell/WAL_CLEANUP.sh');

    try {
        const output = execFileSync(scriptPath, {
            encoding: 'utf8',
            stdio: 'pipe',
        });
        console.log(output);
        return true;
    } catch (err) {
        console.error('reset-wal.sh failed:');
        console.error(err.stdout);
        console.error(err.stderr);
        throw err;
    }
}



function getRemote() {
  return new sql(process.env.TURSO_DATABASE_URL, {
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// git push --force analogy: local -> remote, remote tables are wiped and replaced
function forcePush(localDb) {
  const remote = getRemote();
  try {
    const runPush = remote.transaction(() => {
      for (const table of [...TABLE_ORDER].reverse()) {
        remote.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of TABLE_ORDER) {
        const rows = localDb.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => "?").join(", ");
        const insert = remote.prepare(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          insert.run(...columns.map((col) => row[col]));
        }
        console.log(`Force-pushed ${rows.length} rows to remote.${table}`);
      }
    });
    runPush();
  } catch (err) {
    console.error("forcePush failed, remote left untouched (transaction rolled back):", err.message);
    throw err;
  } finally {
    remote.close();
  }
}

// git reset --hard analogy: remote -> local, local tables are wiped and replaced
function hardReset(localDb) {
  const remote = getRemote();
  try {
    const runReset = localDb.transaction(() => {
      for (const table of [...TABLE_ORDER].reverse()) {
        localDb.prepare(`DELETE FROM ${table}`).run();
      }
      for (const table of TABLE_ORDER) {
        const rows = remote.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => "?").join(", ");
        const insert = localDb.prepare(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
        );
        for (const row of rows) {
          insert.run(...columns.map((col) => row[col]));
        }
        console.log(`Hard-reset local.${table} with ${rows.length} rows from remote.`);
      }
    });
    runReset();
  } catch (err) {
    console.error("hardReset failed, local left untouched (transaction rolled back):", err.message);
    throw err;
  } finally {
    remote.close();
  }
}

module.exports = { forcePush, hardReset, runResetWal };
