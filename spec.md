# Rental Tracking App Specification (MVP Edition)

> [!NOTE]
> **MVP Scope**: This project is designed as a Minimum Viable Product (MVP). It concentrates on delivering the core functionalities for landlord tracking, bank statements parsing, CPI (TÜFE) rent calculation, and ledger management using a simple, high-performance, and lightweight architecture.

A multi-landlord rental tracking web application designed to automate bank statement matching, track rental income and expenses via a running debit/credit ledger, calculate CPI-based (TÜFE) yearly rent increases, and manage landlord-tenant notifications.

---

## 🏗️ Technical Architecture & Stack

- **Frontend**: Single Page Application (SPA) built with **Vite + Vanilla JS & CSS**.
  - Modern, premium visual layout using CSS variables, a responsive layout, sleek dark-mode glassmorphic design, and smooth micro-animations.
  - Custom browser tab favicon using a brand-colored vector SVG layout (`#6366f1` Indigo).
  - Visualization widgets on the dashboard tab:
    - **Rent Collection Trend Combo Chart**: Grouped expected/received columns with rounded caps, drop-shadows, dynamic dark/light theme-adaptive colors, a secondary Y-axis percentage line overlay, and a clean HTML legend. Shows the last 6 months to maintain layout breathing room.
    - **Portfolio Occupancy Doughnut Chart**: Displays occupied vs. vacant units.
- **Backend**: **Node.js + Express** local server.
  - Exposes REST API endpoints.
  - Handles Excel bank statement and configuration uploads natively using the `xlsx` library.
  - Performs Turkish CPI (TÜFE) web scraping dynamically using `cheerio` to fetch rates.
- **Data Persistence**: Isolated JSON files in the `data/` directory (`global.json` for global settings/credentials and landlord-specific `landlord_<landlord_id>.json` files to guarantee absolute database-level data isolation).
- **No Python Integration**: Built entirely in Node.js/JavaScript, eliminating the need for Python, `uv`, or a virtual environment (`.venv`).

---

## 🔒 Security Hardening

1. **Broken Authentication Protection**: Strict token/header validation (`x-landlord-id` / `x-admin-id`) in middleware.
2. **GPU Brute-Force Resistance**: Native `crypto.scryptSync` key derivation for secure, slow password hashing (64-byte outputs).
3. **Directory Path Traversal Protection**: Regex-based whitelister matching format `/^(landlord|admin)-[a-zA-Z0-9_-]+$/` applied to all file lookup APIs.
4. **Transparent Database Encryption (TDE)**: Landlord-specific database files are encrypted at rest using **AES-256-GCM** authenticated encryption. Read/write hooks (`readLandlordDb`/`writeLandlordDb`) automatically handle encryption/decryption on-the-fly.
5. **Strict Production Key Validation**: If `NODE_ENV=production` is set, the server strictly validates encryption keys and initialization vectors. If any parameters are missing or insecure, the server prints a fatal error and terminates the process immediately.
6. **Decrypted Database Reference**: Plaintext schema fixture committed at `docs/sample_landlord_db.json` for developer reference without touching active encrypted databases.
7. **Encryption at Rest for SMTP Credentials**: Landlord SMTP passwords are encrypted at rest using AES-256-CBC and decrypted on-the-fly when initializing the `nodemailer` transporter.
8. **Native HTTP Security Headers**: Native middleware setting `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy`.
9. **CORS Hardening**: Strict origin whitelisting matching frontend URL parameters.
10. **Rate Limiting**: Custom memory-based IP rate-limiting restricting login and registration attempts (10 requests per 15 minutes).
11. **Secure File Filters**: Excel `.xlsx` only restriction with $5\text{MB}$ size limit configuration.

---

## 🗄️ Database Schema (`global.json` & `landlord_<id>.json`)

The data persistence is split into global configurations and isolated files per landlord. `global.json` stores shared data like landlord credentials and global CPI rates, while each landlord's data is persisted in a dedicated file (`data/landlord_<landlord_id>.json`). The schema for each landlord file follows the structure below, scope-limited to their resources:

