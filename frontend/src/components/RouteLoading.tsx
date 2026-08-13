"use client";

import { usePathname } from "next/navigation";

const block = "animate-pulse rounded-sm bg-[#ddd8d0]";

function Bars({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${block} h-10`} style={{ width: `${100 - index * 7}%` }} />
      ))}
    </div>
  );
}

function Cards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${block} h-28`} />
      ))}
    </div>
  );
}

export default function RouteLoading() {
  const pathname = usePathname();

  return (
    <div role="status" aria-label="Loading page" className="h-full overflow-hidden bg-[#f5f2ed] p-4 font-mono sm:p-8">
      <span className="sr-only">Loading…</span>
      {pathname === "/code" ? (
        <div className="grid h-full grid-cols-[minmax(180px,260px)_1fr] gap-4">
          <Bars count={7} />
          <div className={`${block} h-full`} />
        </div>
      ) : pathname === "/interview" ? (
        <div className="mx-auto max-w-2xl space-y-8">
          <div className={`${block} h-8 w-64`} />
          <Cards count={4} />
        </div>
      ) : pathname === "/generate" ? (
        <div className="mx-auto flex h-full max-w-5xl flex-col justify-center gap-6">
          <div className={`${block} h-9 w-72`} />
          <div className="grid gap-4 sm:grid-cols-2"><Bars count={4} /><div className={`${block} min-h-64`} /></div>
        </div>
      ) : pathname === "/tracker" ? (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className={`${block} h-9 w-56`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className={`${block} h-20`} />)}</div>
          <Bars count={5} />
        </div>
      ) : pathname === "/discover" ? (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className={`${block} h-9 w-72`} />
          <div className={`${block} h-36`} />
          <Cards count={4} />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className={`${block} h-9 w-60`} />
          <div className="grid gap-6 lg:grid-cols-[220px_1fr]"><Bars count={6} /><div className={`${block} h-[32rem]`} /></div>
        </div>
      )}
    </div>
  );
}
