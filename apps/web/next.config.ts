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
  // `data/` is a developer's local SQLite database and secret store, created by running the app
  // from a checkout. It is gitignored, so nothing in review ever shows it — and on 2026-08-24 a
  // 4.8 MB development database reached a customer's machine as
  // `Program Files\BuyBox\app\data\app.db` because the standalone output had copied it
  // (doc 14 §8.5). Nothing in the built app reads it; say so here so it is never traced.
  //
  // This is the first of two defences and the weaker one: it depends on tracing honouring the
  // exclusion. `installer/build-package.ps1` purges developer state from the assembled package
  // and then refuses to compile if any survived, which does not.
  outputFileTracingExcludes: {
    '/*': ['data/**/*'],
  },
};

export default nextConfig;
