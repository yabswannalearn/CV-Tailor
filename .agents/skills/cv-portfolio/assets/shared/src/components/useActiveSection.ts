"use client";

import { useEffect, useState } from "react";
import type { PortfolioSectionId } from "../data/types";

export function useActiveSection(sectionIds: PortfolioSectionId[]): PortfolioSectionId | undefined {
  const [active, setActive] = useState<PortfolioSectionId | undefined>(sectionIds[0]);

  useEffect(() => {
    if (!sectionIds.length) return;
    let frameId = 0;

    const update = () => {
      frameId = 0;
      const anchorLine = window.innerHeight * 0.38;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= anchorLine) {
          current = id;
        }
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    const schedule = () => {
      if (!frameId) frameId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sectionIds]);

  return active;
}
