# /recap

Batch-promotes insights from session logs into memory/ files. Applies frequency filtering
to ensure only recurring insights are promoted. Does NOT write to MEMORY.md — Critical
Behaviors are promoted exclusively via /learn.

## Session Log Discovery

Glob `07-logs/` for session logs; filter to files WITHOUT `recapped:` frontmatter field.
Process only those (faster than scanning all logs).

If no unrecapped logs found → tell user "ไม่มี session logs ที่ยังไม่ได้ recap" and stop.

## Run Threshold

Read `recap.min_sessions` from `vault.yml` (default: `6` if field absent).
Read `recap.min_frequency` from `vault.yml` (default: `2` if field absent).

**1 unrecapped log:**
→ warn: "มีแค่ 1 session log — promotion filter ต้องการอย่างน้อย {min_frequency} sessions ครับ"
→ stop (nothing can pass frequency filter with only 1 log)

**2 to (min_sessions - 1) unrecapped logs:**
→ warn: "มี {N}/{min_sessions} sessions — ยังไม่ถึง threshold แนะนำให้รอให้ครบก่อนครับ รัน recap ต่อเลยไหม?"
→ AskUserQuestion: `run-now / wait`
→ if `wait`: stop without processing

**≥ min_sessions unrecapped logs:**
→ proceed immediately, no confirmation needed

## Promotion Filter (always applied, regardless of log count)

After deciding to proceed, apply frequency filter to all extracted insights:
- Promote only insights whose topic appears in ≥ min_frequency of the session logs being processed
- Single-occurrence insights → skip; insight stays in session log (accessible later via /distill)

Example (min_frequency=2, 8 logs):
- Topic "recap"    → appears in logs 1, 3, 5, 7 → ✅ promote
- Topic "dreaming" → appears in log 2 only       → ⏭ skip
- Topic "worktree" → appears in logs 4, 6        → ✅ promote

## Conflict Handling

When insights conflict with existing memory files, scan ONLY files with `status: active`
or `status: needs-review` — skip deprecated files.

Collect ALL conflicts first, then resolve sequentially:

⚠️ พบ conflict 3 รายการ — จัดการทีละอัน

[1/3] 📝 insight จาก session 2026-04-15:
      "repo ย้ายไปที่ ~/projects/onebrain-v2"

      ขัดแย้งกับ memory/onebrain-development.md
      → update / supersede / separate / skip

Options:
- **update** → merge insight into existing file in-place, bump `verified`
- **supersede** → create new file; deprecate old; remove old row from INDEX.md;
  set `supersedes:` on new, `superseded_by:` on old
- **separate** → create new file, no changes to existing
- **skip** → discard this insight, move on

## Memory Consolidation

After resolving conflicts, scan for files with overlapping topics.
Build a topic frequency map from all active+needs-review files.
Scan only files whose topics appear in 2+ files — skip deprecated.

Resolve sequentially [1/N]:

🔀 พบไฟล์ที่มี topics ซ้ำกัน [1/2] — แนะนำให้รวม

memory/dev-workflow.md       (topics: dev, worktree)
memory/dev-worktree-setup.md (topics: dev, worktree, setup)

→ merge / skip

**merge:**
1. Read both files
2. Synthesize (do NOT concatenate) into one coherent document preserving all unique information
3. Name new file after shared topics (e.g. `dev-workflow-worktree.md`)
4. Frontmatter: keep highest `conf`; most recent `verified`; if either was `needs-review`
   → merged file inherits `needs-review` (caution wins)
5. Deprecate both old files + remove their rows from INDEX.md
6. Add new file to INDEX.md

**Contradiction during merge:** if files contain contradicting facts, do NOT auto-pick.
AskUserQuestion showing both versions: `keep version A / keep version B / cancel merge`

**skip** → leave both files as-is, move to next opportunity

## Order of Operations

1. Read `recap.min_sessions` and `recap.min_frequency` from `vault.yml` (apply defaults if absent)
2. Apply run threshold check (warn / stop / proceed per rules above)
3. Extract insights from all unrecapped session logs; apply promotion filter (`min_frequency`)
4. Collect and resolve all conflicts (sequential [1/N])
5. Run memory consolidation (sequential [1/N])
6. For EVERY processed session log (whether it produced insights or not):
   - Set `recapped: YYYY-MM-DD` in frontmatter
   - Extract 2–4 keywords from log content → set `topics: [...]` in frontmatter
7. `auto-saved: true` and `synthesized_from_checkpoints: true` logs processed same way
8. Update `vault.yml` `stats.last_recap: YYYY-MM-DD`

## Writing Promoted Insights

Each insight that passes the frequency filter:
- Write to `memory/kebab-case-topic.md` with frontmatter (source: /recap, status: active,
  conf: medium, verified: today, updated: today, created: today, topics: [...])
- Filename collision: if target exists, suffix with `-NN` automatically (no user prompt —
  batch mode)
- Add row to INDEX.md; update INDEX.md `updated:` and `total_active` counter

Do NOT write to MEMORY.md. Critical Behaviors are promoted exclusively via /learn.
