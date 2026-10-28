"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { copyFormatted } from "@/lib/copyFormatted";

export default function FormattedOutput({ content, copyLabel = "Copy" }: { content: string; copyLabel?: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    const element = contentRef.current;
    if (!element) return;
    try {
      await copyFormatted(element);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div>
      <div ref={contentRef} className="break-words [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold [&_a]:text-[#416e3c] [&_a]:underline [&_a]:underline-offset-2 [&_pre]:overflow-auto">
        <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
      </div>
      <button type="button" onClick={() => void copy()} className="mt-3 rounded-md border border-[#d7dfd2] px-3 py-1.5 text-xs font-semibold text-[#557442] hover:bg-[#eef5e8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#557442]">
        {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed — try selecting the text" : copyLabel}
      </button>
    </div>
  );
}
