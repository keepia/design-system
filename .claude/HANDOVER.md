# Handover

Read at session start (CLAUDE.md, "Session handover"). At session end, replace the state section; never append. Done items leave it: PRs and issues record them.

## State (2026-11-11)

Released: nothing. The work is keepia/mail#7 (Keepia brand), in five parts tracked as sub-issues there: 1 repository setup (keepia/mail#15, this setup) → ruleset and settings (maintainer) → 2 Carbon theme and contrast checks → 3 logo, lockups and icons → 4 VitePress theme → 5 package and release workflow. Then the release `v0.1.0` after a green release dry run (maintainer decision M8 on keepia/mail#7).

Open:
- Maintainer: the ruleset and settings for this repository after part 1's first green run (M5 on keepia/mail#7; exact settings in the part 1 PR).

Decisions to keep (keepia/mail#7):
- Node only, no Python (T2); workflow rules as a Node test, `scripts/workflows.test.mjs` (T4).
- The secret-scan files are keepia/mail's, with only `title` and `go-version-file` changed (M4); any other change needs a new maintainer OK.
- `tools/gitleaks/go.mod` holds only the Go version for the secret scan; there is no root `go.mod`.
- Every action is pinned to one full commit SHA; `actions/setup-node` only in `.github/actions/setup/`.
- The brand files ship in the package (M2); colours follow Carbon step for step (M1); the G100 focus ring stays Carbon white.
- The coordinator commits only in its own worktree under the scratchpad, never in the main checkout.
