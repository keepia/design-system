# Workflow

Roles: maintainer (human), coordinator (Claude: orders the backlog, plans, delegates, merges), implementer (one PR each), reviewer, plan-reviewer (never the planner). Coordination, ticket loop, reviews and models: [pklnx/dev-process](https://github.com/pklnx/dev-process) (`coordinator.md`, `decisions.md`, `models.md`). All in Claude sessions on the subscription; no Claude GitHub Action.

Language: German with the maintainer; English on GitHub and in code. Every GitHub text ends with `— Claude, <role>`; no model names on GitHub.

## Ticket flow
Issues, labels and milestones live in [keepia/mail](https://github.com/keepia/mail); this repository has pull requests only (keepia/mail#7, coordinator decision T1).

1. Issue in keepia/mail with a "Done when" list.
2. Coordinator or maintainer labels `plan` → `## Plan` comment (approach, files, data model, external services, tests, open questions, size); label becomes `review`. Small fixes whose issue already names the fix may skip the plan.
3. A plan-reviewer (never the planner) reviews independently; it or the maintainer replaces `review` with `ready`. Only `ready` issues are built.
4. Several parts: one sub-issue per part in keepia/mail, created with the plan, titled "<what> (#N, part K)", linked as GitHub sub-issue (by `id`, not number). The main issue's `ready` covers them; it closes with the last part.
5. One branch and PR per issue or part, in this repository; body "Closes keepia/mail#<n>." (a part also "Part K of keepia/mail#N.").
6. Review: one session review for every PR. The risk class also gets a second, independent session reviewer who has not seen the first; the coordinator marks those PRs `second-review` (on the keepia/mail issue). Risk class: (a) release and CI security: the release workflow `.github/workflows/release.yml`, workflow permissions, the composite action `.github/actions/setup/`, `.github/workflows/secrets.yml` and the other secret-scan files (Rules), and any new action or other external service; (b) package contents: `package.json` `files` and `exports`, the shipped files, and `scripts/check-pack.mjs`, which fixes the package contents. Docs, CI outside (a) and test-only PRs: one session review (Sonnet) and green required checks.
7. Merge: approving review, green required checks (`check`, `secret-scan`), Done-when list met; squash merge pinned to the reviewed head SHA. Never auto-merge; never change rulesets or repository settings.
8. Releases are planned in keepia/mail milestones; releasing needs the maintainer's OK.

Blocking in reviews only: a wrong result in a main function, a broken build, CI or release, a security problem, a missing or failing test for new behaviour, a Done-when item not met, a plan or maintainer decision violated. Anything else is non-blocking: a `followup` issue in keepia/mail if the reviewer names a realistic near-term case, else it stays in the review.

## GitHub operations
Commands per operation: `.claude/github-operations.md`, read before the first GitHub write. An MCP `issue_write` labels update replaces the whole set.

## Rules
- Before a push: `npm test`. A change to a build script or a generated file also runs `npm run build:all` (`README.md`, "Building") and leaves `git status --porcelain` empty, as CI does.
- Every behaviour change has tests; a bug fix has a regression test that fails without the fix. Tests never touch the network or real credentials; they wait for signals, never for time.
- Generated files are committed together with the change that produces them.
- The package contents are fixed by `scripts/check-pack.mjs`.
- Every `uses:` is pinned to one full commit SHA with a `# vX.Y.Z` comment, the same everywhere; `actions/setup-node` only in `.github/actions/setup/` (`scripts/workflows.test.mjs`); workflows, the composite action and `dependabot.yml` are parsed as YAML, and their rules are in `scripts/workflow-rules.mjs`. A new action or registry is a new external service and needs the maintainer's OK.
- Secret scan: a PR that touches `.gitleaksignore`, `.gitleaks.toml` (and files it extends), `.github/workflows/secrets.yml`, `scripts/secret-scan-*`, `tools/gitleaks/go.mod` or the gitleaks variables and targets in the `Makefile`, or adds a `gitleaks:allow` comment, merges only after the maintainer's explicit OK, noted on the PR. The reviewer checks the file list and greps the diff for `gitleaks:allow`; any hit is blocking ("needs maintainer OK", with the changed entries: file, rule id, path or fingerprint, never secret values) until the OK is there.

## Session handover
Start: read `.claude/HANDOVER.md`; follow-ups are open `followup` issues in keepia/mail, queried when needed. End: replace its state, never append.
