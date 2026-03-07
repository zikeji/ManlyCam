import js from '@eslint/js';
import { fileURLToPath } from 'url';
import path from 'path';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  // Ignore generated/non-source directories
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      'pnpm-lock.yaml',
    ],
  },

  // Base JS recommended rules (native flat config)
  js.configs.recommended,

  // All source files: globals + prettier
  {
    files: ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      camelcase: 0,
      'no-param-reassign': [2, { props: false }],
      'no-unused-vars': 0,
      'no-use-before-define': 0,
      'no-shadow': 0,
    },
  },

  // TypeScript files: @typescript-eslint parser + recommended rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-namespace': 0,
      '@typescript-eslint/no-shadow': 2,
      '@typescript-eslint/no-redundant-type-constituents': 0,
      '@typescript-eslint/no-unsafe-declaration-merging': 0,
      '@typescript-eslint/no-unsafe-assignment': 0,
      '@typescript-eslint/no-unsafe-return': 0,
      '@typescript-eslint/no-unsafe-enum-comparison': 0,
      '@typescript-eslint/no-unsafe-argument': 0,
      '@typescript-eslint/no-unsafe-member-access': 0,
      '@typescript-eslint/no-unsafe-call': 0,
      '@typescript-eslint/restrict-template-expressions': 0,
      '@typescript-eslint/no-unnecessary-type-assertion': 0,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-use-before-define': [2, { ignoreTypeReferences: true }],
    },
  },

  // Server: type-aware linting with server tsconfig
  {
    files: ['apps/server/**/*.ts', 'apps/server/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: path.resolve(__dirname, 'apps/server/tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Web: type-aware linting with web tsconfig
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: path.resolve(__dirname, 'apps/web/tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Types package: type-aware linting
  {
    files: ['packages/types/**/*.ts', 'packages/types/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: path.resolve(__dirname, 'packages/types/tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
  },
];
