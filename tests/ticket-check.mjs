// Ticket check, with no dependencies: CI runs it on every pull request, and it
// fails unless the description references a ticket as "Closes #N", "Fixes #N"
// or "Part of #N" (any case). A reference inside code (a fenced or indented
// block, or an inline span) or inside an HTML comment doesn't count: GitHub
// doesn't link it either. See issue #44.
//
//   PR_BODY='Closes #12' node tests/ticket-check.mjs
//
// The description is untrusted input, so CI passes it only in PR_BODY, and this
// prints only the reference it matched (letters, spaces, # and digits), never
// the description itself.

const FORMS = ['Closes #N', 'Fixes #N', 'Part of #N'];
const REFERENCE = /\b(?:closes|fixes|part[ \t]+of)[ \t]+#\d+\b/i;

// The description as GitHub shows it, without code or HTML comments, where GitHub links no
// reference either. Line by line, it drops fenced blocks (``` or ~~~, closed by a bare fence
// of the same kind at least as long, else running to the end; a backtick fence's info string
// has no backtick, so ```js``` is inline code), indented code blocks (four spaces or a tab, not
// straight after a paragraph's line, which they would continue) and HTML comments that start a
// line (to the line holding -->, else to the end). Each dropped block also ends a paragraph.
// Then, within each paragraph, since neither crosses a blank line, it drops inline code spans
// and HTML comments, whichever starts first. Lists aren't followed: an indented paragraph in a
// list item counts as code here, and the failure message asks for a line outside code.
const INLINE = /<!--[\s\S]*?-->|(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
function withoutCode(body) {
  const kept = [];
  let fence = null, comment = false, paragraph = false;
  for (const line of body.split(/\r?\n/)) {
    if (fence) {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      kept.push(''); continue;
    }
    if (comment) {
      const end = line.indexOf('-->');
      if (end >= 0) comment = false;
      kept.push(end >= 0 ? line.slice(end + 3) : ''); paragraph = false; continue;
    }
    if (!line.trim()) { kept.push(''); paragraph = false; continue; }
    if (!paragraph && /^(?: {4}| {0,3}\t)/.test(line)) { kept.push(''); continue; }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker && !(marker[1][0] === '`' && marker[2].includes('`'))) { fence = marker[1]; kept.push(''); paragraph = false; continue; }
    const opened = line.match(/^ {0,3}<!--/);
    if (opened) {
      const end = line.indexOf('-->', opened[0].length - 2); // <!--> is a whole comment
      comment = end < 0;
      kept.push(comment ? '' : line.slice(end + 3)); paragraph = false; continue;
    }
    kept.push(line); paragraph = true;
  }
  return kept.join('\n').split(/\n[ \t]*\n/).map(text => text.replace(INLINE, '')).join('\n\n');
}

const found = withoutCode(process.env.PR_BODY ?? '').match(REFERENCE);
if (found) {
  console.log(`Ticket check passed: the description says "${found[0]}".`);
} else {
  const forms = FORMS.map(form => `"${form}"`);
  console.error(`This pull request's description names no ticket. Add a line outside code and HTML comments saying ${forms[0]}, ${forms[1]} or ${forms[2]} (any case), with N the issue number. Closes and Fixes close the ticket when the pull request merges; Part of leaves it open. Editing the description runs this check again.`);
  process.exitCode = 1;
}
