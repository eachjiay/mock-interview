import app from './app.js';
import { config } from './config.js';
import { initDB } from './db/database.js';
import { ensureDir } from './utils/fs.js';

async function start() {
  await ensureDir(config.uploadDir);
  await initDB();
  app.listen(config.port, () => {
    console.log(`mock-interview-backend listening on ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
