// VaultConfig — canonical type for vault.yml parsed config

export interface VaultFolders {
  inbox: string;
  projects: string;
  areas: string;
  knowledge: string;
  resources: string;
  agent: string;
  archive: string;
  logs: string;
  // Optional extras
  import_inbox?: string;
  attachments?: string;
}

export interface VaultCheckpoint {
  messages: number;
  minutes: number;
}

export interface VaultRuntime {
  harness: 'claude-code' | 'gemini' | 'direct';
}

export interface VaultSandbox {
  enabled: boolean;
}

export interface VaultStats {
  last_doctor_run?: string;
  last_update_run?: string;
  last_doctor_fix?: string;
  last_recap?: string;
}

export interface VaultRecap {
  min_sessions?: number;
  min_frequency?: number;
}

export interface VaultConfig {
  folders: VaultFolders;
  qmd_collection?: string;
  checkpoint?: VaultCheckpoint;
  runtime?: VaultRuntime;
  sandbox?: VaultSandbox;
  onebrain_version?: string;
  update_channel?: 'stable' | 'next';
  stats?: VaultStats;
  recap?: VaultRecap;
}

// Doctor check result returned by all validator functions

export interface DoctorResult {
  check: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  hint?: string;
}
