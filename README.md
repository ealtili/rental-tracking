# Rental Tracking App (MVP)

> [!NOTE]
> **MVP Scope**: This project is designed as a Minimum Viable Product (MVP). It targets the essential features of multi-landlord rental tracking, native bank statement Excel reconciliation, Turkish CPI (TÜFE) rate scraping, and running ledger calculation in a fast and clean single-page app.

A containerized, multi-landlord rental tracking web application designed to run entirely in **Docker / VS Code Devcontainers**. Features include automated bank statement matching, bilingual support (EN/TR), dark mode (defaulting to system preferences), CPI-based (TÜFE) rent increases, a running debit/credit ledger, and customizable visual analytics.

---

## 🎨 Premium Visual Analytics & UI Features

- **Rent Collection Trend Combo Chart**: 
  - Grouped Expected vs. Received rent columns with rounded caps, drop-shadows, and dynamic dark/light theme-adaptive colors.
  - Secondary right Y-axis for percentages, displaying an overlay **Collection Rate Trend Line** connecting glow-ring nodes and bold percentage labels.
  - Slices data to the last 6 months to prevent text overlapping and maintain visual elegance.
  - Clean HTML-based legend with gradient symbols matching brand colors.
- **Portfolio Occupancy Doughnut Chart**: Displays occupied vs. vacant units and dynamic occupancy rate calculations.
- **Inline SVG Favicon**: High-resolution, theme-color matching building favicon linked in the browser tab.

---

## 🔒 Security Hardening & Secret Management

- **Zero Hardcoded Secrets**: Cryptographic keys and application passwords are never hardcoded in the codebase.
- **Local Secrets Config (`.env`)**: Sensitive credentials, database GCM keys, and SMTP credentials must be loaded natively from a root `.env` configuration file on runtime. A template is provided at `.env.example`. This file is excluded from public git history via `.gitignore` and `.dockerignore`.
- **Transparent Database Encryption (TDE)**: Landlord-specific database JSON files (`landlord_<id>.json`) are encrypted at rest using **AES-256-GCM** authenticated encryption, rendering stored files completely unreadable if offline backups or physical storage are compromised.
- **Strict Key Validation**: The server strictly validates encryption keys and initialization vectors on boot. If any parameters are missing, weak, or invalid, the server prints a fatal error and terminates the process immediately.
- **Decrypted Database Reference**: Plaintext schema fixture committed at `docs/sample_landlord_db.json` for developer reference without touching active encrypted databases.
- **Memory-Hard Password Hashing**: Password hashing utilizes Node's native `crypto.scryptSync` key derivation algorithm, securing accounts against GPU brute-force cracking.
- **Path Traversal Sanitization**: All file interactions and auth headers pass through a strict regex-based whitelister (`/^(landlord|admin)-[a-zA-Z0-9_-]+$/`), protecting host files against directory traversal attempts.
- **SMTP Credential Encryption**: Landlord SMTP passwords are encrypted at rest using AES-256-CBC and decrypted on-the-fly when sending emails, protecting SMTP keys stored in global settings.
- **Native HTTP Security Headers**: Lightweight custom middleware injecting secure headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` (aligned with SPA needs)
- **Login Rate Limiting**: Memory-based IP rate limiter restricting login/signup actions to 10 requests per 15 minutes to block brute-force attacks.
- **Secure File Upload Filters**: Strict extension check (allowing `.xlsx` Excel files only) and $5\text{MB}$ size limit configuration.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: Vite + Vanilla JS & CSS (no heavy framework overhead, fully responsive, sleek dark-mode glassmorphic design).
- **Backend**: Node.js + Express (serving static assets in production, proxying in development).
- **Data Persistence**: Isolated JSON files (`global.json` for credentials/rates, and landlord-specific `landlord_<landlord_id>.json` files under the `data/` directory) to guarantee absolute landlord data isolation.
- **Features**:
  - HTML scraping of Turkish CPI (TÜFE) rates natively using `cheerio` (no Python dependency).
  - Excel bank statement parsing natively using `xlsx`.

---

## 🚀 Running the App in Docker (Production Mode)

To build and run the entire application in a single production-grade container (using multi-stage builds and running under the non-privileged `node` user):

1. **Configure Environment Secrets**: Copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your unique keys:
   ```text
   DB_ENCRYPTION_KEY=your_64_character_hex_database_key
   SMTP_ENCRYPTION_KEY=your_32_character_smtp_pass_key
   SMTP_ENCRYPTION_IV=your_16_character_initialization_vector
   ```
2. Make sure Docker and Docker Compose are installed on your system.
3. Open your terminal in the root of this project and run:
   ```bash
   docker-compose up --build -d
   ```
4. Open your browser and navigate to:
   ```text
   http://localhost:5000
   ```
5. **Pre-Seeded Login Credentials**:
   * **System Administrator**: `admin@rental.local` / Password: `Admin123!`
     * *Note*: Accesses administrative tools, configurations, or system-wide operations.
   * **Landlord 1**: `landlord1@example.com` / Password: `landlord123`
     * *Note*: Seeded with dynamic properties, unoccupied units, active leases (randomized durations: 12/18/24 months, distinct start/end dates), and historical payments matched to bank transactions from start date up to May 2026.
   * **Landlord 2**: `landlord2@example.com` / Password: `landlord123`
     * *Note*: Seeded with separate USD properties, unoccupied duplex units, and active leases to demonstrate data isolation.

*All data configurations (names, currencies, addresses, lease terms) are fully randomized on every seed execution.*

---

## 💻 Running the App in Devcontainers (Development Mode)

If you are using VS Code and have the **Dev Containers** extension installed:

1. Open this project directory in VS Code.
2. VS Code will detect the `.devcontainer` directory and prompt you to:
   > *"Reopen in Container"*
3. Click **Reopen in Container** (or run `Dev Containers: Reopen in Container` from the command palette).
4. VS Code will build the local Alpine Node development container, mount your workspace, and start a shell.
5. Create `.env` from `.env.example` and start development:
   ```bash
   cp .env.example .env
   npm run dev
   ```
6. This command runs both the Express backend API and the Vite frontend concurrently:
   * **Vite Web App**: `http://localhost:5173` (Vite proxies all `/api/*` traffic automatically to port 5000).
   * **Express API Server**: `http://localhost:5000`

---

## 🌳 Git & Worktree Workflow

This project is hosted privately at `https://github.com/ealtili/rental-tracking`.

We follow a Git worktree-based workflow for parallel feature development to prevent configuration or running container state conflicts. To work on a feature, add a new worktree directory:
```bash
git worktree add ../feature-name -b feature-name
```
Work in the `../feature-name` directory, commit, push, and clean up once merged:
```bash
git worktree remove ../feature-name
git branch -d feature-name
```
