const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Create folders if they don't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'db.json');

// Helper to hash password using secure scrypt (memory-hard key derivation)
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

const SALT = 'rental_tracker_salt_2026';

const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || '6a3c8f8b8a928ef23214b7e8d9c2e4a8b8f8a92b2345e67d8a92b2345e67d8f9';

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

// Randomization Lists
const EN_FIRST_NAMES = ['John', 'Jane', 'Robert', 'Mary', 'David', 'Linda', 'James', 'Patricia', 'William', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Matthew', 'Lisa', 'Daniel', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Anthony', 'Ashley', 'Paul', 'Kimberly', 'Steven', 'Emily', 'Andrew', 'Donna', 'Kenneth', 'Michelle', 'Joshua', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Melissa', 'George', 'Deborah', 'Edward', 'Stephanie', 'Ronald', 'Rebecca'];
const EN_LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Hernandez', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Lopez', 'Lee', 'Gonzalez', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Perez', 'Hall', 'Young', 'Allen', 'Sanchez', 'Wright', 'King', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Ramirez', 'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Torres'];

const TR_FIRST_NAMES = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Halil', 'Yusuf', 'Ömer', 'Zeynep', 'Elif', 'Fatma', 'Ayşe', 'Emine', 'Hatice', 'Meryem', 'Selin', 'Deniz', 'Murat', 'Hakan', 'Gökhan', 'Serkan', 'Kemal', 'Cem', 'Bülent', 'Ferdi', 'Çağlar', 'Cihan', 'Murat', 'Derya', 'Emin', 'Selin', 'Hatice', 'Zehra', 'Can', 'Suat', 'Tuncay', 'Hakan', 'Elif'];
const TR_LAST_NAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Karaca', 'Yüksel', 'Kırıkoğlu', 'Akün', 'Özdar', 'Işık', 'Alköse', 'Kaplan', 'Koç', 'Taş', 'Yalçın'];

const PROP_PREFIXES = ['Grand', 'Summit', 'Golden', 'Green', 'Royal', 'Silver', 'Crystal', 'Sunset', 'Emerald', 'Metro', 'Peak', 'Vista', 'Pine', 'Ocean', 'Skyline', 'Central', 'Plaza', 'Park', 'Heritage', 'Regency'];
const PROP_SUFFIXES = ['Plaza', 'Center', 'Tower', 'Heights', 'Apartments', 'Villas', 'Estates', 'Suites', 'Gardens', 'Manor', 'Residences', 'Terrace', 'Lodge', 'Court', 'Hub', 'Square'];
const PROP_CITIES = ['Istanbul', 'Ankara', 'Izmir', 'Muğla', 'Antalya', 'Bursa', 'Adana'];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomName(isTR = true) {
  const first = getRandomItem(isTR ? TR_FIRST_NAMES : EN_FIRST_NAMES);
  const last = getRandomItem(isTR ? TR_LAST_NAMES : EN_LAST_NAMES);
  return `${first} ${last}`;
}

function generateRandomPropertyName() {
  const pref = getRandomItem(PROP_PREFIXES);
  const suff = getRandomItem(PROP_SUFFIXES);
  return `${pref} ${suff}`;
}

function generateRandomAddress(propertyName, city) {
  const num = Math.floor(Math.random() * 200) + 1;
  const block = getRandomItem(['A', 'B', 'C', 'D', '']);
  return `${propertyName}${block ? ' ' + block + ' Block' : ''}, No:${num}, ${city}`;
}

const landlord1Name = generateRandomName(true);
const landlord2Name = generateRandomName(false);

const prop1_1_name = generateRandomPropertyName();
const prop1_1_city = getRandomItem(PROP_CITIES);
const prop1_1_address = generateRandomAddress(prop1_1_name, prop1_1_city);

const prop1_2_name = generateRandomPropertyName();
const prop1_2_city = getRandomItem(PROP_CITIES);
const prop1_2_address = generateRandomAddress(prop1_2_name, prop1_2_city);

