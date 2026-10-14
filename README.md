# CS6.302 - Software System Development

## Setup and Run with Docker

Follow these steps to set up and run the StaySpot project locally.

### Prerequisites

Install the following tools:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Visual Studio Code](https://code.visualstudio.com/)
- VS Code **Dev Containers** extension

Ensure Docker Desktop is running before starting the project.

### 1. Clone the repository

Open a terminal and run:

```bash
git clone https://github.com/PadmaprabhaT/2_a1b.git
cd 2_a1b
```

### 2. Open the project in the Dev Container

1. Open the `2_a1b` folder in VS Code.
2. Press `Ctrl + Shift + P`.
3. Select **Dev Containers: Reopen in Container**.
4. Wait for the container and required services to start.

The project uses Docker Compose configuration located at `.devcontainer/docker-compose.yml`.

If you need to start the services manually, run this command from the project root:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

### 3. Install API dependencies

Open a terminal inside the Dev Container and run:

```bash
cd /workspace/api
npm install
```

### 4. Start the API server

From `/workspace/api`, run:

```bash
node server.js
```

Keep this terminal running while testing the API.

### 5. Test the API

Open a browser and visit:

- Properties: http://localhost:3000/api/properties
- Bookings: http://localhost:3000/api/bookings

You can also test endpoints using Postman or another HTTP client.

For the available endpoints, request parameters, and examples, see [`docs/api_endpoints.md`](docs/api_endpoints.md).

### 6. Database services

The project uses:

- **PostgreSQL** for relational data.
- **MongoDB** for document-based data.

The API's database connection settings are configured in the project files. Make sure the database services are running before testing database-backed endpoints.

**Note:** Use the project's existing database initialization and seed instructions when setting up a fresh environment. Do not run seed scripts against a database containing data you want to preserve.

### Troubleshooting

- **Docker is unavailable:** Start Docker Desktop and retry.
- **Port 3000 is already in use:** Stop the other process using that port before starting the API.
- **Database connection fails:** Check that the PostgreSQL and MongoDB containers are running.
- **Dependencies are missing:** Run `npm install` from `/workspace/api`.

## Run the full website

Use three PowerShell windows. Leave each one open. Docker Desktop must be running.

Postgres in this checkout is published on host port **5433** (container port 5432), so it does not clash with another Postgres already using 5432.

### 1. Databases

```powershell
cd "C:\Users\Varun\Desktop\SSD frontend"
docker compose -f .devcontainer/docker-compose.yml up -d postgres mongo
```

On a brand-new database, load the schema and Mongo collections once:

```powershell
Get-Content sql\01_schema_ddl.sql, sql\02_indexes.sql, sql\03_triggers_and_audit.sql, sql\04_stored_procedures.sql, sql\05_materialized_views.sql | docker exec -i devcontainer-postgres-1 psql -U postgres -d app -v ON_ERROR_STOP=1
Get-Content -Raw mongo\01_collections_and_indexes.js | docker exec -i devcontainer-mongo-1 mongosh --quiet
```

The Mongo script drops and recreates `PropertyAmenities`, `PropertyReviews`, and `SearchSessions`. Skip it when those collections already hold data you want to keep.

### 2. Dummy data

Run this once. A second run inserts another full copy of the Postgres rows.

```powershell
cd "C:\Users\Varun\Desktop\SSD frontend\data_generation"
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

Search Hotspots only includes searches from the last two hours. The Mongo seeder creates those sessions. After they expire, that map can be empty while the other pages still have data.

### 3. API

```powershell
cd "C:\Users\Varun\Desktop\SSD frontend\api"
npm install
$env:DB = "postgresql://postgres:postgres@localhost:5433/app"
$env:MONGO_URI = "mongodb://localhost:27017/app"
node server.js
```

Wait for `StaySpot API running on port 3000`.

### 4. Website

```powershell
cd "C:\Users\Varun\Desktop\SSD frontend\web"
npm install
npm run dev
```

Open the `http://localhost:5173` address printed in that window.

### 5. What to try

1. **Browse** — properties, guests, and bookings.
2. **Booking** — choose a guest whose wallet covers the total, then confirm. The wallet is charged and an audit row is written.
3. **Wallet & Audit Trail** — open the same guest and read the ledger.
4. **Analytics** — summary cards, the 7-day revenue chart, the ranking table, and Refresh data.
5. **Search Hotspots** — start at Hyderabad, Hitech City, or Charminar.
6. **Reviews & Amenities** — the top average is every property. Select one property to read that property's reviews and amenities.


