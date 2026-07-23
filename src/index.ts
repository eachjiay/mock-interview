import app from './app.js';
import { config } from './config.js';
import { initDB, recoverInterruptedWork } from './db/database.js';
import { queueBatchQuestionMediaGeneration } from './services/questionMediaService.js';
import { ensureDir } from './utils/fs.js';

async function start() {
  await ensureDir(config.uploadDir);
  await initDB();
  await recoverInterruptedWork();
  app.listen(config.port, () => {
    console.log(`mock-interview-backend listening on ${config.port}`);
    if (config.questionMediaAutoGenerateAll) {
      void queueBatchQuestionMediaGeneration()
        .then((result) => {
          console.log(`question media auto-generation: ${result.status}, queued=${result.queuedCount}`);
        })
        .catch((error) => {
          console.error('Failed to auto-resume question media generation:', error);
        });
    }
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
