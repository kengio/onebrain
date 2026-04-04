# Design: /import Office File Support + markitdown

**Date:** 2026-04-04
**Status:** Approved
**Scope:** `skills/import/SKILL.md`

---

## Problem

The `/import` skill currently has limited Office file support:
- Word (.docx) and PowerPoint (.pptx): extracted via `pandoc`, which users must install manually
- Excel (.xlsx/.xls): fully stubbed — no content extraction at all
- No automatic dependency installation — users see a stub note with "install pandoc" instructions

## Goals

1. Replace pandoc with `markitdown` (Microsoft) as the unified Office extraction tool
2. Add real Excel extraction: markdown tables per sheet + AI-generated summary
3. Lazy-install markitdown automatically when first needed — users should not need to install anything manually

---

## Architecture

**Only file changed:** `skills/import/SKILL.md`

No new files. No changes to other handlers (PDF, Image, Video, Script).

**Dependency:**
```
markitdown (Python CLI)
  install: pipx install markitdown   (preferred)
  fallback: pip3 install markitdown  (macOS/Linux/WSL)
           pip install markitdown   (Windows/WSL)
```

---

## Section 1: markitdown Dependency (new shared section)

All Office handlers (Word, PowerPoint, Excel) reference this section instead of duplicating logic.

### Detection
```bash
markitdown --version   # cross-platform; exit 0 = installed
```

If exit 0 → markitdown is available, proceed with handler.
If non-zero or command not found → run OS detection before attempting install.

### OS Detection (before attempting install)
1. Run `uname` to detect OS:
   - `Darwin` or `Linux` (non-WSL) → proceed to Python check
   - WSL: `uname -r` contains `microsoft` or `WSL` → treat as Linux, proceed
   - Windows non-WSL (`$OS == Windows_NT` and uname fails or returns MINGW/CYGWIN) →
     create stub note with message:
     > ⚠ Windows detected (non-WSL). /import requires WSL. Run this in a WSL terminal and retry.
     Stop processing this file.

### Python Check
```bash
python3 --version
```
If Python 3 not found → stub note with message:
> ⚠ Python 3 is not installed. Install Python first:
> - macOS: `brew install python3`
> - Linux/WSL: `sudo apt install python3`
>
> Then run: `pipx install markitdown` and re-import this file.

### Install
```bash
pipx install markitdown       # try first
pip3 install markitdown       # fallback if pipx not found
pip install markitdown        # fallback on WSL/Windows
```
If install succeeds → retry handler immediately.
If install fails → stub note:
> ⚠ markitdown could not be installed automatically.
> Install manually: `pipx install markitdown`, then re-import this file.

---

## Section 2: Handler Changes

### Word Handler (.docx)

**Before:**
```bash
pandoc "[filepath]" -t plain   # outputs plain text
```

**After:**
```bash
markitdown "[filepath]"        # outputs markdown directly
```

markitdown preserves heading structure natively — no post-processing needed. Same note template and subfolder logic as before.

Stub note fallback (markitdown unavailable or failed): identical structure to current pandoc fallback.

---

### PowerPoint Handler (.pptx / .ppt)

**Before:**
```bash
pandoc "[filepath]" -t plain
```

**After:**
```bash
markitdown "[filepath]"   # slide titles → ## headings, content → bullets
```

markitdown maps slide titles to `##` headings automatically. The `## Slide Outline` section is populated directly from markitdown output.

---

### Excel Handler (.xlsx / .xls) — full rewrite from stub

**Before:** stub only — no content extraction, just a link to the original file.

**After:**

1. Check/install markitdown (reference markitdown Dependency section)
2. Run: `markitdown "[filepath]"` → each sheet becomes a markdown table
3. If output empty or exit non-zero → stub note, do NOT delete inbox file
4. AI generates Summary: 2-3 sentences describing the data (what it contains, number of sheets, notable values/patterns)
5. Create note using this structure:

```markdown
## Summary

[AI-generated: what this data is, key numbers, patterns]

## [Sheet Name]

| col1 | col2 | ... |
|------|------|-----|
| ...  | ...  | ... |

## [Sheet 2 Name]   ← if multiple sheets
...
```

`--attach` remains unsupported for Excel.

**Cleanup:** delete inbox file only after successful note creation (non-stub). Stub notes do NOT trigger cleanup.

---

## Section 3: Error Handling

All Office handlers use the same error path, consistent with existing Handler Safety Rules.

| Situation | Behavior |
|-----------|----------|
| markitdown output empty | stub note, do NOT delete inbox file |
| markitdown exit non-zero | stub note, do NOT delete inbox file |
| Python 3 not found | stub note + install Python instructions |
| install failed | stub note + manual install instructions |
| Windows non-WSL | stub note + use WSL instructions |

### Summary Report (Step 5 of orchestrator)

Updated error message:
```
⚠ 1 file failed:
  budget.xlsx — markitdown not installed. File left in inbox.
  Install with: pipx install markitdown
```

---

## Out of Scope

- `.xls` (legacy Excel binary format): markitdown may or may not support it. If markitdown fails on `.xls`, fall back to stub with message: "Legacy .xls format may not be supported. Convert to .xlsx and re-import."
- `.odt`, `.ods`, `.odp` (LibreOffice formats): not added in this version
- `--attach` support for Word/PPT/Excel: no change, remains unsupported
- Windows native (non-WSL) support: out of scope; users are directed to WSL

---

## Testing Checklist

- [ ] Import .docx — full note created with heading structure
- [ ] Import .pptx — slide outline populated correctly
- [ ] Import .xlsx — markdown tables + AI summary
- [ ] Import .xlsx with multiple sheets — multiple ## sections
- [ ] markitdown not installed → lazy install triggered → retry succeeds
- [ ] Python not found → correct stub + message
- [ ] Windows non-WSL → correct stub + WSL warning
- [ ] install fails → stub note, inbox file not deleted
- [ ] markitdown output empty → stub note, inbox file not deleted
- [ ] Batch mode with mixed file types — Office files use markitdown, others unaffected
