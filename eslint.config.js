// eslint.config.js
// ESLint v9/v10 Flat Config — TypeScript + Prettier
//
// Rule philosophy:
//   - Catch real bugs, bukan style wars
//   - Prettier menangani semua formatting — ESLint TIDAK duplikasi format rules
//   - TypeScript strict di tsconfig; ESLint hanya tambahkan runtime safety rules

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ─── Global ignores ────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'bun.lock',
      '*.config.js',   // eslint config itself
    ],
  },

  // ─── TypeScript: source ─────────────────────────────────────────────────────
  {
    files: [
      'src/**/*.ts',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // ── TypeScript safety rules ─────────────────────────────────────────

      // Larang any eksplisit — gunakan unknown + type guard
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars (prefix _ = boleh diabaikan)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Selalu gunakan `import type` untuk import tipe saja
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // Jangan biarkan Promise mengambang tanpa await/catch
      '@typescript-eslint/no-floating-promises': 'error',

      // Jangan await non-Thenable
      '@typescript-eslint/await-thenable': 'error',

      // Larang non-null assertion `!` — bisa runtime crash
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // ── General JS rules ────────────────────────────────────────────────

      // Gunakan logger, bukan console.log di production code
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // Tidak ada var
      'no-var': 'error',
      'prefer-const': 'error',

      // Tidak ada debugger statement
      'no-debugger': 'error',

      // Tidak ada duplicate imports
      'no-duplicate-imports': 'error',

      // Selalu === bukan ==
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ─── TypeScript: database & scripts CLI tools (output terminal) ─────────────
  {
    files: [
      'database/**/*.ts',
      'scripts/**/*.ts',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // ─── TypeScript: test files (lebih longgar) ──────────────────────────────
  {
    files: [
      'tests/**/*.ts',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Test boleh any untuk mock/stub
      '@typescript-eslint/no-explicit-any': 'off',
      // Test boleh non-null assertion untuk assertion yang sudah pasti ada
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test boleh console untuk debug sementara
      'no-console': 'off',
      // Unused tetap diperiksa
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Type imports tetap konsisten
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-debugger': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ─── Prettier — HARUS paling terakhir untuk override semua format rules ────
  prettierConfig,
];
