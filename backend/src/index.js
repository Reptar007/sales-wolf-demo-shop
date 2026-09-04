/**
 * WolfMart demo shop — server entry.
 *
 * Boot order is load-bearing: the egress allowlist is installed as the very
 * first thing this process does, before dotenv, before Express, before any
 * import that could open a socket. `assertEgressAllowlistInstalled()` below
 * refuses to serve traffic if that ever stops being true.
 */

import { installEgressAllowlist, assertEgressAllowlistInstalled } from './security/egress.js';

installEgressAllowlist();

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import serveStatic from 'serve-static';
import { securityHeaders } from './security/headers.js';
import apiRoutes from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = process.env.PORT || 7072;
const app = express();

// No CORS middleware on purpose. This app is same-origin only; opening it up
// would let another site drive the demo's API from a page we don't control.
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

const frontendDistPath = resolve(__dirname, '../../frontend/dist');
app.use(serveStatic(frontendDistPath, { fallthrough: true, index: false }));

app.use('/api', apiRoutes);

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(resolve(frontendDistPath, 'index.html'), (error) => {
    if (error) {
      res.status(404).send('Frontend not built. Run npm run build first.');
    }
  });
});

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(error.status || 500).json({ error: 'Internal server error' });
});

assertEgressAllowlistInstalled();

app.listen(PORT, () => {
  console.log(`WolfMart demo shop listening on port ${PORT}`);
});
