import nodeConfig from '@bunker46/eslint-config/node';

export default [
  ...nodeConfig,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'prisma/'],
  },
];
