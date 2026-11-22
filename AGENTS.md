## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `Zero-State-LLC/ion-pumpy-thing`, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Checks

`npm test` (same as `node --test tests/*.test.cjs`) must pass before a PR. `npm run typecheck` runs `tsc` on the standalone scripts (`audio.js`, `audio-cues.js`, `ga4.js`, `view3d.js`): run `npm ci` first, since `view3d.js` is checked against three.js's published types (`@types/three`) at the release vendored in `vendor/three`. The inline game script in `index.html` is covered by the tests, not the type check. Game tests follow `docs/adr/0001-tests-see-what-the-player-sees.md`. `npm run test:browser` checks every step fits 390 px and 320 px phone screens in real Chrome, with all canvas text inside the canvas and no page errors, and that each 3D view starts WebGL and draws a frame that isn't blank (for Orbit, in each camera's half); it needs Chrome installed and Node 22 or later, skips without them locally, and runs in CI. On every pull request, CI's ticket check (`.github/workflows/ticket.yml`, running `tests/ticket-check.mjs`) fails unless the description says `Closes #N`, `Fixes #N` or `Part of #N` (any case, outside code and HTML comments); editing the description runs it again. `npm run dev` serves the site at http://localhost:8080.

### Hallmark design skill

For an explicitly requested Hallmark design, redesign, or audit, read `.agents/skills/hallmark/SKILL.md` and its referenced material. The vendored source is pinned in `.agents/skills/hallmark/UPSTREAM.txt`. Do not apply Hallmark retroactively to unrelated changes or override the game's scientific accuracy, accessibility, or rendering contracts. When Node is available, use the bundled `scripts/sloplint.mjs` as directed by the skill. This is a repository-local agent skill, not a browser runtime dependency.
