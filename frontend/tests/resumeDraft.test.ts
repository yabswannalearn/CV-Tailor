import test from "node:test";
import assert from "node:assert/strict";
import { formatEducationDetails, parseResumeDraft, replaceCommandArgument } from "../src/lib/resumeDraft.ts";

const multilineEducation = String.raw`\section{Education}
\resumeSubheading
  {Holy Angel University}{Angeles City, Philippines}
  {Bachelor of Science in Computer Engineering --- Dean's Lister, President's Lister}{}
\end{document}`;

test("parses multiline education degree and description into friendly-editor fields", () => {
  const education = parseResumeDraft(multilineEducation).sections[0];
  const entry = education.entries[0];

  assert.equal(entry.title, "Holy Angel University");
  assert.equal(entry.subtitle, "Bachelor of Science in Computer Engineering");
  assert.equal(entry.meta, "Angeles City, Philippines");
  assert.equal(entry.description, "Dean's Lister, President's Lister");
});

test("keeps degree and description editable in a multiline subheading", () => {
  const updated = replaceCommandArgument(
    multilineEducation,
    "resumeSubheading",
    0,
    2,
    formatEducationDetails("Bachelor of Engineering", "With honors"),
  );

  assert.match(updated, /\{Bachelor of Engineering --- With honors\}\{\}/);
  const entry = parseResumeDraft(updated).sections[0].entries[0];
  assert.equal(entry.subtitle, "Bachelor of Engineering");
  assert.equal(entry.description, "With honors");
});
