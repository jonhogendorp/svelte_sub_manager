import { resolve } from 'node:path';

/**
 * The e2e suite runs against its own SQLite file so it never reads or writes the
 * development database.
 *
 * The path is absolute on purpose: a built app resolves a relative `file:` URL
 * against its own bundle directory, while `prisma migrate` resolves it against
 * `prisma/`, so a relative URL would point the two at different files.
 * Playwright runs from the project root.
 */
export const E2E_DATABASE_FILE = resolve(process.cwd(), 'prisma', 'e2e.db');
export const E2E_DATABASE_URL = `file:${E2E_DATABASE_FILE.replaceAll('\\', '/')}`;
