import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBlockText,
  escapeLatexText,
  formatEducationDetails,
  parseResumeBlocks,
  parseResumeDraft,
  replaceCommandArgument,
  replaceResumeItem,
  replaceResumeName,
  replaceSectionDetail,
  replaceSummary,
  resolveSelectionToBlocks,
} from "../src/lib/resumeDraft.ts";

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

const bulletDoc = String.raw`\section{Experience}
\resumeSubheading
  {AgentGenius AI}{Ontario, Canada}
  {AI Engineer}{2026}
  \resumeItemListStart
    \resumeItem{Architected end-to-end AI agent flows.}
  \resumeItemListEnd
\end{document}`;

test("escapes LaTeX specials so user text cannot break compilation", () => {
  assert.equal(escapeLatexText("Cut cost by 40% & saved $5K"), String.raw`Cut cost by 40\% \& saved \$5K`);
  assert.equal(escapeLatexText("snake_case #1"), String.raw`snake\_case \#1`);
  assert.equal(escapeLatexText("a\\b"), String.raw`a\textbackslash{}b`);
});

test("a bullet containing a percent sign survives the write/read round trip", () => {
  const text = "Cut cloud cost by 40% & saved $5K on infra_spend";
  const updated = replaceResumeItem(bulletDoc, 0, text);

  // A raw % would comment out the closing brace and break the Tectonic compile.
  assert.match(updated, /\\resumeItem\{Cut cloud cost by 40\\% \\& saved \\\$5K on infra\\_spend\}/);
  assert.equal(parseResumeDraft(updated).bullets[0], text);
});

test("all supported LaTeX specials survive a bullet write/read round trip", () => {
  const text = String.raw`C:\jobs\cv uses snake_case #1 at 40% & costs $5 ~ weekly ^ now`;
  const updated = replaceResumeItem(bulletDoc, 0, text);

  assert.match(updated, /\\textbackslash\{\}/);
  assert.match(updated, /\\textasciitilde\{\}/);
  assert.match(updated, /\\\^\{\}/);
  assert.equal(parseResumeDraft(updated).bullets[0], text);
});

