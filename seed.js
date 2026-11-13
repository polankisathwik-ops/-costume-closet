// Adds demo data so the API is not empty during the live demo.
// Safe to run repeatedly: it only inserts when both actors and costumes are empty.
const { initDB } = require('./index');

const ACTORS = [
  { name: 'Alice Johnson', email: 'alice@example.com' },
  { name: 'Ben Carter', email: 'ben@example.com' },
  { name: 'Priya Nair', email: 'priya@example.com' }
];

const COSTUMES = [
  { name: 'Renaissance Gown', era: 'Renaissance' },
  { name: 'Castle Armor', era: 'Medieval' },
  { name: 'Victorian Tailcoat', era: 'Victorian' },
  { name: 'Flapper Dress', era: '1920s' },
  { name: 'Roman Toga', era: 'Classical' }
];

async function seed() {
  const db = await initDB();

  try {
    const actorCount = await db.get('SELECT COUNT(*) AS count FROM actors');
    const costumeCount = await db.get('SELECT COUNT(*) AS count FROM costumes');

    if (actorCount.count > 0 || costumeCount.count > 0) {
      console.log('Database already has data - skipping seed.');
      return;
    }

    for (const actor of ACTORS) {
      await db.run('INSERT INTO actors (name, email) VALUES (?, ?)', [actor.name, actor.email]);
    }

    for (const costume of COSTUMES) {
      await db.run('INSERT INTO costumes (name, era) VALUES (?, ?)', [costume.name, costume.era]);
    }

    console.log(`Seeded ${ACTORS.length} actors and ${COSTUMES.length} costumes.`);
  } finally {
    await db.close();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
