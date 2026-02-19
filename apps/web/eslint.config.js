import vueConfig from '@bunker46/eslint-config/vue';

export default [
  ...vueConfig,
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', 'playwright-report/'],
  },
];
