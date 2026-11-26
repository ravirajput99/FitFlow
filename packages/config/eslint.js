// Shared flat ESLint config for all FitFlow packages.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Base rules for TypeScript packages (Node or browser). */
export const base = tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**', '**/*.config.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
);

/**
 * NestJS uses emitDecoratorMetadata: classes injected through constructors must be
 * imported as values, so type-only imports would break DI. Turn that rule off.
 */
export const nest = tseslint.config(...base, {
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});

/** React (Next.js / Expo) packages. */
export const react = tseslint.config(...base, {
  plugins: { 'react-hooks': reactHooks },
  rules: reactHooks.configs.recommended.rules,
});

export default base;
