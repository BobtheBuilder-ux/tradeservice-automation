import nextVitals from 'eslint-config-next/core-web-vitals';

const ignoredPaths = [
  '.next/**',
  'node_modules/**',
  'out/**',
  'next-env.d.ts',
];

const config = [
  ...nextVitals,
  {
    ignores: ignoredPaths,
  },
  {
    rules: {
      // Keep Phase 2 focused on making lint non-interactive and CI-ready.
      // Existing dashboard cleanup/refactors are planned for Phase 5.
      'import/no-anonymous-default-export': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
