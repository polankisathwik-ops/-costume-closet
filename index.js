const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
app.use(express.json());

// Database setup
async function initDB() {
  const db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  // Create tables
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
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (actor_id) REFERENCES actors(id),
      FOREIGN KEY (costume_id) REFERENCES costumes(id)
    );
  `);

  return db;
}

// Middleware to make db available
let db;
initDB().then(database => {
  db = database;
  console.log('Database initialized');
});

// Validation helper
function validateCostume(data, isUpdate = false) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('Name is required and must be a non-empty string');
  }

  if (!data.era || typeof data.era !== 'string' || data.era.trim() === '') {
    errors.push('Era is required and must be a non-empty string');
  }

  return errors;
}

function validateActor(data, isUpdate = false) {
  const errors = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.push('Name is required and must be a non-empty string');
  }

  return errors;
}

function validateHire(data) {
  const errors = [];

  if (!data.actor_id || typeof data.actor_id !== 'number') {
    errors.push('Actor ID is required and must be a number');
  }

  if (!data.costume_id || typeof data.costume_id !== 'number') {
    errors.push('Costume ID is required and must be a number');
  }

  return errors;
}

// ============ ACTORS ROUTES ============

// GET all actors
app.get('/actors', async (req, res) => {
  try {
    const actors = await db.all('SELECT * FROM actors');
    res.json(actors);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET one actor
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

// POST add actor
app.post('/actors', async (req, res) => {
  try {
    const errors = validateActor(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const { name, email } = req.body;
    const result = await db.run(
      'INSERT INTO actors (name, email) VALUES (?, ?)',
      [name, email || null]
    );

    const actor = await db.get('SELECT * FROM actors WHERE id = ?', [result.lastID]);
    res.status(201).json(actor);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update actor
app.put('/actors/:id', async (req, res) => {
  try {
    const errors = validateActor(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const { name, email } = req.body;
    const result = await db.run(
      'UPDATE actors SET name = ?, email = ? WHERE id = ?',
      [name, email || null, req.params.id]
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

// DELETE actor
app.delete('/actors/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM actors WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Actor not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ COSTUMES ROUTES ============

// GET all costumes with optional search by era
app.get('/costumes', async (req, res) => {
  try {
    const { era } = req.query;

    let costumes;
    if (era) {
      costumes = await db.all('SELECT * FROM costumes WHERE era = ?', [era]);
    } else {
      costumes = await db.all('SELECT * FROM costumes');
    }

    res.json(costumes);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET one costume
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

// POST add costume
app.post('/costumes', async (req, res) => {
  try {
    const errors = validateCostume(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const { name, era } = req.body;
    const result = await db.run(
      'INSERT INTO costumes (name, era) VALUES (?, ?)',
      [name, era]
    );

    const costume = await db.get('SELECT * FROM costumes WHERE id = ?', [result.lastID]);
    res.status(201).json(costume);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update costume
app.put('/costumes/:id', async (req, res) => {
  try {
    const errors = validateCostume(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const { name, era } = req.body;
    const result = await db.run(
      'UPDATE costumes SET name = ?, era = ? WHERE id = ?',
      [name, era, req.params.id]
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

// DELETE costume
app.delete('/costumes/:id', async (req, res) => {
  try {
    const result = await db.run('DELETE FROM costumes WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Costume not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ HIRSES ROUTES ============

// GET all hires with joined actor and costume names
app.get('/hires', async (req, res) => {
  try {
    const hires = await db.all(`
      SELECT h.id, h.status, h.actor_id, h.costume_id,
             a.name AS actor_name, c.name AS costume_name
      FROM hires h
      JOIN actors a ON h.actor_id = a.id
      JOIN costumes c ON h.costume_id = c.id
    `);
    res.json(hires);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// GET one hire
app.get('/hires/:id', async (req, res) => {
  try {
    const hire = await db.get(`
      SELECT h.id, h.status, h.actor_id, h.costume_id,
             a.name AS actor_name, c.name AS costume_name
      FROM hires h
      JOIN actors a ON h.actor_id = a.id
      JOIN costumes c ON h.costume_id = c.id
      WHERE h.id = ?
    `, [req.params.id]);

    if (!hire) {
      return res.status(404).json({ error: 'Hire not found' });
    }

    res.json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// POST add hire
app.post('/hires', async (req, res) => {
  try {
    const errors = validateHire(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const { actor_id, costume_id } = req.body;

    // Check actor exists
    const actor = await db.get('SELECT id FROM actors WHERE id = ?', [actor_id]);
    if (!actor) {
      return res.status(404).json({ error: 'Actor not found' });
    }

    // Check costume exists
    const costume = await db.get('SELECT id FROM costumes WHERE id = ?', [costume_id]);
    if (!costume) {
      return res.status(404).json({ error: 'Costume not found' });
    }

    const result = await db.run(
      'INSERT INTO hires (actor_id, costume_id, status) VALUES (?, ?, ?)',
      [actor_id, costume_id, 'pending']
    );

    const hire = await db.get(`
      SELECT h.id, h.status, h.actor_id, h.costume_id,
             a.name AS actor_name, c.name AS costume_name
      FROM hires h
      JOIN actors a ON h.actor_id = a.id
      JOIN costumes c ON h.costume_id = c.id
      WHERE h.id = ?
    `, [result.lastID]);

    res.status(201).json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update hire
app.put('/hires/:id', async (req, res) => {
  try {
    const { actor_id, costume_id } = req.body;

    if (actor_id !== undefined) {
      const actor = await db.get('SELECT id FROM actors WHERE id = ?', [actor_id]);
      if (!actor) {
        return res.status(404).json({ error: 'Actor not found' });
      }
    }

    if (costume_id !== undefined) {
      const costume = await db.get('SELECT id FROM costumes WHERE id = ?', [costume_id]);
      if (!costume) {
        return res.status(404).json({ error: 'Costume not found' });
      }
    }

    const updates = [];
    const params = [];

    if (actor_id !== undefined) {
      updates.push('actor_id = ?');
      params.push(actor_id);
    }

    if (costume_id !== undefined) {
      updates.push('costume_id = ?');
      params.push(costume_id);
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

    const hire = await db.get(`
      SELECT h.id, h.status, h.actor_id, h.costume_id,
             a.name AS actor_name, c.name AS costume_name
      FROM hires h
      JOIN actors a ON h.actor_id = a.id
      JOIN costumes c ON h.costume_id = c.id
      WHERE h.id = ?
    `, [req.params.id]);

    res.json(hire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE hire
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

// PATCH hire status (THE TWIST - status flow)
app.patch('/hires/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const validStatuses = ['pending', 'approved', 'done'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const hire = await db.get('SELECT * FROM hires WHERE id = ?', [req.params.id]);
    if (!hire) {
      return res.status(404).json({ error: 'Hire not found' });
    }

    const currentStatus = hire.status;
    const validTransitions = {
      'pending': ['approved'],
      'approved': ['done'],
      'done': []
    };

    if (!validTransitions[currentStatus].includes(status)) {
      return res.status(400).json({ error: 'Invalid status change' });
    }

    await db.run('UPDATE hires SET status = ? WHERE id = ?', [status, req.params.id]);

    const updatedHire = await db.get(`
      SELECT h.id, h.status, h.actor_id, h.costume_id,
             a.name AS actor_name, c.name AS costume_name
      FROM hires h
      JOIN actors a ON h.actor_id = a.id
      JOIN costumes c ON h.costume_id = c.id
      WHERE h.id = ?
    `, [req.params.id]);

    res.json(updatedHire);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;