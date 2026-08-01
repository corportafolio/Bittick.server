const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const logger = require('../logger/logger');
const poolStore = require('../engine/poolStore');

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

  // New indicator columns for professional analysis
  try { db.run("ALTER TABLE opportunities ADD COLUMN support_zone TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN resistance_zone TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN atr REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN volume_ratio REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN fib_levels TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN rsi REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN sma_ema TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN volume_spike INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN distance_pct REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN zone_type TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN zone_strength INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN magnet_zone_mid REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN magnet_zone_strength INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN back_price REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN through_back INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN fast_move INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN drop_pct REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN rise_pct REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN distance_from_sma REAL"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN volume_high INTEGER"); } catch (e) {}
  try { db.run("ALTER TABLE opportunities ADD COLUMN volume_surge INTEGER"); } catch (e) {}

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
    address TEXT,
    leverage INTEGER DEFAULT 1,
    level INTEGER
  )`);

  try { db.run("ALTER TABLE positions ADD COLUMN horizonte TEXT DEFAULT 'horas'"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN usd_amount REAL DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN inscription_id TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN address TEXT"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN leverage INTEGER DEFAULT 1"); } catch (e) {}
  try { db.run("ALTER TABLE positions ADD COLUMN level INTEGER"); } catch (e) {}
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

  // Bot API keys table - REMOVED: now in modules.binary (poolStore.js)

  db.run(`CREATE TABLE IF NOT EXISTS bot_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    max_positions INTEGER NOT NULL DEFAULT 5,
    position_size_usdt REAL NOT NULL DEFAULT 10,
    min_confidence REAL NOT NULL DEFAULT 5
  )`);

  // User inscriptions table - REMOVED: now in modules.binary (poolStore.js)

  // Inscription preferences table - REMOVED: now in modules.binary (poolStore.js)

  // Bot strategies table - REMOVED: now in modules.binary (poolStore.js)

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

  // Migration: add technical indicator columns to opportunities if missing
  const oppMigrations = [
    ['open_interest', 'REAL'], ['ema_50', 'REAL'], ['sma_20', 'REAL'],
    ['zone_type', 'TEXT'], ['zone_mid', 'REAL'], ['zone_strength', 'REAL'],
    ['zone_start', 'REAL'], ['zone_end', 'REAL'], ['rise_percent', 'REAL'],
    ['sma_50', 'REAL'], ['volume_surge', 'INTEGER'], ['volume_spike', 'INTEGER'],
    ['volume_high', 'INTEGER'], ['drop_percent', 'REAL'], ['rsi', 'REAL'],
    ['support_zone', 'TEXT'], ['resistance_zone', 'TEXT'], ['atr', 'REAL'],
    ['volume_ratio', 'REAL'], ['magnet_zone_mid', 'REAL'], ['magnet_zone_strength', 'INTEGER'],
    ['back_price', 'REAL'], ['through_back', 'INTEGER'], ['fast_move', 'INTEGER'],
    ['drop_pct', 'REAL'], ['rise_pct', 'REAL'], ['distance_pct', 'REAL'],
    ['distance_from_sma', 'REAL'], ['fib_levels', 'TEXT'], ['sma_ema', 'TEXT'],
    ['zona_actual', 'TEXT']
  ];
  for (const [col, sql] of oppMigrations) {
    try { db.run(`ALTER TABLE opportunities ADD COLUMN ${col} ${sql}`); } catch (_) {}
  }
  save();

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
    db.run("INSERT INTO bot_config (type, enabled, max_positions, position_size_usdt, min_confidence) VALUES ('spot', 1, 10, 10, 5)");
    save();
  }
  const futuresBot = db.exec("SELECT COUNT(*) as c FROM bot_config WHERE type = 'futures'");
  if (!futuresBot[0] || futuresBot[0].values[0][0] === 0) {
    db.run("INSERT INTO bot_config (type, enabled, max_positions, position_size_usdt, min_confidence) VALUES ('futures', 1, 10, 10, 5)");
    save();
  }

  db.run("UPDATE bot_config SET max_positions = 10 WHERE max_positions < 10");
  db.run("UPDATE bot_config SET min_confidence = 5 WHERE min_confidence > 5");
  save();

  logger.info('trading-store', `Trading DB initialized at ${DB_PATH}`);

  // Initialize poolStore (modules.binary) and migrate sensitive data if needed
  await poolStore.init();
  poolStore.migrateFromTradingDb(db);
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function insertOpportunity(op) {
  const stmt = db.prepare(`INSERT INTO opportunities
    (asset, strategy_type, price, entry_zone, target, stop_loss, score, confidence,
     ai_explanation, factors, risks, signals, horizonte, status, created_at, bot_type,
     rsi, open_interest, ema_50, sma_20, support_zone, resistance_zone, atr, volume_ratio,
     zone_type, zone_mid, zone_strength, zone_start, zone_end, rise_percent, sma_50,
     sma_ema, drop_pct, rise_pct, distance_pct, volume_spike, fib_levels, distance_from_sma,
     magnet_zone_mid, magnet_zone_strength, back_price, through_back, fast_move,
     volume_high, volume_surge, drop_percent, zona_actual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?, datetime('now'), ?,
     ?, ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?, ?, ?,
     ?, ?, ?, ?, ?,
     ?, ?, ?,
     ?)`);
  stmt.run([
    op.asset, op.strategyType, op.currentPrice, op.entryZone,
    op.target, op.stopLoss, op.score, op.confidence || 0,
    op.explanation || '', JSON.stringify(op.factors || []),
    JSON.stringify(op.risks || []), JSON.stringify(op.signals || {}), op.horizonte || 'horas', 'pending', op.botType || 'futures',
    op.rsi || null, op.open_interest || null, op.ema_50 || null, op.sma_20 || null,
    op.support_zone || null, op.resistance_zone || null, op.atr || null, op.volume_ratio || null,
    op.zone_type || null, op.zone_mid || null, op.zone_strength || null, op.zone_start || null, op.zone_end || null,
    op.rise_percent || null, op.sma_50 || null,
    op.sma_ema || null, op.drop_pct || null, op.rise_pct || null, op.distance_pct || null,
    op.volume_spike || null, op.fib_levels || null, op.distance_from_sma || null,
    op.magnet_zone_mid || null, op.magnet_zone_strength || null, op.back_price || null, op.through_back || null, op.fast_move || null,
    op.volume_high || null, op.volume_surge || null, op.drop_percent || null,
    op.zona_actual || null
  ]);
  stmt.free();
  save();
  const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  return id;
}

const OPP_COLS = 'id, asset, strategy_type, price, entry_zone, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, status, created_at, bot_type, rsi, open_interest, ema_50, sma_20, support_zone, resistance_zone, atr, volume_ratio, zone_type, zone_mid, zone_strength, zone_start, zone_end, rise_percent, sma_50, sma_ema, drop_pct, rise_pct, distance_pct, volume_spike, fib_levels, distance_from_sma, magnet_zone_mid, magnet_zone_strength, back_price, through_back, fast_move, volume_high, volume_surge, drop_percent, zona_actual';

function isValidOpportunity(obj) {
  try {
    const entryZone = obj.entry_zone || '';
    const esLong = String(obj.strategy_type || '').indexOf('long') >= 0 || String(obj.strategy_type || '').indexOf('buy') >= 0;
    const nums = String(entryZone).split('-').map(function(p) { return parseFloat(p.trim()) || 0; });
    let entry = null;
    if (nums.length === 2) {
      const low = Math.min(nums[0], nums[1]);
      const high = Math.max(nums[0], nums[1]);
      entry = esLong ? high : low;
    } else if (nums.length === 1) {
      entry = nums[0];
    }
    const target = parseFloat(obj.target);
    if (!entry || !target) return false;
    const margenPct = esLong
      ? ((target - entry) / entry) * 100
      : ((entry - target) / entry) * 100;
    return margenPct >= 1.2;
  } catch (e) {
    return false;
  }
}

function getOpportunities(limit = 50, offset = 0, since = null, botType = null) {
  let sql = "SELECT " + OPP_COLS + " FROM opportunities WHERE score >= 5 AND confidence >= 5";
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
    sql += " AND " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const results = db.exec(sql, params);
  if (!results.length || !results[0].values.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(function(row) {
    const obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    if (obj.created_at) obj.created_at = obj.created_at.replace(' ', 'T') + 'Z';
    if (obj.score !== undefined) obj.score = Math.round(Math.min(10, Math.max(0, obj.score)));
    if (obj.confidence !== undefined) obj.confidence = Math.round(Math.min(10, Math.max(0, obj.confidence)));
    return obj;
  });
}

function getOpportunitiesFreeTier(limit = 50, offset = 0) {
  const sinceDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  const sql = "SELECT " + OPP_COLS + " FROM opportunities WHERE created_at > ? AND score >= 5 AND score <= 6 AND confidence >= 5 AND confidence <= 6 ORDER BY created_at DESC LIMIT ? OFFSET ?";
  const results = db.exec(sql, [sinceDate, limit, offset]);
  if (!results.length || !results[0].values.length) return [];
  const cols = results[0].columns;
  return results[0].values.map(function(row) {
    const obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    if (obj.created_at) obj.created_at = obj.created_at.replace(' ', 'T') + 'Z';
    if (obj.score !== undefined) obj.score = Math.round(Math.min(10, Math.max(0, obj.score)));
    if (obj.confidence !== undefined) obj.confidence = Math.round(Math.min(10, Math.max(0, obj.confidence)));
    return obj;
  });
}

function getOpportunityById(id) {
  const results = db.exec("SELECT " + OPP_COLS + " FROM opportunities WHERE id = ?", [id]);
  if (!results.length || !results[0].values.length) return null;
  const cols = results[0].columns;
  const row = results[0].values[0];
  const obj = {};
  cols.forEach(function(c, i) { obj[c] = row[i]; });
  if (obj.created_at) obj.created_at = obj.created_at.replace(' ', 'T') + 'Z';
  return obj;
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

function deleteInvalidOpportunities() {
  const results = db.exec("SELECT id, strategy_type, entry_zone, target FROM opportunities");
  if (!results.length || !results[0].values.length) return 0;
  const cols = results[0].columns;
  let deleted = 0;
  results[0].values.forEach(function(row) {
    const obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    if (!isValidOpportunity(obj)) {
      db.run("DELETE FROM opportunities WHERE id = ?", [obj.id]);
      deleted++;
    }
  });
  if (deleted > 0) save();
  return deleted;
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
  // Ensure entry_price > 0: fallback chain: entryPrice -> currentPrice -> signal.currentPrice
  // If all are 0, throw error to prevent invalid position
  let entryPrice = pos.entryPrice;
  if (!entryPrice || entryPrice <= 0) {
    entryPrice = pos.currentPrice;
  }
  if (!entryPrice || entryPrice <= 0) {
    throw new Error('Invalid position: entryPrice and currentPrice are both 0 or invalid');
  }

  const initialCurrentPrice = (pos.currentPrice && pos.currentPrice > 0) ? pos.currentPrice : entryPrice;

  const stmt = db.prepare(`INSERT INTO positions
    (bot_type, strategy_type, asset, entry_price, current_price, quantity, order_id, target, stop_loss, score, confidence, ai_explanation, factors, risks, signals, horizonte, usd_amount, status, pnl, pnl_percent, inscription_id, address, opened_at, opportunity_id, level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, 0, ?, ?, ?, ?, ?)`);
  stmt.run([pos.botType, pos.strategyType, pos.asset, entryPrice, initialCurrentPrice,
    pos.quantity, pos.orderId || null, pos.target || null, pos.stopLoss || null,
    pos.score || 0, pos.confidence || 0, pos.explanation || '',
    JSON.stringify(pos.factors || []), JSON.stringify(pos.risks || []),
    JSON.stringify(pos.signals || {}), pos.horizonte || 'horas', pos.usdAmount || 0,
    pos.inscriptionId || null, pos.address || null, new Date().toISOString().replace('T', ' ').substring(0, 19), pos.opportunity_id || null, pos.level || null]);
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

function getPositions(botType = null, status = 'open', address = null, includeClosed = false) {
  let sql = "";
  const params = [];

  if (status === 'open' && includeClosed) {
    // Return both open and closed positions
    sql = "SELECT * FROM positions WHERE status IN ('open', 'closed')";
  } else {
    sql = "SELECT * FROM positions WHERE status = ?";
    params.push(status);
  }
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
  if (!currentPrice) return;

  // Check if entry_price is 0 and backfill with first real price
  const pos = getPositionById(id);
  if (pos && (!pos.entry_price || pos.entry_price === 0)) {
    db.run("UPDATE positions SET entry_price = ?, current_price = ? WHERE id = ?", [currentPrice, currentPrice, id]);
  } else if (currentPrice && pnl !== undefined) {
    // If quantity is 0, calculate from usd_amount / entry_price
    if (pos && (!pos.quantity || pos.quantity === 0) && pos.usd_amount && pos.entry_price > 0) {
      const calcQuantity = pos.usd_amount / pos.entry_price;
      db.run("UPDATE positions SET current_price = ?, pnl = ?, pnl_percent = ?, quantity = ? WHERE id = ?",
        [currentPrice, pnl.pnl, pnl.pnlPercent, calcQuantity, id]);
    } else {
      db.run("UPDATE positions SET current_price = ?, pnl = ?, pnl_percent = ? WHERE id = ?",
        [currentPrice, pnl.pnl, pnl.pnlPercent, id]);
    }
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

// === Functions moved to poolStore: user inscriptions, preferences, strategies, API keys ===
// Use poolStore.getBotApiKey, poolStore.getUserInscriptions, etc.

// Bot status/positions by inscription
function getPositionsByInscription(inscriptionId, status = 'open', includeClosed = false) {
  let sql;
  const params = [inscriptionId];
  if (includeClosed) {
    sql = "SELECT * FROM positions WHERE inscription_id = ? AND status IN ('open', 'closed')";
  } else {
    sql = "SELECT * FROM positions WHERE inscription_id = ? AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY opened_at DESC";
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(normalizePositionTimestamps(stmt.getAsObject()));
  stmt.free();
  return rows;
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
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 2);
  const cutoff = oneYearAgo.toISOString().split('T')[0];
  db.run('DELETE FROM trading_zones WHERE date < ?', [cutoff]);
  save();
}

async function close() { if (db) db.close(); }

module.exports = {
  init, insertOpportunity, getOpportunities, getOpportunitiesFreeTier, getOpportunityById,
  getStrategyConfigs, deleteOldOpportunities, deleteInvalidOpportunities, deleteOpportunity, cleanupOldPositions,
  insertPosition, getPositions, getPositionById, updatePositionPrice, closePosition, cancelPosition,
  getBotConfigs, getBotConfig, updateBotConfig, getBotStats, close,
  getPositionsByInscription,
  getTradingZones, getSmartZones, cleanOldZones,
  save
};
