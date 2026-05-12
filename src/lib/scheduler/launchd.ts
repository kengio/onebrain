import { atToLaunchd, cronFieldsToLaunchd } from './cron-parse.js';
import { isCommandMode, isOneShot } from './entry.js';
import type { ScheduleEntry } from './types.js';

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface LaunchdContext {
  vaultPath: string;
  skillCliPath: string;
  logBasePath: string;
  homedir: string;
  uid: number;
}

export function labelForEntry(entry: ScheduleEntry): string {
  const raw = isCommandMode(entry) ? entry.command : (entry.skill ?? '').replace(/^\//, '');
  return raw.replace(/[^a-zA-Z0-9-]/g, '-');
}

export function generatePlist(entry: ScheduleEntry, ctx: LaunchdContext): string {
  const labelSafe = labelForEntry(entry);
  const label = `com.onebrain.${labelSafe}`;

  const calendar = isOneShot(entry)
    ? atToLaunchd(entry.at)
    : cronFieldsToLaunchd(entry.cron as string);
  const calendarXml = Object.entries(calendar)
    .map(([k, v]) => `        <key>${k}</key>\n        <integer>${v}</integer>`)
    .join('\n');

  let programArgumentsBlock: string;

  if (isOneShot(entry)) {
    if (isCommandMode(entry)) {
      // Args pre-validated by sanitizeArgsForOneShot in register-schedule.ts before reaching here.
      const argv = (entry.args as string[] | undefined) ?? [];
      const quotedArgs = argv.map((a) => `"${a}"`).join(' ');
      const innerCommand = `"${entry.command}"${quotedArgs ? ` ${quotedArgs}` : ''}`;
      const plistFilePath = `${ctx.homedir}/Library/LaunchAgents/${label}.plist`;
      const shellLine = xmlEscape(
        `${innerCommand}; launchctl bootout gui/${ctx.uid}/${label}; rm -f "${plistFilePath}"`,
      );
      programArgumentsBlock = `        <string>/bin/sh</string>
        <string>-c</string>
        <string>${shellLine}</string>`;
    } else {
      // Skill mode one-shot — PR #172 form preserved VERBATIM
      const plistFilePath = plistPath(entry.skill ?? '', ctx.homedir);
      const argsFlags = entry.args
        ? ` ${Object.entries(entry.args as Record<string, string>)
            .map(([k, v]) => `--${k}="${v}"`)
            .join(' ')}`
        : '';
      const shellLine = xmlEscape(
        `"${ctx.skillCliPath}" --vault="${ctx.vaultPath}" --skill="${entry.skill}" --headless${argsFlags}; launchctl bootout gui/${ctx.uid}/${label}; rm -f "${plistFilePath}"`,
      );
      programArgumentsBlock = `        <string>/bin/sh</string>
        <string>-c</string>
        <string>${shellLine}</string>`;
    }
  } else if (isCommandMode(entry)) {
    // Recurring command mode — hook-style argv array
    const argv = (entry.args as string[] | undefined) ?? [];
    programArgumentsBlock = [
      `        <string>${xmlEscape(entry.command)}</string>`,
      ...argv.map((a) => `        <string>${xmlEscape(a)}</string>`),
    ].join('\n');
  } else {
    // Recurring skill mode — PR #172 form preserved VERBATIM
    const argsBlock = entry.args
      ? `\n${Object.entries(entry.args as Record<string, string>)
          .map(([k, v]) => `        <string>--${xmlEscape(k)}=${xmlEscape(v)}</string>`)
          .join('\n')}`
      : '';

    programArgumentsBlock = `        <string>${xmlEscape(ctx.skillCliPath)}</string>
        <string>--vault</string>
        <string>${xmlEscape(ctx.vaultPath)}</string>
        <string>--skill</string>
        <string>${xmlEscape(entry.skill ?? '')}</string>
        <string>--headless</string>${argsBlock}`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${xmlEscape(label)}</string>
    <key>ProgramArguments</key>
    <array>
${programArgumentsBlock}
    </array>
    <key>StartCalendarInterval</key>
    <dict>
${calendarXml}
    </dict>
    <key>StandardOutPath</key>
    <string>${xmlEscape(ctx.logBasePath)}/onebrain-${labelSafe}.stdout</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(ctx.logBasePath)}/onebrain-${labelSafe}.stderr</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>`;
}

export function plistPath(skillOrLabel: string, homedir: string): string {
  const labelSafe = skillOrLabel.startsWith('/')
    ? skillOrLabel.replace(/^\//, '').replace(/[^a-zA-Z0-9-]/g, '-')
    : skillOrLabel.replace(/[^a-zA-Z0-9-]/g, '-');
  return `${homedir}/Library/LaunchAgents/com.onebrain.${labelSafe}.plist`;
}
