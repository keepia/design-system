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
parses every workflow, the composite action `.github/actions/setup` and
`.github/dependabot.yml` with the [`yaml`](https://www.npmjs.com/package/yaml)
package and checks the parsed structure, not the text. The rules and the
policy table are in `scripts/workflow-rules.mjs`; every finding names
`file:line` and a rule id. Every other YAML file under `.github` (the
extension in any case) and every other file in `.github/workflows` fails the
test unless it is listed there (`.github/ISSUE_TEMPLATE/config.yml` is
checked for the YAML subset only). A new workflow needs a policy entry. A new
action is a new external service and needs the maintainer's OK.

**YAML these files may use.** One document; no `%YAML` or `%TAG`
directive; no anchors, aliases or merge keys; no tags (`!!str` included); no
explicit `?` keys; no duplicate keys; only string keys. Quoted and escaped
keys count under their decoded name (`"u\x73es"` is `uses`), and comments
count for nothing. Action inputs (`with:`) are compared case-insensitively,
as GitHub does, and two inputs that differ only in case fail. A file outside
this subset fails; it is not interpreted.
Values are compared exactly, so `persist-credentials: no` is the string `no`,
not `false`.

**Rules** (rule ids in brackets).
- Every `uses` is written in block style [`flow-uses`]. It names a scanned
  local action (`./…`) [`local-action`] or `owner/repo@<40-hex SHA>` with a
  `# vX.Y.Z` comment on the same value [`pin`]. Every occurrence of an
  action (compared case-insensitively) pins the same SHA and comment. Docker
  actions and reusable workflows are not used.
- Each workflow's top-level keys are `name`, `on`, `permissions`,
  `concurrency`, `defaults` and `jobs` at most [`top-keys`]. Its top-level
  and job-level `permissions` equal the policy table (today `contents: read`
  at the top level, none per job) [`permissions`].
- Every `actions/checkout` sets `persist-credentials: false`
  [`persist-credentials`].
- `ci.yml` and `secrets.yml` run on `push` to `main` and on every
  `pull_request`, with no filter and no other trigger [`on`]. Their required
  jobs (`check`, `secret-scan`) are the only job in their file, are named
  after their id, have only `name`, `runs-on`, `timeout-minutes`, `env` (as
  in the policy) and `steps`, and their steps only `name`, `id`, `uses`,
  `with`, `run`, `env` and `shell`; the same holds for the steps of the
  composite action. So there is no `if`, `continue-on-error`, `needs`,
  `strategy` or `defaults` on them. A step's `env` sets only the names the
  policy lists for that step name (today only `secret-scan`'s "Scan the new
  commits" and the setup action's install step), so `BASH_ENV`,
  `npm_config_*` or `MAKEFLAGS` cannot turn a required check green without
  running it [`required`].
- No `run` value contains `${{` [`run-expression`]. Pass values through
  `env:` and use `"$VAR"`. A `run` value is a string, and a plain one has no
  trailing comment [`run`]. `shell` is `bash`, and `defaults` sets only
  `run.shell` [`shell`].
- npm runs only as `npm run`, `npm test`, `npm pack … --ignore-scripts`, and
  `npm ci --ignore-scripts` once, in the setup action. `npx`, `pnpm`, `yarn`
  and `corepack` are not used [`npm`].
- `actions/setup-node` appears only in the setup action, with
  `package-manager-cache: false`; a job that runs npm checks out first, then
  uses the setup action, and IBM's telemetry is off wherever npm runs
  [`setup`]. The setup action reads `.node-version`, and no key
  `node-version` exists [`node-version`].
- CI's step "Generated files are committed" runs exactly `npm run build:all`
  and keeps its drift check, and the README calls the same entry point
  [`build-entry`]. `run` calls only the scripts the policy lists with `node
  scripts/…`, also after node options or in quotes (today `check-pack.mjs`
  in `ci.yml`) [`scripts`].
- Dependabot covers npm, the workflows and the composite action, and
  `tools/gitleaks`, weekly with a 14-day cooldown, exactly as in the policy
  [`dependabot`].

The test also runs the fixtures in `scripts/fixtures/workflows` (each starts
with `# want: <line>:<rule> …` or `# want: none`) and a table of mutations of
the real files; every rule id has at least one red case there.

**What it does not check.**
- Shell semantics. It reads command words, so `npm` behind a variable, an
  alias, `eval` or shell quoting inside the word (`n""pm`) is not seen; a
  command word ends at the first character that is not part of a name, so
  `npm>x`, `npm<x` and `npm\` at the end of a line are seen. The
  review covers that, as for any workflow change (risk class (a)).
- Expressions in `with:` inputs of an action (for example a script input),
  and in `env:` values (that is the allowed way). A new action needs the
  maintainer's OK anyway.
- That a version comment matches its SHA: that needs the network, and
  Dependabot keeps both in step.

**Known false positives (fail closed).**
- Any key named `uses` is checked, also a step input or an env variable;
  the same for `run`, `shell` and `node-version`. Rename it.
- `npm` with a denied subcommand inside an `echo` text is reported when it
  follows a space or a quote (`echo "then npm ci"`).
- `${{` inside a `run` is reported also where it would be harmless.

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
