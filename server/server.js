const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { parseBankStatement, scrapeLatestTufe, parsePropertyUpload } = require('./helper');

// Load environment variables from .env file natively if present
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key) process.env[key] = val;
    }
  });
}

const app = express();

// Secure Multer configuration
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      return cb(new Error('Only Excel files (.xlsx) are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Configure secure CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'http://localhost:5000'],
  credentials: true
}));

app.use(express.json());

// Native Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
  next();
});

// Simple memory-based rate limiter for login attempts
const loginAttempts = new Map();
function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

  if (now - attempt.lastAttempt > 15 * 60 * 1000) {
    attempt.count = 0;
  }

  if (attempt.count >= 10) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again after 15 minutes.' });
  }

  attempt.count++;
  attempt.lastAttempt = now;
  loginAttempts.set(ip, attempt);
  next();
}

// AES-256 Encryption helpers for SMTP passwords
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const SMTP_ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY;
const SMTP_ENCRYPTION_IV = process.env.SMTP_ENCRYPTION_IV;
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY;

// Strict security checks on startup - No hardcoded fallbacks allowed
if (!DB_ENCRYPTION_KEY || DB_ENCRYPTION_KEY.length !== 64) {
  console.error('FATAL ERROR: DB_ENCRYPTION_KEY must be set in your .env file as a 64-character hex string!');
  process.exit(1);
}
if (!SMTP_ENCRYPTION_KEY || SMTP_ENCRYPTION_KEY.length !== 32) {
  console.error('FATAL ERROR: SMTP_ENCRYPTION_KEY must be set in your .env file as a 32-character string!');
  process.exit(1);
}
if (!SMTP_ENCRYPTION_IV || SMTP_ENCRYPTION_IV.length !== 16) {
  console.error('FATAL ERROR: SMTP_ENCRYPTION_IV must be set in your .env file as a 16-character string!');
  process.exit(1);
}

// 1. Text Encryption helpers (used for SMTP App Passwords)
function encrypt(text) {
  if (!text) return '';
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(SMTP_ENCRYPTION_KEY), Buffer.from(SMTP_ENCRYPTION_IV));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text) {
  if (!text) return '';
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(SMTP_ENCRYPTION_KEY), Buffer.from(SMTP_ENCRYPTION_IV));
    let decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption failed, returning plain text:', err);
    return text;
  }
}

// 2. Database Encryption helpers (used for landlord JSON files, AES-256-GCM authenticated encryption)
function encryptDb(data) {
  const key = Buffer.from(DB_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12); // GCM standard 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag,
    content: encrypted
  });
}

function decryptDb(encryptedStr) {
  try {
    const payload = JSON.parse(encryptedStr);
    
    // Check if the payload matches the encrypted format (carries content/tag/iv)
    if (!payload.content || !payload.tag || !payload.iv) {
      // Auto-fallback and transparent migration for legacy unencrypted databases
      return payload;
    }
    
    const key = Buffer.from(DB_ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
    
    let decrypted = decipher.update(payload.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to decrypt database, attempting raw JSON parse fallback:', err);
    try {
      return JSON.parse(encryptedStr);
    } catch (e) {
      throw new Error(`Database corrupted or invalid encryption key: ${err.message}`);
    }
  }
}

// Path Traversal Sanitizer for Landlord IDs
function sanitizeLandlordId(id) {
  if (!id || typeof id !== 'string') return null;
  const match = id.match(/^(landlord|admin)-[a-zA-Z0-9_-]+$/);
  return match ? match[0] : null;
}

// Serve built Vite frontend static files
app.use(express.static(path.join(__dirname, '../dist')));

// DB Path configuration
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/db.json');
const dataDir = path.dirname(dbPath);
const globalDbPath = path.join(dataDir, 'global.json');

function getLandlordDbPath(landlordId) {
  const sanitized = sanitizeLandlordId(landlordId);
  if (!sanitized) throw new Error('Invalid Landlord ID format');
  return path.join(dataDir, `landlord_${sanitized}.json`);
}

// Auto-initialize db files in volume if missing
try {
  const seedDir = path.join(__dirname, '../data_seed');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Copy global.json
  if (!fs.existsSync(globalDbPath)) {
    const seedGlobal = path.join(seedDir, 'global.json');
    const localSeedGlobal = path.join(__dirname, '../data/global.json');
    if (fs.existsSync(seedGlobal)) {
      console.log('Initializing global database from seed...');
      fs.copyFileSync(seedGlobal, globalDbPath);
    } else if (fs.existsSync(localSeedGlobal)) {
      console.log('Initializing global database from local data...');
      fs.copyFileSync(localSeedGlobal, globalDbPath);
    }
  }

  // Copy landlord databases
  if (fs.existsSync(seedDir)) {
    const files = fs.readdirSync(seedDir);
    files.forEach(file => {
      if (file.startsWith('landlord_') && file.endsWith('.json')) {
        const destPath = path.join(dataDir, file);
        if (!fs.existsSync(destPath)) {
          console.log(`Initializing landlord database from seed: ${file}`);
          fs.copyFileSync(path.join(seedDir, file), destPath);
        }
      }
    });
  } else {
    // Check local data directory as fallback
    const localDataDir = path.join(__dirname, '../data');
    if (fs.existsSync(localDataDir) && localDataDir !== dataDir) {
      const files = fs.readdirSync(localDataDir);
      files.forEach(file => {
        if (file.startsWith('landlord_') && file.endsWith('.json')) {
          const destPath = path.join(dataDir, file);
          if (!fs.existsSync(destPath)) {
            console.log(`Initializing landlord database from local data: ${file}`);
            fs.copyFileSync(path.join(localDataDir, file), destPath);
          }
        }
      });
    }
  }
  
  // Write legacy dummy db.json if not present
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ landlords: [], cpiRates: [] }), 'utf8');
  }
} catch (e) {
  console.error('Failed to initialize database volume files:', e);
}

// Global DB helpers
function readGlobalDb() {
  try {
    if (!fs.existsSync(globalDbPath)) {
      return { landlords: [], cpiRates: [] };
    }
    return JSON.parse(fs.readFileSync(globalDbPath, 'utf8'));
  } catch (err) {
    console.error('Error reading global DB:', err);
    return { landlords: [], cpiRates: [] };
  }
}

