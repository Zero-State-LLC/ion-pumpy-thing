// The ticket check fails a pull request whose description names no ticket, so
// no change reaches main without one. CI hands it the description in PR_BODY;
// these runs do the same with sample descriptions. See #44.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const check = path.join(__dirname, 'ticket-check.mjs');
const { PR_BODY, ...envWithoutBody } = process.env;
function runWithBody(body) {
  const env = body === undefined ? envWithoutBody : { ...envWithoutBody, PR_BODY: body };
  return spawnSync(process.execPath, [check], { env, encoding: 'utf8', timeout: 30000 });
}
function assertFails(run) {
  assert.equal(run.status, 1, run.stdout + run.stderr);
  for (const form of ['"Closes #N"', '"Fixes #N"', '"Part of #N"']) assert.ok(run.stderr.includes(form), `names ${form}:\n${run.stderr}`);
}
function assertPasses(run, reference) {
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split('\n');
  assert.equal(lines.length, 1, run.stdout);
  assert.ok(lines[0].includes(reference), run.stdout);
}

test('with no description, the ticket check fails and names the accepted forms', () => {
  assertFails(runWithBody(undefined));
});

test('with an empty description, the ticket check fails and names the accepted forms', () => {
  assertFails(runWithBody(''));
});

test('a description that mentions #12 without "Closes", "Fixes" or "Part of" fails', () => {
  assertFails(runWithBody('Tidies the copy that #12 asked about.\n'));
});

test('"closes #12" in lower case passes, with a one-line confirmation', () => {
  assertPasses(runWithBody('Tidies the copy.\n\ncloses #12\n'), 'closes #12');
});

test('"Part of #25" passes, with a one-line confirmation', () => {
  assertPasses(runWithBody('Part of #25\n\nThe first half of the spec.'), 'Part of #25');
});

test('"Fixes #9" passes, with a one-line confirmation', () => {
  assertPasses(runWithBody('Fixes #9'), 'Fixes #9');
});

// GitHub doesn't link a reference inside code, so neither does the check.
test('a ticket named only inside code, in a fenced block or an inline span, fails', () => {
  assertFails(runWithBody('Shows the lines to add:\n\n```text\nCloses #12\n```\n\n~~~\nPart of #25\n~~~\n\nor `Fixes #9`.\n'));
});

test('a ticket named after a closed code block passes', () => {
  assertPasses(runWithBody('Run:\n\n~~~\nnpm test\n~~~\n\nPart of #25\n'), 'Part of #25');
});

// GitHub's web editor can send Windows line endings, so every line ends in \r.
test('with Windows line endings, a ticket named only inside a code block still fails', () => {
  assertFails(runWithBody('Shows the line to add:\r\n\r\n~~~\r\nCloses #12\r\n~~~\r\n'));
});

// An inline code span lies inside one paragraph, so a backtick with no partner in its own
// paragraph is plain text, and a reference after it still counts (GitHub links it).
test('a stray backtick in one paragraph and a code span in a later one leave the ticket named between them counting', () => {
  assertPasses(runWithBody('Press the ` key to pump.\n\nCloses #12\n\nThen run `npm test`.\n'), 'Closes #12');
});

// A backtick fence's info string can't contain a backtick, so ```js``` on its own line is an
// inline code span, not the start of a fenced block.
test('a one-line ```js``` is inline code, not a fence: a ticket named inside it fails, one named after it passes', () => {
  assertFails(runWithBody('```Closes #12```\n'));
  assertPasses(runWithBody('```js```\n\nCloses #12\n'), 'Closes #12');
});

// GitHub shows nothing of an HTML comment, so a reference inside one doesn't count.
// A code span opens at the start of a backtick run, never inside one (#49, from Codex on #48).
test('a ticket named only in a code span after an unmatched longer backtick run fails', () => {
  assertFails(runWithBody('Use `` as a delimiter; `Closes #12`.'));
  assertFails(runWithBody('Use ``` as a fence marker; `Fixes #9` inline.'));
});

test('a ticket named after an unmatched backtick run, outside code, passes', () => {
  assertPasses(runWithBody('Use `` as a delimiter. Closes #12'), 'Closes #12');
});

test('a ticket named only inside an HTML comment, on one line, across lines or within a line, fails', () => {
  assertFails(runWithBody('<!-- Closes #12 -->\nTidies the copy.\n'));
  assertFails(runWithBody('<!--\nPart of #25\n\nwith a blank line inside\n-->\nTidies the copy.\n'));
  assertFails(runWithBody('Tidies the copy <!-- Fixes #9 --> for the Ledger.\n'));
});

test('a ticket named after an HTML comment, on the same line, passes', () => {
  assertPasses(runWithBody('<!-- Name the ticket below. --> Closes #12\n'), 'Closes #12');
});

// A line indented four spaces, or a tab, after a blank line is an indented code block, which
// GitHub doesn't link either. Straight after a paragraph's line it continues the paragraph.
test('a ticket named only in an indented code block, by spaces or a tab, fails', () => {
  assertFails(runWithBody('Shows the line to add:\n\n    Closes #12\n'));
  assertFails(runWithBody('Shows the line to add:\n\n\tPart of #25\n'));
});

test('an indented line straight after a paragraph line continues the paragraph, so its ticket passes', () => {
  assertPasses(runWithBody('Tidies the copy, and\n    Closes #12\n'), 'Closes #12');
});
