import React from 'react';

interface JobMatchScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const JobMatchScoreBadge: React.FC<JobMatchScoreBadgeProps> = ({ score, size = 'md' }) => {
   const getBadgeStyle = (val: number) => {
     if (val >= 80) return { color: "#3d6600", bg: "#e8f5c0", border: "#8ab030" };
     if (val >= 60) return { color: "#7a5a00", bg: "#fff8e0", border: "#f0d880" };
     return { color: "#8a2a2a", bg: "#ffeaea", border: "#f8b8b8" };
   };

   const sizeClasses = {
     sm: 'px-2 py-0.5 text-xs',
     md: 'px-2.5 py-1 text-sm',
     lg: 'px-3.5 py-1.5 text-base font-bold',
   }[size];

   const s = getBadgeStyle(score);

   return (
     <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses}`} style={{ color: s.color, background: s.bg, borderColor: s.border }}>
       <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
       {score}% Match
     </span>
   );
};
