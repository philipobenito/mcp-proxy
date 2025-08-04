import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
    js.configs.recommended,
    {
        files: ['**/*.{js,mjs,cjs,ts}'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                process: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                NodeJS: 'readonly',
                require: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': typescript,
        },
        rules: {
            ...typescript.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single'],
            semi: ['error', 'always'],
        },
    },
    {
        files: ['**/*.js'],
        rules: {
            '@typescript-eslint/no-var-requires': 'off',
        },
    },
    {
        ignores: ['dist/**', 'node_modules/**', '*.config.js'],
    },
];
