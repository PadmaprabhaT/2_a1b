# CS6.302 - Software System Development

# StaySpot — Vacation Rental & Experiences

**Course:** CS6.302 — Software System Development  
**Assignment:** Assignment 2 — Front-End Design  
**Repository:** https://github.com/PadmaprabhaT/2_a1b  
**Final commit hash:** `ADD_FINAL_COMMIT_HASH_BEFORE_SUBMISSION`  
**Demo video:** `ADD_DEMO_VIDEO_LINK`

StaySpot is a demonstration web application for exploring vacation-rental properties, booking a stay using a guest wallet, inspecting wallet audit records, viewing property-performance analytics, exploring search hotspots, and reading property reviews and amenities. It extends an inherited PostgreSQL + MongoDB project with an API and browser-based interface.

## Features and workflows

1. **Browse:** paginated browsing of properties, guests, and bookings, with search or filters where supported by the screen.
2. **Booking:** choose a guest and property, submit a stay booking, and show the result. The PostgreSQL stored procedure handles the booking transaction and the database trigger records wallet changes in the audit log.
3. **Wallet & Audit Trail:** inspect a selected guest's wallet and audit history, with date filtering where supported.
4. **Analytics:** view property-performance summary data from the materialized view, the moving-revenue analytics and ranked properties; request a materialized-view refresh.
5. **Search Hotspots:** display recent search sessions on a map and explore nearby searches around an origin within a 5 km radius.
6. **Reviews & Amenities:** view review analytics (rating distribution, average rating and tags) and the selected property's flexible amenity document.

The app includes loading, empty and error states where implemented. Results depend on the relevant database service being available and seeded. In particular, reviews, amenities and search hotspots require MongoDB collections and documents; an empty state means there are no matching documents in the selected time window or for the selected property, or that the data service/setup needs checking.

## Technology choices

| Layer | Technology | Why it is used |
|---|---|---|
| Front end | React, Vite, JavaScript | Component-based screens and a fast local development server. |
| Styling | CSS | Shared layout, reusable visual patterns and responsive styling. |
| Charts | Recharts | Property-performance charts and review analytics visualisations. |
| Map | Leaflet | Interactive map for the search-hotspot workflow. |
| API | Node.js, Express | Small HTTP layer between the browser and both databases. |
| Relational data | PostgreSQL | Guests, properties, bookings, wallet balances, audit records, stored procedures, indexes and materialized-view analytics. |
| Document data | MongoDB | Flexible property amenities, property reviews and geospatial search sessions. |

The database remains responsible for transactional and analytical work wherever the inherited SQL procedures, triggers, views and MongoDB aggregation pipelines provide it; the API exposes those operations to the browser.

## Project structure

```text
2_a1b/
├── README.md
├── assumptions.md
├── api/                       # Express API and route handlers
├── data_generation/           # PostgreSQL and MongoDB seeders
├── docs/
│   ├── api_endpoints.md       # API routes, inputs and outputs
│   ├── handover_note.md       # inherited system and changes
│   ├── relational_erd.png
│   ├── mongo_schema_map.json
│   └── design/                # user descriptions, design system, wireframes
├── mongo/                     # collection validators, indexes and workflows
├── performance/               # query execution evidence
├── sql/                       # schema, indexes, triggers, procedures and analytics
└── web/                       # React/Vite front end
```

## Prerequisites

- Git
- Docker Desktop with Docker Compose (recommended setup)
- Node.js and npm (if running the API or front end directly on the host)
- Python 3 and pip (for seeders, if running them on the host)

## Setup and run with Docker

The Compose file is `.devcontainer/docker-compose.yml`. It starts PostgreSQL and MongoDB with persistent Docker volumes. PostgreSQL is published on host port **5433**; MongoDB is published on port **27017**.

### 1. Get the repository

```bash
git clone https://github.com/PadmaprabhaT/2_a1b.git
cd 2_a1b
```

### 2. Start the databases

Run from the repository root:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d postgres mongo
```

### 3. Initialise a fresh database

Only do this for a new, disposable project database. The schema script drops and recreates project tables, and the MongoDB setup script drops/recreates the project's collections. **Do not run these commands against a database containing data you need to keep.**

PowerShell:

```powershell
Get-Content sql\01_schema_ddl.sql, sql\02_indexes.sql, sql\03_triggers_and_audit.sql, sql\04_stored_procedures.sql, sql\05_materialized_views.sql | docker exec -i devcontainer-postgres-1 psql -U postgres -d app -v ON_ERROR_STOP=1
Get-Content -Raw mongo\01_collections_and_indexes.js | docker exec -i devcontainer-mongo-1 mongosh --quiet
```

If Docker gives the containers different names, check `docker ps` and substitute the actual names. The commands above assume the Compose-generated names `devcontainer-postgres-1` and `devcontainer-mongo-1`.

### 4. Install seeder dependencies and generate data

The seeders expect PostgreSQL and MongoDB to use the same project data: Mongo documents refer to UUIDs from PostgreSQL. Seed PostgreSQL first, then MongoDB. Do not run the PostgreSQL seeder repeatedly unless you intend to add another batch of generated rows.

PowerShell, from the repository root:

```powershell
cd data_generation
py -m pip install -r requirements.txt
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
$env:POSTGRES_DB = "app"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "postgres"
$env:MONGO_URI = "mongodb://localhost:27017"
$env:MONGO_DB = "app"
py postgres_seeder.py
py mongo_seeder.py
```

The MongoDB seeder creates property amenities, property reviews and search sessions. Search sessions are intentionally short-lived: the TTL index removes them after two hours, and the seeder timestamps sessions within the recent search window. If Search Hotspots becomes empty later, seed recent search sessions again as needed:

```powershell
py seed_search_sessions.py
```

### 5. Start the API

Open a new terminal from the repository root:

```powershell
cd api
npm install
$env:DB = "postgresql://postgres:postgres@localhost:5433/app"
$env:MONGO_URI = "mongodb://localhost:27017/app"
node server.js
```

The API listens on port `3000`. Health check: http://localhost:3000/api/health

### 6. Start the front end

Open another terminal from the repository root:

```powershell
cd web
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://localhost:5173. Keep the API and front-end terminals running while using the application.

