/**
 * Builds the Express app without listening, so tests can drive it directly.
 * The boot-order guarantees (egress allowlist first) live in index.js.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import serveStatic from 'serve-static';
import { securityHeaders } from './security/headers.js';
import { identity } from './http/identity.js';
import { HttpError } from './http/errors.js';
import apiRoutes from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDistPath = resolve(__dirname, '../../frontend/dist');

export function createApp() {
  const app = express();

  // Heroku's router is the one proxy in front of us; trusting exactly one hop
  // makes req.ip the real client, which the rate limits key on.
  app.set('trust proxy', 1);

  // No CORS middleware on purpose. This app is same-origin only; opening it up
  // would let another site drive the demo's API from a page we don't control.
  app.use(securityHeaders);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(serveStatic(frontendDistPath, { fallthrough: true, index: false }));

  app.use('/api', identity, apiRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' }));

  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(resolve(frontendDistPath, 'index.html'), (error) => {
      if (error) {
        res.status(404).send('Frontend not built. Run npm run build first.');
      }
    });
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code, details: error.details });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON.', code: 'BAD_REQUEST' });
    }
    console.error('Unhandled error:', error);
    res
      .status(error.status || 500)
      .json({ error: 'Something went wrong on our end.', code: 'INTERNAL' });
  });

  return app;
}
