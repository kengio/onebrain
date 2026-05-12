export interface ScheduleEntry {
  cron?: string; // recurring — exactly-one-of with `at`
  at?: string; // one-shot — exactly-one-of with `cron`

  // Entry mode — exactly-one-of:
  skill?: string; // OneBrain skill (e.g. /daily)
  command?: string; // CLI binary name (e.g. "onebrain", "/bin/sh", "rsync")

  // Args interpretation depends on mode:
  // - With `skill`:   Record<string, string> → emitted as --key=value flags
  // - With `command`: string[]                → emitted as positional argv (hook style)
  args?: Record<string, string> | string[];
}

export interface ScheduleConfig {
  schedule?: ScheduleEntry[];
}

export interface SkillFrontmatter {
  name: string;
  schedulable?: boolean;
  schedulable_with_args?: boolean;
  required_args?: string[];
}
