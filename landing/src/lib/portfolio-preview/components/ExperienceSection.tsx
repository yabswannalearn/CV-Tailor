import type { PortfolioConfig } from "../data/types";
import { ImpactText } from "./ImpactText";

export function ExperienceSection({ entries }: { entries: PortfolioConfig["experience"] }) {
  return (
    <div className="p-entries">
      {entries.map((entry, index) => {
        const meta = [entry.dateRange, entry.location].filter((item) => item?.trim());
        const highlights = entry.highlights.filter((item) => item.trim());
        const primary = highlights.slice(0, 3);
        const overflow = highlights.slice(3);
        return (
          <article className="p-entry" key={`${entry.company}-${index}`}>
            <div className="p-entry-heading">
              <h3>{entry.jobTitle}</h3>
              <p className="p-organization">{entry.company}</p>
              {meta.length > 0 && <p className="p-meta">{meta.join(" · ")}</p>}
            </div>
            <div className="p-entry-body">
              {entry.summary?.trim() && (
                <p className="p-description">
                  <ImpactText text={entry.summary} />
                </p>
              )}
              {primary.length > 0 && (
                <ul className="p-highlights">
                  {primary.map((item, i) => (
                    <li key={i}>
                      <ImpactText text={item} />
                    </li>
                  ))}
                </ul>
              )}
              {overflow.length > 0 && (
                <details className="p-more">
                  <summary>
                    Show {overflow.length} more {overflow.length === 1 ? "highlight" : "highlights"}
                  </summary>
                  <ul className="p-highlights">
                    {overflow.map((item, i) => (
                      <li key={i}>
                        <ImpactText text={item} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
