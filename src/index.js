'use strict';

const config = require('./config');
const app = require('./app');
const { pool } = require('./db');

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Task API listening on port ${config.port}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await pool.end();
    console.log('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref(); // safety net
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));