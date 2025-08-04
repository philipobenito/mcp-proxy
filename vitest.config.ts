import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'test/',
                '**/*.config.{js,ts}',
                '**/*.d.ts',
                'docs/',
            ],
            thresholds: {
                functions: 80,
                lines: 80,
                statements: 80,
                branches: 70,
            },
        },
        include: ['test/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules/', 'dist/', 'docs/'],
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': new URL('./src', import.meta.url).pathname,
        },
    },
});