test("name, summary, skills, and certification writers escape user text", () => {
  const nameDoc = String.raw`{\Huge \textbf{\textcolor{primaryColor}{OLD NAME}}}`;
  assert.match(replaceResumeName(nameDoc, "R&D #1"), /\\textcolor\{primaryColor\}\{R\\&D \\#1\}/);

  const summaryDoc = String.raw`\section{Summary}
\small{\color{textColor}Old summary.}
\vspace{-4pt}
\section{Experience}
\resumeItem{Kept bullet.}
\end{document}`;
  const summaryUpdated = replaceSummary(summaryDoc, "Saved 40% on R&D");
  assert.match(summaryUpdated, /\\small\{\\color\{textColor\}Saved 40\\% on R\\&D\}/);
  assert.match(summaryUpdated, /\\vspace\{-4pt\}/);
  assert.equal(parseResumeDraft(summaryUpdated).summary, "Saved 40% on R&D");

  const legacySummary = String.raw`\section{Summary}
{\small Old summary.\par}
\section{Experience}
\resumeItem{Kept bullet.}
\end{document}`;
  assert.equal(parseResumeDraft(replaceSummary(legacySummary, "Saved 25%")).summary, "Saved 25%");

  const detailDoc = String.raw`\section{Technical Skills}
\textbf{Languages}{: C++, snake_case} \\
\section{Certifications}
\item{Cloud #1}
\end{document}`;
  const skillsUpdated = replaceSectionDetail(detailDoc, "skills", 0, "C# & R&D");
  const certUpdated = replaceSectionDetail(skillsUpdated, "certifications", 0, "Cloud 100%_Ready");
  const parsed = parseResumeDraft(certUpdated);
  assert.equal(parsed.sections[0].details[0].value, "C# & R&D");
  assert.equal(parsed.sections[1].details[0].value, "Cloud 100%_Ready");
});

test("an escaped percent is not treated as the start of a LaTeX comment", () => {
  const doc = String.raw`\section{Experience}
\resumeItem{Improved uptime to 100\% across critical tasks}
\end{document}`;
  assert.equal(parseResumeDraft(doc).bullets[0], "Improved uptime to 100% across critical tasks");
});

test("a real LaTeX comment is still stripped", () => {
  const doc = String.raw`\section{Experience}
\resumeItem{Kept text} % trailing comment
\end{document}`;
  assert.equal(parseResumeDraft(doc).bullets[0], "Kept text");
});

// ── Blocks ───────────────────────────────────────────────────────────────────

const resume = String.raw`\begin{document}
%-----------SUMMARY-----------
\section{Summary}
\small{AI Product Engineer with proven experience shipping full-stack products from brief to production using AI-in-the-loop workflows.}
\vspace{-4pt}

%-----------EDUCATION-----------
\section{Education}
  \resumeSubHeadingListStart
    \resumeSubheading
      {Holy Angel University}{Angeles City, Philippines}
      {Bachelor of Science in Computer Engineering --- Dean's Lister}{}
  \resumeSubHeadingListEnd

%-----------EXPERIENCE-----------
\section{Experience}
  \resumeSubHeadingListStart
    \resumeSubheading
      {AgentGenius AI}{Ontario, Canada}
      {AI Engineer (Contractor)}{2026 - 2026}
      \resumeItemListStart
        \resumeItem{Architected end-to-end AI agent flows using Claude Code and n8n, streamlining data ingestion pipelines.}
        \resumeItem{Engineered AI-powered toolkits including Playwright-based automated QA and content engines.}
      \resumeItemListEnd

    \resumeSubheading
      {Parallaxx}{Auckland, New Zealand}
      {AI Developer - L1 Support Intern}{2025 - 2026}
      \resumeItemListStart
        \resumeItem{Designed and deployed an autonomous AI agent within a Docker environment, maintaining 100\% operational uptime.}
      \resumeItemListEnd
  \resumeSubHeadingListEnd

%-----------PROJECTS-----------
\section{Projects}
    \resumeSubHeadingListStart
      \resumeProjectHeading
          {\textbf{PXX Spark Autonomous Agent} $|$ \emph{n8n, Docker, Python, RLHF}}{\textbf{\small 2025 - 2026}}
          \resumeItemListStart
            \resumeItem{Architected an autonomous agent to handle complex orchestration tasks, leveraging n8n for workflow design.}
          \resumeItemListEnd
  \resumeSubHeadingListEnd

%-----------TECHNICAL SKILLS-----------
\section{Technical Skills}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     \textbf{AI Engineering \& LLMs}{: AI Agents, RAG Pipelines, Prompt Engineering} \\
     \textbf{Full-Stack Web Development}{: Next.js, FastAPI, TypeScript, Node.js} \\
    }}
 \end{itemize}
\end{document}`;

test("flattens every addressable piece into one ordered Block list", () => {
  const blocks = parseResumeBlocks(resume);

  assert.deepEqual(
    blocks.map(block => `${block.sectionName}/${block.kind}`),
    [
      "Summary/summary",
      "Education/heading",
      "Experience/heading",
      "Experience/bullet",
      "Experience/bullet",
      "Experience/heading",
      "Experience/bullet",
      "Projects/heading",
      "Projects/bullet",
      "Technical Skills/detail",
      "Technical Skills/detail",
    ],
  );
  assert.deepEqual(blocks.map(block => block.order), [...Array(11).keys()]);
});

test("bullets carry the entry they belong to, so a rewrite knows its source row", () => {
  const bullets = parseResumeBlocks(resume).filter(block => block.kind === "bullet");

  assert.equal(bullets[0].entryTitle, "AgentGenius AI");
  assert.equal(bullets[0].entrySubtitle, "AI Engineer (Contractor)");
  assert.equal(bullets[2].entryTitle, "Parallaxx");
  assert.equal(bullets[3].entryTitle, "PXX Spark Autonomous Agent");
});

test("headings are resolvable but never rewritable", () => {
  const headings = parseResumeBlocks(resume).filter(block => block.kind === "heading");
  assert.ok(headings.length > 0);
  assert.ok(headings.every(block => block.editable === false));
});

test("selecting the summary paragraph resolves to the summary Block alone", () => {
  const blocks = parseResumeBlocks(resume);
  const selection = "AI Product Engineer with proven experience shipping full-stack products from brief to production";

  assert.deepEqual(resolveSelectionToBlocks(blocks, selection).map(block => block.id), ["summary"]);
});

test("selecting one bullet resolves to that bullet only", () => {
  const blocks = parseResumeBlocks(resume);
  const selection = "Engineered AI-powered toolkits including Playwright-based automated QA";

  const resolved = resolveSelectionToBlocks(blocks, selection);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].kind, "bullet");
  assert.match(resolved[0].text, /Playwright-based automated QA/);
});

