/**
 * run.ts — CLI Entry Point
 * Usage: npx ts-node run.ts ./requirements.pdf https://app-url.com
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { runOrchestrator } from './src/orchestrator';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: npx ts-node run.ts <path/to/requirements.pdf> <https://app-url.com>');
  console.error('Example: npx ts-node run.ts ./sample.pdf https://example.com');
  process.exit(1);
}

const [pdfPath, appUrl] = args;

// Validate URL format
try {
  new URL(appUrl);
} catch {
  console.error(`Invalid URL: "${appUrl}". Please provide a valid URL including the protocol (https://...).`);
  process.exit(1);
}

runOrchestrator(pdfPath, appUrl).catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
