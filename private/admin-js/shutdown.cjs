// shutdown.cjs
const envWrite = require("./envWrite.cjs");
const { forcePush } = require("./hard-db.cjs");

const SHUTDOWN_DEADLINE_MS = 25_000; // leave a few seconds of margin before Render's SIGKILL

function registerShutdownHandlers(SQL_Manager_Instance, SQL_TYPE) {
  let cleaningUp = false;

  async function cleanup(signal) {
    if (cleaningUp) return;
    cleaningUp = true;

    console.log(`\nReceived ${signal}`);

    // hard safety net: if cleanup hangs, bail loudly instead of waiting for SIGKILL
    const deadline = setTimeout(() => {
      console.error(`Shutdown cleanup exceeded ${SHUTDOWN_DEADLINE_MS}ms, aborting. Remote may be stale.`);
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    deadline.unref?.(); // don't let this timer itself keep the process alive if cleanup finishes first

    let succeeded = false;
    try {
      if (SQL_TYPE === "turso") {
        console.log('Syncing to remote before exit...');
        await SQL_Manager_Instance.sync();
        console.log("Final sync to remote complete.");
        succeeded = true;
      } else if (SQL_TYPE === "no_turso") {
        console.log('remote sync disabled...');
        succeeded = true;
      }
    } catch (err) {
      console.error("Shutdown sync failed, remote may be stale:", err.message);
    }

    clearTimeout(deadline);

    if (succeeded) {
      envWrite.updateEnvValue("LAST_SQL_MODE", SQL_TYPE === "turso" ? "true" : "false");
    }

    process.exit(succeeded ? 0 : 1);
  }

  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
}

module.exports = { registerShutdownHandlers };