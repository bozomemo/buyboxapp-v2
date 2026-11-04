export { checkForUpdate, MANIFEST_MAX_BYTES } from './check-for-update.js';
export type { CheckForUpdateDeps } from './check-for-update.js';
export { DEFAULT_MANIFEST_URL, resolveUpdateConfig } from './update-config.js';
export type { UpdateConfig } from './update-config.js';
export {
  UPDATE_CHECK_RESULTS,
  UPDATE_PHASES,
  UpdateRequestSchema,
  UpdateStateSchema,
  UpdateStatusSchema,
  readJsonFile,
  updatePaths,
  writeJsonFileAtomic,
} from './update-files.js';
export type { UpdateCheckResult, UpdateRequest, UpdateState, UpdateStatus } from './update-files.js';
