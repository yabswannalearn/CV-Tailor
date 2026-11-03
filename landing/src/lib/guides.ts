export type Guide = {
  slug: string;
  label: string;
  title: string;
  heading: string;
  description: string;
  introduction: string;
  sections: { heading: string; paragraphs: string[]; steps?: string[]; code?: string; prompt?: string }[];
};

export const guides: Guide[] = [
  {
    slug: "ai-resume-builder",
    label: "Resume guide",
    title: "Open-Source AI Resume Builder: One-Page CVs | CV Tailor",
    heading: "How to tailor a one-page resume with your AI agent",
    description: "Use CV Tailor to turn confirmed experience into a tailored one-page resume. Learn how drafts, templates, PDF export, and ATS formatting checks work.",
    introduction: "CV Tailor is an open-source AI resume builder that works with your own agent and a local career profile. Start with your real experience, add a job description, and review a tailored one-page CV before exporting it.",
    sections: [
      {
        heading: "How does AI resume tailoring work in CV Tailor?",
        paragraphs: ["Your saved profile supplies your experience, education, projects, and confirmed skills. A job description provides the role’s requirements. Your agent uses both to suggest relevant wording and emphasis, then saves a draft for your review.", "Tailoring can reword and prioritize your experience. It should preserve your facts: a skill you have not confirmed, an invented achievement, or a guessed number does not belong in your resume."],
        steps: ["Install CV Tailor and ask your agent to import your existing CV.", "Review the extracted profile and confirm the skills you actually have.", "Supply a job description or posting URL and review the job details.", "Ask for a tailored resume draft, choose a visual template, and review the result.", "Resolve any overflow or formatting warnings before applying or exporting the PDF."],
        prompt: "Use cv-resume. Tailor my CV for this job using my confirmed experience. Save a draft, check the page count, and run the ATS check. Ask me about missing facts instead of guessing.",
      },
      {
        heading: "What does the ATS check verify?",
        paragraphs: ["The ATS check extracts text from the generated PDF and checks for selectable text, conventional section headings, and the expected section order. Applying or exporting a generated resume PDF requires exactly one page; an overflowing draft remains available to review and shorten.", "These are document-format checks. They do not reproduce an employer’s applicant tracking system, calculate a match score, or guarantee an interview. Review the content against the actual role requirements as well as the formatting."],
      },
      {
        heading: "Can I revise one bullet without rewriting my CV?",
        paragraphs: ["Yes. Ask your agent to use cv-resume-edit for a specific summary or selected bullets. Keep the request narrow and identify the facts to preserve. Earlier drafts remain available, and applying a reviewed draft makes it the current application document.", "The optional local dashboard also includes a CV editor and PDF preview. It shares the CLI’s saved workspace, so the visual interface is optional rather than a separate account."],
      },
      {
        heading: "Is the resume builder free?",
        paragraphs: ["CV Tailor is free software under the MIT license. It has no CV Tailor account or subscription. Your chosen AI agent or provider may charge for its own service; optional API-powered features require provider credentials. Profile and application records are stored locally, while your provider may process the context you share."],
      },
    ],
  },
  {
    slug: "local-job-application-tracker",
    label: "Tracking guide",
    title: "Local Job Application Tracker & Your Data | CV Tailor",
    heading: "Track job applications in a local, open-source workspace",
    description: "Keep job applications, statuses, resume drafts, and interview preparation in a local SQLite workspace, with optional publishing to your notes or spreadsheet.",
    introduction: "CV Tailor is a local job application tracker that keeps your job records, statuses, and saved documents in a SQLite database on your computer. Use the CLI through your agent, or install the optional dashboard to review your search visually.",
    sections: [
      {
        heading: "What can I keep with each application?",
        paragraphs: ["A tracked application brings the role and job description together with its status, saved CV and cover-letter drafts, company research, and interview preparation. Your agent can load that context in a later session instead of starting from an empty conversation.", "For example, ask for applications at the interview stage and their next steps. Review the saved role and documents before making changes. Keeping one record per application helps you distinguish different roles at the same company."],
        prompt: "Use cv-tracker. Show my applications at the interview stage, including their saved documents and next steps. Ask me about any missing follow-up details.",
      },
      {
        heading: "Where is my application data stored?",
        paragraphs: ["The default workspace is ~/.cv-tailor, outside the repository checkout. It persists between sessions and is shared by the CLI and optional dashboard. You can select a different workspace with --data-dir or CV_TAILOR_HOME; use the same selection consistently.", "CV Tailor does not require a hosted account or PostgreSQL server. Local storage does not make every AI interaction offline: your chosen agent or provider may receive the context you share. Back up your workspace as part of your normal computer backup routine."],
      },
      {
        heading: "Can I use Notion, Google Sheets, or Obsidian too?",
        paragraphs: ["Yes. The cv-connect skill guides optional setup for Obsidian, Notion, Google Sheets, Airtable, HubSpot, or GoHighLevel. Your agent prepares local setup and publishing scripts for the destination you choose. SQLite remains the primary tracker.", "Publishing is one-way and manual. You choose when to publish; connecting a tool does not start a background sync. Existing personal notes, formulas, and custom fields need to be preserved. Required credentials are entered locally and saved in a Git-ignored environment file."],
      },
      {
        heading: "Can I see a visual application-status snapshot?",
        paragraphs: ["Ask your agent to use cv-snapshot. It reads the selected local database and saves an SVG chart, an offline HTML report, and source JSON. The dashboard does not need to be running.", "The snapshot shows the current statuses recorded in your tracker. It does not reconstruct historical transitions or interview rounds. You can include archived applications when you want a broader view of your records."],
      },
    ],
  },
  {
    slug: "coding-agent-career-workspace",
    label: "Agent setup guide",
    title: "Job Search with Claude Code, Codex & OpenCode | CV Tailor",
    heading: "Use your coding agent as a career workspace",
    description: "Set up CV Tailor for Claude Code, Codex, OpenCode, or Antigravity. Reuse your AI access for resumes, job tracking, and interview preparation with local data.",
    introduction: "CV Tailor gives Claude Code, Codex, OpenCode, and Antigravity a shared local career workspace. The included skills guide your agent through profile import, resume tailoring, job tracking, and interview preparation using a Python CLI.",
    sections: [
      {
        heading: "What do I need to install?",
        paragraphs: ["Start with Python 3.12 or newer, Git to clone the repository, and an agent that can read local skills and run shell commands. The default CLI-only installation does not require Node.js or a running web server."],
        code: "git clone https://github.com/yabswannalearn/CV-Tailor.git\ncd CV-Tailor\npython scripts/install.py --cli-only",
        steps: ["Activate .venv using the command the installer prints, or use the printed cv-tailor executable path.", "Open the repository in your chosen agent so it can read the project instructions and skills.", "Ask the agent to use CV Tailor and import your CV for review.", "Confirm your profile facts before saving, then add a job description to begin an application."],
        prompt: "Use CV Tailor. Help me set up my profile and get ready for my next application. Let me review the extracted facts and confirm my skills before saving.",
      },
      {
        heading: "Do I need another AI API key?",
        paragraphs: ["CV Tailor’s default external-agent mode uses the AI access you already have in your agent. It does not require a separate AI API key or CV Tailor account. Access to your agent is separate and may have its own price or usage limits.", "Built-in API-powered AI features are optional. Enable and configure them separately if you want them; they are not needed for the agent-led workflow."],
      },
      {
        heading: "Can I switch agents without losing applications?",
        paragraphs: ["Yes. Agents use the same CLI and saved SQLite workspace. The .agents/skills directory provides skills for Codex, OpenCode, and Antigravity; Claude entrypoints live in .claude/skills.", "Your saved profile, applications, and documents persist independently of an agent’s chat history. When switching tools, ask the new agent to load the workspace and relevant application. Each agent tool keeps its own conversation history."],
      },
      {
        heading: "Can I add a visual dashboard later?",
        paragraphs: ["Yes. Install with --with-dashboard instead of --cli-only, or run cv-tailor dashboard install after a CLI-only setup. Node.js 22 or newer is needed to install the dashboard. Launch it with cv-tailor dashboard to open the local UI.", "The dashboard and CLI share the same workspace. Use whichever interface fits the task: an agent for a guided workflow, or the dashboard for reviewing your profile, tracker, and CV drafts."],
      },
    ],
  },
];
