---
name: update-docs
description: Review staged changes and update all required documentation files before commit
user-invocable: true
argument-hint: [focus-area]
---

# Update Documentation for Staged Changes

Examine the staged git changes, decide which docs need touching, and make targeted edits. Do NOT rewrite stable content — only update sections affected by the diff.

## Staged files
!`git diff --cached --name-only`

## Staged diff summary
!`git diff --cached --stat`

## Staged diff (first 300 lines for context)
!`git diff --cached | head -300`

## Detect project docs

Look for these files at the repo root (whichever exist):
- `README.md` — user-facing overview, install, usage
- `CLAUDE.md` — instructions to Claude about architecture, commands, conventions
- `CHANGELOG.md` — release-visible changes
- `DECISIONS.md` / `docs/adr/*` — architectural decision records
- `docs/` — any other documentation directory

If `CLAUDE.md` lists specific docs that should be maintained, treat that list as authoritative.

## Documentation checklist

For each item, check if the staged changes require an update. Skip items that are not affected.

1. **README.md**
   - New feature, command, or install step? Update the relevant section.
   - Dependency added/removed that affects setup? Update prerequisites.
   - Renamed or relocated a module? Update references.

2. **CHANGELOG.md** (if present)
   - User-visible change? Add an entry under the "Unreleased" heading (or the conventional format the project already uses).

3. **DECISIONS.md / ADRs** (if present)
   - Architectural choice, library swap, or intentional pattern deviation? Add a new ADR.
   - Use the next available ADR number (check the last entry).
   - Keep it short: Context, Decision, Consequences.

4. **CLAUDE.md**
   - New top-level concept, new command, or architectural shift that future Claude sessions should know about?
   - Keep additions terse — CLAUDE.md is read on every session.

5. **Project-specific docs**
   - If the repo has a `docs/` folder or other documentation referenced from README/CLAUDE.md, check whether any of them are directly contradicted by the diff.

## Rules

- Read each file before editing — understand its structure first.
- Make minimal, targeted additions — don't restructure existing content.
- Never invent sections; follow the file's existing conventions.
- If a doc is missing and the project has no convention for it, don't create one unless the user asks.
- Report back what you updated and what you skipped (with reason).

## Focus area (if specified)
$ARGUMENTS
