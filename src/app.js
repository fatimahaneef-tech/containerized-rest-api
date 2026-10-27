'use strict';

const express = require('express');
const { pool } = require('./db');
const tasksRouter = require('./routes/tasks');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Liveness: is the process running? Never touches the database.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

// Readiness: can the app reach its database?
app.get('/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', database: 'connected' });
  } catch (err) {
    console.error('Readiness check failed:', err.message);
    res.status(503).json({ status: 'not ready', database: 'unreachable' });
  }
});

app.use('/tasks', tasksRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'route not found' });
});

// Central error handler (Express 5 routes it async errors automatically).
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }

  const connectionCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET'];
  const isDbDown =
    connectionCodes.includes(err.code) ||
    (err.code && String(err.code).startsWith('08')) || // PostgreSQL connection exceptions
    err.code === '57P03' || // database starting up
    /timeout exceeded when trying to connect|Connection terminated/i.test(err.message);

  if (isDbDown) {
    console.error('Database unavailable:', err.message);
    return res.status(503).json({ error: 'database unavailable' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;