"use client";

import { ArrowUpRight, Briefcase, Check, Code, Copy, Download, Globe, Mail, Phone } from "lucide-react";
import { useState } from "react";
import type { ContactLinkItem } from "../lib/portfolio-data";

const icons = {
  email: Mail,
  phone: Phone,
  linkedin: Briefcase,
  github: Code,
  website: Globe,
  resume: Download,
  other: ArrowUpRight,
} as const;

export function ContactSection({ links }: { links: ContactLinkItem[] }) {
  const [copied, setCopied] = useState(false);

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ul className="p-contact-grid" role="list">
      {links.map((item, index) => {
        const Icon = icons[item.kind];
        const external = item.href.startsWith("http://") || item.href.startsWith("https://");
        return (
          <li className="p-contact-item" key={`${item.kind}-${index}`}>
            <a
              className="p-contact-link"
              href={item.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
              <ArrowUpRight className="p-contact-arrow" size={14} aria-hidden="true" />
            </a>
            {item.copyValue && (
              <button
                type="button"
                className="p-copy-inline"
                aria-label={copied ? "Email copied" : `Copy ${item.copyValue}`}
                onClick={() => copyEmail(item.copyValue!)}
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
