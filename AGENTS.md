## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `Zero-State-LLC/ion-pumpy-thing`, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Checks

`npm test` (same as `node --test tests/*.test.cjs`) must pass before a PR. `npm run typecheck` checks the standalone scripts (`audio.js`, `audio-cues.js`, `ga4.js`); the inline game script in `index.html` is covered by the tests, not the type check.
