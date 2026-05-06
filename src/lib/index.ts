// @onebrain/core — VaultConfig types + validators

export type {
  VaultConfig,
  VaultFolders,
  VaultCheckpoint,
  VaultStats,
  VaultRecap,
  DoctorResult,
} from './types.js';

export { loadVaultConfig } from './parser.js';

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
