# CostumeCloset Theatre - Costume Hire System

A REST API for managing costume hires for theatre productions.

## Features

- Actors management (CRUD)
- Costumes management (CRUD) with search by era
- Hires management with join endpoint showing actor and costume names
- Status flow for hires: pending → approved → done

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

Server runs on port 3000 by default.

## API Endpoints

### Actors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /actors | Get all actors |
| GET | /actors/:id | Get one actor |
| POST | /actors | Add new actor (name, email) |
| PUT | /actors/:id | Update actor |
| DELETE | /actors/:id | Delete actor |

### Costumes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /costumes | Get all costumes |
| GET | /costumes?era=Renaissance | Get costumes filtered by era |
| GET | /costumes/:id | Get one costume |
| POST | /costumes | Add new costume (name, era) |
| PUT | /costumes/:id | Update costume |
| DELETE | /costumes/:id | Delete costume |

### Hires

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /hires | Get all hires (with actor_name and costume_name) |
| GET | /hires/:id | Get one hire |
| POST | /hires | Add new hire (actor_id, costume_id) - starts as pending |
| PUT | /hires/:id | Update hire (actor_id, costume_id) |
| DELETE | /hires/:id | Delete hire |
| PATCH | /hires/:id/status | Update hire status (status flow only) |

## Status Flow (The Twist)

The status flow is strictly forward: `pending → approved → done`

### Status Change Tests

1. **Create hire** → Status starts as `pending`, returns 201
2. **pending → approved** → Returns 200
3. **approved → pending** → Returns 400 with message "Invalid status change"

### Status Transition Rules

- `pending` can only change to `approved`
- `approved` can only change to `done`
- `done` cannot change to any other status

## Validation

All add and update operations include validation:
- Name and era are required for costumes
- Name is required for actors
- Actor ID and costume ID are required for hires
- Returns 400 with clear error messages on validation failure

## Database

SQLite database with three related tables:
- `actors` (id, name, email)
- `costumes` (id, name, era)
- `hires` (id, actor_id, costume_id, status)

## Postman Collection

See `CostumeCloset.postman_collection.json` for the Postman collection.

## Example Requests

### Create an actor
```bash
curl -X POST http://localhost:3000/actors \
  -H "Content-Type: application/json" \
  -d '{"name": "John Smith", "email": "john@example.com"}'
```

### Create a costume
```bash
curl -X POST http://localhost:3000/costumes \
  -H "Content-Type: application/json" \
  -d '{"name": "Castle Armor", "era": "Medieval"}'
```

### Create a hire
```bash
curl -X POST http://localhost:3000/hires \
  -H "Content-Type: application/json" \
  -d '{"actor_id": 1, "costume_id": 1}'
```

### Change hire status
```bash
curl -X PATCH http://localhost:3000/hires/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'
```

### Search costumes by era
```bash
curl http://localhost:3000/costumes?era=Medieval
```

## Demo Day Preparation

Each team member should be ready to explain:
1. Server and routes setup
2. Database schema and queries
3. REST endpoints implementation
4. Validation and search functionality
5. Status flow twist implementation