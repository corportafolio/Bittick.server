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
  try { db.run("ALTER TABLE opportunities ADD COLUMN bot_type TEXT NOT NULL DEFAULT 'futures'"); } catch (e) {}

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
    opportunity_id INTEGER,
    inscription_id TEXT,
    address TEXT
  )`);

  try { db.run("ALTER TABLE positions ADD COLUMN horizonte TEXT DEFAULT 'horas'"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN usd_amount REAL DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN inscription_id TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN address TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN close_reason TEXT DEFAULT ''"); } catch (e) {}

  // PnL history table - preserves realized PnL after position cleanup
  db.run(`CREATE TABLE IF NOT EXISTS pnl_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_type TEXT NOT NULL,
    inscription_id TEXT,
    address TEXT,
    pnl REAL NOT NULL,
    pnl_percent REAL NOT NULL,
    strategy_type TEXT,
    entry_price REAL,
    exit_price REAL,
    usd_amount REAL,
    close_reason TEXT,
    closed_at TEXT NOT NULL
  )`);

  // Bot API keys table - per-bot per-mode Binance API credentials
  db.run(`CREATE TABLE IF NOT EXISTS bot_api_keys (
    inscription_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    address TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (inscription_id, mode)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bot_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    max_positions INTEGER NOT NULL DEFAULT 5,
    position_size_usdt REAL NOT NULL DEFAULT 10,
    min_confidence REAL NOT NULL DEFAULT 5
  )`);

  // User inscriptions table - stores verified wallet inscriptions
  db.run(`CREATE TABLE IF NOT EXISTS user_inscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    bot_num INTEGER NOT NULL,
    inscription_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    bot_image_url TEXT,
    selected INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(address, inscription_id)
  )`);

  // Inscription preferences table - bot preferences per inscription
  db.run(`CREATE TABLE IF NOT EXISTS inscription_preferences (
    inscription_id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    spot_enabled INTEGER NOT NULL DEFAULT 1,
    futures_enabled INTEGER NOT NULL DEFAULT 1,
    spot_position_size REAL NOT NULL DEFAULT 10.0,
    futures_position_size REAL NOT NULL DEFAULT 10.0,
    spot_max_positions INTEGER NOT NULL DEFAULT 5,
    futures_max_positions INTEGER NOT NULL DEFAULT 5,
    spot_min_score INTEGER NOT NULL DEFAULT 6,
    futures_min_score INTEGER NOT NULL DEFAULT 7,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Bot strategies table - per-bot per-mode strategy configuration
  db.run(`CREATE TABLE IF NOT EXISTS bot_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inscription_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    level INTEGER NOT NULL,
    strategy_name TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    position_size_usdt REAL NOT NULL DEFAULT 10.0,
    min_score INTEGER NOT NULL DEFAULT 6,
    min_confidence INTEGER NOT NULL DEFAULT 6,
    leverage INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(inscription_id, mode, level)
  )`);

  // Trading zones table - catalogo de zonas Trading Avizor
  db.run(`CREATE TABLE IF NOT EXISTS trading_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    start_price REAL NOT NULL,
    end_price REAL NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Migration: add min_score column if missing
  try {
    const cols = db.exec("PRAGMA table_info(bot_strategies)");
    const hasMinScore = cols[0]?.values?.some(r => r[1] === 'min_score');
    if (!hasMinScore) {
      db.run("ALTER TABLE bot_strategies ADD COLUMN min_score INTEGER NOT NULL DEFAULT 6");
      db.run("UPDATE bot_strategies SET min_score = level WHERE min_score = 6");
      save();
    }
  } catch (_) {}

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
    (asset, strategy_type, bot_type, price, entry_zone, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`);
  stmt.run([op.asset, op.strategyType, op.botType || 'futures', op.currentPrice, op.entryZone,
    op.target, op.stopLoss, op.score, op.confidence || 0,
    op.explanation || '', JSON.stringify(op.factors || []),
    JSON.stringify(op.risks || []), JSON.stringify(op.signals || {}), op.horizonte || 'horas']);
  stmt.free();
  save();
}