test("an escaped percent in the source matches the plain percent the PDF renders", () => {
  const blocks = parseResumeBlocks(resume);
  const selection = "maintaining 100% operational uptime";

  const resolved = resolveSelectionToBlocks(blocks, selection);
  assert.equal(resolved.length, 1);
  assert.match(resolved[0].text, /100% operational uptime/);
});

test("a selection spanning two bullets resolves to the contiguous run", () => {
  const blocks = parseResumeBlocks(resume);
  const selection = "Architected end-to-end AI agent flows using Claude Code and n8n, streamlining data ingestion pipelines. "
    + "Engineered AI-powered toolkits including Playwright-based automated QA and content engines.";

  const resolved = resolveSelectionToBlocks(blocks, selection);
  assert.equal(resolved.length, 2);
  assert.ok(resolved.every(block => block.kind === "bullet"));
});

test("a selection that runs past a Section boundary is clamped to the anchor Section", () => {
  const blocks = parseResumeBlocks(resume);
  const selection = "Designed and deployed an autonomous AI agent within a Docker environment. "
    + "Architected an autonomous agent to handle complex orchestration tasks, leveraging n8n for workflow design.";

  const resolved = resolveSelectionToBlocks(blocks, selection);
  assert.ok(resolved.length > 0);
  assert.deepEqual([...new Set(resolved.map(block => block.sectionName))], ["Experience"]);
});

test("an unmatchable selection resolves to nothing rather than guessing", () => {
  const blocks = parseResumeBlocks(resume);
  assert.deepEqual(resolveSelectionToBlocks(blocks, "quantum tunnelling through a cryogenic lattice"), []);
});

test("writing a Block back targets only that Block", () => {
  const blocks = parseResumeBlocks(resume);
  const target = blocks.find(block => block.kind === "bullet" && block.text.includes("Playwright"))!;
  const updated = applyBlockText(resume, target, "Rewrote the QA harness, cutting flake rate by 60%");

  assert.match(updated, /\\resumeItem\{Rewrote the QA harness, cutting flake rate by 60\\%\}/);
  assert.match(updated, /Architected end-to-end AI agent flows/);
  const after = parseResumeBlocks(updated);
  assert.equal(after.length, blocks.length);
  assert.equal(after[target.order].text, "Rewrote the QA harness, cutting flake rate by 60%");
});

test("writing a skills row keeps its category label", () => {
  const blocks = parseResumeBlocks(resume);
  const target = blocks.find(block => block.detailKind === "skills")!;

  assert.equal(target.label, "AI Engineering & LLMs");
  const updated = applyBlockText(resume, target, "AI Agents, RAG Pipelines, Evals");
  assert.match(updated, /\\textbf\{AI Engineering \\& LLMs\}\{: AI Agents, RAG Pipelines, Evals\}/);
});

test("near-identical bullets are separated by where the selection sits on the page", () => {
  const twins = String.raw`\section{Experience}
  \resumeSubheading{Alpha Corp}{Remote}{Engineer}{2024}
      \resumeItemListStart
        \resumeItem{Built RESTful APIs using Node.js and PostgreSQL for internal tooling.}
      \resumeItemListEnd
  \resumeSubheading{Beta Corp}{Remote}{Engineer}{2025}
      \resumeItemListStart
        \resumeItem{Built RESTful APIs using Node.js and PostgreSQL for internal tooling.}
      \resumeItemListEnd
\end{document}`;
  const blocks = parseResumeBlocks(twins);
  const selection = "Built RESTful APIs using Node.js and PostgreSQL for internal tooling.";

  const nearTop = resolveSelectionToBlocks(blocks, selection, 0);
  const nearBottom = resolveSelectionToBlocks(blocks, selection, 1);

  assert.equal(nearTop[0].bulletIndex, 0);
  assert.equal(nearBottom[nearBottom.length - 1].bulletIndex, 1);
});
