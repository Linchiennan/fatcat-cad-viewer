import { resolve } from 'node:path';
import config from '../vite.config';
// Test-only alias. Not referenced by production configuration or deployment.
export default {
 ...config,
 resolve: { ...config.resolve, alias: [{ find: './firebaseBackend', replacement: resolve('tests/mockBackend.ts') }, ...config.resolve!.alias as []] },
 build: { ...config.build, outDir: 'dist-mock' },
};
