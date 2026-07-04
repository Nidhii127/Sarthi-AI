/**
 * env-loader.ts — Loaded by tsx --import before any other module.
 * Loads .env.local into process.env BEFORE lib/gemini.ts and lib/pinecone.ts
 * are imported, since those initialize clients at module-evaluation time.
 */
import { config as dotenvConfig } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig({ path: path.resolve(__dirname, "../.env.local") });