const prop1_3_name = generateRandomPropertyName();
const prop1_3_city = getRandomItem(PROP_CITIES);
const prop1_3_address = generateRandomAddress(prop1_3_name, prop1_3_city);

const prop2_1_name = generateRandomPropertyName();
const prop2_1_city = getRandomItem(PROP_CITIES);
const prop2_1_address = generateRandomAddress(prop2_1_name, prop2_1_city);

const prop2_2_name = generateRandomPropertyName();
const prop2_2_city = getRandomItem(PROP_CITIES);
const prop2_2_address = generateRandomAddress(prop2_2_name, prop2_2_city);

const database = {
  landlords: [
    {
      id: 'landlord-1',
      name: landlord1Name,
      email: 'landlord1@example.com',
      phone: `+90532${Math.floor(1000000 + Math.random() * 9000000)}`,
      passwordHash: hashPassword('landlord123', SALT),
      salt: SALT,
      smtpConfig: null
    },
    {
      id: 'landlord-2',
      name: landlord2Name,
      email: 'landlord2@example.com',
      phone: `+90532${Math.floor(1000000 + Math.random() * 9000000)}`,
      passwordHash: hashPassword('landlord123', SALT),
      salt: SALT,
      smtpConfig: null
    }
  ],
  admins: [
    {
      id: 'admin-1',
      name: 'System Administrator',
      email: 'admin@rental.local',
      passwordHash: hashPassword('Admin123!', SALT),
      salt: SALT
    }
  ],
  properties: [
    {
      id: 'prop-1-1',
      landlordId: 'landlord-1',
      name: prop1_1_name,
      address: prop1_1_address,
      city: prop1_1_city,
      type: 'Commercial',
      active: true,
      notes: 'Commercial units'
    },
    {
      id: 'prop-1-2',
      landlordId: 'landlord-1',
      name: prop1_2_name,
      address: prop1_2_address,
      city: prop1_2_city,
      type: 'Commercial',
      active: true,
      notes: 'Retail shops'
    },
    {
      id: 'prop-1-3',
      landlordId: 'landlord-1',
      name: prop1_3_name,
      address: prop1_3_address,
      city: prop1_3_city,
      type: 'Commercial',
      active: true,
      notes: 'Newly acquired vacant building'
    },
    // Seed for Landlord 2
    {
      id: 'prop-2-1',
      landlordId: 'landlord-2',
      name: prop2_1_name,
      address: prop2_1_address,
      city: prop2_1_city,
      type: 'Residential',
      active: true,
      notes: 'Residential apartments'
    },
    {
      id: 'prop-2-2',
      landlordId: 'landlord-2',
      name: prop2_2_name,
      address: prop2_2_address,
      city: prop2_2_city,
      type: 'Residential',
      active: true,
      notes: 'Vacant residential duplex'
    }
  ],
  units: [],
  tenants: [],
  leases: [],
  ledgerEntries: [],
  payments: [],
  expenses: [],
  journalEntries: [],
  bankTransactions: [],
  cpiRates: [
    { year: 2026, month: 1, rate12MonthAvgTufe: 30.65 },
    { year: 2026, month: 2, rate12MonthAvgTufe: 31.53 },
    { year: 2026, month: 3, rate12MonthAvgTufe: 30.87 },
    { year: 2026, month: 4, rate12MonthAvgTufe: 32.37 },
    { year: 2026, month: 5, rate12MonthAvgTufe: 32.61 },
    { year: 2026, month: 6, rate12MonthAvgTufe: 32.24 } // Seeded for June 2026
  ],
  notificationTemplates: {},
  notificationsQueue: [],
  aliases: {} // Maps transaction desc name -> tenantId
};

const DEFAULT_COA = {
  "1100": { "name": "Cash / Bank Account", "type": "Asset" },
  "1200": { "name": "Accounts Receivable (Rent)", "type": "Asset" },
  "2200": { "name": "Security Deposit Liability", "type": "Liability" },
  "4100": { "name": "Rental Income", "type": "Income" },
  "5100": { "name": "Property Taxes / Stopaj", "type": "Expense" },
  "5200": { "name": "Maintenance & Repairs", "type": "Expense" }
};