```json
{
  "admins": [
    {
      "id": "admin-1",
      "name": "System Administrator",
      "email": "admin@rental.local",
      "passwordHash": "scrypt_derived_hex_hash_here",
      "salt": "cryptographic_salt_here"
    }
  ],
  "landlords": [
    {
      "id": "landlord-1",
      "name": "Alice Landlord",
      "email": "landlord1@example.com",
      "phone": "+905321111111",
      "passwordHash": "scrypt_derived_hex_hash_here",
      "salt": "cryptographic_salt_here",
      "smtpConfig": {
        "host": "smtp.gmail.com",
        "port": 587,
        "user": "landlord1@example.com",
        "pass": "aes_encrypted_app_password"
      }
    }
  ],
  "properties": [
    {
      "id": "prop-1",
      "landlordId": "landlord-1",
      "address": "Sanayi Caddesi No:124 D:1",
      "city": "Milas",
      "type": "Commercial",
      "active": true,
      "notes": "Milas dükkanı"
    }
  ],
  "units": [
    {
      "id": "unit-1",
      "propertyId": "prop-1",
      "unitNumber": "Dükkan 1",
      "squareMeters": 150,
      "status": "Occupied",
      "notes": ""
    }
  ],
  "tenants": [
    {
      "id": "tenant-1",
      "landlordId": "landlord-1",
      "name": "Hakan Yılmaz",
      "email": "hakan@yilmaz.com",
      "phone": "+905332222222",
      "aliases": ["HAKAN YILMAZ"],
      "linkedAccounts": ["Banka: 0067 SN: 2991148561"]
    }
  ],
  "leases": [
    {
      "id": "lease-1",
      "unitId": "unit-1",
      "tenantId": "tenant-1",
      "startDate": "2025-06-15",
      "endDate": "2026-06-14",
      "dueDay": 15,
      "status": "Active",
      "increaseRule": {
        "type": "cpi",
        "manualPercentage": null
      },
      "rentSchedule": [
        {
          "startDate": "2025-06-15",
          "endDate": "2026-06-14",
          "amount": 2282.65,
          "currency": "TL"
        }
      ],
      "deposits": [
        {
          "type": "Security Deposit",
          "amount": 4565.30,
          "currency": "TL",
          "status": "Held"
        }
      ]
    }
  ],
  "ledgerEntries": [
    {
      "id": "entry-1",
      "landlordId": "landlord-1",
      "leaseId": "lease-1",
      "date": "2026-06-15",
      "type": "charge",
      "amount": 2282.65,
      "currency": "TL",
      "description": "June 2026 Monthly Rent Charge"
    },
    {
      "id": "entry-2",
      "landlordId": "landlord-1",
      "leaseId": "lease-1",
      "date": "2026-06-10",
      "type": "payment",
      "amount": 2282.65,
      "currency": "TL",
      "description": "Rent Payment - Matched from statement",
      "paymentId": "pay-1"
    }
  ],
  "payments": [
    {
      "id": "pay-1",
      "landlordId": "landlord-1",
      "leaseId": "lease-1",
      "tenantName": "Hakan Yılmaz",
      "paymentDate": "2026-06-10",
      "period": "2026-06-01",
      "amount": 2282.65,
      "currency": "TL",
      "paymentMethod": "Bank Transfer",
      "reference": "Sanayi Caddesi no:124 D:1 Banka: 0067 SN: 2991148561",
      "incomeType": "Rent",
      "notes": "Matched from bank statement upload"
    }
  ],
  "expenses": [
    {
      "id": "exp-1",
      "landlordId": "landlord-1",
      "propertyId": "prop-1",
      "amount": 108.77,
      "currency": "TL",
      "date": "2026-06-10",
      "category": "Tax / Fee",
      "description": "Mkk Ücreti - Central Registry Agency Fee"
    }
  ]
}
```

---

## 📊 Seeding and Realistic Simulation Data

Database initialization (`server/init-db.js`) fully randomizes and sets up a realistic business context:
- **Randomized Identities & Portfolios**: Display names, corporate names, addresses, cities, and lease amounts feature a $\pm 10\%$ variance.
- **Randomized Lease Durations**: Lease durations are randomized across 12, 18, and 24 months.
- **Distinct Start & End Dates**: To prevent calendar overlaps, contract end dates are offset by $-1$ day from their anniversary date.
- **Unoccupied Portfolio Setup**: Seeds vacant units under active properties as well as completely unoccupied buildings to test vacancy tracking and doughnut visual segments.
- **Continuous Historical Transactions**: Dynamically seeds monthly charges, matching ledger payments, and bank transactions starting from each lease's specific `startDate` up to **May 2026**. This ensures historical collections are fully paid ($100\%$ collection rate) and only current/future months remain outstanding, replicating a realistic operating environment.
- **Immediate Seed Encryption**: The seeder dynamically encrypts all generated landlord JSON files upon writing, ensuring plaintext files are never saved onto raw disk volumes.
