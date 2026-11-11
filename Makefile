GO        ?= go
# gitleaks version for secret scanning. Dependabot cannot update
# `go install pkg@version`, so bump it here by hand and rescan the full
# history (`make secrets`) after a bump.
GITLEAKS_VERSION := v8.30.1
GITLEAKS  := bin/gitleaks-$(GITLEAKS_VERSION)/gitleaks
# Git history to scan; `make secrets` scans all refs unless SECRETS_LOG_OPTS
# (git log options, e.g. a commit range) is set.
SECRETS_SOURCE ?= .

.PHONY: secrets secrets-test

# gitleaks is built with the project's toolchain and verified through the Go
# checksum database.
$(GITLEAKS):
	GOTOOLCHAIN=$$($(GO) env GOVERSION) GOBIN=$(CURDIR)/$(dir $(GITLEAKS)) $(GO) install \
		-ldflags=-X=github.com/zricethezav/gitleaks/v8/version.Version=$(GITLEAKS_VERSION) \
		github.com/zricethezav/gitleaks/v8@$(GITLEAKS_VERSION)

## secrets: scan the git history (all refs by default) for committed credentials
secrets: $(GITLEAKS)
	$(GITLEAKS) git --redact --verbose --no-banner --exit-code 1 --config .gitleaks.toml \
		--log-opts="$$SECRETS_LOG_OPTS" $(SECRETS_SOURCE)

## secrets-test: self-test of the secret scan (temporary git repos, no network)
secrets-test: $(GITLEAKS)
	GITLEAKS=$(CURDIR)/$(GITLEAKS) sh scripts/secret-scan-test.sh
