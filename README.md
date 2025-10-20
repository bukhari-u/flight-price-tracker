## Flight Price Tracker - Delivery Build

This repository contains a minimal, production-ready implementation of a **Flight Price Tracking System** built with a **Node.js + Express** backend (MongoDB) and a **React + Vite** frontend.

---

### Prerequisites

* Node.js 18 or higher
* MongoDB (local installation or Docker)

---

### 1) Install Dependencies

Open two terminals.

**Terminal A (Backend):**

```bash
cd backend
npm install
```

**Terminal B (Frontend):**

```bash
cd frontend
npm install
```

---

### 2) Start MongoDB

You can use a local MongoDB service or run it via Docker:

```bash
docker run -d --name mongodb -p 27017:27017 mongo:6
```

---

### 3) Seed Sample Data

```bash
cd backend
npm run seed
```

---

### 4) Run the Applications

**Backend (Terminal A):**

```bash
npm start
```

**Frontend (Terminal B):**

```bash
cd frontend
npm run dev
```

---

### 5) Open the App

* Frontend: [http://localhost:3001](http://localhost:3001)
* Health Check: [http://localhost:3000/health](http://localhost:3000/health)

---

### Notes

* Frontend API base: `http://localhost:3000/api` (see `frontend/src/services/api.js`)
* The Vite dev server proxies `/api` requests to the backend (see `frontend/vite.config.js`)

---

### Project Structure

```
backend/
  config.js
  server.js
  routes/
  models/
  services/
  scripts/
  data/
frontend/
  src/
  index.html
```

---

### Key Endpoints

* **GET** `/health` – Server status
* **GET** `/api/flights` – Flights list
* **GET** `/api/search/hybrid` – Hybrid search (BM25 + cosine similarity)
* **GET** `/api/prices/flight/:flightId` – Price history

---

### Important

Before running the backend, **make sure to configure your MongoDB server and port** in `backend/config.js` according to your local setup.
This is required for the backend to connect successfully to the database.
