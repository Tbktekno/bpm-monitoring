import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    env: {
      JWT_SECRET: 'bpm-monitoring-dev-jwt-secret-key-that-is-at-least-sixty-four-characters-long-for-hs256',
      JWT_ISSUER: 'bpm-monitoring',
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/grpc/**',
        'src/socket/**',
        'node_modules',
        'dist',
      ],
    },
  },
});
