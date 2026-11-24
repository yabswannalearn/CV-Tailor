"use client";

import { ArrowUpRight, Code } from "lucide-react";
import { useState } from "react";
import type { PortfolioConfig } from "../data/types";
import { filterProjectsByTag, getProjectTags } from "../lib/portfolio-data";
import { publicAsset, webLink } from "../lib/public-links";
import { ImpactText } from "./ImpactText";

export function ProjectsSection({ entries }: { entries: PortfolioConfig["projects"] }) {
  const tags = getProjectTags(entries);
  const [activeTag, setActiveTag] = useState("all");
  const visible = filterProjectsByTag(entries, activeTag);

  return (
    <div className="p-projects-wrap">
      {tags.length >= 2 && (
        <div className="p-filter-bar" role="group" aria-label="Filter projects by topic">
          <button
            type="button"
            className="p-filter-pill"
            aria-pressed={activeTag === "all"}
            onClick={() => setActiveTag("all")}
          >
            All <span className="p-filter-count">{entries.length}</span>
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="p-filter-pill"
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className="p-projects">
        {visible.map((project, index) => {
          const live = webLink(project.liveUrl);
          const repo = webLink(project.repoUrl);
          const image = publicAsset(project.imagePath);
          const meta = [project.role, project.dateRange].filter((item) => item?.trim());
          const highlights = (project.highlights ?? []).filter((item) => item.trim());
          const projectTags = [...new Set((project.tags ?? []).map((item) => item.trim()).filter(Boolean))];
          return (
            <article className="p-project" key={`${project.name}-${index}`}>
              <div className="p-project-heading">
                <span className="p-project-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{project.name}</h3>
                {meta.length > 0 && <p className="p-meta">{meta.join(" · ")}</p>}
              </div>
              <div className="p-project-body">
                {image && (
                  <div className="p-project-media">
                    <img className="p-project-image" src={image} alt={`${project.name} screenshot`} loading="lazy" />
                  </div>
                )}
                {project.tagline?.trim() && <p className="p-tagline">{project.tagline}</p>}
                {project.description?.trim() && (
                  <p className="p-description">
                    <ImpactText text={project.description} />
                  </p>
                )}
                {highlights.length > 0 && (
                  <ul className="p-highlights">
                    {highlights.map((item, i) => (
                      <li key={i}>
                        <ImpactText text={item} />
                      </li>
                    ))}
                  </ul>
                )}
                {projectTags.length > 0 && (
                  <ul className="p-tags" role="list">
                    {projectTags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                )}
                {(live || repo) && (
                  <div className="p-links">
                    {live && (
                      <a href={live} target="_blank" rel="noreferrer" aria-label={`Visit ${project.name}`}>
                        <ArrowUpRight size={15} aria-hidden="true" />
                        Live project
                      </a>
                    )}
                    {repo && (
                      <a href={repo} target="_blank" rel="noreferrer" aria-label={`View source for ${project.name}`}>
                        <Code size={15} aria-hidden="true" />
                        Source code
                      </a>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
