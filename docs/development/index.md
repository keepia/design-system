# Development

How to build and test is in the [README](../../README.md#building). This page
describes the checks that run on every pull request.

## Security checks

The required checks are `check` and `secret-scan`. Each runs on every pull
request and every push to `main`; no workflow with a required job has a
`paths` filter (`scripts/workflows.test.mjs` checks this).

```sh
npm ci --ignore-scripts && npm test   # among the tests: the workflow rules
make secrets-test secrets             # secret scan: self-test, then the full history
```

### Workflows and action pinning

`scripts/workflows.test.mjs` (part of `npm test`, so of the `check` job)
reads every workflow and the composite action `.github/actions/setup` and
checks:

- every `uses:` is pinned to a full 40-character commit SHA with a
  `# vX.Y.Z` comment (`owner/repo@<sha> # v1.2.3`); local actions (`./…`)
  must exist; every occurrence of an action pins the same SHA and comment;
- `actions/setup-node` is pinned only in the setup action, which reads
  `.node-version`; nothing else names a Node version; `npm ci
  --ignore-scripts` runs once, there, with IBM's telemetry off;
- every checkout has `persist-credentials: false`; every workflow grants
  only `contents: read`, at the top level;
- the required checks run on every pull request and push to `main`;
- CI and the README call the same build entry point (`npm run build:all`);
- a single-line `run:` value is valid as a plain YAML scalar;
- Dependabot covers npm, the workflows and the composite action, and
  `tools/gitleaks`.

It reads the files as text, not with a YAML parser, as pklnx/design-system
does (keepia/mail#7, decision T4): it checks the layout these files use and
fails when a file departs from it. A new action is a new external service and
needs the maintainer's OK.

### Dependencies

- Dependabot opens weekly update pull requests for npm, GitHub Actions and
  the Go version in `tools/gitleaks/go.mod` (`.github/dependabot.yml`). It
  waits 14 days after a release before it opens a version update
  (`cooldown`); security updates are exempt.
- Dependabot does not update gitleaks, which the Makefile installs with
  `go install pkg@version`: bump it by hand in the Makefile.

### Secret scanning

The `secret-scan` check (`.github/workflows/secrets.yml`) runs
[gitleaks](https://github.com/gitleaks/gitleaks) with its built-in rules and
the narrow allowlist in [`.gitleaks.toml`](../../.gitleaks.toml):

- on every pull request: the commits the pull request adds
  (`base..head`);
- on every push to `main`: the commits the push adds (`before..after`). A
  push without a previous commit, or whose previous commit is not in the
  clone, scans only its last commit and says so in the log.

The files are keepia/mail's, with only the `title` and the
`go-version-file` changed (keepia/mail#7, maintainer decision M4). This
repository has no Go code: `tools/gitleaks/go.mod` holds only the Go
version gitleaks is built with. Secret values are redacted in the log. Pull
request runs cancel older runs of the same pull request; push runs are never
cancelled.

```sh
make secrets        # scan the full history of all local refs
make secrets-test   # self-test: the scan fails and passes where it should
```

gitleaks is pinned in the Makefile (`GITLEAKS_VERSION`) and verified through
the Go checksum database. It is built with the Go on the `PATH`; locally that
must be the version in `tools/gitleaks/go.mod` or newer (for example
`make GO=/path/to/go1.27.3/bin/go secrets-test`). Dependabot does not update
gitleaks: bump it by hand, then rescan the full history with `make secrets`
on a clone with all branches and tags.

**If the check finds a credential:**

1. Treat it as leaked: rotate or revoke it first. Removing the commit does
   not help, because the value stays in the history and in clones.
2. Never post the value on GitHub (issues, pull requests, comments). Report
   it to the maintainer privately.
3. Remove it from the branch. On a pull request branch, rewrite the branch
   so no commit contains the value. On `main` the history is not rewritten:
   after rotating, add the finding's fingerprint (`commit:file:rule:line`,
   printed by gitleaks) to `.gitleaksignore` with a comment.

**False positives** (a fake key in a test fixture) get a narrow entry in
`.gitleaks.toml`: one `[[allowlists]]` block with `condition = "AND"`, the
fixture's exact path and a regex for the fake value, and a comment saying why
it is safe. Global regexes and path globs are not allowed. Better still,
build fake credentials at runtime in tests, so nothing in the repository
matches a rule (see `scripts/secret-scan-test.sh`). Any change to the
secret-scan files needs the maintainer's OK (`CLAUDE.md`, "Rules").

**Known fake finding.** The proof that the check fails a pull request with a
credential was the throwaway draft pull request #2 (commit
`087cf783f6e38efb7069fc3a84bf9dfc2deeb035`), closed unmerged. Its only commit adds a file with the fake
GitHub token that `scripts/secret-scan-test.sh` builds at runtime (rule
`github-pat`); it is not a real credential. GitHub keeps that commit as
`refs/pull/2/head`, so a full-history rescan that includes `refs/pull/*`
reports it. This finding is the known fake: it gets no allowlist entry and no
`.gitleaksignore` entry; rescans leave out `refs/pull/*`.

### CodeQL

CodeQL runs as GitHub's default setup (a repository setting, no workflow
file): the default query suite on the languages GitHub detects, today the
workflows (`actions`) and JavaScript. It is not a required check. Alerts are
never dismissed to make a check green; they are fixed.
