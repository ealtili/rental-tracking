const XLSX = require('xlsx');
const cheerio = require('cheerio');

/**
 * Parses the Hesap Hareketleri bank statement Excel file.
 * Start parsing from Row 13 (0-indexed 12 in SheetJS).
 * Column indexes:
 *  0: Date (Tarih)
 *  1: Transaction Type (İşlem)
 *  2: Description (Açıklama)
 *  3: Reference/Receipt Number (Dekont Numarası)
 *  4: Channel (Kanal)
 *  5: Amount (Tutar TL)
 *  6: Running Balance (Güncel Bakiye TL)
 */
function parseBankStatement(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Parse as 2D array to easily handle custom row index offset
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    
    const transactions = [];
    
    // Row 13 is headers (index 12), data starts at row 14 (index 13)
    for (let i = 13; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row[0]) continue;
      
      // Date formatting check (handle Excel serial dates vs strings)
      let rawDate = row[0];
      let dateStr = '';
      if (typeof rawDate === 'number') {
        // Excel date serial code to JS Date conversion
        const dateObj = XLSX.SSF.parse_date_code(rawDate);
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        const hh = String(dateObj.H || 0).padStart(2, '0');
        const mm = String(dateObj.M || 0).padStart(2, '0');
        dateStr = `${d}.${m}.${y} ${hh}:${mm}`;
      } else {
        dateStr = String(rawDate).trim();
      }

      const amount = parseFloat(row[5]);
      if (isNaN(amount)) continue;

      transactions.push({
        id: `tx-${i}-${Date.now() % 1000}`,
        date: dateStr,
        type: String(row[1] || '').trim(),
        description: String(row[2] || '').trim(),
        refNumber: String(row[3] || '').trim(),
        channel: String(row[4] || '').trim(),
        amount: amount,
        balance: parseFloat(row[6] || 0)
      });
    }
    
    return transactions;
  } catch (error) {
    console.error('Error parsing bank statement Excel:', error);
    throw new Error('Failed to parse bank statement file.');
  }
}

/**
 * Scrapes the latest 12-month average TÜFE rate.
 * Falls back to null dynamically if WAF/Cloudflare blocks or structure changes.
 */
async function scrapeLatestTufe() {
  const targetUrl = 'https://kira-artis-orani.hesaplama.net/';
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(8000) // 8 second timeout boundary
    });

    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    let scrapedRates = [];

    // Parse the table rows. The table has class like 'tblcentered'
    $('table tbody tr').each((i, elem) => {
      const cols = $(elem).find('td');
      if (cols.length >= 2) {
        const periodText = $(cols[0]).text().trim(); // E.g., "Haziran 2026"
        const rateText = $(cols[1]).text().replace('%', '').replace(',', '.').trim(); // E.g., "%32,24" -> "32.24"
        const rateVal = parseFloat(rateText);
        
        if (periodText && !isNaN(rateVal)) {
          scrapedRates.push({
            period: periodText,
            rate12MonthAvgTufe: rateVal
          });
        }
      }
    });

    if (scrapedRates.length > 0) {
      return scrapedRates;
    }
    
    throw new Error('No valid rate data extracted from parsed HTML');
  } catch (error) {
    // Fail gracefully: Log the error and return null. The server will fall back to manual entry.
    console.warn(`[Defensive Scraper] Failed to fetch TÜFE from ${targetUrl}:`, error.message);
    return null;
  }
}

/**
 * Parses a bulk-uploaded property Excel file.
 * Returns a list of properties and their nested units.
 */
function parsePropertyUpload(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // Convert to JSON array, starting from row 1 (headers)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    // Header check
    if (rows.length === 0) return [];
    
    const propertiesMap = {};

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const address = String(row[0] || '').trim();
      const city = String(row[1] || '').trim();
      const type = String(row[2] || 'Residential').trim();
      const name = String(row[3] || '').trim();
      
      const unitNumber = String(row[4] || '').trim();
      const sqm = parseFloat(row[5]) || null;
      const unitDescription = String(row[6] || '').trim();

      if (!address) continue;

      if (!propertiesMap[address]) {
        propertiesMap[address] = {
          name: name || address,
          address,
          city,
          type: (type.toLowerCase().includes('com') || type.toLowerCase().includes('is') || type.toLowerCase().includes('tic')) ? 'Commercial' : 'Residential',
          notes: '',
          units: []
        };
      }

      if (unitNumber) {
        propertiesMap[address].units.push({
          unitNumber,
          squareMeters: sqm,
          notes: unitDescription
        });
      }
    }

    return Object.values(propertiesMap);
  } catch (error) {
    console.error('Error parsing property upload Excel:', error);
    throw new Error('Failed to parse property upload file.');
  }
}

function parseLeaseUpload(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rows.length === 0) return [];
    
    const parsedLeases = [];
    
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const propSearch = String(row[0] || '').trim();
      const unitNumberSearch = String(row[1] || '').trim();
      const tenantName = String(row[2] || '').trim();
      const tenantEmail = String(row[3] || '').trim();
      const tenantPhone = String(row[4] || '').trim();
      
      let rawStartDate = row[5];
      let rawEndDate = row[6];
      let startDate = '';
      let endDate = '';

      const parseExcelDate = (val) => {
        if (!val) return '';
        if (typeof val === 'number') {
          const dateObj = XLSX.SSF.parse_date_code(val);
          const y = dateObj.y;
          const m = String(dateObj.m).padStart(2, '0');
          const d = String(dateObj.d).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        return String(val).trim();
      };

      startDate = parseExcelDate(rawStartDate);
      endDate = parseExcelDate(rawEndDate);

      const monthlyRent = parseFloat(row[7]) || 0;
      const currency = String(row[8] || 'TL').trim();
      const dueDay = parseInt(row[9]) || 1;
      const escalationType = String(row[10] || 'cpi').toLowerCase().trim();
      const escalationParam = parseFloat(row[11]) || 0;
      const depositAmount = parseFloat(row[12]) || 0;
      const notes = String(row[13] || '').trim();

      if (!propSearch || !unitNumberSearch || !tenantName || !startDate || !monthlyRent) {
        continue;
      }

      parsedLeases.push({
        propSearch,
        unitNumberSearch,
        tenantName,
        tenantEmail,
        tenantPhone,
        startDate,
        endDate,
        monthlyRent,
        currency,
        dueDay,
        escalationType: (escalationType.includes('fixed') || escalationType.includes('sabit')) ? 'fixed' : 'cpi',
        escalationParam,
        depositAmount,
        notes
      });
    }
    
    return parsedLeases;
  } catch (error) {
    console.error('Error parsing lease upload Excel:', error);
    throw new Error('Failed to parse lease upload file.');
  }
}

module.exports = {
  parseBankStatement,
  scrapeLatestTufe,
  parsePropertyUpload,
  parseLeaseUpload
};
