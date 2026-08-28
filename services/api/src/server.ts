import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { checkDatabase } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { filesRouter } from './routes/files.js';
import { foldersRouter } from './routes/folders.js';
import { sharesRouter } from './routes/shares.js';
import { uploadsRouter } from './routes/uploads.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'as-storagebox-api' }));

// Every v1 route below this point requires an authenticated identity. Individual
// routers remain responsible for resource-level authorization.
app.use('/api/v1', requireAuth);
app.use('/api/v1/folders', foldersRouter);
app.use('/api/v1/files', filesRouter);
app.use('/api/v1/uploads', uploadsRouter);
app.use('/api/v1/shares', sharesRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: error.issues });
  console.error(error);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// Refuse to accept traffic when the database is unavailable at startup.
await checkDatabase();
app.listen(config.PORT, () => console.log(`AS-StorageBox API listening on :${config.PORT}`));
