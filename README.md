# Containerized Task API (Node.js + Express + PostgreSQL)

A small task-management REST API, containerized with Docker and orchestrated with Docker Compose. The API and the database run in separate containers on a dedicated network, with persistent storage in a named volume.

This is a learning and portfolio project focused on **container fundamentals**: images, networks, volumes, health checks, startup ordering, configuration, and failure behavior.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 (Alpine image) |
| Web framework | Express 5 |
| Database | PostgreSQL 17 (Alpine image) |
| DB driver | `pg` (connection pool) |
| Orchestration | Docker Compose v2 |

## Architecture

```
Host (your machine)
   |  localhost:3000
   v
+------------------- Docker network: task-api_backend -------------------+
|                                                                         |
|   [ api container ]  --- TCP 5432, host "db" --->  [ db container ]     |
|   Node 22 / Express                                 PostgreSQL 17       |
|   port 3000 (published)                             port 5432 (NOT     |
|                                                     published)         |
+-------------------------------------------------------------|-----------+
                                                              |
                                                  [ named volume: pgdata ]
```

- Only the API is published to the host. The database is reachable only from inside the Compose network.
- The API reaches the database by service name (`db`), resolved by Docker's internal DNS.
- Database files live in the `task-api_pgdata` named volume, so they outlive containers.

See [`docs/architecture.md`](docs/architecture.md) for the full diagram specification.

## Project structure

```
.
├── src/
│   ├── index.js        # entry point, graceful shutdown
│   ├── app.js          # Express app, health routes, error handler
│   ├── config.js       # reads and validates environment variables
│   ├── db.js           # PostgreSQL connection pool
│   └── routes/tasks.js # task CRUD endpoints
├── db/init.sql         # schema, run on first database start only
├── Dockerfile          # API image
├── docker-compose.yml  # services, network, volume, health check
├── .dockerignore       # keeps secrets and junk out of the image
├── .env.example        # configuration template (safe to commit)
└── package.json / package-lock.json
```

## Prerequisites

- Docker Desktop (Docker Engine 29.x and Compose v5.x were used for development)
- PowerShell on Windows (commands below are PowerShell)
- Git

Node.js does **not** need to be installed locally.

## Quick start (PowerShell)

```powershell
git clone https://github.com/fatimahaneef-tech/containerized-rest-api.git
cd containerized-rest-api
```

Create your local `.env` with a randomly generated password (it is never printed or committed):

```powershell
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$envText = "DB_USER=taskapp`nDB_PASSWORD=$pw`nDB_NAME=tasks`nAPI_PORT=3000`n"
[System.IO.File]::WriteAllText("$PWD\.env", $envText, (New-Object System.Text.UTF8Encoding($false)))
```

Start the stack:

```powershell
docker compose up -d --build
docker compose ps
```

Expected: `db` shows `healthy` and `api` shows `Up`, with `0.0.0.0:3000->3000/tcp`.

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/health/ready
```

Stop (keeps data) or stop and delete data:

```powershell
docker compose down        # removes containers and network, keeps the volume
docker compose down -v     # also deletes the database volume (data loss)
```

## Configuration

All configuration comes from environment variables. Compose reads `.env` from the project folder.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_USER` | yes | none | Postgres user (created on first start) |
| `DB_PASSWORD` | yes | none | Postgres password. No default, by design |
| `DB_NAME` | yes | none | Database name |
| `API_PORT` | no | `3000` | Host port published for the API |

Set inside Compose for the API container: `DB_HOST=db`, `DB_PORT=5432`, `PORT=3000`.

The API exits with a clear error and a non-zero exit code if a required variable is missing.

## API reference