function writeGlobalDb(data) {
  try {
    fs.writeFileSync(globalDbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing global DB:', err);
  }
}

// Chart of Accounts (COA) default structure
const DEFAULT_COA = {
  "1100": { "name": "Cash / Bank Account", "type": "Asset" },
  "1200": { "name": "Accounts Receivable (Rent)", "type": "Asset" },
  "2200": { "name": "Security Deposit Liability", "type": "Liability" },
  "4100": { "name": "Rental Income", "type": "Income" },
  "5100": { "name": "Property Taxes / Stopaj", "type": "Expense" },
  "5200": { "name": "Maintenance & Repairs", "type": "Expense" }
};

// Landlord specific DB helpers
function readLandlordDb(landlordId) {
  const filePath = getLandlordDbPath(landlordId);
  try {
    if (!fs.existsSync(filePath)) {
      return { 
        properties: [], 
        units: [], 
        tenants: [], 
        leases: [], 
        ledgerEntries: [], 
        payments: [], 
        expenses: [], 
        aliases: {}, 
        chartOfAccounts: DEFAULT_COA,
        journalEntries: [],
        bankTransactions: []
      };
    }
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = decryptDb(fileContent);
    if (!data.chartOfAccounts) data.chartOfAccounts = DEFAULT_COA;
    if (!data.journalEntries) data.journalEntries = [];
    if (!data.bankTransactions) data.bankTransactions = [];
    return data;
  } catch (err) {
    console.error(`Error reading landlord DB for ${landlordId}:`, err);
    return { 
      properties: [], 
      units: [], 
      tenants: [], 
      leases: [], 
      ledgerEntries: [], 
      payments: [], 
      expenses: [], 
      aliases: {}, 
      chartOfAccounts: DEFAULT_COA,
      journalEntries: [],
      bankTransactions: []
    };
  }
}

function writeLandlordDb(landlordId, data) {
  const filePath = getLandlordDbPath(landlordId);
  try {
    const encryptedContent = encryptDb(data);
    fs.writeFileSync(filePath, encryptedContent, 'utf8');
  } catch (err) {
    console.error(`Error writing landlord DB for ${landlordId}:`, err);
  }
}

// Security: Hash password using secure scrypt (memory-hard key derivation)
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Helper: Normalize names for fuzzy matching
function normalizeText(text) {
  if (!text) return '';
  return text
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper to calculate rent charge for a specific month based on rent schedules/escalations.
 * Evaluates the lease start date, counts anniversaries, fetches historical TÜFE
 * or applies fixed yearly increases, and computes the correct rent for that period.
 */
function calculateRentForPeriod(lease, targetPeriodDate, cpiRates) {
  // If v2.0 rent schedule array is defined, use it directly
  if (lease.rentSchedule && lease.rentSchedule.length > 0) {
    const targetTime = new Date(targetPeriodDate).getTime();
    const matchedBlock = lease.rentSchedule.find(block => {
      const start = new Date(block.startDate).getTime();
      const end = block.endDate ? new Date(block.endDate).getTime() : Infinity;
      return targetTime >= start && targetTime <= end;
    });
    if (matchedBlock) return matchedBlock.amount;
    // Fallback to the last available rent schedule block
    return lease.rentSchedule[lease.rentSchedule.length - 1].amount;
  }

  // Legacy fallback anniversary calculation
  const start = new Date(lease.startDate);
  const target = new Date(targetPeriodDate);
  
  if (target < start) return lease.monthlyRent || 0;
  
  let yearsDiff = target.getFullYear() - start.getFullYear();
  if (target.getMonth() < start.getMonth()) {
    yearsDiff--;
  }
  
  if (yearsDiff <= 0) return lease.monthlyRent || 0;
  
  let currentRent = lease.monthlyRent || 0;
  const incType = lease.increaseRule ? lease.increaseRule.type : lease.increaseType;
  const manualPct = lease.increaseRule ? lease.increaseRule.manualPercentage : lease.manualIncreasePercentage;
  
  for (let year = 1; year <= yearsDiff; year++) {
    if (incType === 'cpi') {
      const anniversaryMonth = new Date(start.getTime());
      anniversaryMonth.setFullYear(start.getFullYear() + year);
      
      const rateYear = anniversaryMonth.getFullYear();
      const rateMonth = anniversaryMonth.getMonth() + 1;
      
      const cpiRecord = cpiRates.find(r => r.year === rateYear && r.month === rateMonth);
      const rate = cpiRecord ? cpiRecord.rate12MonthAvgTufe : 60.0;
      
      currentRent = currentRent * (1 + rate / 100);
    } else if (incType === 'fixed') {
      const fixedRate = manualPct || 0;
      currentRent = currentRent * (1 + fixedRate / 100);
    }
  }
  
  return Math.round(currentRent * 100) / 100;
}

/**
 * Auto-generates ledger charge entries and double-entry JEs up to the current date.
 */
function generateLedgerCharges(db, lease, cpiRates) {
  const start = new Date(lease.startDate);
  const today = new Date();
  
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  
  let updated = false;
  
  while (current < end) {
    const periodStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-01`;
    
    // Check if legacy charge already exists for this period
    const exists = db.ledgerEntries.find(
      e => e.leaseId === lease.id && e.type === 'charge' && e.description.includes(periodStr.slice(0, 7))
    );
    
    const rentAmount = calculateRentForPeriod(lease, periodStr, cpiRates);
    const tenant = db.tenants.find(t => t.id === lease.tenantId);
    const landlordId = tenant ? tenant.landlordId : '';

    if (!exists) {
      db.ledgerEntries.push({
        id: `charge-${lease.id}-${periodStr}`,
        landlordId: landlordId,
        leaseId: lease.id,
        date: `${periodStr.slice(0, 7)}-${String(lease.dueDay).padStart(2, '0')}`,
        type: 'charge',
        amount: rentAmount,
        currency: lease.currency || 'TL',
        description: `Monthly Rent Charge - ${periodStr.slice(0, 7)}`
      });
      
      updated = true;
    }

    // Check / Generate balanced double-entry Journal Entry (v2.0)
    const jeId = `je-charge-${lease.id}-${periodStr}`;
    const jeExists = db.journalEntries.find(je => je.id === jeId);
    if (!jeExists) {
      db.journalEntries.push({
        id: jeId,
        date: `${periodStr.slice(0, 7)}-${String(lease.dueDay).padStart(2, '0')}`,
        description: `Rent Charge - ${periodStr.slice(0, 7)}`,
        leaseId: lease.id,
        lines: [
          { accountId: "1200", debit: rentAmount, credit: 0 }, // Accounts Receivable (Rent) - Debit
          { accountId: "4100", debit: 0, credit: rentAmount }  // Rental Income - Credit
        ]
      });
      updated = true;
    }
    
    // Move to next month
    current.setMonth(current.getMonth() + 1);
  }
  
  return updated;
}

// Global Daily Cron Simulation (runs on server startup and endpoints)
function runCronServices(landlordId) {
  const globalDb = readGlobalDb();
  const cpiRates = globalDb.cpiRates || [];
  
  const db = readLandlordDb(landlordId);
  let dbChanged = false;
  
  // 1. Generate due charges for all active leases
  db.leases.forEach(lease => {
    if (lease.status === 'Active') {
      const updated = generateLedgerCharges(db, lease, cpiRates);
      if (updated) dbChanged = true;
    }
  });

  // 2. Queue notifications for upcoming rent increases (2 days and 1 day before anniversary)
  const today = new Date();
  db.leases.forEach(lease => {
    if (lease.status !== 'Active') return;
    
    const start = new Date(lease.startDate);
    const anniversary = new Date(today.getFullYear(), start.getMonth(), start.getDate());
    
    // Calculate time differences
    const diffTime = anniversary - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Check if the anniversary is in 1 or 2 days
    if (diffDays === 1 || diffDays === 2) {
      const tenant = db.tenants.find(t => t.id === lease.tenantId);
      const landlord = globalDb.landlords.find(l => l.id === landlordId);
      const unit = db.units.find(u => u.id === lease.unitId);
      const property = unit ? db.properties.find(p => p.id === unit.propertyId) : null;
      
      if (!tenant || !landlord || !property || !unit) {
        return;
      }
      
      const periodYearStr = `${anniversary.getFullYear()}-${String(anniversary.getMonth() + 1).padStart(2, '0')}-01`;
      const nextRent = calculateRentForPeriod(lease, periodYearStr, cpiRates);
      
      // Calculate CPI rate
      const rateRecord = cpiRates.find(r => r.year === anniversary.getFullYear() && r.month === (anniversary.getMonth() + 1));
      const cpiRate = rateRecord ? rateRecord.rate12MonthAvgTufe : 60.0;
      
      // Unique notification key
      const notifKey = `increase-${lease.id}-${anniversary.getFullYear()}-${diffDays}days`;
      
      if (!db.notificationsQueue) {
        db.notificationsQueue = [];
      }
      
      const exists = db.notificationsQueue.find(n => n.id === notifKey);
      
      if (!exists) {
        // Load template or fallback to default
        const templates = globalDb.notificationTemplates ? (globalDb.notificationTemplates[landlordId] || {}) : {};
        let emailSubject = templates.rentIncrease2DaysEmailSubject || 'Rent Increase Adjustment / Kira Artış Bildirimi';
        let emailBody = templates.rentIncrease2DaysEmailBody || 'Dear {tenant_name},\n\nThis is a notification that on {increase_date}, your rent for {property_address} will increase to {new_rent} {currency} based on the TÜFE rate ({cpi_rate}%).\n\nBest regards,\n{landlord_name}';
        let waBody = templates.rentIncrease2DaysWhatsApp || 'Hello {tenant_name}. A friendly reminder that your rent for {property_address} will adjust to {new_rent} {currency} on {increase_date} (TÜFE rate: {cpi_rate}%).';
        
        // Dynamic placeholder replacing
        const replacements = {
          '{tenant_name}': tenant.name,
          '{property_address}': property.address,
          '{increase_date}': lease.endDate,
          '{cpi_rate}': lease.increaseType === 'cpi' ? cpiRate : (lease.manualIncreasePercentage || 0),
          '{new_rent}': nextRent,
          '{currency}': lease.currency,
          '{landlord_name}': landlord.name
        };
        
        const replaceAll = (text) => {
          let output = text;
          for (let key in replacements) {
            output = output.split(key).join(replacements[key]);
          }
          return output;
        };

        // Queue Email
        db.notificationsQueue.push({
          id: `${notifKey}-email`,
          landlordId: landlord.id,
          tenantId: tenant.id,
          leaseId: lease.id,
          type: 'email',
          recipient: 'tenant',
          recipientContact: tenant.email,
          triggerDate: new Date().toISOString().split('T')[0],
          messageBody: replaceAll(emailBody),
          subject: replaceAll(emailSubject),
          status: 'pending'
        });

        // Queue WhatsApp
        db.notificationsQueue.push({
          id: `${notifKey}-wa`,
          landlordId: landlord.id,
          tenantId: tenant.id,
          leaseId: lease.id,
          type: 'whatsapp',
          recipient: 'tenant',
          recipientContact: tenant.phone,
          triggerDate: new Date().toISOString().split('T')[0],
          messageBody: replaceAll(waBody),
          status: 'pending'
        });
        
        dbChanged = true;
      }
    }
  });

  if (dbChanged) {
    writeLandlordDb(landlordId, db);
  }
}

// Middleware: Authenticated requests must carry x-landlord-id
function authenticateLandlord(req, res, next) {
  const rawId = req.headers['x-landlord-id'];
  const landlordId = sanitizeLandlordId(rawId);
  if (!landlordId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing x-landlord-id header' });
  }
  const db = readGlobalDb();
  const landlord = db.landlords.find(l => l.id === landlordId);
  if (!landlord) {
    return res.status(401).json({ error: 'Unauthorized: Invalid landlord ID' });
  }
  req.landlord = landlord;
  next();
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Auth: Signup
app.post('/api/auth/signup', loginRateLimiter, (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = readGlobalDb();
  const exists = db.landlords.find(l => l.email.toLowerCase() === email.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const landlordId = `landlord-${Date.now()}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  const newLandlord = {
    id: landlordId,
    name,
    email,
    phone: phone || '',
    passwordHash,
    salt,
    smtpConfig: null
  };

  db.landlords.push(newLandlord);
  writeGlobalDb(db);

  // Initialize landlord specific database file
  const landlordDb = {
    properties: [],
    units: [],
    tenants: [],
    leases: [],
    ledgerEntries: [],
    payments: [],
    expenses: [],
    notificationTemplates: {},
    notificationsQueue: [],
    aliases: {}
  };
  writeLandlordDb(landlordId, landlordDb);

  res.status(201).json({ id: landlordId, name, email, phone: phone || '' });
});

// Auth: Login (handles both landlords and admins)
app.post('/api/auth/login', loginRateLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  const db = readGlobalDb();

  // Check admin accounts first
  const admins = db.admins || [];
  const admin = admins.find(a => a.email.toLowerCase() === email.toLowerCase());
  if (admin) {
    const computedHash = hashPassword(password, admin.salt);
    if (computedHash !== admin.passwordHash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    return res.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'admin'
    });
  }

  // Check landlord accounts
  const landlord = db.landlords.find(l => l.email.toLowerCase() === email.toLowerCase());
  if (!landlord) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const computedHash = hashPassword(password, landlord.salt);
  if (computedHash !== landlord.passwordHash) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  // Pre-trigger dues updates on login for this landlord
  runCronServices(landlord.id);

  res.json({ id: landlord.id, name: landlord.name, email: landlord.email, phone: landlord.phone || '', role: 'landlord' });
});

