import nodeConfig from './packages/eslint-config/node.js';
import vueConfig from './packages/eslint-config/vue.js';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/build/**',
      '**/.output/**',
      '**/playwright-report/**',
      '**/.turbo/**',
      '**/prisma/migrations/**',
    ],
  },
  ...nodeConfig
    .filter((c) => !c.ignores)
    .map((c) => ({ ...c, files: ['apps/server/**/*.ts', 'packages/**/*.ts'] })),
  ...vueConfig
    .filter((c) => !c.ignores)
    .map((c) => ({ ...c, files: ['apps/web/**/*.ts', 'apps/web/**/*.vue'] })),
];
