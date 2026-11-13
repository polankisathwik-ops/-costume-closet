const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { start, closeDB } = require('../index');

let server;
let baseUrl;
let dbPath;
let actorId;
let costumeId;
let hireId;

async function api(method, endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

before(async () => {
  dbPath = path.join(os.tmpdir(), `costume-closet-test-${process.pid}-${Date.now()}.sqlite`);
  server = await start(0, dbPath);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const actor = await api('POST', '/actors', {
    name: 'Test Actor',
    email: 'actor@example.com'
  });
  actorId = actor.body.id;

  const costume = await api('POST', '/costumes', {
    name: 'Test Gown',
    era: 'Renaissance'
  });
  costumeId = costume.body.id;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDB();
  fs.rmSync(dbPath, { force: true });
});

// ---------------------------------------------------------------------------
// Twist: the three required tests
// ---------------------------------------------------------------------------

test('Test 1: adding a hire returns 201 and starts as pending', async () => {
  const { status, body } = await api('POST', '/hires', {
    actor_id: actorId,
    costume_id: costumeId
  });

  assert.equal(status, 201);
  assert.equal(body.status, 'pending');
  assert.equal(body.actor_name, 'Test Actor');
  assert.equal(body.costume_name, 'Test Gown');
  hireId = body.id;
});

test('Test 2: pending -> approved returns 200', async () => {
  const { status, body } = await api('PATCH', `/hires/${hireId}/status`, {
    status: 'approved'
  });

  assert.equal(status, 200);
  assert.equal(body.status, 'approved');
});

test('Test 3: approved -> pending returns 400 with "Invalid status change"', async () => {
  const { status, body } = await api('PATCH', `/hires/${hireId}/status`, {
    status: 'pending'
  });

  assert.equal(status, 400);
  assert.equal(body.error, 'Invalid status change');
});

test('the hire stays approved after the rejected change', async () => {
  const { body } = await api('GET', `/hires/${hireId}`);
  assert.equal(body.status, 'approved');
});

test('approved -> done returns 200 and done cannot move again', async () => {
  const forward = await api('PATCH', `/hires/${hireId}/status`, { status: 'done' });
  assert.equal(forward.status, 200);
  assert.equal(forward.body.status, 'done');

  const backwards = await api('PATCH', `/hires/${hireId}/status`, { status: 'approved' });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.body.error, 'Invalid status change');
});

test('skipping a step (pending -> done) and unknown status values are rejected', async () => {
  const hire = await api('POST', '/hires', { actor_id: actorId, costume_id: costumeId });

  const skip = await api('PATCH', `/hires/${hire.body.id}/status`, { status: 'done' });
  assert.equal(skip.status, 400);
  assert.equal(skip.body.error, 'Invalid status change');

  const unknown = await api('PATCH', `/hires/${hire.body.id}/status`, { status: 'lost' });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.error, /Invalid status value/);

  const missing = await api('PATCH', `/hires/${hire.body.id}/status`, {});
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'status is required');

  const unknownHire = await api('PATCH', '/hires/999999/status', { status: 'approved' });
  assert.equal(unknownHire.status, 404);
});

// ---------------------------------------------------------------------------
// Costume CRUD, validation and search
// ---------------------------------------------------------------------------

test('costume CRUD uses the correct status codes', async () => {
  const all = await api('GET', '/costumes');
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.body));

  const one = await api('GET', `/costumes/${costumeId}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.name, 'Test Gown');

  const missing = await api('GET', '/costumes/999999');
  assert.equal(missing.status, 404);

  const created = await api('POST', '/costumes', { name: 'Victorian Hat', era: 'Victorian' });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Victorian Hat');

  const updated = await api('PUT', `/costumes/${created.body.id}`, {
    name: 'Victorian Top Hat',
    era: 'Victorian'
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Victorian Top Hat');

  const deleted = await api('DELETE', `/costumes/${created.body.id}`);
  assert.equal(deleted.status, 204);

  const gone = await api('GET', `/costumes/${created.body.id}`);
  assert.equal(gone.status, 404);
});

test('costume validation rejects missing name or era on add and update', async () => {
  const noEra = await api('POST', '/costumes', { name: 'No Era Costume' });
  assert.equal(noEra.status, 400);
  assert.match(noEra.body.error, /era is required/);

  const noName = await api('POST', '/costumes', { era: 'Medieval' });
  assert.equal(noName.status, 400);
  assert.match(noName.body.error, /name is required/);

  const badUpdate = await api('PUT', `/costumes/${costumeId}`, { era: 'Medieval' });
  assert.equal(badUpdate.status, 400);
  assert.match(badUpdate.body.error, /name is required/);
});

test('search by era is case-insensitive and returns matching costumes', async () => {
  const { status, body } = await api('GET', '/costumes?era=renaissance');

  assert.equal(status, 200);
  assert.ok(body.length >= 1);
  assert.ok(body.every((costume) => costume.era === 'Renaissance'));

  const noMatch = await api('GET', '/costumes?era=Space%20Age');
  assert.equal(noMatch.status, 200);
  assert.deepEqual(noMatch.body, []);
});

// ---------------------------------------------------------------------------
// Join endpoint and actor routes
// ---------------------------------------------------------------------------

test('GET /hires joins the actor name and costume name', async () => {
  const { status, body } = await api('GET', '/hires');

  assert.equal(status, 200);
  assert.ok(Array.isArray(body));

  const hire = body.find((row) => row.id === hireId);
  assert.ok(hire);
  assert.equal(hire.actor_name, 'Test Actor');
  assert.equal(hire.costume_name, 'Test Gown');
  assert.equal(hire.status, 'done');

  const one = await api('GET', `/hires/${hireId}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.actor_name, 'Test Actor');
  assert.equal(one.body.costume_name, 'Test Gown');
});

test('hire creation validates ids and missing actors/costumes', async () => {
  const missingFields = await api('POST', '/hires', {});
  assert.equal(missingFields.status, 400);
  assert.match(missingFields.body.error, /actor_id is required/);
  assert.match(missingFields.body.error, /costume_id is required/);

  const badActor = await api('POST', '/hires', {
    actor_id: 999999,
    costume_id: costumeId
  });
  assert.equal(badActor.status, 404);
  assert.equal(badActor.body.error, 'Actor not found');

  const badCostume = await api('POST', '/hires', {
    actor_id: actorId,
    costume_id: 999999
  });
  assert.equal(badCostume.status, 404);
  assert.equal(badCostume.body.error, 'Costume not found');
});

test('actor and hire routes return 404 for unknown ids and 204 on delete', async () => {
  const missingActor = await api('GET', '/actors/999999');
  assert.equal(missingActor.status, 404);

  const tempHire = await api('POST', '/hires', {
    actor_id: actorId,
    costume_id: costumeId
  });
  assert.equal(tempHire.status, 201);

  const deletedHire = await api('DELETE', `/hires/${tempHire.body.id}`);
  assert.equal(deletedHire.status, 204);

  const deletedAgain = await api('DELETE', `/hires/${tempHire.body.id}`);
  assert.equal(deletedAgain.status, 404);
});

test('unknown routes return 404 JSON and malformed JSON returns 400', async () => {
  const unknown = await api('GET', '/not-a-route');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'Route not found');

  const malformed = await fetch(`${baseUrl}/costumes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name": '
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Invalid JSON body');
});