// Middleware: Admin-only requests must carry x-admin-id header
function authenticateAdmin(req, res, next) {
  const rawId = req.headers['x-admin-id'];
  const adminId = sanitizeLandlordId(rawId);
  if (!adminId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing x-admin-id header' });
  }
  const db = readGlobalDb();
  const admin = (db.admins || []).find(a => a.id === adminId);
  if (!admin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin ID' });
  }
  req.admin = admin;
  next();
}

// ── Admin: List all landlord accounts ─────────────────────────────────────────
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  const db = readGlobalDb();
  const users = (db.landlords || []).map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone || ''
  }));
  res.json(users);
});

// ── Admin: Reset a landlord password ──────────────────────────────────────────
app.put('/api/admin/users/:id/reset-password', authenticateAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const db = readGlobalDb();
  const landlord = db.landlords.find(l => l.id === req.params.id);
  if (!landlord) {
    return res.status(404).json({ error: 'User not found' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  landlord.salt = salt;
  landlord.passwordHash = hashPassword(newPassword, salt);
  writeGlobalDb(db);

  res.json({ success: true, message: `Password reset for ${landlord.name}` });
});

// ── Admin: Delete a landlord account and all their data ───────────────────────
app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
  const db = readGlobalDb();
  const idx = db.landlords.findIndex(l => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const landlordId = db.landlords[idx].id;

  // Remove landlord from global DB
  db.landlords.splice(idx, 1);
  writeGlobalDb(db);

  // Delete landlord-specific data file
  try {
    const landlordDbPath = getLandlordDbPath(landlordId);
    if (fs.existsSync(landlordDbPath)) {
      fs.unlinkSync(landlordDbPath);
    }
  } catch (err) {
    console.error('Failed to unlink landlord DB file:', err);
  }

  res.json({ success: true, message: `User ${landlordId} and all their data deleted.` });
});

// Get isolated properties
app.get('/api/properties', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  const propertiesWithUnits = db.properties.map(p => ({
    ...p,
    units: db.units.filter(u => u.propertyId === p.id)
  }));
  res.json(propertiesWithUnits);
});

// Add property
app.post('/api/properties', authenticateLandlord, (req, res) => {
  const { name, address, city, type, notes } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address' });

  const db = readLandlordDb(req.landlord.id);
  const newProp = {
    id: `prop-${Date.now()}`,
    landlordId: req.landlord.id,
    name: name || address,
    address,
    city: city || '',
    type: type || 'Residential',
    active: true,
    notes: notes || ''
  };
  
  db.properties.push(newProp);
  writeLandlordDb(req.landlord.id, db);
  res.status(201).json(newProp);
});

// Update property
app.put('/api/properties/:id', authenticateLandlord, (req, res) => {
  const { name, address, city, type, active, notes } = req.body;
  const db = readLandlordDb(req.landlord.id);
  const prop = db.properties.find(p => p.id === req.params.id);
  
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  if (name !== undefined) prop.name = name;
  if (address !== undefined) prop.address = address;
  if (city !== undefined) prop.city = city;
  if (type !== undefined) prop.type = type;
  if (active !== undefined) prop.active = active;
  if (notes !== undefined) prop.notes = notes;

  writeLandlordDb(req.landlord.id, db);
  res.json(prop);
});

