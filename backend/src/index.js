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

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ quiet: true });

// Imported after dotenv so modules that read config at load see it.
const { createApp } = await import('./app.js');
const { attachChat } = await import('./chat/socket.js');

const PORT = process.env.PORT || 7072;
const app = createApp();

assertEgressAllowlistInstalled();

const server = app.listen(PORT, () => {
  console.log(`WolfMart demo shop listening on port ${PORT}`);
});

// Live chat shares the HTTP server (same origin, same port). See chat/socket.js.
attachChat(server);

export default server;
