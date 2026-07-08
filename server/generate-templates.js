const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '../public/templates');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Helper to autofit columns for a cleaner layout
function xlsxColumnsAutofit(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const cols = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v) {
        const len = cell.v.toString().length;
        if (len > maxLen) maxLen = len;
      }
    }
    cols.push({ wch: maxLen + 3 });
  }
  ws['!cols'] = cols;
}

// --- 1. PROPERTIES TEMPLATES ---

// 1.1 Blank Template
const blankPropsData = [
  ["Address (Açık Adres)", "City (Şehir)", "Property Type (Mülk Tipi)", "Property Name (Mülk Adı)", "Unit Number (Daire/Bölüm No)", "Square Meters (Metrekare)", "Unit Description (Bölüm Açıklaması)"]
];
const wbBlankProps = XLSX.utils.book_new();
const wsBlankProps = XLSX.utils.aoa_to_sheet(blankPropsData);
xlsxColumnsAutofit(wsBlankProps);
XLSX.utils.book_append_sheet(wbBlankProps, wsBlankProps, "Properties");
XLSX.writeFile(wbBlankProps, path.join(publicDir, 'properties_template.xlsx'));

// 1.2 Dummy Data Template
const dummyPropsData = [
  ["Address (Açık Adres)", "City (Şehir)", "Property Type (Mülk Tipi)", "Property Name (Mülk Adı)", "Unit Number (Daire/Bölüm No)", "Square Meters (Metrekare)", "Unit Description (Bölüm Açıklaması)"],
  ["Ataturk Bulvari No:45", "Istanbul", "Residential", "Atatürk Apartmanı", "Apt 1", "90", "First floor residential flat"],
  ["Ataturk Bulvari No:45", "Istanbul", "Residential", "Atatürk Apartmanı", "Apt 2", "110", "Second floor residential flat"],
  ["Cumhuriyet Caddesi No:88", "Ankara", "Commercial", "Başkent Plaza", "Office 101", "65", "First floor office"],
  ["Cumhuriyet Caddesi No:88", "Ankara", "Commercial", "Başkent Plaza", "Office 102", "75", "First floor corner office"],
  ["Bodrum Marina Yolu No:12", "Mugla", "Residential", "Bodrum Marina Villa", "Villa A", "250", "Exclusive sea-view villa"]
];
const wbDummyProps = XLSX.utils.book_new();
const wsDummyProps = XLSX.utils.aoa_to_sheet(dummyPropsData);
xlsxColumnsAutofit(wsDummyProps);
XLSX.utils.book_append_sheet(wbDummyProps, wsDummyProps, "Properties");
XLSX.writeFile(wbDummyProps, path.join(publicDir, 'properties_dummy_test.xlsx'));

// --- 2. LEASES TEMPLATES ---

// 2.1 Blank Template
const blankLeasesData = [
  ["Property Name / Address (Mülk Adı veya Adresi)", "Unit Number (Bölüm No)", "Tenant Name (Kiracı Adı)", "Tenant Email (Kiracı E-postası)", "Tenant Phone (Kiracı Telefonu)", "Start Date (Başlangıç Tarihi)", "End Date (Bitiş Tarihi)", "Monthly Rent (Aylık Kira Bedeli)", "Currency (Para Birimi)", "Payment Due Day (Ödeme Günü)", "Escalation Type (Artış Türü)", "Escalation Parameter (Artış Oranı / Parametresi)", "Security Deposit (Güvence Bedeli / Depozito)", "Lease Notes (Sözleşme Notları)"]
];
const wbBlankLeases = XLSX.utils.book_new();
const wsBlankLeases = XLSX.utils.aoa_to_sheet(blankLeasesData);
xlsxColumnsAutofit(wsBlankLeases);
XLSX.utils.book_append_sheet(wbBlankLeases, wsBlankLeases, "Leases");
XLSX.writeFile(wbBlankLeases, path.join(publicDir, 'leases_template.xlsx'));

// 2.2 Dummy Data Template
// NOTE: These rows intentionally reference properties defined in properties_dummy_test.xlsx
// so the two templates form a consistent end-to-end dataset.
const dummyLeasesData = [
  ["Property Name / Address (Mülk Adı veya Adresi)", "Unit Number (Bölüm No)", "Tenant Name (Kiracı Adı)", "Tenant Email (Kiracı E-postası)", "Tenant Phone (Kiracı Telefonu)", "Start Date (Başlangıç Tarihi)", "End Date (Bitiş Tarihi)", "Monthly Rent (Aylık Kira Bedeli)", "Currency (Para Birimi)", "Payment Due Day (Ödeme Günü)", "Escalation Type (Artış Türü)", "Escalation Parameter (Artış Oranı / Parametresi)", "Security Deposit (Güvence Bedeli / Depozito)", "Lease Notes (Sözleşme Notları)"],
  ["Atatürk Apartmanı",   "Apt 1",      "Ahmet Yılmaz",  "ahmet@yilmaz.com",  "+905321111111", "2025-01-01", "2026-01-01", "15000", "TL",  "5",  "fixed", "10", "30000", "Residential flat – fixed 10% annual increase"],
  ["Atatürk Apartmanı",   "Apt 2",      "Ayşe Kara",     "ayse@kara.com",     "+905322222222", "2025-03-01", "2026-03-01", "18000", "TL",  "1",  "cpi",   "",   "36000", "Residential flat – CPI-linked annual increase"],
  ["Başkent Plaza",       "Office 101", "Mehmet Kaya",   "mehmet@kaya.com",   "+905333333333", "2025-02-01", "2026-02-01", "25000", "TL",  "10", "fixed", "15", "50000", "Corner office – fixed 15% annual increase"],
  ["Başkent Plaza",       "Office 102", "Zeynep Aksoy",  "zeynep@aksoy.com",  "+905344444444", "2025-06-01", "",           "30000", "TL",  "15", "cpi",   "",   "60000", "Office with open-ended CPI lease"],
  ["Bodrum Marina Villa", "Villa A",    "Can Yılmaz",     "can@yilmaz.com",     "+905355555555", "2025-07-01", "2026-07-01", "85000", "TL",  "1",  "fixed", "20", "170000","Exclusive sea-view villa – fixed 20% annual increase"]
];
const wbDummyLeases = XLSX.utils.book_new();
const wsDummyLeases = XLSX.utils.aoa_to_sheet(dummyLeasesData);
xlsxColumnsAutofit(wsDummyLeases);
XLSX.utils.book_append_sheet(wbDummyLeases, wsDummyLeases, "Leases");
XLSX.writeFile(wbDummyLeases, path.join(publicDir, 'leases_dummy_test.xlsx'));

console.log('Templates generated successfully in:', publicDir);
