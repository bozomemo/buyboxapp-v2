/**
 * Authentication building blocks (docs/18-authentication-and-access.md). Pure computation over
 * `node:crypto`: no database, no cookies, no clock — those belong to `packages/db` and
 * `apps/web/src/lib/server/auth`, which call into this.
 */
export * from './constants.js';
export * from './permissions.js';
export * from './actor.js';
export * from './password.js';
export { isCommonPassword } from './common-passwords.js';
export * from './totp.js';
export * from './tokens.js';
export * from './identity.js';
export * from './session.js';
export * from './env.js';
