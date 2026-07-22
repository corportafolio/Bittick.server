const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DOC_PATH = path.join(__dirname, 'docs', '02_zonas-trading-avizor.md');
const DB_PATH = path.join(__dirname, 'data', 'trading.db');

const TYPE_MAP = {
  '🟢compra': 'compra',
  '🔴venta': 'venta',
  '🟡demanda': 'demanda',
  '📊deuda': 'deuda',
  '📊oferta': 'oferta'
};

const COLOR_MAP = {
  compra: '#44FF66',
  venta: '#FF4444',
  demanda: '#FFD700',
  deuda: '#FF8800',
  oferta: '#FF8800'
};

function parseDate(dateStr) {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function parsePrice(priceStr) {
  if (!priceStr || priceStr.trim() === '—') return null;
  return parseFloat(priceStr.replace(/[$.\s]/g, '').replace(',', '.'));
}

function parseType(typeStr) {
  const types = typeStr.split('<br>');
  return types.map(t => {
    const cleaned = t.trim().toLowerCase();
    for (const [key, val] of Object.entries(TYPE_MAP)) {
      if (cleaned.includes(key.toLowerCase())) return val;
    }
    return null;
  }).filter(Boolean);
}

function parseDocument() {
  const content = fs.readFileSync(DOC_PATH, 'utf-8');
  const lines = content.split('\n');
  const zones = [];

  for (const line of lines) {
    if (!line.startsWith('| ')) continue;
    if (line.startsWith('| Fecha')) continue;
    if (line.startsWith('|---')) continue;

    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length < 3) continue;

    const [fechaCol, tipoCol, rangoCol] = cols;

    const date = parseDate(fechaCol);
    if (!date) continue;

    const types = parseType(tipoCol);
    if (types.length === 0) continue;

    const rangeParts = rangoCol.split('—').map(s => s.trim());
    const startPrice = parsePrice(rangeParts[0]);
    const endPrice = parsePrice(rangeParts[1] || rangeParts[0]);

    if (startPrice === null || endPrice === null) continue;
    if (startPrice <= 0 || endPrice <= 0) continue;

    for (const type of types) {
      zones.push({
        date,
        type,
        start_price: Math.min(startPrice, endPrice),
        end_price: Math.max(startPrice, endPrice),
        color: COLOR_MAP[type] || '#888888'
      });
    }
  }

  return zones;
}

async function main() {
  const SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS trading_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      start_price REAL NOT NULL,
      end_price REAL NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run('DELETE FROM trading_zones');

  const zones = parseDocument();
  console.log(`Parseadas ${zones.length} zonas del documento`);

  const insert = db.prepare('INSERT INTO trading_zones (date, type, start_price, end_price, color) VALUES (?, ?, ?, ?, ?)');
  for (const z of zones) {
    insert.run([z.date, z.type, z.start_price, z.end_price, z.color]);
  }
  insert.free();

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().split('T')[0];
  db.run('DELETE FROM trading_zones WHERE date < ?', [cutoff]);

  const count = db.exec('SELECT COUNT(*) as total FROM trading_zones');
  console.log(`Total zonas en DB: ${count[0].values[0][0]}`);

  const sample = db.exec('SELECT date, type, start_price, end_price, color FROM trading_zones ORDER BY date LIMIT 5');
  console.log('Primeras 5 zonas:');
  for (const row of sample[0].values) {
    console.log(`  ${row[0]} | ${row[1]} | $${row[2]} — $${row[3]} | ${row[4]}`);
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  console.log('DB guardada en', DB_PATH);

  db.close();
}

main().catch(console.error);
