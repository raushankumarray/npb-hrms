const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'npb_hrms.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema migrations
try {
  db.prepare("ALTER TABLE company_settings ADD COLUMN geofence_policy TEXT DEFAULT 'strict'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE employee_devices ADD COLUMN mac_address TEXT").run();
} catch (e) {}

module.exports = db;