// Delete property
app.delete('/api/properties/:id', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  const propIndex = db.properties.findIndex(p => p.id === req.params.id);
  
  if (propIndex === -1) return res.status(404).json({ error: 'Property not found' });

  // Cascade delete units, leases, and ledgerEntries
  const unitIds = db.units.filter(u => u.propertyId === req.params.id).map(u => u.id);
  const leaseIds = db.leases.filter(l => unitIds.includes(l.unitId)).map(l => l.id);

  db.properties.splice(propIndex, 1);
  db.units = db.units.filter(u => u.propertyId !== req.params.id);
  db.leases = db.leases.filter(l => !unitIds.includes(l.unitId));
  db.ledgerEntries = db.ledgerEntries.filter(le => !leaseIds.includes(le.leaseId));
  db.payments = db.payments.filter(p => !leaseIds.includes(p.leaseId));

  writeLandlordDb(req.landlord.id, db);
  res.json({ success: true });
});

// Add unit to property
app.post('/api/properties/:propertyId/units', authenticateLandlord, (req, res) => {
  const { propertyId } = req.params;
  const { unitNumber, squareMeters, status, notes, tenantName, monthlyRent, startDate, currency, dueDay, increaseType, manualIncreasePercentage } = req.body;
  if (!unitNumber) return res.status(400).json({ error: 'Missing unit number' });

  const db = readLandlordDb(req.landlord.id);
  const prop = db.properties.find(p => p.id === propertyId);
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  // Check if unit number already exists in this property
  const exists = db.units.some(u => u.propertyId === propertyId && u.unitNumber.toLowerCase() === unitNumber.toLowerCase());
  if (exists) return res.status(400).json({ error: 'Unit number already exists in this property' });

  const newUnit = {
    id: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    propertyId,
    unitNumber,
    squareMeters: squareMeters ? parseFloat(squareMeters) : 0,
    status: status || 'Vacant',
    notes: notes || ''
  };

  // If status is Occupied, create tenant & lease
  if (status === 'Occupied') {
    if (!tenantName || !monthlyRent) {
      return res.status(400).json({ error: 'Occupied unit requires a tenant name and monthly rent.' });
    }

    // Find or create tenant
    let tenant = db.tenants.find(t => t.name.toLowerCase() === tenantName.toLowerCase());
    if (!tenant) {
      tenant = {
        id: `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        landlordId: req.landlord.id,
        name: tenantName,
        email: '',
        phone: '',
        aliases: [tenantName],
        linkedAccounts: []
      };
      db.tenants.push(tenant);
    }

    // Create lease
    const leaseId = `lease-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newLease = {
      id: leaseId,
      unitId: newUnit.id,
      tenantId: tenant.id,
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: '',
      monthlyRent: parseFloat(monthlyRent) || 0,
      currency: currency || 'TL',
      dueDay: parseInt(dueDay) || 1,
      paymentMethodDefault: 'Bank Transfer',
      status: 'Active',
      increaseType: increaseType || 'cpi',
      manualIncreasePercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null,
      lastIncreaseDate: null,
      notes: '',
      increaseRule: {
        type: increaseType || 'cpi',
        manualPercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null
      },
      rentSchedule: [
        {
          startDate: startDate || new Date().toISOString().split('T')[0],
          endDate: '2028-12-31',
          amount: parseFloat(monthlyRent) || 0,
          currency: currency || 'TL'
        }
      ],
      deposits: []
    };
    db.leases.push(newLease);
    const globalDb = readGlobalDb();
    generateLedgerCharges(db, newLease, globalDb.cpiRates || []);
  }

  db.units.push(newUnit);
  writeLandlordDb(req.landlord.id, db);
  res.status(201).json(newUnit);
});

// Update unit details
app.put('/api/units/:id', authenticateLandlord, (req, res) => {
  const { unitNumber, squareMeters, status, notes, tenantName, monthlyRent, startDate, currency, dueDay, increaseType, manualIncreasePercentage } = req.body;
  const db = readLandlordDb(req.landlord.id);
  const unit = db.units.find(u => u.id === req.params.id);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });

  // Verify property ownership
  const prop = db.properties.find(p => p.id === unit.propertyId);
  if (!prop) return res.status(403).json({ error: 'Access Denied' });

  const oldStatus = unit.status;

  // Check if unit number already exists elsewhere in this property
  if (unitNumber && unitNumber.toLowerCase() !== unit.unitNumber.toLowerCase()) {
    const exists = db.units.some(u => u.propertyId === unit.propertyId && u.unitNumber.toLowerCase() === unitNumber.toLowerCase());
    if (exists) return res.status(400).json({ error: 'Unit number already exists in this property' });
    unit.unitNumber = unitNumber;
  }

  if (squareMeters !== undefined) unit.squareMeters = squareMeters ? parseFloat(squareMeters) : 0;
  if (status !== undefined) unit.status = status;
  if (notes !== undefined) unit.notes = notes;

  // Bidirectional Synchronization Loops
  if (status === 'Occupied') {
    // Look for current active lease
    let lease = db.leases.find(l => l.unitId === unit.id && l.status === 'Active');
    
    if (lease) {
      // Unit is already occupied, update the active lease parameters if provided
      if (tenantName) {
        // If tenant name changes, find/create tenant
        let tenant = db.tenants.find(t => t.name.toLowerCase() === tenantName.toLowerCase());
        if (!tenant) {
          tenant = {
            id: `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            landlordId: req.landlord.id,
            name: tenantName,
            email: '',
            phone: '',
            aliases: [tenantName],
            linkedAccounts: []
          };
          db.tenants.push(tenant);
        }
        lease.tenantId = tenant.id;
      }
      if (startDate !== undefined) lease.startDate = startDate;
      if (monthlyRent !== undefined) lease.monthlyRent = parseFloat(monthlyRent);
      if (currency !== undefined) lease.currency = currency;
      if (dueDay !== undefined) lease.dueDay = parseInt(dueDay);
      if (increaseType !== undefined) lease.increaseType = increaseType;
      if (manualIncreasePercentage !== undefined) lease.manualIncreasePercentage = manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null;

      // Update v2.0 structures
      if (increaseType !== undefined || manualIncreasePercentage !== undefined) {
        lease.increaseRule = {
          type: lease.increaseType || 'cpi',
          manualPercentage: lease.manualIncreasePercentage ? parseFloat(lease.manualIncreasePercentage) : null
        };
      }
      if (startDate !== undefined || monthlyRent !== undefined || currency !== undefined) {
        lease.rentSchedule = [
          {
            startDate: lease.startDate,
            endDate: lease.endDate || '2028-12-31',
            amount: parseFloat(lease.monthlyRent),
            currency: lease.currency
          }
        ];
      }

      // Regenerate pending charges
      db.ledgerEntries = db.ledgerEntries.filter(le => le.leaseId !== lease.id || le.paymentStatus === 'Paid');
      const globalDb = readGlobalDb();
      generateLedgerCharges(db, lease, globalDb.cpiRates || []);
    } else {
      // Unit status changed from Vacant/Maintenance to Occupied, create new lease
      if (!tenantName || !monthlyRent) {
        return res.status(400).json({ error: 'Occupied unit requires a tenant name and monthly rent.' });
      }

      let tenant = db.tenants.find(t => t.name.toLowerCase() === tenantName.toLowerCase());
      if (!tenant) {
        tenant = {
          id: `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          landlordId: req.landlord.id,
          name: tenantName,
          email: '',
          phone: '',
          aliases: [tenantName],
          linkedAccounts: []
        };
        db.tenants.push(tenant);
      }

      const leaseId = `lease-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newLease = {
        id: leaseId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: '',
        monthlyRent: parseFloat(monthlyRent) || 0,
        currency: currency || 'TL',
        dueDay: parseInt(dueDay) || 1,
        paymentMethodDefault: 'Bank Transfer',
        status: 'Active',
        increaseType: increaseType || 'cpi',
        manualIncreasePercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null,
        lastIncreaseDate: null,
        notes: '',
        increaseRule: {
          type: increaseType || 'cpi',
          manualPercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null
        },
        rentSchedule: [
          {
            startDate: startDate || new Date().toISOString().split('T')[0],
            endDate: '2028-12-31',
            amount: parseFloat(monthlyRent) || 0,
            currency: currency || 'TL'
          }
        ],
        deposits: []
      };
      db.leases.push(newLease);
      const globalDb = readGlobalDb();
      generateLedgerCharges(db, newLease, globalDb.cpiRates || []);
    }
  } else if ((status === 'Vacant' || status === 'Maintenance') && oldStatus === 'Occupied') {
    // Terminate active leases for this unit
    const activeLeases = db.leases.filter(l => l.unitId === unit.id && l.status === 'Active');
    activeLeases.forEach(al => {
      al.status = 'Terminated';
      al.endDate = new Date().toISOString().split('T')[0];
      // Clean up future unpaid ledger charges after end date
      db.ledgerEntries = db.ledgerEntries.filter(le => le.leaseId !== al.id || le.paymentStatus === 'Paid');
      const globalDb = readGlobalDb();
      generateLedgerCharges(db, al, globalDb.cpiRates || []);
    });
  }

  writeLandlordDb(req.landlord.id, db);
  res.json(unit);
});

// Delete unit
app.delete('/api/units/:id', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  const unitIndex = db.units.findIndex(u => u.id === req.params.id);
  if (unitIndex === -1) return res.status(404).json({ error: 'Unit not found' });

  const unit = db.units[unitIndex];
  // Verify property ownership
  const prop = db.properties.find(p => p.id === unit.propertyId);
  if (!prop) return res.status(403).json({ error: 'Access Denied' });

  // Cascade delete leases & ledgerEntries
  const leaseIds = db.leases.filter(l => l.unitId === req.params.id).map(l => l.id);

  db.units.splice(unitIndex, 1);
  db.leases = db.leases.filter(l => l.unitId !== req.params.id);
  db.ledgerEntries = db.ledgerEntries.filter(le => !leaseIds.includes(le.leaseId));
  db.payments = db.payments.filter(p => !leaseIds.includes(p.leaseId));

  writeLandlordDb(req.landlord.id, db);
  res.json({ success: true });
});

// Bulk Upload Properties Excel
app.post('/api/properties/bulk-upload', authenticateLandlord, upload.single('properties_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const uploadedProps = parsePropertyUpload(req.file.path);
    const db = readLandlordDb(req.landlord.id);

    let propertiesCreated = 0;
    let unitsCreated = 0;

    uploadedProps.forEach(up => {
      // Find if property address already exists
      let prop = db.properties.find(p => p.address.toLowerCase() === up.address.toLowerCase());
      
      if (!prop) {
        prop = {
          id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          landlordId: req.landlord.id,
          name: up.name || up.address,
          address: up.address,
          city: up.city,
          type: up.type,
          active: true,
          notes: up.notes
        };
        db.properties.push(prop);
        propertiesCreated++;
      }

      // Add units
      up.units.forEach(uu => {
        // Check if unit number already exists in this property
        const exists = db.units.some(u => u.propertyId === prop.id && u.unitNumber.toLowerCase() === uu.unitNumber.toLowerCase());
        if (!exists) {
          db.units.push({
            id: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            propertyId: prop.id,
            unitNumber: uu.unitNumber,
            squareMeters: uu.squareMeters,
            status: 'Vacant',
            notes: uu.notes
          });
          unitsCreated++;
        }
      });
    });

    writeLandlordDb(req.landlord.id, db);
    
    // Clean up temporary upload file safely
    fs.unlinkSync(req.file.path);

    res.json({ success: true, propertiesCreated, unitsCreated });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('Bulk upload properties failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get isolated tenants
app.get('/api/tenants', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  res.json(db.tenants);
});

// Add tenant
app.post('/api/tenants', authenticateLandlord, (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const db = readLandlordDb(req.landlord.id);
  const newTenant = {
    id: `tenant-${Date.now()}`,
    landlordId: req.landlord.id,
    name,
    email: email || '',
    phone: phone || '',
    aliases: [name.toUpperCase()],
    linkedAccounts: []
  };

  db.tenants.push(newTenant);
  writeLandlordDb(req.landlord.id, db);
  res.status(201).json(newTenant);
});

// Get isolated leases
app.get('/api/leases', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  const leases = db.leases;
  
  // Hydrate output with Property Address and Tenant Name
  const hydrated = leases.map(l => {
    const tenant = db.tenants.find(t => t.id === l.tenantId);
    const unit = db.units.find(u => u.id === l.unitId);
    const prop = unit ? db.properties.find(p => p.id === unit.propertyId) : null;
    
    // Fallback dynamic rent values for frontend backwards compatibility
    const rentAmount = l.rentSchedule && l.rentSchedule.length > 0
      ? l.rentSchedule[l.rentSchedule.length - 1].amount
      : (l.monthlyRent || 0);

    const rentCurrency = l.rentSchedule && l.rentSchedule.length > 0
      ? l.rentSchedule[l.rentSchedule.length - 1].currency
      : (l.currency || 'TL');

    const incType = l.increaseRule ? l.increaseRule.type : (l.increaseType || 'cpi');
    const manualPct = l.increaseRule ? l.increaseRule.manualPercentage : (l.manualIncreasePercentage || null);

    return {
      ...l,
      monthlyRent: rentAmount,
      currency: rentCurrency,
      increaseType: incType,
      manualIncreasePercentage: manualPct,
      tenantName: tenant ? tenant.name : 'Unknown',
      propertyAddress: (prop && unit) ? `${prop.address} - ${unit.unitNumber}` : 'Unknown'
    };
  });
  
  res.json(hydrated);
});

// Add lease
app.post('/api/leases', authenticateLandlord, (req, res) => {
  const { unitId, tenantId, startDate, endDate, monthlyRent, currency, dueDay, increaseType, manualIncreasePercentage } = req.body;
  
  if (!unitId || !tenantId || !startDate || !monthlyRent || !dueDay) {
    return res.status(400).json({ error: 'Missing lease parameters' });
  }

  if (endDate && startDate === endDate) {
    return res.status(400).json({ error: 'Contract End Date must be different from Contract Start Date' });
  }
  if (endDate && new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({ error: 'Contract End Date must be after the Contract Start Date' });
  }

  const db = readLandlordDb(req.landlord.id);
  
  // Ensure unit exists in landlord DB
  const unit = db.units.find(u => u.id === unitId);
  if (!unit) {
    return res.status(403).json({ error: 'Access Denied: Unit not found' });
  }

  const leaseId = `lease-${Date.now()}`;
  const newLease = {
    id: leaseId,
    unitId,
    tenantId,
    startDate,
    endDate: endDate || '',
    monthlyRent: parseFloat(monthlyRent),
    currency: currency || 'TL',
    dueDay: parseInt(dueDay),
    paymentMethodDefault: 'Bank Transfer',
    status: 'Active',
    increaseType: increaseType || 'cpi',
    manualIncreasePercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null,
    lastIncreaseDate: null,
    notes: '',
    // v2.0 properties
    increaseRule: {
      type: increaseType || 'cpi',
      manualPercentage: manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null
    },
    rentSchedule: [
      {
        startDate: startDate,
        endDate: endDate || '2028-12-31',
        amount: parseFloat(monthlyRent),
        currency: currency || 'TL'
      }
    ],
    deposits: [
      {
        type: 'Security Deposit',
        amount: parseFloat(monthlyRent) * 2,
        currency: currency || 'TL',
        status: 'Held'
      }
    ]
  };

  const globalDb = readGlobalDb();

  db.leases.push(newLease);
  generateLedgerCharges(db, newLease, globalDb.cpiRates || []);
  
  // Set unit status to Occupied
  const unitToUpdate = db.units.find(u => u.id === unitId);
  if (unitToUpdate) {
    unitToUpdate.status = 'Occupied';
  }

  writeLandlordDb(req.landlord.id, db);
  
  res.status(201).json(newLease);
});

// Update lease details
app.put('/api/leases/:id', authenticateLandlord, (req, res) => {
  const { startDate, endDate, monthlyRent, currency, dueDay, increaseType, manualIncreasePercentage, status, notes } = req.body;
  const db = readLandlordDb(req.landlord.id);
  const lease = db.leases.find(l => l.id === req.params.id);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });

  const checkStartDate = startDate !== undefined ? startDate : lease.startDate;
  const checkEndDate = endDate !== undefined ? endDate : lease.endDate;
  if (checkEndDate && checkStartDate === checkEndDate) {
    return res.status(400).json({ error: 'Contract End Date must be different from Contract Start Date' });
  }
  if (checkEndDate && new Date(checkEndDate) <= new Date(checkStartDate)) {
    return res.status(400).json({ error: 'Contract End Date must be after the Contract Start Date' });
  }

  // Update simple fields
  if (startDate !== undefined) lease.startDate = startDate;
  if (endDate !== undefined) lease.endDate = endDate;
  if (monthlyRent !== undefined) lease.monthlyRent = parseFloat(monthlyRent);
  if (currency !== undefined) lease.currency = currency;
  if (dueDay !== undefined) lease.dueDay = parseInt(dueDay);
  if (increaseType !== undefined) lease.increaseType = increaseType;
  if (manualIncreasePercentage !== undefined) lease.manualIncreasePercentage = manualIncreasePercentage ? parseFloat(manualIncreasePercentage) : null;
  if (status !== undefined) {
    lease.status = status;
    if (status === 'Terminated') {
      const unitToUpdate = db.units.find(u => u.id === lease.unitId);
      if (unitToUpdate) {
        unitToUpdate.status = 'Vacant';
      }
    }
  }
  if (notes !== undefined) lease.notes = notes;

  // v2.0 fields
  if (increaseType !== undefined || manualIncreasePercentage !== undefined) {
    lease.increaseRule = {
      type: lease.increaseType || 'cpi',
      manualPercentage: lease.manualIncreasePercentage ? parseFloat(lease.manualIncreasePercentage) : null
    };
  }

  if (startDate !== undefined || endDate !== undefined || monthlyRent !== undefined || currency !== undefined) {
    lease.rentSchedule = [
      {
        startDate: lease.startDate,
        endDate: lease.endDate || '2028-12-31',
        amount: parseFloat(lease.monthlyRent),
        currency: lease.currency
      }
    ];
  }

  // Regenerate ledger charges to keep in sync with updated dates or rents
  db.ledgerEntries = db.ledgerEntries.filter(le => le.leaseId !== req.params.id || le.paymentStatus === 'Paid');
  const globalDb = readGlobalDb();
  generateLedgerCharges(db, lease, globalDb.cpiRates || []);

  writeLandlordDb(req.landlord.id, db);
  res.json(lease);
});

// Delete lease
app.delete('/api/leases/:id', authenticateLandlord, (req, res) => {
  const db = readLandlordDb(req.landlord.id);
  const leaseIndex = db.leases.findIndex(l => l.id === req.params.id);
  if (leaseIndex === -1) return res.status(404).json({ error: 'Lease not found' });

  const lease = db.leases[leaseIndex];
  
  // Set unit status to Vacant
  const unitToUpdate = db.units.find(u => u.id === lease.unitId);
  if (unitToUpdate) {
    unitToUpdate.status = 'Vacant';
  }

  db.leases.splice(leaseIndex, 1);
  // Cascade delete ledger entries and payments
  db.ledgerEntries = db.ledgerEntries.filter(le => le.leaseId !== req.params.id);
  db.payments = db.payments.filter(p => p.leaseId !== req.params.id);

  writeLandlordDb(req.landlord.id, db);
  res.json({ success: true });
});

// Bulk Upload Leases Excel
app.post('/api/leases/bulk-upload', authenticateLandlord, upload.single('leases_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { parseLeaseUpload } = require('./helper');
    const uploadedLeases = parseLeaseUpload(req.file.path);
    const db = readLandlordDb(req.landlord.id);
    const globalDb = readGlobalDb();

    let leasesCreated = 0;
    let unitsCreated = 0;
    let tenantsCreated = 0;

    for (const item of uploadedLeases) {
      // Find property
      const prop = db.properties.find(p => 
        p.name.toLowerCase() === item.propSearch.toLowerCase() || 
        p.address.toLowerCase() === item.propSearch.toLowerCase()
      );

      if (!prop) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ error: `Property "${item.propSearch}" not found. Please import your properties first, then upload leases.` });
      }

      // Find or create unit
      let unit = db.units.find(u => u.propertyId === prop.id && u.unitNumber.toLowerCase() === item.unitNumberSearch.toLowerCase());
      if (!unit) {
        unit = {
          id: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          propertyId: prop.id,
          unitNumber: item.unitNumberSearch,
          squareMeters: 0,
          status: 'Occupied',
          notes: 'Auto-created via lease import'
        };
        db.units.push(unit);
        unitsCreated++;
      } else {
        unit.status = 'Occupied';
      }

      // Find or create tenant
      let tenant = db.tenants.find(t => t.name.toLowerCase() === item.tenantName.toLowerCase());
      if (!tenant) {
        tenant = {
          id: `tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          landlordId: req.landlord.id,
          name: item.tenantName,
          email: item.tenantEmail,
          phone: item.tenantPhone,
          aliases: [item.tenantName],
          linkedAccounts: []
        };
        db.tenants.push(tenant);
        tenantsCreated++;
      }

      // Create new lease
      const leaseId = `lease-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newLease = {
        id: leaseId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: item.startDate,
        endDate: item.endDate || '',
        monthlyRent: item.monthlyRent,
        currency: item.currency,
        dueDay: item.dueDay,
        paymentMethodDefault: 'Bank Transfer',
        status: 'Active',
        increaseType: item.escalationType,
        manualIncreasePercentage: item.escalationType === 'fixed' ? item.escalationParam : null,
        lastIncreaseDate: null,
        notes: item.notes,
        increaseRule: {
          type: item.escalationType,
          manualPercentage: item.escalationType === 'fixed' ? item.escalationParam : null
        },
        rentSchedule: [
          {
            startDate: item.startDate,
            endDate: item.endDate || '2028-12-31',
            amount: item.monthlyRent,
            currency: item.currency
          }
        ],
        deposits: item.depositAmount ? [
          {
            type: 'Security Deposit',
            amount: item.depositAmount,
            currency: item.currency,
            status: 'Held'
          }
        ] : []
      };

      db.leases.push(newLease);
      generateLedgerCharges(db, newLease, globalDb.cpiRates || []);
      leasesCreated++;
    }

    writeLandlordDb(req.landlord.id, db);
    
    // Clean up file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json({
      success: true,
      leasesCount: leasesCreated,
      unitsCount: unitsCreated,
      tenantsCount: tenantsCreated
    });
  } catch (err) {
    console.error('Lease bulk upload error:', err);
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// Upload statement file and generate proposed matches
app.post('/api/statements/upload', authenticateLandlord, upload.single('statement'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const transactions = parseBankStatement(req.file.path);
    
    // Load landlord database context
    const db = readLandlordDb(req.landlord.id);
    const myTenants = db.tenants;
    const tenantIds = myTenants.map(t => t.id);
    const myLeases = db.leases.filter(l => l.status === 'Active');

    const matchedResults = transactions.map(tx => {
      let proposedAction = 'ignore';
      let matchedTenantId = null;
      let matchedLeaseId = null;
      let period = '';
      let reason = '';
      let confidence = 0;

      const descNorm = normalizeText(tx.description);

      if (tx.amount > 0) {
        // Positive cash flow: search for tenant matches
        
        // 1. Strict reference/account matching check
        const strictMatch = myTenants.find(t => 
          t.linkedAccounts && t.linkedAccounts.some(acc => descNorm.includes(normalizeText(acc)))
        );

        // 2. Learned name aliases check
        let aliasMatch = null;
        for (const [alias, id] of Object.entries(db.aliases)) {
          if (tenantIds.includes(id) && descNorm.includes(alias)) {
            aliasMatch = myTenants.find(t => t.id === id);
            break;
          }
        }

        // 3. Normal fuzzy substring matching on tenant name
        let fuzzyMatch = null;
        if (!strictMatch && !aliasMatch) {
          fuzzyMatch = myTenants.find(t => {
            const nameNorm = normalizeText(t.name);
            // Match first name + last name subsets
            return descNorm.includes(nameNorm) || nameNorm.includes(descNorm);
          });
        }

        const matchedTenant = strictMatch || aliasMatch || fuzzyMatch;

        if (matchedTenant) {
          matchedTenantId = matchedTenant.id;
          // Find active lease for tenant
          const lease = myLeases.find(l => l.tenantId === matchedTenant.id);
          if (lease) {
            matchedLeaseId = lease.id;
            proposedAction = 'rent';
            confidence = strictMatch ? 100 : (aliasMatch ? 90 : 75);
            reason = strictMatch 
              ? 'Matched by saved bank reference / account code' 
              : (aliasMatch ? `Matched by learned alias: ${matchedTenant.name}` : `Fuzzy name match: ${matchedTenant.name}`);
            
            // Extract period from date (e.g. 15.06.2026 -> 2026-06-01)
            const dateParts = tx.date.split(' ')[0].split('.');
            if (dateParts.length === 3) {
              period = `${dateParts[2]}-${dateParts[1]}-01`;
            } else {
              const now = new Date();
              period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            }
          } else {
            proposedAction = 'ignore';
            reason = `Tenant ${matchedTenant.name} found but has no active lease`;
          }
        } else {
          proposedAction = 'ignore';
          reason = 'No matching tenant identified';
        }
      } else {
        // Negative cash flow: categorize as expense
        proposedAction = 'expense';
        confidence = 80;
        
        if (descNorm.includes('STOPAJ')) {
          reason = 'Auto-categorized as Tax / Stopaj';
          tx.category = 'Tax / Fee';
        } else if (descNorm.includes('MKK') || descNorm.includes('UCRET')) {
          reason = 'Auto-categorized as Financial Fee';
          tx.category = 'Tax / Fee';
        } else {
          reason = 'Outgoing transaction (assumed expense)';
          tx.category = 'Maintenance';
        }
      }

      // Check if raw transaction already exists in the log to prevent duplicates
      const exists = db.bankTransactions.find(bt => 
        (bt.refNumber && tx.refNumber && bt.refNumber === tx.refNumber) ||
        (bt.date === tx.date && bt.description === tx.description && bt.amount === tx.amount)
      );

      let bankTransactionId;
      if (exists) {
        bankTransactionId = exists.id;
      } else {
        bankTransactionId = `tx-bank-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.bankTransactions.push({
          id: bankTransactionId,
          landlordId: req.landlord.id,
          date: tx.date,
          amount: tx.amount,
          currency: 'TL',
          description: tx.description,
          refNumber: tx.refNumber || '',
          reconciliationStatus: 'Unmatched',
          matchedLeaseId: null
        });
      }

      return {
        ...tx,
        bankTransactionId,
        proposedAction,
        matchedTenantId,
        matchedLeaseId,
        tenantName: matchedTenantId ? myTenants.find(t => t.id === matchedTenantId).name : '',
        period,
        reason,
        confidence
      };
    });

    writeLandlordDb(req.landlord.id, db);

    // Delete uploaded temp file safely
    fs.unlinkSync(req.file.path);

    res.json(matchedResults);
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// Reconcile and save matches bulk / individual
app.post('/api/statements/reconcile', authenticateLandlord, (req, res) => {
  const { reconciliations } = req.body;
  if (!reconciliations || !Array.isArray(reconciliations)) {
    return res.status(400).json({ error: 'Invalid reconciliation actions list' });
  }

  const db = readLandlordDb(req.landlord.id);
  let addedPaymentsCount = 0;
  let addedExpensesCount = 0;

  reconciliations.forEach(rec => {
    const { date, description, refNumber, amount, proposedAction, matchedLeaseId, matchedTenantId, period, category, bankTransactionId } = rec;

    // Parse date safely
    const cleanDate = date.split(' ')[0].split('.').reverse().join('-'); // converts dd.mm.yyyy -> yyyy-mm-dd

    // Find the corresponding bank transaction in db
    let bankTx = db.bankTransactions.find(bt => bt.id === bankTransactionId);
    if (!bankTx) {
      // Fallback search to prevent errors
      bankTx = db.bankTransactions.find(bt => 
        bt.date === date && bt.description === description && bt.amount === amount
      );
    }

    if (proposedAction === 'rent' && matchedLeaseId && matchedTenantId) {
      const lease = db.leases.find(l => l.id === matchedLeaseId);
      const tenant = db.tenants.find(t => t.id === matchedTenantId);
      
      if (lease && tenant) {
        const paymentId = `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // 1. Save payment entry
        db.payments.push({
          id: paymentId,
          landlordId: req.landlord.id,
          leaseId: lease.id,
          tenantName: tenant.name,
          paymentDate: cleanDate,
          period: period,
          amount: parseFloat(amount),
          currency: lease.currency || 'TL',
          paymentMethod: 'Bank Transfer',
          reference: description,
          incomeType: 'Rent',
          notes: `Reconciled reference: ${refNumber}`
        });

        // 2. Log credit to running ledger
        db.ledgerEntries.push({
          id: `ledger-pay-${paymentId}`,
          landlordId: req.landlord.id,
          leaseId: lease.id,
          date: cleanDate,
          type: 'payment',
          amount: parseFloat(amount),
          currency: lease.currency || 'TL',
          description: `Rent Payment - ${period.slice(0, 7)}`,
          paymentId: paymentId
        });

        // 3. Generate double-entry Journal Entry (v2.0)
        db.journalEntries.push({
          id: `je-pay-${paymentId}`,
          date: cleanDate,
          description: `Rent Payment - ${tenant.name} - period ${period.slice(0, 7)}`,
          leaseId: lease.id,
          bankTransactionId: bankTx ? bankTx.id : null,
          lines: [
            { accountId: "1100", debit: parseFloat(amount), credit: 0 },  // Cash / Bank Account - Debit
            { accountId: "1200", debit: 0, credit: parseFloat(amount) }  // Accounts Receivable - Credit
          ]
        });

        // 4. Update persistent bank transaction matching status
        if (bankTx) {
          bankTx.reconciliationStatus = 'Reconciled';
          bankTx.matchedLeaseId = lease.id;
        }

        // 5. Learn Match Rules: Save sender reference or alias if not already present
        const matchSignature = description.match(/Banka:\s*\d+\s*SN:\s*\d+/i);
        if (matchSignature) {
          const signature = matchSignature[0];
          if (!tenant.linkedAccounts) tenant.linkedAccounts = [];
          if (!tenant.linkedAccounts.includes(signature)) {
            tenant.linkedAccounts.push(signature);
          }
        }

        // Also add the full raw name in description as an alias if fuzzy match was used
        const normalizedDesc = normalizeText(description);
        db.aliases[normalizedDesc] = tenant.id;

        addedPaymentsCount++;
      }
    } else if (proposedAction === 'expense') {
      const expenseId = `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.expenses.push({
        id: expenseId,
        landlordId: req.landlord.id,
        amount: Math.abs(parseFloat(amount)),
        currency: 'TL',
        date: cleanDate,
        category: category || 'Maintenance',
        description: description
      });

      // 1. Generate double-entry Journal Entry (v2.0)
      db.journalEntries.push({
        id: `je-exp-${expenseId}`,
        date: cleanDate,
        description: description,
        bankTransactionId: bankTx ? bankTx.id : null,
        lines: [
          { accountId: category === 'Tax / Fee' ? "5100" : "5200", debit: Math.abs(parseFloat(amount)), credit: 0 }, // Expense Account - Debit
          { accountId: "1100", debit: 0, credit: Math.abs(parseFloat(amount)) } // Cash / Bank Account - Credit
        ]
      });

      // 2. Update persistent bank transaction matching status
      if (bankTx) {
        bankTx.reconciliationStatus = 'Reconciled';
        bankTx.matchedLeaseId = null;
      }

      addedExpensesCount++;
    } else if (proposedAction === 'ignore') {
      // Update persistent bank transaction status if ignored
      if (bankTx) {
        bankTx.reconciliationStatus = 'Ignored';
      }
    }
  });

  writeLandlordDb(req.landlord.id, db);
  res.json({ success: true, payments: addedPaymentsCount, expenses: addedExpensesCount });
});

// Get running ledger details
app.get('/api/ledger/:leaseId', authenticateLandlord, (req, res) => {
  const { leaseId } = req.params;
  const db = readLandlordDb(req.landlord.id);
  
  // Verify lease ownership
  const lease = db.leases.find(l => l.id === leaseId);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  
  const tenant = db.tenants.find(t => t.id === lease.tenantId);
  if (!tenant) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  const globalDb = readGlobalDb();

  // Ensure dues are up to date dynamically before rendering ledger
  generateLedgerCharges(db, lease, globalDb.cpiRates || []);
  writeLandlordDb(req.landlord.id, db);

  // Filter ledger lines for this lease
  const entries = db.ledgerEntries.filter(e => e.leaseId === leaseId);
  
  // Sort ledger entries chronologically
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Compute rolling balance
  let runningBalance = 0;
  const computed = entries.map(e => {
    if (e.type === 'charge') {
      runningBalance += e.amount;
    } else if (e.type === 'payment') {
      runningBalance -= e.amount;
    }
    return {
      ...e,
      balance: Math.round(runningBalance * 100) / 100
    };
  });

  const rentAmount = lease.rentSchedule && lease.rentSchedule.length > 0
    ? lease.rentSchedule[lease.rentSchedule.length - 1].amount
    : (lease.monthlyRent || 0);

  const rentCurrency = lease.rentSchedule && lease.rentSchedule.length > 0
    ? lease.rentSchedule[lease.rentSchedule.length - 1].currency
    : (lease.currency || 'TL');

  res.json({
    leaseId,
    tenantName: tenant.name,
    currency: rentCurrency,
    monthlyRent: rentAmount,
    balance: Math.round(runningBalance * 100) / 100,
    entries: computed
  });
});

// Get double-entry journal logs for a specific lease
app.get('/api/ledger/:leaseId/journal', authenticateLandlord, (req, res) => {
  const { leaseId } = req.params;
  const db = readLandlordDb(req.landlord.id);
  
  // Verify lease ownership
  const lease = db.leases.find(l => l.id === leaseId);
  if (!lease) return res.status(404).json({ error: 'Lease not found' });
  
  const tenant = db.tenants.find(t => t.id === lease.tenantId);
  if (!tenant) {
    return res.status(403).json({ error: 'Access Denied' });
  }

  // Filter journal entries for this lease
  const entries = db.journalEntries.filter(je => je.leaseId === leaseId);
  
  // Sort chronologically
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json({
    leaseId,
    tenantName: tenant.name,
    entries
  });
});

// Get queued notifications
app.get('/api/notifications', authenticateLandlord, (req, res) => {
  runCronServices(req.landlord.id);
  
  const db = readLandlordDb(req.landlord.id);
  res.json(db.notificationsQueue || []);
});

// Update SMTP Configuration
app.post('/api/settings/smtp', authenticateLandlord, (req, res) => {
  const { host, port, user, pass } = req.body;
  
  const db = readGlobalDb();
  const landlord = db.landlords.find(l => l.id === req.landlord.id);
  
  landlord.smtpConfig = { host, port: parseInt(port), user, pass: encrypt(pass) };
  writeGlobalDb(db);
  
  res.json({ success: true });
});

// Direct Email sending endpoint
app.post('/api/notifications/send-direct', authenticateLandlord, async (req, res) => {
  const { to, subject, body } = req.body;
  
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing to, subject or body in request' });
  }

  const landlord = req.landlord;
  if (!landlord.smtpConfig || !landlord.smtpConfig.host || !landlord.smtpConfig.user) {
    return res.status(400).json({ error: 'SMTP configuration is missing. Falling back to mailto client link.' });
  }

  try {
    const decryptedPass = decrypt(landlord.smtpConfig.pass);
    const transporter = nodemailer.createTransport({
      host: landlord.smtpConfig.host,
      port: landlord.smtpConfig.port || 587,
      secure: landlord.smtpConfig.port === 465, // true for 465, false for other ports
      auth: {
        user: landlord.smtpConfig.user,
        pass: decryptedPass
      }
    });

    await transporter.sendMail({
      from: `"${landlord.name}" <${landlord.smtpConfig.user}>`,
      to,
      subject,
      text: body
    });

    res.json({ success: true });
  } catch (err) {
    console.error('SMTP Send direct failed:', err);
    res.status(500).json({ error: `SMTP server error: ${err.message}` });
  }
});

