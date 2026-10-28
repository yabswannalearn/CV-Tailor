import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFormatted } from "../src/lib/copyFormatted.ts";

test("copies bold HTML with clean plain text", async () => {
  let item: Record<string, Blob> | undefined;
  class FakeClipboardItem { constructor(data: Record<string, Blob>) { item = data; } }
  Object.defineProperty(globalThis, "ClipboardItem", { value: FakeClipboardItem, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { write: async () => {} } }, configurable: true });
  await copyFormatted({ innerHTML: "<p><strong>A bit about me:</strong> Hello</p>", innerText: "A bit about me: Hello" } as HTMLElement);
  assert.equal(await item?.["text/html"].text(), "<p><strong>A bit about me:</strong> Hello</p>");
  assert.equal(await item?.["text/plain"].text(), "A bit about me: Hello");
});

test("falls back to clean text if rich clipboard writing fails", async () => {
  let copied = "";
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: {
    write: async () => { throw new Error("Rich copy unsupported"); },
    writeText: async (text: string) => { copied = text; },
  } }, configurable: true });
  await copyFormatted({ innerHTML: "<strong>Heading</strong>", innerText: "Heading" } as HTMLElement);
  assert.equal(copied, "Heading");
});
