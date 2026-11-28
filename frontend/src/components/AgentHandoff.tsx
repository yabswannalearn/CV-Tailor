"use client";

import { useState } from "react";
import { useWorkspace, useTrackerJobs } from "@/lib/queries";
import { toast } from "sonner";

const tasks = [
  ["resume", "Tailor a resume", "cv-resume"],
  ["resume_edit", "Edit resume blocks", "cv-resume-edit"],
  ["cover_letter", "Write a cover letter", "cv-cover-letter"],
  ["application_form", "Assist with application", "cv-apply"],
  ["job_fit", "Assess job fit", "cv-job-fit"],
  ["research", "Research the company", "cv-company-research"],
  ["interview_plan", "Prepare for an interview", "cv-interview"],
  ["interview_feedback", "Review an interview answer", "cv-interview"],
  ["cheat_sheet", "Create a cheat sheet", "cv-interview"],
  ["code_review", "Review a coding solution", "cv-code-practice"],
  ["code_problems", "Create coding exercises", "cv-code-practice"],
  ["portfolio", "Build or update my web portfolio", "cv-portfolio"],
  ["profile", "Import or update my profile", "cv-profile"],
];

export default function AgentHandoff() {
  const { data: workspace } = useWorkspace();
  const { data: applications = [] } = useTrackerJobs();
  const [task, setTask] = useState("resume");
  const [application, setApplication] = useState("");
  const copy = async () => {
    const selected = tasks.find(item => item[0] === task)!;
    const target = application ? ` --application ${application}` : "";
    const formInstructions = task === "application_form" ? "\nUse your supported browser/computer tools to inspect and fill the employer form. Let me select the resume and cover-letter drafts if they are not already specified. Preserve my existing values, save form checkpoints, verify values read back from the live form, and leave final submission to me. If browser access is unavailable, prepare copyable answers and report that nothing was filled. Do not mark Applied until I explicitly confirm submission." : "";
    const prompt = task === "portfolio"
      ? `Use the cv-portfolio skill in this CV Tailor checkout. Every command must target the workspace directory ${JSON.stringify(workspace?.data_dir)} using --data-dir with platform-appropriate quoting. Build or update my web portfolio.\nRun: cv-tailor --json preferences get && cv-tailor --json profile get\nAsk me where to place the portfolio directory outside the CV Tailor checkout, help me choose a Portfolio Design and frontend stack (defaulting to Next.js static export, with Vite + React or other options explained with trade-offs), review what profile details stay private, verify the local build and static SEO, save my portfolio_preference, and prepare deploy-wizard.mjs for me to run locally.\nAdditional instructions: `
      : `Use the ${selected[2]} skill in this CV Tailor checkout. Every command must target the workspace directory ${JSON.stringify(workspace?.data_dir)} using --data-dir with platform-appropriate quoting. ${selected[1]}.\nRun: cv-tailor --json context export --task ${task}${target}\nUse only confirmed profile facts and my explicit statements as personal evidence. Ask for missing information. Follow the output schema and the skill's save commands. Save the result to my local workspace so I can review it in the dashboard. Applying a document is a separate action.${formInstructions}\nAdditional instructions: `;
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied. Paste it into your CLI agent in the CV Tailor repository.");
    } catch {
      toast.error("Clipboard access failed. Run cv-tailor context export in your terminal.");
    }
  };
  if (!workspace) return null;
  return (
    <details className="shrink-0 border-b border-stone-300 bg-stone-100 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {workspace.ai.mode === "external" ? "Work with your CLI agent" : "CLI agent handoff"}
        <span className="ml-2 font-normal text-stone-600">Local data · no CV Tailor AI API key required</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label>Task <select aria-label="Agent task" className="rounded border bg-white p-2" value={task} onChange={e => setTask(e.target.value)}>
          {tasks.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Application <select aria-label="Agent application" className="rounded border bg-white p-2" value={application} onChange={e => setApplication(e.target.value)}>
          <option value="">General workspace</option>
          {applications.map(job => <option key={job.id} value={job.id}>{job.job_title} · {job.company_name}</option>)}
        </select></label>
        <button disabled={task === "application_form" && !application} onClick={() => void copy()} className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-40">Copy agent prompt</button>
        <p className="w-full text-stone-600">{task === "application_form" ? "Choose an application, then paste the prompt into your browser-capable local agent. It helps fill the form; you review and submit." : "Paste the prompt into your agent. Saved drafts appear here automatically. Review them before applying."}</p>
      </div>
    </details>
  );
}
