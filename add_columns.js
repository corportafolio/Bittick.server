const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync('data/trading.db');
  const db = new SQL.Database(buf);
  const cols = [
    'zone_mid REAL',
    'zone_strength INTEGER',
    'zone_start REAL',
    'zone_end REAL',
    'rise_percent REAL',
    'sma_50 REAL',
    'sma_ema TEXT',
    'distance_pct REAL',
    'fib_levels TEXT',
    'drop_pct REAL',
    'rise_pct REAL',
    'distance_from_sma REAL',
    'volume_spike INTEGER',
    'volume_high INTEGER',
    'volume_surge INTEGER',
    'drop_percent REAL',
    'magnet_zone_mid REAL',
    'magnet_zone_strength INTEGER',
    'back_price REAL',
    'through_back INTEGER',
    'fast_move INTEGER',
    'volume_high INTEGER',
    'volume_surge INTEGER',
    'drop_percent REAL'
  ];
  for (const col of cols) {
    const colName = col.split(' ')[0];
    try {
      db.run('ALTER TABLE opportunities ADD COLUMN ' + col);
      console.log('Added:', colName);
    } catch(e) {
      console.log('Skip:', colName, e.message);
    }
  }
  fs.writeFileSync('data/trading.db', Buffer.from(db.export()));
  console.log('Done');
});
