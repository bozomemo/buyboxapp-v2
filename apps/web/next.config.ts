import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
