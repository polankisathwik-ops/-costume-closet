# CostumeCloset Theatre — Costume Hire API

A small REST API that keeps track of which costume is hired by which actor, and stops returns from going backwards through the approval process.

Built for **CostumeCloset Theatre**, assignment theme 8 of 30.

- **Student:** Sai Siva Teja
- **Section:** CSE2D — Group 8 of 15
- **Repository:** https://github.com/polankisathwik-ops/-costume-closet

---

## What it does

- Full CRUD for **actors**, **costumes** and **hires**
- **Costume search** by era with `GET /costumes?era=Renaissance` (case-insensitive)
- **Join endpoint** `GET /hires` returns each hire with `actor_name` and `costume_name`
- **Validation** on every add and update, with clear `400` messages
- **Status flow (the twist):** `pending → approved → done`, one step at a time only
- SQLite database with three related tables, created automatically on first run

---

## Tech stack

| Layer    | Choice                          |
| -------- | ------------------------------- |
| Server   | Node.js + Express 4             |
| Database | SQLite via `sqlite` / `sqlite3` |
| Tests    | Node's built-in `node:test`     |
| API tests| Postman collection / Newman     |

---

## Quick start

```bash
npm install     # install dependencies
npm run seed    # optional: add demo actors and costumes
npm start       # start the API on http://localhost:3000
```

Other commands:

```bash
npm run dev     # restart automatically on file changes
npm test        # run the automated API tests
```

The database file (`database.sqlite`) is created automatically and is ignored by git. To use a different file or port:

```bash
# Windows PowerShell
$env:PORT=4000; $env:DB_PATH="C:\temp\costume.sqlite"; npm start

# macOS / Linux
PORT=4000 DB_PATH=/tmp/costume.sqlite npm start
```

Check that it is running: `GET http://localhost:3000/health` → `{ "status": "ok" }`

---

## Database

Three related tables:

```
actors                          costumes
-------                         --------
id      INTEGER PK              id      INTEGER PK
name    TEXT NOT NULL           name    TEXT NOT NULL
email   TEXT                    era     TEXT NOT NULL
   |                               |
   | 1                          1  |
   |                               |
   +--------< hires >--------------+
              id          INTEGER PK
              actor_id    INTEGER FK -> actors.id
              costume_id  INTEGER FK -> costumes.id
              status      TEXT NOT NULL DEFAULT 'pending'
```

A hire is the link between one actor and one costume. Its status starts at `pending`.

---

## API reference

Base URL: `http://localhost:3000`

### Actors

| Method | Endpoint      | Body                | Success | Errors              |
| ------ | ------------- | ------------------- | ------- | ------------------- |
| GET    | `/actors`     | —                   | `200`   | `500`               |
| GET    | `/actors/:id` | —                   | `200`   | `404`               |
| POST   | `/actors`     | `name`, `email`*    | `201`   | `400`               |
| PUT    | `/actors/:id` | `name`, `email`*    | `200`   | `400`, `404`        |
| DELETE | `/actors/:id` | —                   | `204`   | `404`               |

\* `email` is optional.

### Costumes (the main CRUD resource)

| Method | Endpoint                    | Body           | Success | Errors       |
| ------ | --------------------------- | -------------- | ------- | ------------ |
| GET    | `/costumes`                 | —              | `200`   | `500`        |
| GET    | `/costumes?era=Renaissance` | —              | `200`   | `400`        |
| GET    | `/costumes/:id`             | —              | `200`   | `404`        |
| POST   | `/costumes`                 | `name`, `era`  | `201`   | `400`        |
| PUT    | `/costumes/:id`             | `name`, `era`  | `200`   | `400`, `404` |
| DELETE | `/costumes/:id`             | —              | `204`   | `404`        |

The era search is case-insensitive, so `?era=renaissance` and `?era=Renaissance` return the same rows. An empty `?era=` returns `400`.

### Hires

