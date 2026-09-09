const fs = require('fs');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');
const dbDir = path.join(serverDir, 'data');
const dbFile = path.join(dbDir, 'npb_hrms.db');
const walFile = path.join(dbDir, 'npb_hrms.db-wal');
const shmFile = path.join(dbDir, 'npb_hrms.db-shm');

console.log('Clearing database files and cache from:', dbDir);

[dbFile, walFile, shmFile].forEach(file => {
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
      console.log(`Deleted: ${path.basename(file)}`);
    } catch (err) {
      console.warn(`Could not delete ${path.basename(file)}: ${err.message}`);
    }
  }
});

// Run clean seed
const { seedDatabase } = require('./seed');
seedDatabase();

console.log('Database successfully reset to clean default state with zero test data!');
