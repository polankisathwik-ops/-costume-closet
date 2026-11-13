const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

app.use(express.json());

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function initDB(filename = DB_PATH) {
  const db = await open({
    filename,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT
    );

    CREATE TABLE IF NOT EXISTS costumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      era TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER NOT NULL,
      costume_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY (actor_id) REFERENCES actors(id),
      FOREIGN KEY (costume_id) REFERENCES costumes(id)
    );
  `);

  return db;
}

let db;

// Every request needs a ready database. This keeps the API from crashing if a
// request arrives in the split second before initDB() has finished.
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({
      error: 'Database is still initializing, please try again in a moment.'
    });
  }
  next();
});

// ---------------------------------------------------------------------------
// Validation and status rules
// ---------------------------------------------------------------------------

const STATUSES = ['pending', 'approved', 'done'];
const NEXT_STATUS = { pending: 'approved', approved: 'done', done: null };

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function validateCostume(body) {
  const errors = [];

  if (!isNonEmptyString(body.name)) {
    errors.push('name is required and must be a non-empty string');
  }

  if (!isNonEmptyString(body.era)) {
    errors.push('era is required and must be a non-empty string');
  }

  return errors;
}

function validateActor(body) {
  const errors = [];

  if (!isNonEmptyString(body.name)) {
    errors.push('name is required and must be a non-empty string');
  }

  return errors;
}

function validateHire(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.actor_id !== undefined) {
    if (!isPositiveInteger(body.actor_id)) {
      errors.push('actor_id is required and must be a positive integer');
    }
  }

  if (!partial || body.costume_id !== undefined) {
    if (!isPositiveInteger(body.costume_id)) {
      errors.push('costume_id is required and must be a positive integer');
    }
  }

  return errors;
}

function sendValidationError(res, errors) {
  return res.status(400).json({ error: errors.join('; ') });
}

const HIRE_SELECT = `
  SELECT h.id,
         h.actor_id,
         h.costume_id,
         h.status,
         a.name AS actor_name,
         c.name AS costume_name
  FROM hires h
  JOIN actors a ON a.id = h.actor_id
  JOIN costumes c ON c.id = h.costume_id
`;

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------

app.get('/actors', async (req, res) => {
  try {
    const actors = await db.all('SELECT * FROM actors ORDER BY id');
    res.json(actors);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/actors/:id', async (req, res) => {
  try {
    const actor = await db.get('SELECT * FROM actors WHERE id = ?', [req.params.id]);
    if (!actor) {
      return res.status(404).json({ error: 'Actor not found' });
    }
    res.json(actor);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/actors', async (req, res) => {
  try {
    const errors = validateActor(req.body || {});
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const { name, email } = req.body;
    const result = await db.run(
      'INSERT INTO actors (name, email) VALUES (?, ?)',
      [name.trim(), email || null]
    );

    const actor = await db.get('SELECT * FROM actors WHERE id = ?', [result.lastID]);
    res.status(201).json(actor);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/actors/:id', async (req, res) => {
  try {
    const errors = validateActor(req.body || {});
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const { name, email } = req.body;
    const result = await db.run(
      'UPDATE actors SET name = ?, email = ? WHERE id = ?',
      [name.trim(), email || null, req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Actor not found' });
    }

    const actor = await db.get('SELECT * FROM actors WHERE id = ?', [req.params.id]);
    res.json(actor);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/actors/:id', async (req, res) => {
  try {
    const actor = await db.get('SELECT id FROM actors WHERE id = ?', [req.params.id]);
    if (!actor) {
      return res.status(404).json({ error: 'Actor not found' });
    }

    // Remove dependent hires so the join endpoint never returns orphan rows.
    await db.run('DELETE FROM hires WHERE actor_id = ?', [req.params.id]);
    await db.run('DELETE FROM actors WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// Costumes
// ---------------------------------------------------------------------------

// GET /costumes            -> all costumes
// GET /costumes?era=...    -> search by era (case-insensitive)
app.get('/costumes', async (req, res) => {
  try {
    const { era } = req.query;

    if (era !== undefined) {
      if (!isNonEmptyString(era)) {
        return res.status(400).json({ error: 'era must be a non-empty string' });
      }

      const costumes = await db.all(
        'SELECT * FROM costumes WHERE LOWER(era) = LOWER(?) ORDER BY id',
        [era.trim()]
      );
      return res.json(costumes);
    }

    const costumes = await db.all('SELECT * FROM costumes ORDER BY id');
    res.json(costumes);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/costumes/:id', async (req, res) => {
  try {
    const costume = await db.get('SELECT * FROM costumes WHERE id = ?', [req.params.id]);
    if (!costume) {
      return res.status(404).json({ error: 'Costume not found' });
    }
    res.json(costume);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/costumes', async (req, res) => {
  try {
    const errors = validateCostume(req.body || {});
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const { name, era } = req.body;
    const result = await db.run(
      'INSERT INTO costumes (name, era) VALUES (?, ?)',
      [name.trim(), era.trim()]
    );

    const costume = await db.get('SELECT * FROM costumes WHERE id = ?', [result.lastID]);
    res.status(201).json(costume);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/costumes/:id', async (req, res) => {
  try {
    const errors = validateCostume(req.body || {});
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const { name, era } = req.body;
    const result = await db.run(
      'UPDATE costumes SET name = ?, era = ? WHERE id = ?',
      [name.trim(), era.trim(), req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Costume not found' });
    }

    const costume = await db.get('SELECT * FROM costumes WHERE id = ?', [req.params.id]);
    res.json(costume);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/costumes/:id', async (req, res) => {
  try {
    const costume = await db.get('SELECT id FROM costumes WHERE id = ?', [req.params.id]);
    if (!costume) {
      return res.status(404).json({ error: 'Costume not found' });
    }

    await db.run('DELETE FROM hires WHERE costume_id = ?', [req.params.id]);
    await db.run('DELETE FROM costumes WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// Hires
// ---------------------------------------------------------------------------

// Join endpoint: every hire with the actor and costume names attached.
app.get('/hires', async (req, res) => {
  try {
    const hires = await db.all(`${HIRE_SELECT} ORDER BY h.id`);
    res.json(hires);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/hires/:id', async (req, res) => {
  try {
    const hire = await db.get(`${HIRE_SELECT} WHERE h.id = ?`, [req.params.id]);
    if (!hire) {
      return res.status(404).json({ error: 'Hire not found' });
    }
    res.json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/hires', async (req, res) => {
  try {
    const errors = validateHire(req.body || {});
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const { actor_id, costume_id } = req.body;

    const actor = await db.get('SELECT id FROM actors WHERE id = ?', [actor_id]);
    if (!actor) {
      return res.status(404).json({ error: 'Actor not found' });
    }

    const costume = await db.get('SELECT id FROM costumes WHERE id = ?', [costume_id]);
    if (!costume) {
      return res.status(404).json({ error: 'Costume not found' });
    }

    // New hires always start at pending; a client cannot skip the flow.
    const result = await db.run(
      'INSERT INTO hires (actor_id, costume_id, status) VALUES (?, ?, ?)',
      [actor_id, costume_id, 'pending']
    );

    const hire = await db.get(`${HIRE_SELECT} WHERE h.id = ?`, [result.lastID]);
    res.status(201).json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/hires/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateHire(body, { partial: true });
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    const updates = [];
    const params = [];

    if (body.actor_id !== undefined) {
      const actor = await db.get('SELECT id FROM actors WHERE id = ?', [body.actor_id]);
      if (!actor) {
        return res.status(404).json({ error: 'Actor not found' });
      }
      updates.push('actor_id = ?');
      params.push(body.actor_id);
    }

    if (body.costume_id !== undefined) {
      const costume = await db.get('SELECT id FROM costumes WHERE id = ?', [body.costume_id]);
      if (!costume) {
        return res.status(404).json({ error: 'Costume not found' });
      }
      updates.push('costume_id = ?');
      params.push(body.costume_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    const result = await db.run(
      `UPDATE hires SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Hire not found' });
    }

    const hire = await db.get(`${HIRE_SELECT} WHERE h.id = ?`, [req.params.id]);
    res.json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/hires/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM hires WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Hire not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// THE TWIST: status may only move one step forward:
