# vault.yml Template — Reference

Used by onboarding Step 11. Write to vault root as `vault.yml`.

```yaml
method: onebrain
folders:
  inbox: 00-inbox
  import_inbox: 00-inbox/imports
  attachments: attachments
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs

checkpoint:
  messages: 15    # auto-checkpoint every N message exchanges
  minutes: 30     # auto-checkpoint every N minutes (whichever comes first)

stats:
  # Fields populate on first run of each skill — leave absent initially
  # last_recap: YYYY-MM-DD
  # last_doctor_run: YYYY-MM-DD
  # last_doctor_fix: YYYY-MM-DD
  # last_memory_review: YYYY-MM-DD

recap:
  min_sessions: 6
  min_frequency: 2

# Update channel (controls which GitHub branch /update pulls from)
# update_channel: stable    # stable | next | 1.x | 2.x — uncomment to change
```
