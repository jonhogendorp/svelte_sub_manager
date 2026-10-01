import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { E2E_DATABASE_FILE, E2E_DATABASE_URL } from './database';

/** Recreates the e2e database from the migrations so every run starts from a known empty state. */
export default function globalSetup() {
	// Never delete anything but the dedicated e2e database.
	if (basename(E2E_DATABASE_FILE) !== 'e2e.db') {
		throw new Error(`Refusing to reset unexpected database file: ${E2E_DATABASE_FILE}`);
	}
	for (const suffix of ['', '-journal', '-wal', '-shm']) {
		rmSync(`${E2E_DATABASE_FILE}${suffix}`, { force: true });
	}

	execSync('npx prisma migrate deploy', {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL }
	});
}
