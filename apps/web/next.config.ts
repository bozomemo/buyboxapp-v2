import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The customer installer ships a self-contained server rather than the monorepo's whole
  // `node_modules` (doc 14 §4.2). `.next/static` and `public` are not copied by standalone
  // itself — the packaging step does that (doc 14 §8 step 4).
  output: 'standalone',
  // packages/* are plain TS workspace packages, not pre-bundled for the browser — transpile
  // them through Next's own pipeline rather than requiring each to ship its own bundler config.
  transpilePackages: [
    '@buybox/core',
    '@buybox/shared',
    '@buybox/db',
    '@buybox/adapters',
    '@buybox/jobs',
    '@buybox/worker',
  ],
  // better-sqlite3 and the postgres/mysql drivers are native/Node-only — never bundle them for
  // the client, and let Next's server bundle require() them instead of trying to tree-shake.
  serverExternalPackages: ['better-sqlite3', 'pg', 'mysql2'],
};

export default nextConfig;
