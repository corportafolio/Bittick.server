const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const logger = require('../logger/logger');

const DB_PATH = path.join(__dirname, '../../data/trading.db');
let db = null;
let SQL = null;

async function init() {
  SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    price REAL NOT NULL,
    entry_zone TEXT,
    target REAL,
    stop_loss REAL,
    score REAL NOT NULL DEFAULT 0,
    confidence REAL DEFAULT 0,
    ai_explanation TEXT,
    factors TEXT,
    risks TEXT,
    signals TEXT,
    horizonte TEXT DEFAULT 'horas',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  try { db.run("ALTER TABLE opportunities ADD COLUMN horizonte TEXT DEFAULT 'horas'"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS strategy_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    interval_minutes INTEGER NOT NULL DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_type TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    asset TEXT NOT NULL DEFAULT 'BTCUSDT',
    entry_price REAL NOT NULL,
    current_price REAL,
    quantity REAL NOT NULL DEFAULT 0,
    order_id TEXT,
    target REAL,
    stop_loss REAL,
    score REAL DEFAULT 0,
    confidence REAL DEFAULT 0,
    ai_explanation TEXT,
    factors TEXT,
    risks TEXT,
    signals TEXT,
    horizonte TEXT DEFAULT 'horas',
    usd_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    pnl REAL DEFAULT 0,
    pnl_percent REAL DEFAULT 0,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    opportunity_id INTEGER
  )`);

  try { db.run("ALTER TABLE positions ADD COLUMN horizonte TEXT DEFAULT 'horas'"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN usd_amount REAL DEFAULT 0"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS bot_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    max_positions INTEGER NOT NULL DEFAULT 5,
    position_size_usdt REAL NOT NULL DEFAULT 10,
    min_confidence REAL NOT NULL DEFAULT 5
  )`);

  save();

  const row = db.exec("SELECT COUNT(*) as c FROM strategy_config WHERE name = 'longAfterDrop'");
  if (!row[0] || row[0].values[0][0] === 0) {
    db.run("INSERT INTO strategy_config (name, enabled, interval_minutes) VALUES ('longAfterDrop', 1, 1)");
    db.run("INSERT INTO strategy_config (name, enabled, interval_minutes) VALUES ('shortAfterRise', 1, 1)");
    save();
  }

  const rangeRow = db.exec("SELECT COUNT(*) as c FROM strategy_config WHERE name = 'rangeStrategy'");
  if (!rangeRow[0] || rangeRow[0].values[0][0] === 0) {
    db.run("INSERT INTO strategy_config (name, enabled, interval_minutes) VALUES ('rangeStrategy', 1, 1)");
    save();
  }

  const fibRow = db.exec("SELECT COUNT(*) as c FROM strategy_config WHERE name = 'spotFibStrategy'");
  if (!fibRow[0] || fibRow[0].values[0][0] === 0) {
    db.run("INSERT INTO strategy_config (name, enabled, interval_minutes) VALUES ('spotFibStrategy', 1, 1)");
    save();
  }

  const renkoRow = db.exec("SELECT COUNT(*) as c FROM strategy_config WHERE name = 'renkoAccumulation'");
  if (!renkoRow[0] || renkoRow[0].values[0][0] === 0) {
    db.run("INSERT INTO strategy_config (name, enabled, interval_minutes) VALUES ('renkoAccumulation', 1, 1)");
    save();
  }

  const spotBot = db.exec("SELECT COUNT(*) as c FROM bot_config WHERE type = 'spot'");
  if (!spotBot[0] || spotBot[0].values[0][0] === 0) {
    db.run("INSERT INTO bot_config (type, enabled, max_positions, position_size_usdt, min_confidence) VALUES ('spot', 1, 5, 10, 5)");
    save();
  }
  const futuresBot = db.exec("SELECT COUNT(*) as c FROM bot_config WHERE type = 'futures'");
  if (!futuresBot[0] || futuresBot[0].values[0][0] === 0) {
    db.run("INSERT INTO bot_config (type, enabled, max_positions, position_size_usdt, min_confidence) VALUES ('futures', 1, 5, 10, 5)");
    save();
  }

  db.run("UPDATE bot_config SET max_positions = 5 WHERE max_positions < 5");
  db.run("UPDATE bot_config SET min_confidence = 5 WHERE min_confidence > 5");
  save();

  logger.info('trading-store', `Trading DB initialized at ${DB_PATH}`);
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function insertOpportunity(op) {
  const stmt = db.prepare(`INSERT INTO opportunities
    (asset, strategy_type, price, entry_zone, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`);
  stmt.run([op.asset, op.strategyType, op.currentPrice, op.entryZone,
    op.target, op.stopLoss, op.score, op.confidence || 0,
    op.explanation || '', JSON.stringify(op.factors || []),
    JSON.stringify(op.risks || []), JSON.stringify(op.signals || {}), op.horizonte || 'horas']);
  stmt.free();
  save();
}

function getOpportunities(limit = 50, offset = 0, since = null) {
  let sql = "SELECT * FROM opportunities";
  const params = [];
  if (since) {
    const sinceDate = since.replace('T', ' ').replace('Z', '');
    sql += " WHERE created_at > ?";
    params.push(sinceDate);
  }
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.created_at) {
      row.created_at = row.created_at.replace(' ', 'T') + 'Z';
    }
    if (row.score !== undefined) row.score = Math.round(Math.min(10, Math.max(0, row.score)));
    if (row.confidence !== undefined) row.confidence = Math.round(Math.min(10, Math.max(0, row.confidence)));
    rows.push(row);
  }
  stmt.free();
  return rows;
}