// Trigger Scraper and fetch latest CPI
app.post('/api/settings/cpi-fetch', authenticateLandlord, async (req, res) => {
  const scrapedRates = await scrapeLatestTufe();
  
  if (!scrapedRates) {
    return res.status(502).json({ error: 'Unable to scrape inflation portal. Please enter data manually.' });
  }

  const db = readGlobalDb();
  let updated = false;

  scrapedRates.forEach(rate => {
    // Parse Turkish month names: e.g. "Mayıs 2026"
    const monthsTr = {
      'OCAK': 1, 'SUBAT': 2, 'MART': 3, 'NISAN': 4, 'MAYIS': 5, 'HAZIRAN': 6,
      'TEMMUZ': 7, 'AGUSTOS': 8, 'EYLUL': 9, 'EKIM': 10, 'KASIM': 11, 'ARALIK': 12
    };

    const parts = rate.period.toUpperCase().split(' ');
    if (parts.length === 2) {
      const monthName = parts[0].replace('İ', 'I').replace('Ş', 'S').replace('Ç', 'C').replace('Ğ', 'G').replace('Ö', 'O').replace('Ü', 'U');
      const month = monthsTr[monthName];
      const year = parseInt(parts[1]);

      if (month && year) {
        const exists = db.cpiRates.find(r => r.year === year && r.month === month);
        if (!exists) {
          db.cpiRates.push({
            year,
            month,
            rate12MonthAvgTufe: rate.rate12MonthAvgTufe
          });
          updated = true;
        }
      }
    }
  });

  if (updated) {
    writeGlobalDb(db);
  }

  res.json({ success: true, rates: db.cpiRates });
});

// Global error handler — always return JSON, never an HTML error page
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.name === 'MulterError' || (err.message && err.message.includes('Only Excel files'))) {
    return res.status(400).json({ error: err.message });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Start Express Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Rental Tracking Backend serving on port ${PORT}`);
  // Initial run of cron services for all seeded landlords
  try {
    const globalDb = readGlobalDb();
    globalDb.landlords.forEach(l => {
      runCronServices(l.id);
    });
  } catch (err) {
    console.error('Failed to run initial cron service:', err);
  }
});