function getOpportunities(limit = 50, offset = 0, since = null, botType = null) {
  let sql = "SELECT * FROM opportunities";
  const conditions = [];
  const params = [];
  if (since) {
    const sinceDate = since.replace('T', ' ').replace('Z', '');
    conditions.push("created_at > ?");
    params.push(sinceDate);
  }
  if (botType) {
    conditions.push("bot_type = ?");
    params.push(botType);
  }
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
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

function getOpportunitiesFreeTier(limit = 50, offset = 0) {
  const sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  let sql = "SELECT * FROM opportunities WHERE created_at > ? AND score >= 5 AND score <= 6 AND confidence >= 5 AND confidence <= 6";
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const stmt = db.prepare(sql);
  stmt.bind([sinceDate, limit, offset]);
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
    (bot_type, strategy_type, asset, entry_price, current_price, quantity, order_id, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, usd_amount, status, pnl, pnl_percent, inscription_id, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, 0, ?, ?)`);
  stmt.run([pos.botType, pos.strategyType, pos.asset, pos.entryPrice, pos.entryPrice,
    pos.quantity, pos.orderId || null, pos.target || null, pos.stopLoss || null,
    pos.score || 0, pos.confidence || 0, pos.explanation || '',
    JSON.stringify(pos.factors || []), JSON.stringify(pos.risks || []),
    JSON.stringify(pos.signals || {}), pos.horizonte || 'horas', pos.usdAmount || 0,
    pos.inscriptionId || null, pos.address || null]);
  stmt.free();
  const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  save();
  return id;
}

function normalizePositionTimestamps(row) {
  if (row.opened_at) row.opened_at = row.opened_at.replace(' ', 'T') + 'Z';
  if (row.closed_at) row.closed_at = row.closed_at.replace(' ', 'T') + 'Z';
  return row;
}

function getPositions(botType = null, status = 'open', address = null) {
  let sql = "SELECT * FROM positions WHERE status = ?";
  const params = [status];
  if (botType) {
    sql += " AND bot_type = ?";
    params.push(botType);
  }
  if (address) {
    sql += " AND address = ?";
    params.push(address.toLowerCase());
  }
  sql += " ORDER BY opened_at DESC";
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(normalizePositionTimestamps(stmt.getAsObject()));
  stmt.free();
  return rows;
}

function getPositionById(id) {
  const stmt = db.prepare("SELECT * FROM positions WHERE id = ?");
  stmt.bind([id]);
  if (stmt.step()) { const r = normalizePositionTimestamps(stmt.getAsObject()); stmt.free(); return r; }
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

function closePosition(id, currentPrice, pnl, reason = '') {
  const closedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.run("UPDATE positions SET status = 'closed', current_price = ?, pnl = ?, pnl_percent = ?, closed_at = ?, close_reason = ? WHERE id = ?",
    [currentPrice, pnl.pnl, pnl.pnlPercent, closedAt, reason, id]);
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

function cleanupOldPositions(daysOld = 30, maxClosed = 50) {
  const countRow = (() => {
    const stmt = db.prepare("SELECT COUNT(*) as c FROM positions WHERE status IN ('closed','cancelled')");
    const r = stmt.step() ? stmt.getAsObject() : { c: 0 };
    stmt.free();
    return r.c;
  })();

  if (countRow <= maxClosed) return 0;

  const toDelete = countRow - maxClosed;
  const stmt = db.prepare(
    "SELECT id, bot_type, inscription_id, address, pnl, pnl_percent, strategy_type, entry_price, current_price, usd_amount, close_reason, closed_at FROM positions WHERE status IN ('closed','cancelled') ORDER BY closed_at ASC LIMIT ?"
  );
  stmt.bind([toDelete]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  if (rows.length === 0) return 0;

  for (const row of rows) {
    db.run(`INSERT INTO pnl_history (bot_type, inscription_id, address, pnl, pnl_percent, strategy_type, entry_price, exit_price, usd_amount, close_reason, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.bot_type, row.inscription_id, row.address, row.pnl, row.pnl_percent,
       row.strategy_type, row.entry_price, row.current_price, row.usd_amount,
       row.close_reason || '', row.closed_at || new Date().toISOString().replace('T', ' ').substring(0, 19)]);
  }

  const ids = rows.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM positions WHERE id IN (${placeholders})`, ids);
  save();
  logger.info('trading-store', `Cleaned up ${rows.length} old closed positions, preserved PnL in history`);
  return rows.length;
}

function getBotStats(type) {
  const openPositions = getPositions(type, 'open');
  const totalPnl = (() => {
    const stmt = db.prepare(`SELECT COALESCE(SUM(pnl), 0) as total FROM (
      SELECT pnl FROM positions WHERE bot_type = ? AND status IN ('closed','cancelled')
      UNION ALL
      SELECT pnl FROM pnl_history WHERE bot_type = ?
    )`);
    stmt.bind([type, type]);
    if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r.total; }
    stmt.free();
    return 0;
  })();
  return { type, openPositions: openPositions.length, totalPnl };
}

// User inscriptions functions
function insertUserInscription(address, botNum, inscriptionId, tier, botImageUrl) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO user_inscriptions
    (address, bot_num, inscription_id, tier, bot_image_url, verified_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`);
  stmt.run([address.toLowerCase(), botNum, inscriptionId, tier, botImageUrl || '']);
  stmt.free();
  save();
}

