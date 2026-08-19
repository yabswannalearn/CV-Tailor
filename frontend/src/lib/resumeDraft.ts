export type ResumeDraft = {
  name: string;
  summary: string;
  bullets: string[];
  sections: {
    name: string;
    bullets: { index: number; text: string }[];
    detailType: "skills" | "certifications" | null;
    details: { label: string; value: string; index: number }[];
    entries: {
      command: "resumeSubheading" | "resumeProjectHeading";
      occurrence: number;
      title: string;
      subtitle: string;
      meta: string;
      description: string;
      items: { index: number; text: string }[];
    }[];
  }[];
};

// LaTeX specials, in protect-then-strip order. Sentinels are private-use codepoints so they
// pass through latexText's command/brace stripping untouched.
const LATEX_ESCAPES: { literal: string; escaped: RegExp; sentinel: string }[] = [
  { literal: "\\", escaped: /\\textbackslash\{\}/g, sentinel: "\uE000" },
  { literal: "~", escaped: /\\textasciitilde\{\}/g, sentinel: "\uE001" },
  { literal: "^", escaped: /\\\^\{\}/g, sentinel: "\uE002" },
  { literal: "%", escaped: /\\%/g, sentinel: "\uE003" },
  { literal: "&", escaped: /\\&/g, sentinel: "\uE004" },
  { literal: "$", escaped: /\\\$/g, sentinel: "\uE005" },
  { literal: "#", escaped: /\\#/g, sentinel: "\uE006" },
  { literal: "_", escaped: /\\_/g, sentinel: "\uE007" },
];

function protectEscapes(value: string): string {
  return LATEX_ESCAPES.reduce((acc, entry) => acc.replace(entry.escaped, entry.sentinel), value);
}

function restoreEscapes(value: string): string {
  return LATEX_ESCAPES.reduce((acc, entry) => acc.split(entry.sentinel).join(entry.literal), value);
}

/** Turns plain user text into LaTeX-safe text. Mirrors `_escape_latex` in latex_assembly.py. */
export function escapeLatexText(value: string): string {
  return value
    .replace(/[{}]/g, "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([%&$#_])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\^{}");
}

function latexText(value: string | undefined | null): string {
  if (!value) return "";
  let clean = protectEscapes(value).replace(/%.*$/gm, "")
    .replace(/\\href\{[^{}]*\}\{([^{}]*)\}/g, "$1")
    .replace(/\$\|\$/g, "|")
    .replace(/\\vspace\*?\s*\{[^{}]*\}/g, "")
    .replace(/\\color\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:small|Huge|Large|large)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:small|smallskip|medskip|bigskip|Huge|Large|large|color)\b/g, "");
  for (let pass = 0; pass < 3; pass += 1) {
    clean = clean
      .replace(/\\(?:textbf|textit|emph)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\[a-zA-Z]+\*?(?:\[[^]]*\])?\s*(?:\{[^{}]*\})?/g, "");
  }
  return restoreEscapes(clean.replace(/\\\\/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

function commandArguments(code: string, command: string) {
  const result: { occurrence: number; args: string[]; start: number; end: number }[] = [];
  const pattern = new RegExp("\\\\" + command + "(?![A-Za-z])\\s*", "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    const beforeMatch = code.slice(Math.max(0, match.index - 20), match.index);
    if (/newcommand\s*\{\s*$/.test(beforeMatch)) continue;
    let cursor = match.index + match[0].length;
    const args: string[] = [];
    const commandStart = match.index;
    while (cursor < code.length) {
      while (/\s/.test(code[cursor] || "")) cursor += 1;
      if (code[cursor] !== "{") break;
      let depth = 0;
      const start = cursor + 1;
      for (; cursor < code.length; cursor += 1) {
        if (code[cursor] === "{") depth += 1;
        if (code[cursor] === "}") depth -= 1;
        if (depth === 0) break;
      }
      args.push(code.slice(start, cursor));
      cursor += 1;
    }
    result.push({ occurrence: result.length, args, start: commandStart, end: cursor });
  }
  return result;
}

function replaceParsedCommandArgument(
  code: string,
  command: string,
  occurrence: number,
  argIndex: number,
  value: string,
  escape = true,
) {
  const target = commandArguments(code, command)[occurrence];
  if (!target) return code;
  const prefix = new RegExp("^\\\\" + command + "(?![A-Za-z])\\s*").exec(code.slice(target.start))?.[0] || "";
  let cursor = target.start + prefix.length;
  let start = -1;
  let end = -1;
  for (let index = 0; index <= argIndex; index += 1) {
    while (code[cursor] !== "{" && cursor < code.length) cursor += 1;
    if (cursor >= code.length) return code;
    start = cursor + 1;
    let depth = 1;
    cursor += 1;
    while (depth > 0 && cursor < code.length) {
      if (code[cursor] === "{") depth += 1;
      if (code[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth !== 0) return code;
    end = cursor - 1;
  }
  const replacement = escape ? escapeLatexText(value) : value;
  return start >= 0 ? code.slice(0, start) + replacement + code.slice(end) : code;
}

export function replaceCommandArgument(code: string, command: string, occurrence: number, argIndex: number, value: string) {
  return replaceParsedCommandArgument(code, command, occurrence, argIndex, value);
}

export function parseResumeDraft(code: string): ResumeDraft {
  const nameMatch = code.match(/\\textcolor\{[^}]+\}\{([^{}]+)\}/) || code.match(/\\Huge\s*\{?([^{}\\]+)\}?/i);
  const summaryMatch = code.match(/\\section\*?\{[^{}]*(?:Summary|Profile|Objective)[^{}]*\}([\s\S]*?)(?=\\section|\\end\{document\})/i);
  const bulletMatches = commandArguments(code, "resumeItem");
  const bullets = bulletMatches.map(match => latexText(match.args[0]));
  const sections = Array.from(code.matchAll(/\\section\{([^{}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/gi))
    .map(match => {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const subheadings = commandArguments(code, "resumeSubheading").filter(entry => entry.start >= start && entry.start <= end);
      const projectHeadings = commandArguments(code, "resumeProjectHeading").filter(entry => entry.start >= start && entry.start <= end);
      const normalizedName = match[1].trim().toLowerCase();
      const isEducation = normalizedName === "education";
      const rawEntries = [
        ...subheadings.map(entry => {
          const subtitle = latexText(entry.args[2] || "");
          const separator = isEducation ? subtitle.match(/\s+(?:---|—)\s+/) : null;
          const separatorIndex = separator?.index ?? -1;
          return {
            command: "resumeSubheading" as const,
            occurrence: entry.occurrence,
            title: latexText(entry.args[0] || ""),
            subtitle: separatorIndex >= 0 ? subtitle.slice(0, separatorIndex).trim() : subtitle,
            meta: isEducation
              ? latexText(entry.args[1] || "")
              : [latexText(entry.args[1] || ""), latexText(entry.args[3] || "")].filter(Boolean).join(" · "),
            description: separatorIndex >= 0
              ? subtitle.slice(separatorIndex + (separator?.[0].length ?? 0)).trim()
              : "",
            start: entry.start,
          };
        }),
        ...projectHeadings.map(entry => ({
          command: "resumeProjectHeading" as const,
          occurrence: entry.occurrence,
          title: latexText((entry.args[0] || "").split("$|$")[0]),
          subtitle: latexText((entry.args[0] || "").split("$|$")[1] || ""),
          meta: latexText(entry.args[1] || ""),
          description: "",
          start: entry.start,
        })),
      ].sort((a, b) => a.start - b.start);
      const detailType = normalizedName === "technical skills" ? "skills" as const : normalizedName === "certifications" ? "certifications" as const : null;
      const details = detailType === "skills"
        ? commandArguments(code, "textbf")
          .filter(skill => skill.start >= start && skill.start <= end && /^\s*:/.test(skill.args[1] || ""))
          .map((skill, index) => ({ label: latexText(skill.args[0]), value: latexText((skill.args[1] || "").replace(/^\s*:\s*/, "")), index }))
        : detailType === "certifications"
          ? commandArguments(code, "item")
            .filter(cert => cert.start >= start && cert.start <= end && cert.args.length > 0)
            .map((cert, index) => ({ label: "Certifications", value: latexText(cert.args[0]), index }))
          : [];
      return {
        name: match[1].trim(),
        detailType,
        details,
        bullets: bulletMatches
          .map((bullet, index) => ({ index, text: latexText(bullet.args[0]), position: bullet.start }))
          .filter(bullet => bullet.position >= start && bullet.position <= end)
          .map(({ index, text }) => ({ index, text })),
        entries: rawEntries.map((entry, index) => {
          const nextStart = rawEntries[index + 1]?.start ?? end;
          return {
            ...entry,
            items: bulletMatches
              .map((bullet, bulletIndex) => ({ index: bulletIndex, text: latexText(bullet.args[0]), position: bullet.start }))
              .filter(bullet => bullet.position > entry.start && bullet.position < nextStart)
              .map(({ index: bulletIndex, text }) => ({ index: bulletIndex, text })),
          };
        }),
      };
    });
  return {
    name: nameMatch?.[1] || "Your name",
    summary: summaryMatch ? latexText(summaryMatch[1]) : "",
    bullets,
    sections,
  };
}

export function formatEducationDetails(course: string, description: string) {
  return [course.trim(), description.trim()].filter(Boolean).join(" --- ");
}

export function replaceFirst(code: string, pattern: RegExp, replacement: string) {
  return code.replace(pattern, replacement);
}

export function replaceResumeItem(code: string, index: number, value: string) {
  return replaceCommandArgument(code, "resumeItem", index, 0, value);
}

export function replaceNthMatch(code: string, pattern: RegExp, index: number, replacement: string | ((full: string) => string)) {
  let seen = -1;
  return code.replace(pattern, (full) => {
    seen += 1;
    return seen === index ? (typeof replacement === "function" ? replacement(full) : replacement) : full;
  });
}

const SUMMARY_SECTION = /\\section\*?\{[^{}]*(?:Summary|Profile|Objective)[^{}]*\}[\s\S]*?(?=\\section|\\end\{document\})/i;

export function replaceSummary(code: string, value: string) {
  const section = SUMMARY_SECTION.exec(code);
  if (!section || section.index === undefined) return code;
  const sectionEnd = section.index + section[0].length;
  const small = commandArguments(code, "small").find(command => command.start >= section.index! && command.start < sectionEnd && command.args.length);
  if (small) {
    const stylePrefix = small.args[0].match(/^\s*(\\color\{[^{}]*\}\s*)/)?.[1] || "";
    return replaceParsedCommandArgument(code, "small", small.occurrence, 0, stylePrefix + escapeLatexText(value), false);
  }

  // Also support the declaration form produced by older editor builds:
  // {\small Summary text\par}
  const declaration = /(\{\s*\\small\b\s*(?:\\color\{[^{}]*\}\s*)?)([\s\S]*?)(\\par\s*\})/;
  if (!declaration.test(section[0])) return code;
  const updated = section[0].replace(declaration, (_full, before: string, _current: string, after: string) => (
    `${before}${escapeLatexText(value)}${after}`
  ));
  return code.slice(0, section.index) + updated + code.slice(sectionEnd);
}

export function replaceResumeName(code: string, value: string) {
  const escaped = escapeLatexText(value);
  if (/\\textcolor\{[^}]+\}\{([^{}]+)\}/.test(code)) {
    return code.replace(/\\textcolor\{([^}]+)\}\{([^{}]+)\}/, (_full, color: string) => `\\textcolor{${color}}{${escaped}}`);
  }
  return code.replace(/(\\Huge\s*\{?)[^{}\\]+(\}?)/i, (_full, before: string, after: string) => `${before}${escaped}${after}`);
}

export function replaceSectionDetail(code: string, detailType: "skills" | "certifications", index: number, value: string) {
  if (detailType === "skills") {
    const skills = Array.from(code.matchAll(/\\section\{([^{}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/gi))
      .find(section => section[1].trim().toLowerCase() === "technical skills");
    if (!skills || skills.index === undefined) return code;
    const end = skills.index + skills[0].length;
    const target = commandArguments(code, "textbf")
      .filter(command => command.start >= skills.index! && command.start < end && /^\s*:/.test(command.args[1] || ""))[index];
    return target ? replaceParsedCommandArgument(code, "textbf", target.occurrence, 1, `: ${escapeLatexText(value)}`, false) : code;
  }
  const certifications = Array.from(code.matchAll(/\\section\{([^{}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/gi))
    .find(section => section[1].trim().toLowerCase() === "certifications");
  if (!certifications || certifications.index === undefined) return code;
  const end = certifications.index + certifications[0].length;
  const target = commandArguments(code, "item")
    .filter(command => command.start >= certifications.index! && command.start < end && command.args.length)[index];
  return target ? replaceCommandArgument(code, "item", target.occurrence, 0, value) : code;
}

// ── Blocks ───────────────────────────────────────────────────────────────────
// A Block is the smallest independently regenerable piece of a resume. Blocks
// flatten parseResumeDraft's three disjoint address spaces (bullets by global
// \resumeItem index, entries by command occurrence, details by index) into one
// list with a single document order, which is what Spot Edits address.

export type BlockKind = "summary" | "bullet" | "detail" | "heading";

export type ResumeBlock = {
  id: string;
  kind: BlockKind;
  sectionName: string;
  /** The rewritable payload. For skills details this is the value, not the category label. */
  text: string;
  /** Skills category for detail blocks; empty otherwise. Matched against, never rewritten. */
  label: string;
  position: number;
  order: number;
  /** Headings carry facts (company, title, dates) and are resolvable but not rewritable. */
  editable: boolean;
  bulletIndex?: number;
  detailKind?: "skills" | "certifications";
  detailIndex?: number;
  entryTitle?: string;
  entrySubtitle?: string;
};

type RawBlock = Omit<ResumeBlock, "order">;

export function parseResumeBlocks(code: string): ResumeBlock[] {
  const bulletMatches = commandArguments(code, "resumeItem");
  const blocks: RawBlock[] = [];

  for (const sectionMatch of code.matchAll(/\\section\{([^{}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/gi)) {
    const sectionStart = sectionMatch.index ?? 0;
    const sectionEnd = sectionStart + sectionMatch[0].length;
    const sectionName = sectionMatch[1].trim();
    const body = sectionMatch[2];
    const normalized = sectionName.toLowerCase();

    if (/^(summary|profile|objective)$/.test(normalized)) {
      const text = latexText(body);
      if (text) blocks.push({ id: "summary", kind: "summary", sectionName, text, label: "", position: sectionStart, editable: true });
      continue;
    }

    const entries = [
      ...commandArguments(code, "resumeSubheading")
        .filter(entry => entry.start >= sectionStart && entry.start <= sectionEnd)
        .map(entry => ({
          start: entry.start,
          occurrence: entry.occurrence,
          command: "resumeSubheading" as const,
          title: latexText(entry.args[0] || ""),
          subtitle: latexText(entry.args[2] || ""),
        })),
      ...commandArguments(code, "resumeProjectHeading")
        .filter(entry => entry.start >= sectionStart && entry.start <= sectionEnd)
        .map(entry => ({
          start: entry.start,
          occurrence: entry.occurrence,
          command: "resumeProjectHeading" as const,
          title: latexText((entry.args[0] || "").split("$|$")[0]),
          subtitle: latexText((entry.args[0] || "").split("$|$")[1] || ""),
        })),
    ].sort((a, b) => a.start - b.start);

    for (const entry of entries) {
      blocks.push({
        id: `heading:${entry.command}:${entry.occurrence}`,
        kind: "heading",
        sectionName,
        text: [entry.title, entry.subtitle].filter(Boolean).join(" — "),
        label: "",
        position: entry.start,
        editable: false,
        entryTitle: entry.title,
        entrySubtitle: entry.subtitle,
      });
    }

    bulletMatches.forEach((bullet, index) => {
      const position = bullet.start;
      if (position < sectionStart || position > sectionEnd) return;
      const owner = [...entries].reverse().find(entry => entry.start < position);
      blocks.push({
        id: `bullet:${index}`,
        kind: "bullet",
        sectionName,
        text: latexText(bullet.args[0]),
        label: "",
        position,
        editable: true,
        bulletIndex: index,
        entryTitle: owner?.title,
        entrySubtitle: owner?.subtitle,
      });
    });

    if (normalized === "technical skills") {
      commandArguments(code, "textbf")
        .filter(skill => skill.start >= sectionStart && skill.start < sectionEnd && /^\s*:/.test(skill.args[1] || ""))
        .forEach((skill, index) => {
          blocks.push({
            id: `detail:skills:${index}`,
            kind: "detail",
            sectionName,
            text: latexText((skill.args[1] || "").replace(/^\s*:\s*/, "")),
            label: latexText(skill.args[0]),
            position: skill.start,
            editable: true,
            detailKind: "skills",
            detailIndex: index,
          });
        });
    } else if (normalized === "certifications") {
      commandArguments(code, "item")
        .filter(cert => cert.start >= sectionStart && cert.start < sectionEnd && cert.args.length)
        .forEach((cert, index) => {
          blocks.push({
            id: `detail:certifications:${index}`,
            kind: "detail",
            sectionName,
            text: latexText(cert.args[0]),
            label: "",
            position: cert.start,
            editable: true,
            detailKind: "certifications",
            detailIndex: index,
          });
        });
    }
  }

  return blocks
    .sort((a, b) => a.position - b.position)
    .map((block, order) => ({ ...block, order }));
}

export function applyBlockText(code: string, block: ResumeBlock, value: string): string {
  if (block.kind === "summary") return replaceSummary(code, value);
  if (block.kind === "bullet" && block.bulletIndex !== undefined) return replaceResumeItem(code, block.bulletIndex, value);
  if (block.kind === "detail" && block.detailIndex !== undefined) {
    return block.detailKind ? replaceSectionDetail(code, block.detailKind, block.detailIndex, value) : code;
  }
  return code;
}

// ── Selection → Blocks ───────────────────────────────────────────────────────
// The PDF text layer gives us a rendered string; Blocks give us ~20-40 candidate
// strings. Matching is bigram containment over a bounded candidate set, not a
// document search. See docs/adr/0001.

const EDGE_TOKENS = 10;
const MIN_SCORE = 0.34;
const POSITION_WEIGHT = 0.15;

function matchTokens(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized ? normalized.split(" ") : [];
}

function bigrams(list: string[]): Set<string> {
  if (list.length <= 1) return new Set(list);
  const out = new Set<string>();
  for (let index = 0; index < list.length - 1; index += 1) out.add(`${list[index]} ${list[index + 1]}`);
  return out;
}

function containment(probe: Set<string>, candidate: Set<string>): number {
  if (!probe.size || !candidate.size) return 0;
  let shared = 0;
  probe.forEach(gram => { if (candidate.has(gram)) shared += 1; });
  return shared / Math.min(probe.size, candidate.size);
}

function blockMatchText(block: ResumeBlock): string {
  return [block.label, block.text].filter(Boolean).join(" ");
}

/**
 * `hintRatio` is how far down the page the selection sits (0 = top, 1 = bottom).
 * Blocks have no PDF coordinates, so this compares against the block's relative
 * position in document order — monotonic with vertical position, not exact.
 * It only ever breaks ties between near-identical Blocks.
 */
function bestBlock(blocks: ResumeBlock[], tokens: string[], hintRatio?: number): ResumeBlock | null {
  const probe = bigrams(tokens);
  const span = Math.max(1, blocks.length - 1);
  let best: ResumeBlock | null = null;
  let bestScore = 0;

  for (const block of blocks) {
    const score = containment(probe, bigrams(matchTokens(blockMatchText(block))));
    if (score < MIN_SCORE) continue;
    const penalty = hintRatio === undefined ? 0 : Math.abs(block.order / span - hintRatio) * POSITION_WEIGHT;
    const adjusted = score - penalty;
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = block;
    }
  }
  return best;
}

export function resolveSelectionToBlocks(
  blocks: ResumeBlock[],
  selection: string,
  hintRatio?: number,
  maxBlocks = 6,
): ResumeBlock[] {
  const tokens = matchTokens(selection);
  if (tokens.length < 2 || !blocks.length) return [];

  const head = bestBlock(blocks, tokens.slice(0, EDGE_TOKENS), hintRatio);
  const tail = bestBlock(blocks, tokens.slice(-EDGE_TOKENS), hintRatio);
  const anchor = head || tail;
  if (!anchor) return [];

  const other = tail || head || anchor;
  const from = Math.min(anchor.order, other.order);
  const to = Math.max(anchor.order, other.order);

  return blocks
    .filter(block => block.order >= from && block.order <= to && block.sectionName === anchor.sectionName)
    .slice(0, maxBlocks);
}
