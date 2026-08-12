type InlineQueryErrorProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

export default function InlineQueryError({ message, onRetry, retryLabel = "Try again" }: InlineQueryErrorProps) {
  return (
    <div role="alert" className="rounded-sm border border-[#e8aaaa] bg-[#fff0f0] px-5 py-4 font-mono text-sm text-[#7d2525]">
      <p>{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 rounded-sm border border-[#b83030] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:bg-[#ffe1e1]">
        {retryLabel}
      </button>
    </div>
  );
}