// Seed Units, Tenants, and Leases for Landlord 1 dynamically
const landlord1TenantsData = [];
for (let i = 0; i < 16; i++) {
  const isCorp = Math.random() < 0.25;
  let name = '';
  let aliases = [];
  if (isCorp) {
    const corpPref = getRandomItem(PROP_PREFIXES);
    const corpType = getRandomItem(['Trading', 'Energy', 'Foods', 'Logistics', 'Health', 'Optics']);
    const corpSuffix = getRandomItem(['A.Ş.', 'Ltd. Şti.']);
    name = `${corpPref} ${corpType} ${corpSuffix}`;
    aliases = [name.toUpperCase()];
  } else {
    name = generateRandomName(true);
    aliases = [name.toUpperCase()];
  }

  // Predefined rent array distributed randomly
  const baseRents = [15000, 25000, 35000, 8000, 10000, 12000, 45000, 50000, 77000, 18000, 5375, 3375, 2000, 9000, 16000, 2282.65];
  const rent = baseRents[i % baseRents.length];

  // Distribute across properties prop-1-1 and prop-1-2
  const propId = (i % 2 === 0) ? 'prop-1-1' : 'prop-1-2';

  landlord1TenantsData.push({
    name,
    rent,
    dueDay: Math.floor(Math.random() * 28) + 1,
    unitName: `Unit ${i + 1}`,
    address: propId,
    aliases
  });
}

