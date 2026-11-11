# GitHub operations

Read before the first GitHub write (CLAUDE.md, "GitHub operations"). Local sessions use `gh`; cloud sessions have no `gh` and use the GitHub MCP tools (load them via ToolSearch). Same operation, same rules.

Issues, labels and milestones of this repository's work live in keepia/mail (keepia/mail#7, decision T1): issue, sub-issue, label and milestone operations go to `keepia/mail`; pull requests, their reviews and merges to `keepia/design-system`. This repository has no labels, so a PR gets none; markers such as `second-review` go on its keepia/mail issue. A PR is opened with `gh pr create` or `mcp__github__create_pull_request`.

| Operation | Local (`gh`) | Cloud session (MCP / session tools) |
|---|---|---|
| Read an issue and its comments | `gh issue view <n> --comments` | `mcp__github__issue_read` method `get`, then `get_comments` |
| Comment on an issue or PR | `gh issue comment` / `gh pr comment` | `mcp__github__add_issue_comment` (PR number as `issue_number`) |
| Change labels | `gh issue edit --add-label/--remove-label` | `mcp__github__issue_write` method `update` with `labels`: **replaces the whole set**, so read the current labels first (`issue_read` method `get_labels`) |
| Create a sub-issue and link it | `gh issue create`, then `gh api -X POST repos/keepia/mail/issues/N/sub_issues -F sub_issue_id=<issue .id>` | `mcp__github__issue_write` method `create` with `parent_issue_number: N`; for an existing issue `mcp__github__sub_issue_write` method `add` with `sub_issue_id` (the issue's id, not its number) |
| Read a PR and its diff | `gh pr view`, `gh pr diff` | `mcp__github__pull_request_read` method `get`, `get_diff` (`get_files` for the file list) |
| Read check status once | `gh pr checks <n>` | `mcp__github__pull_request_read` method `get_check_runs` (plus `get_status` for commit statuses) |
| Coordinator waits for CI (first wait until the checks appear, in both columns) | background `gh pr checks <n> --watch --interval 120 >/dev/null 2>&1; gh pr checks <n>` | `mcp__claude-code-remote__subscribe_pr_activity` on the PR wakes the coordinator; optionally one `mcp__claude-code-remote__send_later` check-in that reads `get_check_runs` as a safety net; `unsubscribe_pr_activity` after merge or close |
| Merge | `gh pr merge <n> --squash --match-head-commit <sha> --subject '<title> (#<n>)' --body '<message>'` | `mcp__github__merge_pull_request` with `merge_method: squash`, `expectedHeadSha: <sha>`, `commit_title` and `commit_message` (always: without them GitHub joins every commit message and trailer of the branch) |
| Bring a PR branch up to date with `main` (a Dependabot branch that is behind) | `gh pr update-branch <n>` | `mcp__github__update_pull_request_branch` with `expectedHeadSha: <sha>`; a bot command in a comment does not work, because the mention arrives escaped |
| Create a milestone | `gh api -X POST repos/keepia/mail/milestones -f title=0.2.0 -f description='<goal>'` | no MCP tool: REST fallback (below), `POST repos/keepia/mail/milestones` with `{"title":"0.2.0","description":"<goal>"}` |
| Rename or close a milestone | `gh api -X PATCH repos/keepia/mail/milestones/<number> -f title=<X.Y.Z>` / `-f state=closed` | REST fallback, `PATCH repos/keepia/mail/milestones/<number>` with `{"state":"closed"}` or `{"title":"X.Y.Z"}` |
| List milestones (with numbers) | `gh api 'repos/keepia/mail/milestones?state=all'` | REST fallback, `GET repos/keepia/mail/milestones?state=all` |
| Assign an issue or PR to a milestone | `gh issue edit <n> --milestone 0.2.0` (`gh pr edit` for a PR) | `mcp__github__issue_write` method `update` with `milestone`: the milestone **number**, not its title |

## REST fallback in cloud sessions
Maintainer decision (2026-11-01), the rule [G26 in pklnx/dev-process `decisions.md`](https://github.com/pklnx/dev-process/blob/main/decisions.md): agents perform GitHub operations that have no MCP tool themselves (milestones above); they do not hand them to the maintainer. In a cloud session without `gh`, call the REST API with the session's token, only in the repositories attached to the session and named in the brief (for the coordinator: attached to the session):

```bash
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/keepia/mail/milestones -d '{"title":"0.2.1","description":"<goal>"}'
```

- The `Content-Type: application/json` header is required (the proxy refuses a body without it). Build JSON bodies with a JSON encoder, not by hand.
- Use it only where no MCP tool covers the operation; everything else stays on the MCP tools. Only the channel is green: every operation keeps its own tier, so Never 4 stays a prohibition, and releases and tags (R2), repository settings, rulesets and secrets (R3) and deleting anything the session did not create (R5) stay with the maintainer (red). A call that the permission system, a safety classifier or the proxy refuses by policy stays undone and is reported, never tried another way; a request error (missing header, malformed JSON, 422) is corrected and sent again. Never print or log the token.
- GraphQL (`gh` subcommands other than `gh api`) is refused in cloud sessions; REST is not.
