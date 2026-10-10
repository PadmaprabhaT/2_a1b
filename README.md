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

