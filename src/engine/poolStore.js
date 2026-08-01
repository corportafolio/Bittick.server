const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const logger = require('../logger/logger');

const DB_PATH = path.join(__dirname, '../../data/modules.binary');
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

  try {
    db.run("ALTER TABLE inscription_preferences ADD COLUMN spot_budget REAL NOT NULL DEFAULT 100");
    db.run("ALTER TABLE inscription_preferences ADD COLUMN futures_budget REAL NOT NULL DEFAULT 200");
    db.run("ALTER TABLE inscription_preferences ADD COLUMN language TEXT NOT NULL DEFAULT 'es'");
  } catch (_) {}

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

  try {
    const cols = db.exec("PRAGMA table_info(bot_strategies)");
    const hasMinScore = cols[0]?.values?.some(r => r[1] === 'min_score');
    if (!hasMinScore) {
      db.run("ALTER TABLE bot_strategies ADD COLUMN min_score INTEGER NOT NULL DEFAULT 6");
      db.run("UPDATE bot_strategies SET min_score = level WHERE min_score = 6");
    }
  } catch (_) {}

  save();
  logger.info('pool-store', `Secret DB initialized at ${DB_PATH}`);
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function migrateFromTradingDb(tradingDb) {
  if (!tradingDb) return;
  let migrated = 0;
  const tables = ['bot_api_keys', 'user_inscriptions', 'inscription_preferences', 'bot_strategies'];
  for (const table of tables) {
    try {
      const countResult = tradingDb.exec(`SELECT COUNT(*) FROM ${table}`);
      const count = countResult[0]?.values?.[0]?.[0] || 0;
      if (count > 0) {
        const rows = tradingDb.exec(`SELECT * FROM ${table}`);
        if (rows[0]) {
          const cols = rows[0].columns;
          const placeholders = cols.map(() => '?').join(',');
          const stmt = db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
          for (const row of rows[0].values) {
            stmt.run(row);
          }
          stmt.free();
          migrated += count;
        }
      }
    } catch (_) {}
  }
  if (migrated > 0) {
    save();
    logger.info('pool-store', `Migrated ${migrated} rows from trading.db to modules.binary`);
  }
}

// === Bot API Keys ===
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

// === User Inscriptions ===
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

function getActiveInscriptions() {
  const stmt = db.prepare("SELECT inscription_id, bot_num, address FROM user_inscriptions WHERE selected = 1");
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function setUserInscriptions(address, inscriptions) {
  deleteUserInscriptions(address);
  for (const ins of inscriptions) {
    insertUserInscription(address, ins.num, ins.inscriptionId, ins.tier, ins.botImageUrl || '');
  }
}

function selectInscription(address, inscriptionId) {
  setSelectedInscription(address, inscriptionId);
}

function setVerifiedOwner(address, botNum, inscriptionId) {
  db.run(`INSERT OR REPLACE INTO user_inscriptions
    (address, bot_num, inscription_id, tier, bot_image_url, selected, verified_at)
    SELECT ?, ?, ?, tier, bot_image_url, 1, datetime('now')
    FROM user_inscriptions WHERE inscription_id = ? AND address = ?`, [
    address.toLowerCase(), botNum, inscriptionId, inscriptionId, address.toLowerCase()
  ]);
  save();
}

// === Inscription Preferences ===
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
     spot_max_positions, futures_max_positions, spot_min_score, futures_min_score,
     spot_budget, futures_budget, language, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`);
  stmt.run([
    inscriptionId, address.toLowerCase(),
    prefs.spot_enabled ?? 1, prefs.futures_enabled ?? 1,
    prefs.spot_position_size ?? 10.0, prefs.futures_position_size ?? 10.0,
    prefs.spot_max_positions ?? 5, prefs.futures_max_positions ?? 5,
    prefs.spot_min_score ?? 6, prefs.futures_min_score ?? 7,
    prefs.spot_budget ?? 100, prefs.futures_budget ?? 200,
    prefs.language ?? 'es'
  ]);
  stmt.free();
  save();
}

function deleteInscriptionPreferences(inscriptionId) {
  db.run("DELETE FROM inscription_preferences WHERE inscription_id = ?", [inscriptionId]);
  save();
}

function updateInscriptionBudget(inscriptionId, mode, budget) {
  const field = mode === 'spot' ? 'spot_budget' : 'futures_budget';
  db.run(`UPDATE inscription_preferences SET ${field} = ?, updated_at = datetime('now') WHERE inscription_id = ?`, [budget, inscriptionId]);
  save();
}

// === Bot Strategies (per-level) ===
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

async function close() { if (db) db.close(); }

module.exports = {
  init, save, migrateFromTradingDb, close,
  getBotApiKey, saveBotApiKey, deleteBotApiKey,
  insertUserInscription, getUserInscriptions, setSelectedInscription, getSelectedInscription,
  deleteUserInscriptions, setUserInscriptions, selectInscription, setVerifiedOwner, getActiveInscriptions,
  getInscriptionPreferences, upsertInscriptionPreferences, deleteInscriptionPreferences, updateInscriptionBudget,
  getBotStrategiesByLevel, getBotStrategyByLevel, saveBotStrategyByLevel, saveBotStrategiesByLevel, deleteBotStrategiesByLevel
};
