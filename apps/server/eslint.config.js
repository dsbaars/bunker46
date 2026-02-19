import nodeConfig from '@bunker46/eslint-config/node';

export default [
  ...nodeConfig,
  {
    // NestJS uses decorator metadata for dependency injection at runtime.
    // consistent-type-imports converts injected class imports to `import type`,
    // which strips the class reference at runtime and breaks the DI container.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'prisma/'],
  },
];