| Method | Endpoint             | Body                     | Success | Errors                       |
| ------ | -------------------- | ------------------------ | ------- | ---------------------------- |
| GET    | `/hires`             | —                        | `200`   | `500`                        |
| GET    | `/hires/:id`         | —                        | `200`   | `404`                        |
| POST   | `/hires`             | `actor_id`, `costume_id` | `201`   | `400`, `404`                 |
| PUT    | `/hires/:id`         | `actor_id` and/or `costume_id` | `200` | `400`, `404`             |
| DELETE | `/hires/:id`         | —                        | `204`   | `404`                        |
| PATCH  | `/hires/:id/status`  | `status`                 | `200`   | `400`, `404`                 |

`GET /hires` is the **join endpoint**. It returns:

```json
[
  {
    "id": 1,
    "actor_id": 1,
    "costume_id": 1,
    "status": "pending",
    "actor_name": "Alice Johnson",
    "costume_name": "Renaissance Gown"
  }
]
```

New hires always start at `pending`, even if the client sends another status. This keeps the status flow honest.

---

## The twist: status flow

A hire may only move **one step forward**:

```
pending ──▶ approved ──▶ done
```

Every other move returns `400` with the exact message:

```json
{ "error": "Invalid status change" }
```

This includes going backwards (`approved → pending`), skipping a step (`pending → done`) and moving a finished hire (`done → approved`). An unknown value such as `lost` returns `400` with `Invalid status value...`.

### Required tests

**Test 1 — add a hire, expect `201` and `pending`**

```bash
# PowerShell (Windows) - use curl.exe so it is not confused with Invoke-WebRequest
curl.exe -i -X POST http://localhost:3000/hires -H "Content-Type: application/json" -d '{"actor_id":1,"costume_id":1}'
```

```bash
# macOS / Linux
curl -i -X POST http://localhost:3000/hires -H "Content-Type: application/json" -d '{"actor_id":1,"costume_id":1}'
```

```http
HTTP/1.1 201 Created

{ "id": 1, "actor_id": 1, "costume_id": 1, "status": "pending",
  "actor_name": "Alice Johnson", "costume_name": "Renaissance Gown" }
```

**Test 2 — `pending → approved`, expect `200`**

```bash
curl.exe -i -X PATCH http://localhost:3000/hires/1/status -H "Content-Type: application/json" -d '{"status":"approved"}'
```

```http
HTTP/1.1 200 OK

{ "id": 1, "status": "approved", ... }
```

**Test 3 — `approved → pending`, expect `400`**

```bash
curl.exe -i -X PATCH http://localhost:3000/hires/1/status -H "Content-Type: application/json" -d '{"status":"pending"}'
```

```http
HTTP/1.1 400 Bad Request

{ "error": "Invalid status change" }
```

> Test 2 and Test 3 deliberately use the same hire **in that order**. Test 3 only makes sense after Test 2 has moved the hire to `approved`. The Postman collection and `npm test` do exactly the same sequence.

All three tests run automatically with `npm test` and in the Postman collection.

---

## Validation

Add and update requests are checked before touching the database. Failures return `400` with a message that names the problem:

| Request                   | Invalid input          | Response `error`                                             |
| ------------------------- | ---------------------- | ------------------------------------------------------------ |
| `POST /costumes`          | missing `era`          | `era is required and must be a non-empty string`             |
| `PUT /costumes/:id`       | missing `name`         | `name is required and must be a non-empty string`            |
| `POST /hires`             | missing ids            | `actor_id is required and must be a positive integer; ...`   |
| `PATCH /hires/:id/status` | not the next status    | `Invalid status change`                                      |
| `POST /hires`             | unknown actor          | `404` — `Actor not found`                                    |
| any malformed JSON body   | broken JSON            | `400` — `Invalid JSON body`                                  |

Strings are trimmed before saving, and IDs must be positive integers.

---

## Tests

```bash
npm test
```

The suite starts the API on a random port with a temporary SQLite file, exercises the routes over HTTP, and deletes the file afterwards. It covers:

- the three required twist tests, plus `approved → done` and rejected skips/unknown values
- costume CRUD status codes: `200`, `201`, `204`, `404`
- validation on add and update
- case-insensitive era search
- the hire join fields (`actor_name`, `costume_name`)
- unknown routes and malformed JSON

**Current result: 13 tests, 13 passing.**

---

## Postman collection

Import [`CostumeCloset.postman_collection.json`](./CostumeCloset.postman_collection.json) into Postman.

