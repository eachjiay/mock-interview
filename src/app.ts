import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import documentRoutes from './routes/documentRoutes.js';
import interviewRoutes from './routes/interviewRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import transcriptionRoutes from './routes/transcriptionRoutes.js';
import { createRateLimiter } from './middleware/security.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
if (config.nodeEnv !== 'production') {
  app.use(cors());
} else if (config.corsOrigins.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin is not allowed.'));
    }
  }));
}
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/uploads/question-media', express.static(config.questionMediaDir, {
  dotfiles: 'deny',
  fallthrough: false,
  index: false,
  maxAge: config.nodeEnv === 'production' ? '1h' : 0
}));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/api', createRateLimiter({
  label: 'api',
  max: config.apiRateLimitMax
}));

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
