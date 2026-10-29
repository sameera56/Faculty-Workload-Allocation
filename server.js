require('dotenv').config();
const app = require('./app');
const db = require('./config/db');

const port = Number(process.env.PORT || 3000);
let server;

async function start() {
  try {
    await app.locals.sessionStore.onReady();
    await db.query('SELECT 1');
    server = app.listen(port, () => {
      console.log(`Faculty Workload System listening at http://localhost:${port}`);
    });
  } catch (error) {
    const reason = error.errors?.map((cause) => cause.message).join('; ')
      || error.message
      || error.code
      || String(error);
    console.error('Startup failed. Check MySQL availability, database settings, and schema initialization:', reason);
    await app.locals.sessionStore.close();
    await db.end();
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received; closing server.`);
  const closeConnections = async () => {
    await app.locals.sessionStore.close();
    await db.end();
    process.exit(0);
  };
  if (server) server.close(closeConnections);
  else await closeConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
start();