1. Start the server: `npm start`
2. Make sure the collection variable `baseUrl` is `http://localhost:3000` (it is by default)
3. Open the collection and click **Run** (Collection Runner)

**Run the requests in order.** The collection is a self-contained test run:

| Folder                              | What it proves |
| ----------------------------------- | -------------- |
| 1. Setup                            | creates a test actor and two costumes, saves their ids as variables |
| 2. Costumes CRUD, validation, search| `200`/`201`/`204`/`404`, `400` messages, era search |
| 3. Hires and join endpoint          | **Test 1** `201` + `pending`, join names, update |
| 4. Status flow (the twist)          | **Test 2** `200`, **Test 3** `400 Invalid status change`, `done`, skip-step rejection |
| 5. Cleanup                          | deletes the test data |

The requests use `pm.collectionVariables`, so IDs flow from setup into later requests automatically. The collection has **47 assertions**, all passing. It is safe to run repeatedly because cleanup removes what setup created.

To run it from the terminal instead:

```bash
npx newman run CostumeCloset.postman_collection.json
```

If the API is on another port:

```bash
npx newman run CostumeCloset.postman_collection.json --env-var baseUrl=http://localhost:4000
```

---

## Project structure

```
costume-closet/
├── index.js                             # Express app, routes, validation, status flow
├── seed.js                              # optional demo data
├── test/
│   └── api.test.js                      # automated API tests (node:test)
├── CostumeCloset.postman_collection.json
├── package.json
├── render.yaml                          # optional deploy config
├── railway.json                         # optional deploy config
└── README.md
```

`index.js` exports `{ app, initDB, start, closeDB }`. `start()` opens the database before listening, so the API never serves a request without a ready database. The tests import `start()` directly.

---

## Demo day notes

**3-minute flow**

1. `npm start` (show the listening message)
2. `GET /hires` — point out `actor_name` and `costume_name` from the join
3. POST a new hire — show `201` and `"status": "pending"`
4. PATCH it to `approved` — `200`
5. PATCH it back to `pending` — `400` and `Invalid status change`
6. `GET /costumes?era=renaissance` — show the search
7. Show `npm test` passing and the Postman Runner summary

**Who answers what**

| Part | Owner's answer in one line |
| ---- | -------------------------- |
| 1. Server and routes | Express app with `express.json()`, one router block per resource, and status codes chosen per outcome (`201` create, `204` delete, `400` bad input, `404` missing). |
| 2. Database | SQLite with `actors`, `costumes`, `hires`; `hires.actor_id` and `hires.costume_id` are foreign keys, and every query uses `?` placeholders. |
| 3. REST endpoints | Uniform CRUD verbs; costume `GET` supports `?era=`; `/hires` uses `JOIN` to attach both names. |
| 4. Validation and search | Validators run before the insert/update, collect all problems, return one clear `400`; era search uses `LOWER(era) = LOWER(?)`. |
| 5. Twist rule | A `NEXT_STATUS` map defines the only legal next value; anything else returns `400 { error: "Invalid status change" }`. |
| 6. Postman and README | Collection creates its own data and passes ids through collection variables; run in order so Test 1 → 2 → 3 share one hire. |

**Likely questions**

- *Why `PUT` instead of `PATCH` for costumes?* `PUT` replaces both fields; `PATCH` is reserved for the status transition, which is a partial update.
- *Why does the new hire ignore a supplied status?* So a client cannot create a hire directly as `done`; the flow must start at `pending`.
- *What happens if two requests arrive at once?* SQLite serializes writes, and each request uses its own parameterized statement; the status check reads the current row first.
- *Why 204 on delete?* The delete succeeded but there is no representation to return.
- *What is the join?* `SELECT ... FROM hires JOIN actors ... JOIN costumes ...` so one response contains the hire plus both names.

---

## Deployment (optional)

`render.yaml` and `railway.json` are included. On either platform:

- Build: `npm install`
- Start: `npm start`
- The platform provides `PORT`; the SQLite file lives beside the app.

Note: free hosting tiers usually have ephemeral disks, so the database resets on redeploy. That is fine for a demo; for production you would move to a managed Postgres database.

---

## License

ISC — coursework project.
