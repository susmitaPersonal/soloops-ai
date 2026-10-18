import reactHooks from 'eslint-plugin-react-hooks';
import { soloopsConfig } from '@soloops/config/eslint';

export default [
  ...soloopsConfig(),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
];
