import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATA_DIR is overridable so tests run against a temp dir, never local_data/.
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'local_data');
export const PORT = parseInt(process.env.PORT, 10) || 3007;
// Loopback only: the API is unauthenticated, so it must not be reachable from the network.
export const HOST = process.env.HOST || '127.0.0.1';
