# markitdown Dependency Setup — Reference

Used by the Word, PowerPoint, and Excel handlers. Follow this sequence before attempting extraction.

## 1. Detection

```bash
command -v markitdown
```

Exit 0 → markitdown is installed. Proceed with the handler.
Non-zero or command not found → run OS detection below before attempting install.

## 2. OS Detection

Run `uname`:
- `Darwin` → proceed to Python check
- `Linux` AND `uname -r` contains `microsoft` or `WSL` (WSL) → treat as Linux, proceed to Python check
- `Linux` AND `uname -r` does NOT contain `microsoft` or `WSL` (native Linux) → proceed to Python check
- Windows non-WSL: `$OS` equals `Windows_NT` AND uname fails or returns `MINGW`/`CYGWIN` →
  create stub note:
  > ⚠ Windows detected (non-WSL). /import requires WSL. Run this in a WSL terminal and retry.
  Stop. Do NOT delete the inbox file.
- `uname` not found: proceed to Python check (assume POSIX-compatible environment).

## 3. Python Check

```bash
python3 --version
```

Not found → create stub note:
> ⚠ Python 3 is not installed. Install Python first:
> - macOS: `brew install python3`
> - Linux/WSL: `sudo apt install python3`
>
> Then run: `pipx install markitdown` and re-import this file.

Stop. Do NOT delete the inbox file.

## 4. Install

Try in order:
```bash
pipx install markitdown   # preferred (isolated environment)
```
If `pipx` is not found:
```bash
pip3 install markitdown   # macOS/Linux/WSL
pip install markitdown    # fallback if pip3 not in PATH
```

Install succeeded → retry the handler from the beginning (markitdown is now available).

Install failed → create stub note:
> ⚠ markitdown could not be installed automatically.
> Install manually: `pipx install markitdown`, then re-import this file.

Stop. Do NOT delete the inbox file.
