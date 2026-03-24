import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sessionsRouter from './routes/sessions.js';
import launchRouter from './routes/launch.js';
import browseRouter from './routes/browse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3899;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', launchRouter);
app.use('/api/browse', browseRouter);

// Serve static client build in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Claude Code Manager server running at http://localhost:${PORT}`);
});
