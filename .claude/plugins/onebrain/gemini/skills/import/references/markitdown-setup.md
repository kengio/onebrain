# markitdown Dependency Setup — Reference

Used by the Word, PowerPoint, and Excel handlers. Follow this sequence before attempting extraction.

## 1. Detection

```bash
command -v markitdown
```

Exit 0 → markitdown is installed. Proceed with the handler.
Non-zero or command not found → proceed to Python check (no OS gate; markitdown installs and runs on macOS, Linux, WSL, and native Windows).

## 2. Python Check

Try in order — first one that succeeds wins:

```bash
python3 --version    # macOS / Linux / WSL
python --version     # Windows default Python launcher (also works on Linux when symlinked)
py -3 --version      # Windows Python launcher (always available since Python 3.6)
```

All three fail → create stub note:
> ⚠ Python 3 is not installed. Install Python first:
> - macOS: `brew install python3`
> - Linux/WSL: `sudo apt install python3`
> - Windows: install from https://www.python.org/downloads/ or the Microsoft Store
>
> Then run: `pipx install markitdown` and re-import this file.

Stop. Do NOT delete the inbox file.

Remember which command succeeded — use the matching `pipx`/`pip` form below.

## 3. Install

Try `pipx` first (preferred — isolated environment):

```bash
pipx install markitdown
```

If `pipx` is not on PATH, fall back to `pip` matched to whichever Python detector succeeded above:

```bash
pip3 install markitdown         # if `python3` succeeded
pip install markitdown          # if `python` succeeded
py -3 -m pip install markitdown # if `py -3` succeeded (Windows)
```

Install succeeded → retry the handler from the beginning (markitdown is now available).

Install failed → create stub note:
> ⚠ markitdown could not be installed automatically.
> Install manually: `pipx install markitdown`, then re-import this file.

Stop. Do NOT delete the inbox file.