// pending -> approved -> done
app.patch('/hires/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};

    if (status === undefined) {
      return res.status(400).json({ error: 'status is required' });
    }

    if (!STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status value. Allowed values: ${STATUSES.join(', ')}`
      });
    }

    const hire = await db.get('SELECT * FROM hires WHERE id = ?', [req.params.id]);
    if (!hire) {
      return res.status(404).json({ error: 'Hire not found' });
    }

    if (NEXT_STATUS[hire.status] !== status) {
      return res.status(400).json({ error: 'Invalid status change' });
    }

    await db.run('UPDATE hires SET status = ? WHERE id = ?', [status, req.params.id]);

    const updatedHire = await db.get(`${HIRE_SELECT} WHERE h.id = ?`, [req.params.id]);
    res.json(updatedHire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// Health, 404 and error handling
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.json({
    name: 'CostumeCloset Theatre API',
    endpoints: ['/actors', '/costumes', '/hires', '/hires/:id/status']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(port = PORT, filename = DB_PATH) {
  db = await initDB(filename);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      const actualPort = server.address().port;
      console.log(`CostumeCloset API listening on http://localhost:${actualPort}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

async function closeDB() {
  if (db) {
    await db.close();
    db = null;
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app, initDB, start, closeDB, DB_PATH };
