# Security Policy

## Reporting a vulnerability

Please report security problems **privately** through
[GitHub's private vulnerability reporting](https://github.com/keepia/design-system/security/advisories/new).
Do not open a public issue.

Include what you found, how to reproduce it and what an attacker could do with it.

## Supported versions

Only the latest state of the `main` branch is supported until the first
release. There are no maintained older versions.

## What to expect

We acknowledge a report within 7 days. We then assess it and fix it by
severity; there is no fixed deadline for the fix. You are credited in the
advisory unless you prefer otherwise.

CI scans every pull request and every push to `main` for committed
credentials (gitleaks, check `secret-scan`), and CodeQL (default setup)
analyses the code.

## Scope

In scope, for example:

- A release tarball whose contents differ from what `scripts/check-pack.mjs`
  allows, or a way to get code into a release past the checks
- Code in the package that runs on install or in a consumer's build
- CSS or SVG in the package that loads remote content or runs script

Out of scope:

- Vulnerabilities in dependencies without a demonstrated impact on this project
- The products that use this package (report those in their own repository,
  for example [keepia/mail](https://github.com/keepia/mail/security/advisories/new))
