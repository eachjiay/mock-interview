import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import documentRoutes from './routes/documentRoutes.js';
import interviewRoutes from './routes/interviewRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import transcriptionRoutes from './routes/transcriptionRoutes.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadDir));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/documents', documentRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/transcriptions', transcriptionRoutes);
app.use('/api/interviews', interviewRoutes);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ error: error.message });
});

export default app;
