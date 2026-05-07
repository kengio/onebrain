// @onebrain/core — VaultConfig types + validators

export type {
  VaultConfig,
  VaultFolders,
  VaultCheckpoint,
  VaultStats,
  VaultRecap,
  DoctorResult,
} from './types.js';

export { loadVaultConfig, DEFAULT_CHECKPOINT, VAULT_YML_NOT_FOUND_PREFIX } from './parser.js';

export {
  checkVaultYml,
  checkFolders,
  checkQmdEmbeddings,
  checkOrphanCheckpoints,
  checkPluginFiles,
  checkVaultYmlKeys,
  checkSettingsHooks,
  checkClaudeSettings,
} from './validator.js';

export { atomicWrite } from './fs-atomic.js';

export { mkdirIdempotent } from './fs-mkdir-safe.js';
