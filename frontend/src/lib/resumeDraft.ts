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

function latexText(value: string | undefined | null): string {
  if (!value) return "";
  let clean = value.replace(/%.*$/gm, "")
    .replace(/\\href\{[^{}]*\}\{([^{}]*)\}/g, "$1")
    .replace(/\$\|\$/g, "|")
    .replace(/\\vspace\*?\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:small|Huge|Large|large|color)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:small|smallskip|medskip|bigskip|Huge|Large|large|color)\b/g, "");
  for (let pass = 0; pass < 3; pass += 1) {
    clean = clean
      .replace(/\\(?:textbf|textit|emph)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\[a-zA-Z]+\*?(?:\[[^]]*\])?\s*(?:\{[^{}]*\})?/g, "");
  }
  return clean.replace(/\\\\/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function commandArguments(code: string, command: string) {
  const result: { occurrence: number; args: string[]; start: number; end: number }[] = [];
  const pattern = new RegExp("\\\\?" + command + "\\s*", "g");
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

export function replaceCommandArgument(code: string, command: string, occurrence: number, argIndex: number, value: string) {
  const target = commandArguments(code, command)[occurrence];
  if (!target) return code;
  const prefix = new RegExp("^\\\\?" + command + "\\s*").exec(code.slice(target.start))?.[0] || "";
  let cursor = target.start + prefix.length;
  let start = -1;
  let end = -1;
  for (let index = 0; index <= argIndex; index += 1) {
    while (code[cursor] !== "{" && cursor < code.length) cursor += 1;
    start = cursor + 1;
    let depth = 1;
    cursor += 1;
    while (depth > 0 && cursor < code.length) {
      if (code[cursor] === "{") depth += 1;
      if (code[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    end = cursor - 1;
  }
  return start >= 0 ? code.slice(0, start) + value.replace(/[{}]/g, "") + code.slice(end) : code;
}

export function parseResumeDraft(code: string): ResumeDraft {
  const nameMatch = code.match(/\\textcolor\{[^}]+\}\{([^{}]+)\}/) || code.match(/\\Huge\s*\{?([^{}\\]+)\}?/i);
  const summaryMatch = code.match(/\\section\*?\{[^{}]*(?:Summary|Profile|Objective)[^{}]*\}([\s\S]*?)(?=\\section|\\end\{document\})/i);
  const bulletMatches = Array.from(code.matchAll(/\\resumeItem\{([^{}]*)\}/g));
  const bullets = bulletMatches.map(m => latexText(m[1]));
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
      const sectionBody = match[2];
      const details = detailType === "skills"
        ? Array.from(sectionBody.matchAll(/\\textbf\{([^{}]*)\}\{\s*:\s*([^{}]*)\}/g)).map((skill, index) => ({ label: latexText(skill[1]), value: latexText(skill[2]), index }))
        : detailType === "certifications"
          ? Array.from(sectionBody.matchAll(/\\item\{([^{}]*)\}/g)).map((cert, index) => ({ label: "Certifications", value: latexText(cert[1]), index }))
          : [];
      return {
        name: match[1].trim(),
        detailType,
        details,
        bullets: bulletMatches
          .map((bullet, index) => ({ index, text: latexText(bullet[1]), position: bullet.index ?? 0 }))
          .filter(bullet => bullet.position >= start && bullet.position <= end)
          .map(({ index, text }) => ({ index, text })),
        entries: rawEntries.map((entry, index) => {
          const nextStart = rawEntries[index + 1]?.start ?? end;
          return {
            ...entry,
            items: bulletMatches
              .map((bullet, bulletIndex) => ({ index: bulletIndex, text: latexText(bullet[1]), position: bullet.index ?? 0 }))
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
  let seen = -1;
  return code.replace(/\\resumeItem\{([^{}]*)\}/g, (full) => {
    seen += 1;
    return seen === index ? `\\resumeItem{${value.replace(/[{}]/g, "")}}` : full;
  });
}

export function replaceNthMatch(code: string, pattern: RegExp, index: number, replacement: string | ((full: string) => string)) {
  let seen = -1;
  return code.replace(pattern, (full) => {
    seen += 1;
    return seen === index ? (typeof replacement === "function" ? replacement(full) : replacement) : full;
  });
}
