import { tokenizeImpact } from "../lib/impact-text";

export function ImpactText({ text }: { text: string }) {
  const segments = tokenizeImpact(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.emphasize ? (
          <strong className="p-impact" key={index}>
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
