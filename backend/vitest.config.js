import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.js'],
    setupFiles: ['./test/setup-env.js'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
