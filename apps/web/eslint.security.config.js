import security from 'eslint-plugin-security';

export default [
  security.configs.recommended,
  {
    rules: {
      'security/detect-object-injection': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'playwright-report/', '*.spec.ts'],
  },
];
