'use strict';

const express = require('express');
const { pool } = require('../db');

const router = express.Router();
const STATUSES = ['todo', 'in_progress', 'done'];

function validateId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }
  req.taskId = id;
  next();
}

function validateTitle(title) {
  return typeof title === 'string' && title.trim().length > 0 && title.length <= 200;
}

// Create
router.post('/', async (req, res) => {
  const { title, description = null, status = 'todo' } = req.body ?? {};
  if (!validateTitle(title)) {
    return res.status(400).json({ error: 'title is required (1-200 characters)' });
  }
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, description, status)
     VALUES ($1, $2, $3) RETURNING *`,
    [title.trim(), description, status]
  );
  res.status(201).json(rows[0]);
});

// List (optional ?status=done)
router.get('/', async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }
  const { rows } = status
    ? await pool.query('SELECT * FROM tasks WHERE status = $1 ORDER BY id', [status])
    : await pool.query('SELECT * FROM tasks ORDER BY id');
  res.json(rows);
});

// Read one
router.get('/:id', validateId, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.taskId]);
  if (rows.length === 0) return res.status(404).json({ error: 'task not found' });
  res.json(rows[0]);
});

// Partial update
router.patch('/:id', validateId, async (req, res) => {
  const { title, description, status } = req.body ?? {};
  if (title !== undefined && !validateTitle(title)) {
    return res.status(400).json({ error: 'title must be 1-200 characters' });
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }
  const { rows } = await pool.query(
    `UPDATE tasks
        SET title       = COALESCE($1, title),
            description = COALESCE($2, description),
            status      = COALESCE($3, status),
            updated_at  = now()
      WHERE id = $4
      RETURNING *`,
    [title?.trim() ?? null, description ?? null, status ?? null, req.taskId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'task not found' });
  res.json(rows[0]);
});

// Delete
router.delete('/:id', validateId, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [req.taskId]);
  if (rowCount === 0) return res.status(404).json({ error: 'task not found' });
  res.status(204).send();
});

module.exports = router;