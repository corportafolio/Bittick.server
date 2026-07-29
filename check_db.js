const initSqlJs = require("sql.js");
const fs = require("fs");
initSqlJs().then(SQL => {
  const buf = fs.readFileSync("data/trading.db");
  const db = new SQL.Database(buf);
  const r = db.exec("PRAGMA table_info(opportunities)");
  console.log("Total columns:", r[0]?.values?.length);
  r[0]?.values?.forEach(c => console.log(c[0], c[1]));
});
