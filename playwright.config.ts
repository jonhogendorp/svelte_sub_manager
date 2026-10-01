import { defineConfig } from '@playwright/test';
import { E2E_DATABASE_URL } from './e2e/database';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		env: { DATABASE_URL: E2E_DATABASE_URL }
	},
	globalSetup: './e2e/global-setup.ts',
	testDir: 'e2e'
});
