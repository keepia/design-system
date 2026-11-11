# Keepia design system

The brand of Keepia (Mail, Docs and Archive): **IBM Carbon v11 with Teal as the interactive colour**, the mark and the wordmark `keepia` in IBM Plex Sans.

This repository will hold the Carbon theme and tokens for White and G100, the logo, lockups, app icons and favicons, and a VitePress theme for the products' documentation, released as an npm-format tarball on a GitHub release. The work is planned in [keepia/mail#7](https://github.com/keepia/mail/issues/7) and tracked there; this is part 1, the repository setup. Nothing is released yet.

**Status: in development.**

## Building

Node 26, as declared in `.node-version`: the one place for the version. The workflows read it through the local action `.github/actions/setup` (`actions/setup-node` with `node-version-file`, then `npm ci --ignore-scripts`), `scripts/workflows.test.mjs` checks that nothing else names a Node version, and `devEngines` in `package.json` makes npm warn on an older Node when you work in this repository. `devEngines` (unlike `engines`) is ignored when the package is installed as a dependency, so the tarball puts no requirement on consumers.

```sh
npm ci --ignore-scripts   # no install scripts, as in CI
npm run build:all         # every generated file, in the order below
npm test                  # all tests (no network)
npm pack --dry-run --json --ignore-scripts | node scripts/check-pack.mjs   # the package contents
```

`npm run build:all` (`scripts/build_all.mjs`) is the one place that defines the order of the generation steps. It runs these commands, in this order, and stops at the first one that fails:

```sh
# none yet: the theme, the logo and the VitePress theme add their steps here
```

CI (step "Generated files are committed") runs `npm run build:all` and fails when it changes the tree, so generated files are committed together with the change that produces them.

The secret scan needs Go (the version in `tools/gitleaks/go.mod`) and is run with `make secrets-test secrets`; see [docs/development/index.md](docs/development/index.md).

## Layout

| Path | Contents |
| --- | --- |
| `.node-version` | The Node major for development and CI (workflows, `devEngines`, tests); see Building |
| `.github/workflows/ci.yml` | The `check` job: generated files are committed, `npm test`, package contents |
| `.github/workflows/secrets.yml` | The `secret-scan` job: gitleaks on the commits a pull request or a push to `main` adds |
| `.github/actions/setup/` | The composite action with the Node and `npm ci` steps and the only pin of `actions/setup-node` |
| `.github/dependabot.yml` | Weekly version updates with a 14-day cooldown for npm, GitHub Actions (workflows and the composite action) and Go (`tools/gitleaks`) |
| `.gitleaks.toml`, `Makefile`, `scripts/secret-scan-*.sh` | The secret scan, taken from keepia/mail |
| `tools/gitleaks/go.mod` | Only the Go version the secret scan builds gitleaks with; this repository has no Go code |
| `scripts/build_all.mjs` | `npm run build:all`: the one entry point for all generation steps (see Building) |
| `scripts/check-pack.mjs` | Fixes the package contents, file by file, and forbids lifecycle scripts |
| `scripts/workflows.test.mjs` | The rules every workflow follows: pins, permissions, checkouts, the Node prelude, Dependabot |
| `scripts/*.test.mjs` | The tests, run by `npm test` (no network) |
| `scripts/fixtures/` | Captured data the tests read (an `npm pack` sample) |
| `docs/development/index.md` | The checks on every pull request |

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

- Code in this repository: [MIT](LICENSE).
- Brand assets (the name "Keepia", the wordmark, the mark, lockups and app icons): all rights reserved, see the exceptions in [LICENSE](LICENSE).
