/**
 * ESLint flat config (v9+) for City Simulator Desktop.
 * Covers both the Electron main process (CJS/Node) and
 * the renderer (ESM/React) source trees.
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
    // ── Shared defaults ─────────────────────────────────
    js.configs.recommended,

    // ── Ignore build outputs / deps ─────────────────────
    {
        ignores: [
            'renderer/dist/**',
            '**/node_modules/**',
            '**/__pycache__/**',
            'build/**',
        ],
    },

    // ── Electron main process (CJS + Node) ──────────────
    {
        files: ['electron/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    },

    // ── Renderer (ESM + Browser + React JSX) ────────────
    {
        files: ['renderer/src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                __APP_VERSION__: 'readonly',
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
        },
    },

    // ── Test files (ESM + vitest globals) ───────────────
    {
        files: ['renderer/src/__tests__/**/*.{js,jsx}'],
        languageOptions: {
            globals: {
                ...globals.node,
                vi: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
    },
];
