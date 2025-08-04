import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'dist/', 'tests/', '**/*.config.{js,ts}', '**/*.d.ts'],
        },
        include: ['tests/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules/', 'dist/'],
    },
    resolve: {
        alias: {
            '@': new URL('./src', import.meta.url).pathname,
        },
    },
});
