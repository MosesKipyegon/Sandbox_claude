# Sandbox_claude

A personal sandbox for experimenting with [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).
Nothing here is production work. It's a place to try ideas, test features, and learn.

## Layout

Each experiment gets its own subfolder so they stay independent:

```
Sandbox_claude/
├── README.md            ← this file
├── <experiment-name>/   ← one folder per experiment
│   ├── README.md        ← optional: what it is, how to run it
│   └── ...
└── ...
```

### Conventions

- **One folder per experiment.** Use short, descriptive, kebab-case names
  (e.g. `todo-cli`, `csv-cleanup`, `hooks-test`).
- **Optional dated prefix** if you want them sorted chronologically:
  `2026-10-30-todo-cli`.
- **Add a small README** inside a folder when an experiment is worth
  revisiting. Note what you tried, what worked, and how to run it.
- **Delete freely.** It's a sandbox, so remove experiments you no longer need.

## Experiments

Keep a running list here (update as you go):

| Folder | What it explores | Status |
|--------|------------------|--------|
| _none yet_ | | |

## Tips for using Claude Code here

- Open the specific experiment folder (or tell Claude which folder to work in)
  so it stays focused on that experiment's files.
- Run `/init` inside an experiment folder to generate a `CLAUDE.md` with
  project-specific instructions for Claude.
- Consider `git init` at this level (or per experiment) so you can review and
  undo changes Claude makes.
- Useful things to try: `/help`, `/code-review`, `/simplify`, hooks and
  settings via `/config`, and the `/run` skill to launch an app.
