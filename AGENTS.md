## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `Zero-State-LLC/ion-pumpy-thing`, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Checks

`npm test` (same as `node --test tests/*.test.cjs`) must pass before a PR. `npm run typecheck` runs `tsc` on the standalone scripts (`audio.js`, `audio-cues.js`, `ga4.js`): run `npm ci` first when you have network; without it, any TypeScript 5 or later on your PATH gives the same result. The inline game script in `index.html` is covered by the tests, not the type check. Game tests follow `docs/adr/0001-tests-see-what-the-player-sees.md`. `npm run test:browser` checks every step fits 390 px and 320 px phone screens in real Chrome, with all canvas text inside the canvas and no page errors; it needs Chrome installed and Node 22 or later, skips without them locally, and runs in CI. `npm run dev` serves the site at http://localhost:8080.
