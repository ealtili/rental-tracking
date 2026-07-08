# Rental Tracking App Specification (MVP Edition)

> [!NOTE]
> **MVP Scope**: This project is designed as a Minimum Viable Product (MVP). It concentrates on delivering the core functionalities for landlord tracking, bank statements parsing, CPI (TÜFE) rent calculation, and ledger management using a simple, high-performance, and lightweight architecture.

A multi-landlord rental tracking web application designed to automate bank statement matching, track rental income and expenses via a running debit/credit ledger, calculate CPI-based (TÜFE) yearly rent increases, and manage landlord-tenant notifications.

---

## 🏗️ Technical Architecture & Stack

- **Frontend**: Single Page Application (SPA) built with **Vite + Vanilla JS & CSS**.
  - Modern, premium visual layout using CSS variables, a responsive layout, sleek dark-mode glassmorphism, and smooth micro-animations.
- **Backend**: **Node.js + Express** local server.
  - Exposes REST API endpoints.
  - Handles Excel bank statement and configuration uploads natively using the `xlsx` library.
  - Performs Turkish CPI (TÜFE) web scraping dynamically using `cheerio` to fetch rates.
- **Data Persistence**: Isolated JSON files in the `data/` directory (`global.json` for global settings/credentials and landlord-specific `landlord_<landlord_id>.json` files to guarantee absolute database-level data isolation).
- **No Python Integration**: Built entirely in Node.js/JavaScript, eliminating the need for Python, `uv`, or a virtual environment (`.venv`).

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
      "passwordHash": "hashed_password_here"
    }
  ],
  "landlords": [
    {
      "id": "landlord-1",
      "name": "Alice Landlord",
      "email": "landlord1@example.com",
      "phone": "+905321111111",
      "passwordHash": "hashed_password_here",
      "smtpConfig": {
        "host": "smtp.gmail.com",
        "port": 587,
        "user": "landlord1@example.com",
        "pass": "encrypted_app_password"
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
      "aliases": ["HAKAN YILMAZ", "HAKAN YILMAZ ALIAS"],
      "linkedAccounts": ["Banka: 0067 SN: 2991148561"]
    }
  ],
  "leases": [
    {
      "id": "lease-1",
      "unitId": "unit-1",
      "tenantId": "tenant-1",
      "startDate": "2025-06-15",
      "endDate": "2026-06-15",
      "monthlyRent": 2282.65,
      "currency": "TL",
      "dueDay": 15,
      "paymentMethodDefault": "Bank Transfer",
      "status": "Active",
      "increaseType": "cpi", 
      "manualIncreasePercentage": null,
      "lastIncreaseDate": null,
      "notes": "Yearly TÜFE increase applies"
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
  ],
  "cpiRates": [
    {
      "year": 2026,
      "month": 6,
      "rate12MonthAvgTufe": 62.51
    }
  ],
  "notificationTemplates": {
    "landlord-1": {
      "rentIncrease2DaysEmailSubject": "Upcoming Rent Increase Notification / Kira Artış Bilgilendirmesi",
      "rentIncrease2DaysEmailBody": "Dear {tenant_name},\n\nThis is a notification that on {increase_date}, your rent for {property_address} will increase based on the TÜFE rate ({cpi_rate}%). The new rent will be {new_rent} {currency}.\n\nBest regards,\n{landlord_name}",
      "rentIncrease2DaysWhatsApp": "Hello {tenant_name}. A friendly reminder that your rent for {property_address} will adjust to {new_rent} {currency} on {increase_date} (TÜFE increase rate: {cpi_rate}%)."
    }
  },
  "notificationsQueue": [
    {
      "id": "notif-1",
      "landlordId": "landlord-1",
      "tenantId": "tenant-1",
      "leaseId": "lease-1",
      "type": "whatsapp",
      "recipient": "tenant",
      "recipientContact": "+905332222222",
      "triggerDate": "2026-06-13",
      "messageBody": "Hello Hakan Yılmaz...",
      "status": "pending"
    }
  ]
}
```

---

## 🚀 Core Features & Workflows

### 1. Landlord Signup, Login & Tenant Isolation
- A clean, modern login/signup interface.
- Session simulation (token-based or local session) that isolation-filters all database queries so that Landlord A can never access Landlord B's data.
- One pre-seeded admin user (`admin@rental.local`) and two pre-seeded landlords: `Alice Landlord` (with transaction matching records) and `Bob Landlord` (with separate mock records).

### 2. Bank Reconciliation Dashboard
- **File Upload**: Landlord uploads Excel file (e.g., `bank_statement_landlord1.xlsx`) and manually selects which property/bank account it belongs to.
- **Processing**: The Node backend parses rows 13+ and matches them against the landlord's database:
  - **Fuzzy Match Engine**: Runs a three-tier matching pipeline:
    1. **Strict ID/IBAN/Account Reference matching**: Matches sender bank codes (e.g., `Banka: 0067 SN: 2991148561`) mapped to a tenant's profile from previous transactions.
    2. **Learned Name Aliases**: Matches transaction description details that were previously manually mapped to a specific tenant (e.g., parent/spouse name `HÜSEYİN KAYA` mapped to tenant `Tuncay Kaya`).
    3. **Fuzzy Name matching**: Runs normal fuzzy text match against active tenant names.
  - **Proposed Actions**:
    1. **Link to Rent**: Pre-selected for positive transactions with matching tenant names. Period defaults to transaction date month (with a manual dropdown override to adjust for late/early payments).
    2. **Categorize as Expense**: Pre-selected for negative transactions (e.g., fees, taxes).
    3. **Ignore**: Pre-selected for trades (`FON SATIS/ALIS`), personal transfers, or unmatchable items.
- **Approval UI**:
  - Displays matches in a clear table with action icons and checkboxes.
  - **Reconciliation Action**: Support both **Bulk Approval** (checking multiple rows and approving them all) and **Individual Overrides** (manually selecting actions and matching terms before individual approval).

### 3. CPI (TÜFE) Inflation Rent Escalations & Foreign Currency Rules
- **TL Leases (CPI-based)**: On the anniversary of a lease (`startDate` month/day), the rent amount automatically calculates its inflation adjustment using the official 12-month average Consumer Price Index (TÜFE).
- **Foreign Currency Leases**: USD/EUR leases stay at their baseline rate or increase based on a fixed yearly percentage (e.g. 5% per year) specified in the lease configuration, rather than using CPI.
- **Manual Adjustments**: The landlord can override the automated calculation at any time by updating the rent amount manually in the lease settings.
- **TÜFE Inflation Scraper Helper**:
  - A Cheerio-based web scraper in the Node.js backend fetches the latest monthly 12-month average TÜFE rate from `https://kira-artis-orani.hesaplama.net/`.
  - Triggered in two ways:
    1. **Automatic Daily Fetch**: Runs during server boot and daily in the background.
    2. **Manual Button**: Landlord can click "Fetch Latest Inflation Rates" in settings.

### 4. Running Debit/Credit Ledger
- **Transactions**: Displays a complete historical running balance.
- **Dues Generation**: Rent charges (`charge` entries) are logged automatically on the due day of the lease.
- **Payments**: Payments received reduce the outstanding balance.
- **Arrears Rolling**: Unpaid balances roll forward to the next month automatically (debits accumulate until a credit/payment covers them).

### 5. Automated 2-Day & 1-Day Notifications
- **Calculation**: A daily cron-style check (or simulated checking service on login/load) checks for upcoming lease anniversaries.
- **Notification Schedule**:
  - **2 Days Before Anniversary**: Queues notifications for both tenant and landlord.
  - **1 Day Before Anniversary**: Queues a final confirmation reminder.
- **Delivery Channels**:
  - **Email**: Sent automatically in the background using SMTP if configured in landlord profile settings (with `mailto:` links as fallback).
  - **WhatsApp**: Clickable `https://wa.me/` link with custom URL-encoded pre-filled text, allowing the landlord to trigger it from the browser.
- **System-Generated Templates**:
  - Out-of-the-box system-generated notification templates provided in both **Turkish** (default for Turkish tenants) and **English**.
  - Landlords can select the tenant's preferred language, preview the text, and fully customize/override the templates.

---

## 🌳 Git & Worktree Development Workflow

The source code is managed via a private repository on GitHub at `https://github.com/ealtili/rental-tracking`.

For parallel development, developers use Git worktrees. Feature development takes place in separate worktree directories:
```bash
git worktree add ../feature-name -b feature-name
```
After completing the changes in the worktree, the branch is pushed to GitHub:
```bash
git push origin feature-name
```
Once the feature is merged into `main`, the worktree directory is removed:
```bash
git worktree remove ../feature-name
```