landlord1TenantsData.forEach((t, index) => {
  const tenantId = `tenant-1-${index + 1}`;
  const unitId = `unit-1-${index + 1}`;
  const leaseId = `lease-1-${index + 1}`;

  // Randomize monthly rent amount
  const finalRent = Math.round(t.rent * (0.9 + Math.random() * 0.2) * 100) / 100;

  // Randomize contract start month (between January and October 2025) to ensure April & May 2026 are covered
  const startMonth = Math.floor(Math.random() * 10) + 1;
  const startDay = t.dueDay;
  
  // Randomize duration (12, 18, or 24 months) and offset the end date by -1 day to ensure start/end are different
  const durations = [12, 18, 24];
  const durationMonths = durations[index % durations.length];
  
  const sDate = new Date(2025, startMonth - 1, startDay);
  const eDate = new Date(2025, startMonth - 1 + durationMonths, startDay - 1);
  const schedEDate = new Date(2025, startMonth - 1 + durationMonths, startDay - 1);
  
  const startDateStr = sDate.toISOString().split('T')[0];
  const endDateStr = eDate.toISOString().split('T')[0];
  const schedEDateStr = schedEDate.toISOString().split('T')[0];

  // Add unit
  database.units.push({
    id: unitId,
    propertyId: t.address,
    unitNumber: t.unitName,
    squareMeters: 100,
    status: 'Occupied',
    notes: ''
  });

  // Add tenant
  database.tenants.push({
    id: tenantId,
    landlordId: 'landlord-1',
    name: t.name,
    email: `${t.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
    phone: `+9053200000${index < 10 ? '0' + index : index}`,
    aliases: [t.name.toUpperCase()],
    linkedAccounts: []
  });

  // Add lease
  database.leases.push({
    id: leaseId,
    unitId: unitId,
    tenantId: tenantId,
    startDate: startDateStr,
    endDate: endDateStr,
    dueDay: t.dueDay,
    status: 'Active',
    increaseRule: {
      type: 'cpi',
      manualPercentage: null
    },
    rentSchedule: [
      {
        startDate: startDateStr,
        endDate: schedEDateStr,
        amount: finalRent,
        currency: 'TL'
      }
    ],
    deposits: [
      {
        type: 'Security Deposit',
        amount: finalRent * 2,
        currency: 'TL',
        status: 'Held'
      }
    ]
  });

  // Dynamically generate all historical charges/payments from start of lease up to May 2026 to reflect reality
  const months = [];
  let currYear = sDate.getFullYear();
  let currMonth = sDate.getMonth();
  while (true) {
    if (currYear > 2026 || (currYear === 2026 && currMonth > 4)) {
      break;
    }
    
    const periodStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;
    const chargeDateStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    
    const payDayOffset = Math.floor(Math.random() * 5); // 0 to 4 days after due day
    const pDate = new Date(currYear, currMonth, startDay + payDayOffset);
    const payDateStr = pDate.toISOString().split('T')[0];
    
    months.push({
      period: periodStr,
      chargeDate: chargeDateStr,
      payDate: payDateStr
    });
    
    currMonth++;
    if (currMonth > 11) {
      currMonth = 0;
      currYear++;
    }
  }

  months.forEach((m, mIdx) => {
    const payId = `pay-seed-${index}-${mIdx}`;
    const txId = `tx-seed-${index}-${mIdx}`;

    // 1. Ledger Legacy Charge
    database.ledgerEntries.push({
      id: `ledger-charge-${index}-${mIdx}`,
      landlordId: 'landlord-1',
      leaseId: leaseId,
      date: m.chargeDate,
      type: 'charge',
      amount: finalRent,
      currency: 'TL',
      description: `${t.name} Rent Charge - ${m.period.slice(0, 7)}`
    });

    // 2. Journal Entry Charge (v2.0)
    database.journalEntries.push({
      id: `je-charge-${leaseId}-${m.period}`,
      date: m.chargeDate,
      description: `Rent Charge - ${m.period.slice(0, 7)}`,
      leaseId: leaseId,
      lines: [
        { accountId: "1200", debit: finalRent, credit: 0 },
        { accountId: "4100", debit: 0, credit: finalRent }
      ]
    });

    // 3. Legacy Payments
    database.payments.push({
      id: payId,
      landlordId: 'landlord-1',
      leaseId: leaseId,
      tenantName: t.name,
      paymentDate: m.payDate,
      period: m.period,
      amount: finalRent,
      currency: 'TL',
      paymentMethod: 'Bank Transfer',
      reference: `SEED BANK STATEMENT REF FOR ${t.name}`,
      incomeType: 'Rent',
      notes: 'Seeded historical payment'
    });

    database.ledgerEntries.push({
      id: `ledger-pay-${index}-${mIdx}`,
      landlordId: 'landlord-1',
      leaseId: leaseId,
      date: m.payDate,
      type: 'payment',
      amount: finalRent,
      currency: 'TL',
      description: `${t.name} Rent Payment - ${m.period.slice(0, 7)}`,
      paymentId: payId
    });

    // 4. Journal Entry Payment (v2.0)
    database.journalEntries.push({
      id: `je-pay-${payId}`,
      date: m.payDate,
      description: `Rent Payment - ${t.name} - period ${m.period.slice(0, 7)}`,
      leaseId: leaseId,
      bankTransactionId: txId,
      lines: [
        { accountId: "1100", debit: finalRent, credit: 0 },
        { accountId: "1200", debit: 0, credit: finalRent }
      ]
    });

    // 5. Persistent Bank Transaction Log (v2.0)
    database.bankTransactions.push({
      id: txId,
      landlordId: 'landlord-1',
      date: `${m.payDate} 12:00:00`,
      amount: finalRent,
      currency: 'TL',
      description: `Banka: 0067 SN: 2991148561 ${t.name.toUpperCase()} KIRA ODEMESI`,
      refNumber: `SN-${index}-${mIdx}`,
      reconciliationStatus: 'Reconciled',
      matchedLeaseId: leaseId
    });
  });

  // Set up aliases for strict matching
  database.aliases[t.name.toUpperCase()] = tenantId;
  if (t.aliases) {
    t.aliases.forEach(alias => {
      database.aliases[alias.toUpperCase()] = tenantId;
    });
  }
});

// Seed a mock tenant for Bob Landlord (USD currency)
const landlord2TenantId = 'tenant-2-1';
const landlord2UnitId = 'unit-2-1';
const landlord2LeaseId = 'lease-2-1';

// Randomize Bob's rent (baseline 1200 USD)
const bobRent = Math.round(1200 * (0.9 + Math.random() * 0.2) * 100) / 100;

// Randomize Bob's contract start month (between January and October 2025), day is 1
const bobStartMonth = Math.floor(Math.random() * 10) + 1;
const bobStartDay = 1;
const bobSDate = new Date(2025, bobStartMonth - 1, bobStartDay);
const bobEDate = new Date(2026, bobStartMonth - 1, bobStartDay - 1);
const bobSchedEDate = new Date(2026, bobStartMonth - 1, bobStartDay - 1);

const bobStartDateStr = bobSDate.toISOString().split('T')[0];
const bobEndDateStr = bobEDate.toISOString().split('T')[0];
const bobSchedEDateStr = bobSchedEDate.toISOString().split('T')[0];

const landlord2TenantName = generateRandomName(false);
const landlord2TenantEmail = `${landlord2TenantName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

database.units.push({
  id: landlord2UnitId,
  propertyId: 'prop-2-1',
  unitNumber: 'Apartment 4B',
  squareMeters: 85,
  status: 'Occupied',
  notes: ''
});

database.tenants.push({
  id: landlord2TenantId,
  landlordId: 'landlord-2',
  name: landlord2TenantName,
  email: landlord2TenantEmail,
  phone: `+90532${Math.floor(1000000 + Math.random() * 9000000)}`,
  aliases: [landlord2TenantName.toUpperCase()],
  linkedAccounts: []
});

database.leases.push({
  id: landlord2LeaseId,
  unitId: landlord2UnitId,
  tenantId: landlord2TenantId,
  startDate: bobStartDateStr,
  endDate: bobEndDateStr,
  dueDay: bobStartDay,
  status: 'Active',
  increaseRule: {
    type: 'fixed',
    manualPercentage: 5
  },
  rentSchedule: [
    {
      startDate: bobStartDateStr,
      endDate: bobSchedEDateStr,
      amount: bobRent,
      currency: 'USD'
    }
  ],
  deposits: [
    {
      type: 'Security Deposit',
      amount: bobRent * 2,
      currency: 'USD',
      status: 'Held'
    }
  ]
});

// Seed data for Bob (dynamically generate all historical charges/payments from start of lease up to May 2026)
const landlord2Months = [];
let bYear = bobSDate.getFullYear();
let bMonth = bobSDate.getMonth();
while (true) {
  if (bYear > 2026 || (bYear === 2026 && bMonth > 4)) {
    break;
  }
  
  const periodStr = `${bYear}-${String(bMonth + 1).padStart(2, '0')}-01`;
  const chargeDateStr = `${bYear}-${String(bMonth + 1).padStart(2, '0')}-${String(bobStartDay).padStart(2, '0')}`;
  
  const payDayOffset = Math.floor(Math.random() * 5); // 0 to 4 days after due day
  const pDate = new Date(bYear, bMonth, bobStartDay + payDayOffset);
  const payDateStr = pDate.toISOString().split('T')[0];
  
  landlord2Months.push({
    period: periodStr,
    chargeDate: chargeDateStr,
    payDate: payDateStr
  });
  
  bMonth++;
  if (bMonth > 11) {
    bMonth = 0;
    bYear++;
  }
}

landlord2Months.forEach((m, mIdx) => {
  const payId = `pay-seed-2-${mIdx}`;
  const txId = `tx-seed-2-${mIdx}`;

  database.ledgerEntries.push({
    id: `ledger-charge-2-${mIdx}`,
    landlordId: 'landlord-2',
    leaseId: landlord2LeaseId,
    date: m.chargeDate,
    type: 'charge',
    amount: bobRent,
    currency: 'USD',
    description: `${landlord2TenantName} Rent Charge - ${m.period.slice(0, 7)}`
  });

  database.journalEntries.push({
    id: `je-charge-${landlord2LeaseId}-${m.period}`,
    date: m.chargeDate,
    description: `Rent Charge - ${m.period.slice(0, 7)}`,
    leaseId: landlord2LeaseId,
    lines: [
      { accountId: "1200", debit: bobRent, credit: 0 },
      { accountId: "4100", debit: 0, credit: bobRent }
    ]
  });

  database.payments.push({
    id: payId,
    landlordId: 'landlord-2',
    leaseId: landlord2LeaseId,
    tenantName: landlord2TenantName,
    paymentDate: m.payDate,
    period: m.period,
    amount: bobRent,
    currency: 'USD',
    paymentMethod: 'Bank Transfer',
    reference: `SEED BANK REF FOR ${landlord2TenantName.toUpperCase()}`,
    incomeType: 'Rent',
    notes: 'Seeded historical payment'
  });

  database.ledgerEntries.push({
    id: `ledger-pay-2-${mIdx}`,
    landlordId: 'landlord-2',
    leaseId: landlord2LeaseId,
    date: m.payDate,
    type: 'payment',
    amount: bobRent,
    currency: 'USD',
    description: `${landlord2TenantName} Rent Payment - ${m.period.slice(0, 7)}`,
    paymentId: payId
  });

  database.journalEntries.push({
    id: `je-pay-${payId}`,
    date: m.payDate,
    description: `Rent Payment - ${landlord2TenantName} - period ${m.period.slice(0, 7)}`,
    leaseId: landlord2LeaseId,
    bankTransactionId: txId,
    lines: [
      { accountId: "1100", debit: bobRent, credit: 0 },
      { accountId: "1200", debit: 0, credit: bobRent }
    ]
  });

  database.bankTransactions.push({
    id: txId,
    landlordId: 'landlord-2',
    date: `${m.payDate} 10:00:00`,
    amount: bobRent,
    currency: 'USD',
    description: `BANK WIRE TRANSFER ${landlord2TenantName.toUpperCase()} RENT`,
    refNumber: `SN-BOB-${mIdx}`,
    reconciliationStatus: 'Reconciled',
    matchedLeaseId: landlord2LeaseId
  });
});

database.aliases[landlord2TenantName.toUpperCase()] = landlord2TenantId;

// Seed vacant/unoccupied units for Landlord 1
database.units.push({
  id: 'unit-1-vacant-1',
  propertyId: 'prop-1-1',
  unitNumber: 'Unit 17',
  squareMeters: 85,
  status: 'Vacant',
  notes: 'Available for commercial lease'
});

database.units.push({
  id: 'unit-1-vacant-2',
  propertyId: 'prop-1-2',
  unitNumber: 'Unit 18',
  squareMeters: 120,
  status: 'Vacant',
  notes: 'Needs paint job'
});

database.units.push({
  id: 'unit-1-vacant-3',
  propertyId: 'prop-1-3',
  unitNumber: 'Office A',
  squareMeters: 215,
  status: 'Vacant',
  notes: 'Prime office location'
});

database.units.push({
  id: 'unit-1-vacant-4',
  propertyId: 'prop-1-3',
  unitNumber: 'Office B',
  squareMeters: 145,
  status: 'Vacant',
  notes: 'High ceiling'
});

// Seed vacant/unoccupied units for Landlord 2
database.units.push({
  id: 'unit-2-vacant-1',
  propertyId: 'prop-2-1',
  unitNumber: 'Apartment 4C',
  squareMeters: 92,
  status: 'Vacant',
  notes: 'Available immediately'
});

database.units.push({
  id: 'unit-2-vacant-2',
  propertyId: 'prop-2-2',
  unitNumber: 'Duplex A',
  squareMeters: 155,
  status: 'Vacant',
  notes: 'Renovated duplex unit'
});

database.units.push({
  id: 'unit-2-vacant-3',
  propertyId: 'prop-2-2',
  unitNumber: 'Duplex B',
  squareMeters: 155,
  status: 'Vacant',
  notes: 'Renovated duplex unit'
});

// Notification Templates Seed
database.notificationTemplates['landlord-1'] = {
  rentIncrease2DaysEmailSubject: 'Rent Adjustment Notice / Kira Artış Bildirimi',
  rentIncrease2DaysEmailBody: 'Dear {tenant_name},\n\nThis is a notification that on {increase_date}, your rent for {property_address} will increase to {new_rent} {currency} based on the TÜFE rate ({cpi_rate}%).\n\nBest regards,\n{landlord_name}',
  rentIncrease2DaysWhatsApp: 'Hello {tenant_name}. A friendly reminder that your rent for {property_address} will adjust to {new_rent} {currency} on {increase_date} (TÜFE rate: {cpi_rate}%).'
};

database.notificationTemplates['landlord-2'] = {
  rentIncrease2DaysEmailSubject: 'Rent Adjustment Notice',
  rentIncrease2DaysEmailBody: 'Dear {tenant_name},\n\nYour rent for {property_address} will increase to {new_rent} {currency} on {increase_date} (+{cpi_rate}%).\n\nBest,\n{landlord_name}',
  rentIncrease2DaysWhatsApp: 'Hi {tenant_name}. Your rent for {property_address} will adjust to {new_rent} {currency} on {increase_date} (+{cpi_rate}%).'
};

// Build global database
const globalDb = {
  landlords: database.landlords,
  admins: database.admins,
  cpiRates: database.cpiRates
};

// Write global database
const globalDbPath = path.join(dataDir, 'global.json');
fs.writeFileSync(globalDbPath, JSON.stringify(globalDb, null, 2), 'utf8');
console.log('Global database seeded at:', globalDbPath);

// Write separate landlord databases
database.landlords.forEach(landlord => {
  const landlordDb = {
    properties: database.properties.filter(p => p.landlordId === landlord.id),
    units: database.units.filter(u => {
      const prop = database.properties.find(p => p.id === u.propertyId);
      return prop && prop.landlordId === landlord.id;
    }),
    tenants: database.tenants.filter(t => t.landlordId === landlord.id),
    leases: database.leases.filter(l => {
      const tenant = database.tenants.find(t => t.id === l.tenantId);
      return tenant && tenant.landlordId === landlord.id;
    }),
    ledgerEntries: database.ledgerEntries.filter(le => le.landlordId === landlord.id),
    payments: database.payments.filter(p => {
      const lease = database.leases.find(l => l.id === p.leaseId);
      if (!lease) return false;
      const tenant = database.tenants.find(t => t.id === lease.tenantId);
      return tenant && tenant.landlordId === landlord.id;
    }),
    expenses: database.expenses.filter(e => e.landlordId === landlord.id),
    aliases: {},
    chartOfAccounts: DEFAULT_COA,
    journalEntries: database.journalEntries.filter(je => {
      if (je.leaseId) {
        const lease = database.leases.find(l => l.id === je.leaseId);
        if (lease) {
          const tenant = database.tenants.find(t => t.id === lease.tenantId);
          return tenant && tenant.landlordId === landlord.id;
        }
      }
      return false;
    }),
    bankTransactions: database.bankTransactions.filter(bt => bt.landlordId === landlord.id)
  };

  // Extract aliases for this specific landlord's tenants
  for (const [alias, tenantId] of Object.entries(database.aliases)) {
    const isMyTenant = database.tenants.some(t => t.id === tenantId && t.landlordId === landlord.id);
    if (isMyTenant) {
      landlordDb.aliases[alias] = tenantId;
    }
  }

  // Populate notificationTemplates / notificationsQueue
  landlordDb.notificationTemplates = database.notificationTemplates[landlord.id] || {};
  landlordDb.notificationsQueue = database.notificationsQueue.filter(nq => nq.landlordId === landlord.id);

  const landlordDbPath = path.join(dataDir, `landlord_${landlord.id}.json`);
  fs.writeFileSync(landlordDbPath, encryptDb(landlordDb), 'utf8');
  console.log(`Landlord ${landlord.name} database seeded at:`, landlordDbPath);
});

// Also write a dummy empty db.json so legacy references do not crash
fs.writeFileSync(dbPath, JSON.stringify({ landlords: [], cpiRates: [] }), 'utf8');
