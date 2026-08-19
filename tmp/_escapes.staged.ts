// LaTeX specials, in protect-then-strip order. Sentinels are private-use codepoints so they
// pass through latexText's command/brace stripping untouched.
const LATEX_ESCAPES: { literal: string; escaped: RegExp; sentinel: string }[] = [
  { literal: "\\", escaped: /\textbackslash\{\}/g, sentinel: "\uE000" },
  { literal: "~", escaped: /\textasciitilde\{\}/g, sentinel: "\uE001" },
  { literal: "^", escaped: /\\^\{\}/g, sentinel: "\uE002" },
  { literal: "%", escaped: /\%/g, sentinel: "\uE003" },
  { literal: "&", escaped: /\&/g, sentinel: "\uE004" },
  { literal: "$", escaped: /\\$/g, sentinel: "\uE005" },
  { literal: "#", escaped: /\#/g, sentinel: "\uE006" },
  { literal: "_", escaped: /\_/g, sentinel: "\uE007" },
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
    .replace(/\/g, "\textbackslash{}")
    .replace(/([%&$#_])/g, "\$1")
    .replace(/~/g, "\textasciitilde{}")
    .replace(/\^/g, "\^{}");
}

