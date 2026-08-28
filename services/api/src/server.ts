import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config } from './config.js';
import { checkDatabase } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { filesRouter } from './routes/files.js';
import { foldersRouter } from './routes/folders.js';
import { publicSharesRouter } from './routes/publicShares.js';
import { sharedWithMeRouter } from './routes/sharedWithMe.js';
import { sharesRouter } from './routes/shares.js';
import { uploadsRouter } from './routes/uploads.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'as-storagebox-api' }));

// Capability-link endpoints are public by design and perform their own token and
// resource authorization before exposing metadata or a short-lived download URL.
app.use('/api/v1/public/shares', publicSharesRouter);

// All remaining v1 routes require authenticated identity first; each router then
// performs resource-level authorization independently.
app.use('/api/v1', requireAuth);
app.use('/api/v1/folders', foldersRouter);
app.use('/api/v1/files', filesRouter);
app.use('/api/v1/uploads', uploadsRouter);
app.use('/api/v1/shares', sharesRouter);
app.use('/api/v1/shared-with-me', sharedWithMeRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ error: 'VALIDATION_ERROR', issues: error.issues });
  console.error(error);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
});
await checkDatabase();
app.listen(config.PORT, () => console.log(`AS-StorageBox API listening on :${config.PORT}`));
