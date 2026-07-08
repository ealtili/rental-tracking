# Project Rules: Rental Tracking MVP

This file defines the architecture, design guidelines, and developer rules for the **Rental Tracking App MVP**. These rules apply to all code changes, refactors, and feature implementations.

---

## 🚀 MVP & Architecture Scope
1. **MVP Design**: Keep the codebase clean, high-performance, and minimal. Avoid adding unnecessary dependencies or premature framework abstractions.
2. **Pure JavaScript Stack**:
   - **Frontend**: Single Page Application (SPA) using **Vite + Vanilla JS & CSS**. No Vue/React/Angular/TailwindCSS unless explicitly requested.
   - **Backend**: **Node.js + Express** server.
   - **No Python**: Excel parsing and web scraping are done natively in Node.js. Do not introduce Python scripts, `uv`, or virtual environments (`.venv`).
3. **Strict Landlord Data Isolation**:
   - Authentication is simulation-based using credentials in `data/global.json` (supporting both regular landlords and the system administrator account).
   - All tenant, lease, and transaction data is kept in landlord-specific files (`data/landlord_<landlord_id>.json`).
   - Every backend route that acts on landlord resources must enforce isolation by validating the `x-landlord-id` header. A landlord must never be allowed to read/write another landlord's file.

---

## 🎨 Frontend & Design Aesthetics
1. **Vibrant & Premium Aesthetics**:
   - Implement modern visual design utilizing curated dark-mode glassmorphic styling, CSS variables, gradients, and smooth micro-animations.
   - Avoid generic, unstyled browser defaults. Use modern typography (e.g., system-ui fonts, Outfit, or Inter).
2. **Bilingual Support (EN/TR)**:
   - All UI copy must support both English and Turkish dynamically.
   - Manage translations in [src/translations.js](file:///C:/Google_Drive/AgyProjects/rental-tracking/src/translations.js).
3. **Interactive & Responsive Layouts**:
   - All dashboards, settings, and tables must be fully responsive, scaling gracefully from mobile screens to desktop monitors.
   - Use dynamic hover effects and interactive states for all buttons and tabs.

---

## 📊 Backend & Integration Rules
1. **Excel Parsing (`xlsx`)**:
   - Parse bank statement files (like `bank_statement_landlord1.xlsx`) and bulk configurations starting from header rows dynamically.
   - Excel logic resides in [server/helper.js](file:///C:/Google_Drive/AgyProjects/rental-tracking/server/helper.js).
2. **Defensive Web Scraping (`cheerio` + `fetch`)**:
   - Fetch Turkish CPI (TÜFE) inflation rates from `https://kira-artis-orani.hesaplama.net/`.
   - Wrap the scraper in a try-catch block. If blocked by a WAF or structure changes, log a warning and fallback gracefully to manual user inputs in the UI instead of crashing the server.
3. **SMTP & Fallback Notifications**:
   - Send landlord-tenant email notifications using `nodemailer` when SMTP is configured.
   - If SMTP configuration is missing, fallback to a standard `mailto:` mailto link or trigger WhatsApp notifications via clickable `https://wa.me/` custom URL-encoded pre-filled texts.

---

## 🛠️ Local Development & Scripts
- Start backend and frontend concurrently:
  ```bash
  npm run dev
  ```
- Initialize/seed local database files:
  ```bash
  npm run init-db
  ```
- Build production assets:
  ```bash
  npm run build
  ```

---

## 🌳 Git & Worktree Workflow
1. **GitHub Remote**: Private repository at `https://github.com/ealtili/rental-tracking`.
2. **Worktree Development**: Instead of checking out branches in the main directory, use Git worktrees for parallel feature development to prevent configuration or running container state conflicts:
   - Add a new feature worktree:
     ```bash
     git worktree add ../feature-name -b feature-name
     ```
   - Work in the `../feature-name` folder, commit, and push.
   - Clean up the worktree once the feature is merged:
     ```bash
     git worktree remove ../feature-name
     git branch -d feature-name
     ```
