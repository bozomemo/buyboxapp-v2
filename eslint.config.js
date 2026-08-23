// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // installer/staging and installer/out are build outputs (installer/README-build.md) --
    // generated Next server code and a packed installer, neither of them ours to lint.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'reference/**',
      '**/.next/**',
      'installer/staging/**',
      'installer/out/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Plain Node scripts, run directly by `npm run` rather than compiled. They get no
    // `@types/node` lib the way the TypeScript packages do, so the Node globals they use are
    // declared here instead of being reported as undefined.
    files: ['scripts/**/*.mjs', 'installer/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    // CLAUDE.md: "no `any` in packages/core" — the domain core is pure and fully typed.
    files: ['packages/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  eslintConfigPrettier,
);
