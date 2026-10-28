/** Copy the rendered content in rich and plain formats, falling back to plain text. */
export async function copyFormatted(element: HTMLElement): Promise<void> {
  const text = element.innerText;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([element.innerHTML], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      })]);
      return;
    } catch {
      // Some browsers reject rich clipboard writes even when the API exists.
    }
  }
  await navigator.clipboard.writeText(text);
}