function getOpportunityById(id) {
  const stmt = db.prepare("SELECT * FROM opportunities WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function getStrategyConfigs() {
  const stmt = db.prepare("SELECT * FROM strategy_config");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function deleteOldOpportunities(daysOld = 10) {
  db.run("DELETE FROM opportunities WHERE created_at < datetime('now', ?)", [`-${daysOld} days`]);
  save();
}

function deleteOpportunity(id) {
  const stmt = db.prepare("SELECT COUNT(*) as c FROM opportunities WHERE id = ?");
  stmt.bind([id]);
  const exists = stmt.step() && stmt.getAsObject().c > 0;
  stmt.free();
  if (!exists) return false;
  db.run("DELETE FROM opportunities WHERE id = ?", [id]);
  save();
  return true;
}

function insertPosition(pos) {
  const stmt = db.prepare(`INSERT INTO positions
    (bot_type, strategy_type, asset, entry_price, current_price, quantity, order_id, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, usd_amount, status, pnl, pnl_percent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, 0)`);
  stmt.run([pos.botType, pos.strategyType, pos.asset, pos.entryPrice, pos.entryPrice,
    pos.quantity, pos.orderId || null, pos.target || null, pos.stopLoss || null,
    pos.score || 0, pos.confidence || 0, pos.explanation || '',
    JSON.stringify(pos.factors || []), JSON.stringify(pos.risks || []),
    JSON.stringify(pos.signals || {}), pos.horizonte || 'horas', pos.usdAmount || 0]);
  stmt.free();
  const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  save();
  return id;
}

function getPositions(botType = null, status = 'open') {
  let sql = "SELECT * FROM positions WHERE status = ?";
  const params = [status];
  if (botType) {
    sql += " AND bot_type = ?";
    params.push(botType);
  }
  sql += " ORDER BY opened_at DESC";
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getPositionById(id) {
  const stmt = db.prepare("SELECT * FROM positions WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function updatePositionPrice(id, currentPrice, pnl) {
  if (currentPrice && pnl !== undefined) {
    db.run("UPDATE positions SET current_price = ?, pnl = ?, pnl_percent = ? WHERE id = ?",
      [currentPrice, pnl.pnl, pnl.pnlPercent, id]);
  } else if (currentPrice) {
    db.run("UPDATE positions SET current_price = ? WHERE id = ?", [currentPrice, id]);
  }
  save();
}

function closePosition(id, currentPrice, pnl) {
  const closedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.run("UPDATE positions SET status = 'closed', current_price = ?, pnl = ?, pnl_percent = ?, closed_at = ? WHERE id = ?",
    [currentPrice, pnl.pnl, pnl.pnlPercent, closedAt, id]);
  save();
}

function cancelPosition(id) {
  db.run("UPDATE positions SET status = 'cancelled', closed_at = datetime('now') WHERE id = ?", [id]);
  save();
}

function getBotConfigs() {
  const stmt = db.prepare("SELECT * FROM bot_config");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getBotConfig(type) {
  const stmt = db.prepare("SELECT * FROM bot_config WHERE type = ?");
  stmt.bind([type]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function updateBotConfig(type, updates) {
  const fields = [];
  const params = [];
  if (updates.enabled !== undefined) { fields.push("enabled = ?"); params.push(updates.enabled ? 1 : 0); }
  if (updates.max_positions !== undefined) { fields.push("max_positions = ?"); params.push(updates.max_positions); }
  if (updates.position_size_usdt !== undefined) { fields.push("position_size_usdt = ?"); params.push(updates.position_size_usdt); }
  if (updates.min_confidence !== undefined) { fields.push("min_confidence = ?"); params.push(updates.min_confidence); }
  if (fields.length === 0) return;
  params.push(type);
  db.run(`UPDATE bot_config SET ${fields.join(", ")} WHERE type = ?`, params);
  save();
}

function getBotStats(type) {
  const openPositions = getPositions(type, 'open');
  const totalPnl = (() => {
    const stmt = db.prepare("SELECT COALESCE(SUM(pnl), 0) as total FROM positions WHERE bot_type = ? AND status IN ('closed','cancelled')");
    stmt.bind([type]);
    if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r.total; }
    stmt.free();
    return 0;
  })();
  return { type, openPositions: openPositions.length, totalPnl };
}

async function close() { if (db) db.close(); }

module.exports = {
  init, insertOpportunity, getOpportunities, getOpportunityById,
  getStrategyConfigs, deleteOldOpportunities, deleteOpportunity,
  insertPosition, getPositions, getPositionById, updatePositionPrice, closePosition, cancelPosition,
  getBotConfigs, getBotConfig, updateBotConfig, getBotStats, close
};
