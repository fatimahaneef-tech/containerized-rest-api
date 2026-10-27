'use strict';

const { Pool } = require('pg');
const { db } = require('./config');

const pool = new Pool({
  ...db,
  max: 10,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
});

// Without this, an error on an idle client would crash the process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

module.exports = { pool };