function getUserInscriptions(address) {
  const stmt = db.prepare("SELECT bot_num, inscription_id, tier, bot_image_url, selected FROM user_inscriptions WHERE address = ? ORDER BY bot_num");
  stmt.bind([address.toLowerCase()]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function setSelectedInscription(address, inscriptionId) {
  db.run("UPDATE user_inscriptions SET selected = 0 WHERE address = ?", [address.toLowerCase()]);
  db.run("UPDATE user_inscriptions SET selected = 1 WHERE address = ? AND inscription_id = ?", [address.toLowerCase(), inscriptionId]);
  save();
}

function getSelectedInscription(address) {
  const stmt = db.prepare("SELECT inscription_id, bot_num, tier, bot_image_url FROM user_inscriptions WHERE address = ? AND selected = 1");
  stmt.bind([address.toLowerCase()]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function deleteUserInscriptions(address) {
  db.run("DELETE FROM user_inscriptions WHERE address = ?", [address.toLowerCase()]);
  save();
}

// Inscription preferences functions
function getInscriptionPreferences(inscriptionId) {
  const stmt = db.prepare("SELECT * FROM inscription_preferences WHERE inscription_id = ?");
  stmt.bind([inscriptionId]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function upsertInscriptionPreferences(inscriptionId, address, prefs) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO inscription_preferences
    (inscription_id, address, spot_enabled, futures_enabled, spot_position_size, futures_position_size,
     spot_max_positions, futures_max_positions, spot_min_score, futures_min_score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  stmt.run([
    inscriptionId, address.toLowerCase(),
    prefs.spot_enabled ?? 1, prefs.futures_enabled ?? 1,
    prefs.spot_position_size ?? 10.0, prefs.futures_position_size ?? 10.0,
    prefs.spot_max_positions ?? 5, prefs.futures_max_positions ?? 5,
    prefs.spot_min_score ?? 6, prefs.futures_min_score ?? 7
  ]);
  stmt.free();
  save();
}

function deleteInscriptionPreferences(inscriptionId) {
  db.run("DELETE FROM inscription_preferences WHERE inscription_id = ?", [inscriptionId]);
  save();
}

// Bot strategies CRUD (per-level)
function getBotStrategiesByLevel(inscriptionId, mode) {
  const stmt = db.prepare("SELECT * FROM bot_strategies WHERE inscription_id = ? AND mode = ? ORDER BY level DESC");
  stmt.bind([inscriptionId, mode]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function getBotStrategyByLevel(inscriptionId, mode, level) {
  const stmt = db.prepare("SELECT * FROM bot_strategies WHERE inscription_id = ? AND mode = ? AND level = ?");
  stmt.bind([inscriptionId, mode, level]);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function saveBotStrategyByLevel(strategy) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO bot_strategies
    (inscription_id, mode, level, strategy_name, enabled, position_size_usdt, min_score, min_confidence, leverage, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  stmt.run([
    strategy.inscription_id, strategy.mode, strategy.level,
    strategy.strategy_name || '', strategy.enabled ?? 1,
    strategy.position_size_usdt ?? 10, strategy.min_score ?? 6,
    strategy.min_confidence ?? 6, strategy.leverage ?? 1
  ]);
  stmt.free();
}

function saveBotStrategiesByLevel(inscriptionId, mode, levels) {
  for (const lvl of levels) {
    saveBotStrategyByLevel({
      inscription_id: inscriptionId,
      mode: mode,
      level: lvl.level,
      strategy_name: `level_${lvl.level}`,
      enabled: lvl.enabled ?? 1,
      position_size_usdt: lvl.amount ?? lvl.position_size_usdt ?? 10,
      min_score: lvl.min_score ?? lvl.level ?? 6,
      min_confidence: lvl.min_confidence ?? lvl.level ?? 6,
      leverage: lvl.leverage ?? 1
    });
  }
  save();
}

function deleteBotStrategiesByLevel(inscriptionId, mode) {
  db.run("DELETE FROM bot_strategies WHERE inscription_id = ? AND mode = ?", [inscriptionId, mode]);
  save();
}

function getActiveInscriptions() {
  const stmt = db.prepare("SELECT inscription_id, bot_num, address FROM user_inscriptions WHERE selected = 1");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Bot status/positions by inscription
function getPositionsByInscription(inscriptionId, status = 'open') {
  let sql = "SELECT * FROM positions WHERE inscription_id = ? AND status = ?";
  const params = [inscriptionId, status];
  sql += " ORDER BY opened_at DESC";
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(normalizePositionTimestamps(stmt.getAsObject()));
  stmt.free();
  return rows;
}

// Batch set user inscriptions (called by authRouter after verify)
function setUserInscriptions(address, inscriptions) {
  deleteUserInscriptions(address);
  for (const ins of inscriptions) {
    insertUserInscription(address, ins.num, ins.inscriptionId, ins.tier, ins.botImageUrl || '');
  }
}

// Alias for setSelectedInscription
function selectInscription(address, inscriptionId) {
  setSelectedInscription(address, inscriptionId);
}

// Track verified owner
function setVerifiedOwner(address, botNum, inscriptionId) {
  db.run(`INSERT OR REPLACE INTO user_inscriptions
    (address, bot_num, inscription_id, tier, bot_image_url, selected, verified_at)
    SELECT ?, ?, ?, tier, bot_image_url, 1, datetime('now')
    FROM user_inscriptions WHERE inscription_id = ? AND address = ?`, [
    address.toLowerCase(), botNum, inscriptionId, inscriptionId, address.toLowerCase()
  ]);
  save();
}

// Bot API Keys CRUD
function getBotApiKey(inscriptionId, mode) {
  const stmt = db.prepare("SELECT api_key, api_secret FROM bot_api_keys WHERE inscription_id = ? AND mode = ?");
  stmt.bind([inscriptionId, mode]);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return null;
}

function saveBotApiKey(inscriptionId, mode, address, apiKey, apiSecret) {
  const stmt = db.prepare(`INSERT OR REPLACE INTO bot_api_keys
    (inscription_id, mode, address, api_key, api_secret, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`);
  stmt.run([inscriptionId, mode, address.toLowerCase(), apiKey, apiSecret]);
  stmt.free();
  save();
}

function deleteBotApiKey(inscriptionId, mode) {
  db.run("DELETE FROM bot_api_keys WHERE inscription_id = ? AND mode = ?", [inscriptionId, mode]);
  save();
}

function getTradingZones(limit = 100) {
  const result = db.exec(`SELECT id, date, type, start_price, end_price, color FROM trading_zones ORDER BY date DESC LIMIT ${limit}`);
  if (!result[0]) return [];
  return result[0].values.map(r => ({
    id: r[0], date: r[1], type: r[2], start_price: r[3], end_price: r[4], color: r[5]
  }));
}

function getSmartZones(currentPrice) {
  const seen = new Set();
  const zones = [];
  const validTypes = ['compra', 'venta', 'deuda', 'demanda', 'oferta'];

  for (const type of validTypes) {
    const result = db.exec(
      `SELECT id, date, type, start_price, end_price, color FROM trading_zones WHERE type = '${type}' ORDER BY date DESC LIMIT 5`
    );
    if (result[0]) {
      for (const r of result[0].values) {
        if (!seen.has(r[0])) {
          seen.add(r[0]);
          zones.push({ id: r[0], date: r[1], type: r[2], start_price: r[3], end_price: r[4], color: r[5] });
        }
      }
    }
  }

  const price = parseFloat(currentPrice);
  if (price && price > 0) {
    const result = db.exec(
      `SELECT id, date, type, start_price, end_price, color FROM trading_zones ORDER BY ABS((start_price + end_price) / 2 - ${price}) ASC LIMIT 1`
    );
    if (result[0] && result[0].values[0]) {
      const r = result[0].values[0];
      if (!seen.has(r[0])) {
        zones.push({ id: r[0], date: r[1], type: r[2], start_price: r[3], end_price: r[4], color: r[5] });
      }
    }
  }

  return zones;
}

function cleanOldZones() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().split('T')[0];
  db.run('DELETE FROM trading_zones WHERE date < ?', [cutoff]);
  save();
}

async function close() { if (db) db.close(); }

module.exports = {
  init, insertOpportunity, getOpportunities, getOpportunitiesFreeTier, getOpportunityById,
  getStrategyConfigs, deleteOldOpportunities, deleteOpportunity, cleanupOldPositions,
  insertPosition, getPositions, getPositionById, updatePositionPrice, closePosition, cancelPosition,
  getBotConfigs, getBotConfig, updateBotConfig, getBotStats, close,
  insertUserInscription, getUserInscriptions, setSelectedInscription, getSelectedInscription,
  deleteUserInscriptions, setUserInscriptions, selectInscription, setVerifiedOwner,
  getInscriptionPreferences, upsertInscriptionPreferences, deleteInscriptionPreferences,
  getPositionsByInscription,
  getBotStrategiesByLevel, getBotStrategyByLevel, saveBotStrategyByLevel, saveBotStrategiesByLevel, deleteBotStrategiesByLevel, getActiveInscriptions,
  getBotApiKey, saveBotApiKey, deleteBotApiKey,
  getTradingZones, getSmartZones, cleanOldZones,
  save
};