### Running in a VS Code Dev Container

The repository includes `.devcontainer/devcontainer.json` and Compose configuration. With Docker Desktop and the VS Code Dev Containers extension installed, open the project and choose **Dev Containers: Reopen in Container**. The Compose configuration provides `DB`, `MONGO_URI` and PostgreSQL settings for container-to-container connections. Follow the same schema initialisation and seeding order above, using the container service names and ports when running commands inside the container.

## API documentation

See [`docs/api_endpoints.md`](docs/api_endpoints.md) for route details, parameters, and response examples. The API route code is in `api/routes/`; the health check is `GET /api/health`. The base URL for local host development is `http://localhost:3000/api`.

## Design and user assumptions

The design direction, colour palette, typography, layout and reusable components are documented in [`docs/design/design_system.md`](docs/design/design_system.md). User descriptions are in [`docs/design/user_descriptions.md`](docs/design/user_descriptions.md), and screen wireframes are in [`docs/design/wireframes/`](docs/design/wireframes/).

Key data and workflow assumptions:

- The application is a demonstration interface; real authentication is not required, and a guest can be selected for demo purposes.
- A booking has explicit check-in and check-out dates; the number of nights is calculated as check-out date minus check-in date.
- Wallet audit records are intended to be append-only.
- Revenue analytics attribute revenue to the booking creation date and use UTC day boundaries.
- MongoDB uses the database name `app`; review and amenity documents reference PostgreSQL UUIDs.
- Search sessions are ephemeral because of the two-hour TTL policy.

## Inherited code and changes

The handover note is in [`docs/handover_note.md`](docs/handover_note.md). It records the inherited backend, what worked, the issue identified with the booking procedure's response, and the change made so the API can return a booking result or a meaningful rejection response. SQL and MongoDB workflow scripts are retained in their respective folders. Performance evidence is stored in `performance/`.

## Testing and verification

Before the demo, verify the following against a freshly seeded environment:

- API health check responds successfully.
- Browse screens return paginated records.
- A booking succeeds for a guest with sufficient balance, updates the balance and creates an audit row.
- An invalid or rejected booking shows a meaningful error.
- Analytics displays data and the refresh action reports success only when the API succeeds.
- Search Hotspots displays recent sessions within the configured radius.
- Reviews & Amenities displays review analytics and at least one amenity document for a selected property.

The SQL test queries and recorded execution plans are in `sql/test_queries.sql` and `performance/`. Record any additional tests performed by the team here before submission; do not claim a test passed unless it has been run.

## Demo video

`ADD_DEMO_VIDEO_LINK` — replace this placeholder with the final video URL. The video should be no longer than five minutes and should demonstrate the workflows against seeded data.

## Team contributions

All four team members contributed to both design and technical development, including reviewing the shared wireframes/design system, discussing the user flows, integrating screens with the API, testing the application and preparing the final submission. The primary ownership below indicates coordination responsibilities; it does not mean the named member worked only on that area. **Replace the member placeholders with the team's names before submission and keep this table consistent with the work actually completed.**

| Team member | Design contribution | Technical contribution | Primary coordination responsibility |
|---|---|---|---|
| `Name` | Contributed to screen flows, wireframe review and visual consistency across screens. | Contributed to frontend implementation, API integration and testing. | Browse and shared UI components |
| `Name` | Contributed to screen layouts, interaction states and design-system consistency. | Contributed to API/database integration, implementation and debugging. | Booking workflow |
| `Name` | Contributed to wireframe review, information hierarchy and usability improvements. | Contributed to frontend implementation, data handling and workflow testing. | Wallet & Audit Trail and Reviews & Amenities |
| `Name` | Contributed to visual consistency, responsive behaviour and review of all screen designs. | Contributed to API integration, analytics/map implementation, testing and documentation. | Analytics, Search Hotspots and integration |

## Submission checklist

- [ ] Replace all placeholders with the final commit hash, demo URL and four member names.
- [ ] Verify setup instructions on a clean environment.
- [ ] Confirm all six screens and the four inherited workflows against seeded data.
- [ ] Include screenshots that reflect the current implementation.
- [ ] Ensure `README.md` links to the GitHub repository and the demo video.
- [ ] Create the Moodle ZIP with the required team filename and keep it below 20 MB.
- [ ] Exclude `node_modules/`, virtual environments, `__pycache__/`, build output and database dumps.