Base URL: `http://localhost:3000`

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/health` | Liveness. Never touches the database | 200 |
| GET | `/health/ready` | Readiness. Runs `SELECT 1` | 200, or 503 if DB unreachable |
| POST | `/tasks` | Create a task | 201 |
| GET | `/tasks` | List tasks. Optional `?status=` filter | 200 |
| GET | `/tasks/:id` | Get one task | 200 |
| PATCH | `/tasks/:id` | Partial update | 200 |
| DELETE | `/tasks/:id` | Delete a task | 204 |

Task fields: `title` (required, 1-200 chars), `description` (optional), `status` (`todo` | `in_progress` | `done`, default `todo`).

Errors return JSON `{ "error": "..." }` with status 400 (validation), 404 (not found), 503 (database unavailable), or 500 (unexpected).

Example:

```powershell
$body = @{ title = "Learn Docker Compose"; status = "todo" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/tasks -ContentType "application/json" -Body $body
```

## Design decisions

- **Separate containers for API and database.** Each can be rebuilt, restarted, and scaled independently.
- **Dedicated network, database not published.** Only the API needs the database, so it is not exposed to the host.
- **Named volume for data.** `docker compose down` removes containers but keeps `pgdata`.
- **Health check plus `depends_on: condition: service_healthy`.** The API starts only after Postgres accepts connections. Plain `depends_on` only waits for the container to start.
- **Liveness vs readiness endpoints.** `/health` says the process is up; `/health/ready` says it can do useful work. This lets the API stay up and report DB problems clearly.
- **Fail-fast configuration, no secret defaults.** A missing variable stops the container at startup.
- **Single-stage Dockerfile.** Plain JavaScript has no build step, so multi-stage would add complexity with no benefit.
- **Dependency layer caching.** `package*.json` is copied and installed before source code, so code edits rebuild quickly.
- **`npm ci` with a lockfile.** Reproducible dependency versions.
- **Non-root user and exec-form `CMD`.** The process runs as `node` (uid 1000), and `SIGTERM` reaches Node directly so shutdown is graceful.
- **Parameterized SQL queries.** User input is never concatenated into SQL.
- **`.dockerignore`.** Excludes `.env`, `node_modules`, `.git`, and other files from the build context.

## Testing

Testing in this project is **manual**, run from PowerShell. There is no automated test suite. See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for what was tested and how each result was recorded.

Areas covered: image build and caching, fail-fast config, non-root user, stack startup and health, API success and error paths, data persistence across container recreation, database outage and recovery, wrong-password behavior, graceful shutdown, and startup ordering.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `failed to connect to the docker API ... docker_engine` | Docker Desktop not running | Start Docker Desktop, wait for "Engine running" |
| `port is already allocated` | Port 3000 in use | Set `API_PORT=3001` in `.env`, run `docker compose up -d` |
| `variable is not set` warning | `.env` missing or misnamed | Create `.env` (not `.env.txt`) |
| `password authentication failed` | Volume was created with a different password | `docker compose down -v`, then `up -d` (deletes data) |
| Schema change in `init.sql` not applied | Init scripts run only on an empty volume | Use `down -v` in development, or add a migration tool |
| `EJSONPARSE` during build | `package.json` empty or not saved | Re-save the file and check its size |
| `psql` says `dt` is a syntax error | PowerShell strips `\` | Use SQL (`SELECT tablename FROM pg_tables ...`) instead of `\dt` |
| `role "postgres" does not exist` | Superuser is named after `POSTGRES_USER` | Use `-U $POSTGRES_USER` |

Useful commands:

```powershell
docker compose logs api --tail 50
docker compose logs db --tail 50
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM tasks;"'
```

## Known limitations

- No automated tests and no CI pipeline.
- No authentication or authorization on the API.
- No TLS. Traffic is plain HTTP on localhost.
- Single host only. No orchestration beyond Compose, no scaling or load balancing.
- No database migrations tool. `init.sql` runs only on first initialization of an empty volume.
- No backups of the database volume.
- No pagination on `GET /tasks`.
- No container resource limits configured.
- Database credentials are passed as environment variables, which are visible to anyone who can run `docker inspect` on the host. Docker secrets or a secrets manager would be the next step for production.
- Image is tagged `task-api:dev`. There is no versioning or registry publishing workflow.
- Error mapping: the API maps connection-type errors to 503. Database authentication failures may surface as 500 instead of 503 (see `docs/VERIFICATION.md`, test 8.3, for what was observed).

## What I would add next

Automated tests (for example Node's built-in test runner with a test database), a GitHub Actions workflow that builds the image and runs the tests, a migration tool, Docker secrets for credentials, and pagination.
