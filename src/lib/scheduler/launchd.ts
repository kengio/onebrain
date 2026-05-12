import { atToLaunchd, cronFieldsToLaunchd } from './cron-parse.js';
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

export function generatePlist(entry: ScheduleEntry, ctx: LaunchdContext): string {
  const labelSafe = entry.skill.replace(/^\//, '').replace(/[^a-zA-Z0-9-]/g, '-');
  const label = `com.onebrain.${labelSafe}`;

  let programArgumentsBlock: string;
  let calendarXml: string;

  if (entry.at !== undefined) {
    const calendar = atToLaunchd(entry.at);
    calendarXml = Object.entries(calendar)
      .map(([k, v]) => `        <key>${k}</key>\n        <integer>${v}</integer>`)
      .join('\n');

    const plistFilePath = plistPath(entry.skill, ctx.homedir);
    const argsFlags = entry.args
      ? ` ${Object.entries(entry.args)
          .map(([k, v]) => `--${k}="${v}"`)
          .join(' ')}`
      : '';
    // Double-quote interpolated values in the shell line so sh handles spaces correctly.
    // The entire assembled shell line is XML-escaped once for the plist <string>.
    const shellLine = xmlEscape(
      `"${ctx.skillCliPath}" --vault="${ctx.vaultPath}" --skill="${entry.skill}" --headless${argsFlags}; launchctl bootout gui/${ctx.uid}/${label}; rm -f "${plistFilePath}"`,
    );
    programArgumentsBlock = `        <string>/bin/sh</string>
        <string>-c</string>
        <string>${shellLine}</string>`;
  } else {
    const calendar = cronFieldsToLaunchd(entry.cron as string);
    calendarXml = Object.entries(calendar)
      .map(([k, v]) => `        <key>${k}</key>\n        <integer>${v}</integer>`)
      .join('\n');

    const argsBlock = entry.args
      ? `\n${Object.entries(entry.args)
          .map(([k, v]) => `        <string>--${k}=${xmlEscape(v)}</string>`)
          .join('\n')}`
      : '';

    programArgumentsBlock = `        <string>${xmlEscape(ctx.skillCliPath)}</string>
        <string>--vault</string>
        <string>${xmlEscape(ctx.vaultPath)}</string>
        <string>--skill</string>
        <string>${xmlEscape(entry.skill)}</string>
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

export function plistPath(skill: string, homedir: string): string {
  const labelSafe = skill.replace(/^\//, '').replace(/[^a-zA-Z0-9-]/g, '-');
  return `${homedir}/Library/LaunchAgents/com.onebrain.${labelSafe}.plist`;
}
