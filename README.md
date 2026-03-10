# Anduril Backend ⚔️

High-performance NestJS backend for the **Oracle Dashboard**, providing real-time prediction market data, settlement statuses, and dashboard statistics. Connected to Supabase with optimized parallel querying.

## 🚀 Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Module Resolution**: `NodeNext` (ESM)
- **Authentication**: Static Bearer Token Guard

---

## 🏗️ Architecture

The application is structured around a central **Market Module**, which encapsulates all logic for prediction market data.

### Core Components

- **Market Controller**: Defines the REST interface and routing. Static routes are prioritized over dynamic parameter routes to prevent conflicts.
- **Market Service**: Contains the business logic. It implements a unique **Two-Query Merge Pattern** to join data between `market_allData` and `market_oracle_db` without requiring explicit Foreign Key configurations in Supabase.
- **Supabase Service**: A wrapper around the `@supabase/supabase-js` client, providing a singleton instance across the application.
- **Auth Guard**: A security layer that validates the `Authorization: Bearer <token>` header against the `API_KEY` defined in environment variables.

### ⚡ Performance Optimization: Parallel Batching
When fetching details for hundreds of markets (e.g., resolvable markets), the system uses a **Parallel Batching** strategy. It chunks address lists into groups of 50 and executes queries in parallel. This prevents URL-length limit failures and significantly reduces response times.

---

## 📡 API Endpoints

All endpoints are prefixed with `/market` and require a valid `Authorization` header.

### Market Discovery
- `GET /market` — Paginated list of all markets with full details and settlement criteria.
- `GET /market/all/:address` — Comprehensive details for a specific market address.

### Settlement & Oracle Data
- `GET /market/resolvable` — Flat array of addresses pending oracle settlement.
- `GET /market/resolvable/details` — Full details for all resolvable markets (non-paginated).
- `GET /market/settled` — Paginated list of settled market addresses.
- `GET /market/settled/details` — Full details for all settled markets (paginated).
- `GET /market/settlementData/:address` — Specific oracle resolution results (Answer, Reasoning, Grok/Perplexity data).

### Dashboard Analytics
- `GET /market/stats` — Real-time stats including total markets, weekly/monthly settlements, and category distributions.

---

## 🛠️ Setup & Installation

### 1. Clone & Install
```bash
git clone git@github.com:notanaveragelifter/anduril-be.git
cd anduril-be
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory (refer to `.env.example`):
```bash
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
API_KEY=your_secure_api_key
```

### 3. Run the App
```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod
```

---

## 📜 License
This project is UNLICENSED.
