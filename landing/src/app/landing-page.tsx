"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./theme-toggle";
import CopyButton from "./copy-button";
import ResumeGallery from "./resume-gallery";
import TrackingIntegrations from "./tracking-integrations";
import AgentCarousel from "./agent-carousel";
import ProductDemo from "./product-demo";
import ApplicationAssistance, { APPLY_PROMPT } from "./application-assistance";
import ApplicationSnapshots, { SNAPSHOT_PROMPT } from "./application-snapshots";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, Code2, FileText,
  GitBranch, LayoutDashboard, Menu, MessageSquare,
  Search, Star, Terminal, UserRound, X, type LucideIcon,
} from "lucide-react";

const REPO = "https://github.com/yabswannalearn/CV-Tailor";
const README = `${REPO}#readme`;
type View = "tracker" | "resume" | "interview";
type InstallMode = "cli" | "dashboard";

const skills = [
  { name: "cv-tailor", label: "Your starting point", description: "Set up your workspace and bring the whole workflow together.", prompt: "Use CV Tailor. Help me set up my profile and get ready for my next application." },
  { name: "cv-profile", label: "Profile & confirmed skills", description: "Import your CV and keep your real experience up to date.", prompt: "Import my CV into my profile. Let me review the extracted facts and confirm my skills before saving." },
  { name: "cv-jobs", label: "Job discovery", description: "Find roles and collect the details from a posting or job URL.", prompt: "Find remote roles that fit my background, then help me review the job descriptions." },
  { name: "cv-job-fit", label: "Job fit analysis", description: "See supported matches, questions, gaps, and practical constraints.", prompt: "Compare this job with my profile. Show supported matches, what needs clarification, and known gaps." },
  { name: "cv-company-research", label: "Company research", description: "Gather useful company and role context with sources.", prompt: "Research this company and role for my application. Cite the sources and distinguish facts from inference." },
  { name: "cv-resume", label: "Tailored resumes", description: "Turn confirmed experience into a tailored, one-page CV.", prompt: "Tailor my CV for this job using my confirmed experience. Save a draft, check the page count, and run the ATS check." },
  { name: "cv-resume-edit", label: "Targeted edits", description: "Rewrite one summary or selected bullets while keeping the rest.", prompt: "Make the first experience bullet more relevant to this job. Keep my facts and leave the rest of the CV unchanged." },
  { name: "cv-cover-letter", label: "Cover letters", description: "Connect your experience to the role in a letter you can review.", prompt: "Write a concise cover letter using my real experience and the company research. Save it as a draft for this application." },
  { name: "cv-tracker", label: "Application tracking", description: "Query, update, archive, and manage your application history.", prompt: "Show my applications at the interview stage, including their saved documents and next steps." },
  { name: "cv-snapshot", label: "Application snapshots", description: "Visualize your current application statuses and save a chart, offline HTML report, and source JSON from your local database.", prompt: SNAPSHOT_PROMPT },
  { name: "cv-apply", label: "Application form assistance", description: "Draft answers, fill supported forms, and resume from saved progress. You review and submit.", prompt: APPLY_PROMPT },
  { name: "cv-interview", label: "Interview preparation", description: "Build prep plans, practice answers, and create cheat sheets.", prompt: "Help me prepare for this interview. Ask one practice question at a time, give feedback, and save a cheat sheet." },
  { name: "cv-code-practice", label: "Coding practice", description: "Work through Python exercises with hints, execution, and review.", prompt: "Give me a Python interview exercise for this role. Let me attempt it, offer hints when asked, and review my solution." },
  { name: "cv-connect", label: "Connect your tracker", description: "Guide setup to publish your local applications to your notes or chosen tracking tool.", prompt: "Use the cv-connect skill. Help me connect my local application tracker to my preferred tool. Keep SQLite primary, guide the setup, and store any credentials locally in a Git-ignored .env file." },
];

const features: { icon: LucideIcon; title: string }[] = [
  { icon: Search, title: "Find your next role." },
  { icon: FileText, title: "Tailor your CV." },
  { icon: MessageSquare, title: "Write a cover letter." },
  { icon: LayoutDashboard, title: "Track your progress." },
  { icon: UserRound, title: "Prepare to interview." },
  { icon: Code2, title: "Practice your coding." },
];

const questions = [
  { title: "What is CV Tailor?", answer: "CV Tailor is an open-source AI resume builder and job application tracker that runs on your computer. Use your own AI agent to tailor one-page CVs, draft cover letters, track applications, and prepare for interviews. A Python CLI is the default, and a local visual dashboard is optional." },
  { title: "Is CV Tailor free to use?", answer: "CV Tailor is free, MIT-licensed software with no CV Tailor account or subscription. Your chosen AI agent or provider supplies the AI access and may have its own charges. Built-in API-powered AI features are optional and require separate provider credentials." },
  { title: "What does the ATS check actually check?", answer: "CV Tailor checks that the generated PDF contains selectable text, conventional section headings, and the expected section order. Applying or exporting a generated resume PDF also requires exactly one page. These checks help identify formatting issues; they do not predict an employer’s screening decision or provide an ATS match score." },
  { title: "Can my agent create an application snapshot?", answer: "Yes. Ask for a snapshot of your job applications, or name the cv-snapshot skill. Your agent reads your selected local database and saves an SVG chart, offline HTML report, and source JSON. You can request archived applications too. The chart shows current recorded statuses; historical transitions and interview rounds are not recorded. The dashboard does not need to be running." },
  { title: "Can it help fill application forms?", answer: "Yes, through a local agent with browser or computer access. The cv-apply skill uses your confirmed profile and selected documents, asks for missing facts, and saves progress. You handle sign-in or CAPTCHA when needed, review the form, and submit it yourself. Without browser access, your agent prepares answers to copy. Tracker status changes after you confirm submission." },
  { title: "How do tracking connections work?", answer: "Copy a connection prompt into an AI agent working in this repository. The cv-connect skill guides local setup and prepares a publishing script for your chosen tool. SQLite stays primary, and you choose when to publish. Any required credentials are entered locally and saved in a Git-ignored .env file." },
  { title: "Is CV Tailor open source?", answer: "Yes. CV Tailor is available under the MIT license. Clone the repository, inspect the code, adapt it to your workflow, and contribute through GitHub. Access to your chosen AI agent or provider is separate." },
  { title: "Is the web UI still included?", answer: "Yes. Install the optional dashboard to use the profile editor, application tracker, CV editor, interview practice, and coding practice in your browser. It runs locally and shares the same data as the CLI. You can also add it after a CLI-only installation." },
  { title: "Do I need an AI API key?", answer: "You don’t need a separate AI API key for CV Tailor’s agent workflows. Use the access you already have in your chosen CLI agent. If you want the built-in API-powered AI features, you can opt in and configure provider credentials separately." },
  { title: "Where does my work live?", answer: "Your profile, applications, and saved documents live in a local SQLite database, outside the checkout, and persist between sessions. There’s no CV Tailor account or PostgreSQL server to set up. Your chosen AI agent or provider may process the context you share with it." },
  { title: "Can I switch between agents?", answer: "Yes. Claude Code, Codex, OpenCode, and Antigravity can use the included skills and CLI commands against the same workspace. CV Tailor reloads your saved career data; each harness keeps its own chat history." },
];

function ArrowLink({ children, href }: { children: ReactNode; href: string }) {
  return <a className="button button-secondary" href={href}>{children}<ArrowRight size={15} /></a>;
}

function StarLink({ className = "" }: { className?: string }) {
  return <a className={`github-star ${className}`} href={REPO} target="_blank" rel="noreferrer" aria-label="Star CV Tailor on GitHub"><Star size={16} aria-hidden="true" /><span>Star<span className="star-full-label"> on GitHub</span></span><ArrowUpRight size={14} className="star-external" aria-hidden="true" /></a>;
}


function TrackerPreview() {
  return <div className="demo-tracker">
    <div className="demo-page-heading"><div><span className="eyebrow">YOUR NEXT CHAPTER</span><h3>Job Tracker</h3></div><span className="demo-add">+ Add application</span></div>
    <div className="demo-stats"><div><strong>3</strong><span>Applications</span></div><div><strong>1</strong><span>Interview</span></div><div><strong>2</strong><span>CV drafts</span></div></div>
    <div className="demo-table-label"><span>APPLICATION</span><span>STATUS</span></div>
    <div className="demo-job"><span className="company-monogram">n</span><div><strong>Product engineer</strong><span>Northstar · Remote</span></div><span className="status status-interview">Interview</span></div>
    <div className="demo-job"><span className="company-monogram monogram-square">a</span><div><strong>Frontend developer</strong><span>Arc Studio · Remote</span></div><span className="status status-applied">Applied</span></div>
    <div className="demo-job"><span className="company-monogram">o</span><div><strong>Software engineer</strong><span>Orbit · Hybrid</span></div><span className="status status-saved">Saved</span></div>
    <div className="demo-saved-document"><FileText size={15} /><div><strong>northstar_resume_v2.pdf</strong><span>Saved to Product engineer at Northstar</span></div><span className="small-check"><Check size={13} />1 page</span></div>
  </div>;
}

function ResumePreview() {
  return <div className="demo-resume">
    <div className="demo-page-heading"><div><span className="eyebrow">TAILORED TO THE ROLE</span><h3>CV Studio</h3></div><span className="status status-ready"><Check size={11} />ATS check passed</span></div>
    <div className="resume-toolbar"><span className="active">Edit</span><span>Preview</span><span>LaTeX</span><span className="resume-page-count">1 / 1</span></div>
    <a className="resume-paper" href="/resume-templates/classic.pdf" target="_blank" rel="noreferrer" aria-label="Open Reinael Yabut’s Classic resume PDF"><Image src="/resume-templates/classic.png" width={850} height={1100} alt="Reinael Yabut’s complete one-page resume in the Classic format" sizes="210px" /></a>
  </div>;
}

function InterviewPreview() {
  return <div className="demo-interview">
    <div className="demo-page-heading"><div><span className="eyebrow">PRODUCT ENGINEER · NORTHSTAR</span><h3>A little practice goes a long way.</h3></div></div>
    <div className="practice-question"><span className="eyebrow">PRACTICE QUESTION</span><p>Tell me about a tool you built that made someone else’s work easier.</p><span className="practice-cursor" /></div>
    <div className="prep-checklist"><span><Check size={13} />Company research saved</span><span><Check size={13} />Your experience, in context</span><span><Check size={13} />Interview-day cheat sheet</span></div>
    <div className="demo-saved-document"><FileText size={15} /><div><strong>northstar_interview_prep</strong><span>Ready to pick up next session</span></div><span className="status status-ready">Saved</span></div>
  </div>;
}

function WorkspacePreview() {
  const [view, setView] = useState<View>("tracker");
  const views: { value: View; label: string; icon: LucideIcon }[] = [{ value: "tracker", label: "Job tracker", icon: LayoutDashboard }, { value: "resume", label: "CV studio", icon: FileText }, { value: "interview", label: "Interview prep", icon: MessageSquare }];
  return <figure className="workspace-preview">
    <div className="window-bar"><span className="window-dots"><i /><i /><i /></span><span>CV Tailor / local workspace</span><span className="window-local"><span />On your machine</span></div>
    <div className="demo-workspace"><aside className="demo-sidebar"><span className="demo-brand">CV Tailor</span><span className="demo-nav-label">WORKSPACE</span><div className="demo-nav" aria-label="Workspace preview views">{views.map(({ value, label, icon: Icon }) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}><Icon size={14} /><span>{label}</span></button>)}</div><div className="demo-profile"><span>RY</span><div>Reinael Yabut<small>Local profile</small></div></div></aside><div className="demo-main" aria-live="polite">{view === "tracker" ? <TrackerPreview /> : view === "resume" ? <ResumePreview /> : <InterviewPreview />}</div></div>
    <div className="agent-receipt"><span className="receipt-icon"><Terminal size={16} /></span><div><span className="eyebrow">FROM YOUR AGENT, TO YOUR WORKSPACE</span><p>{view === "tracker" ? "Application saved. Everything is right where you left it." : view === "resume" ? "CV draft saved. Ready for your review." : "Preparation saved. Your next session starts here."}</p></div><Check size={16} className="receipt-check" /></div>
    <figcaption><span className="sample-dot" />Interactive preview · {view === "resume" ? "Reinael Yabut’s resume" : "Sample applications"}</figcaption>
  </figure>;
}

function SkillDesk() {
  const [selected, setSelected] = useState("cv-resume");
  const skill = skills.find(item => item.name === selected)!;
  return <div className="skill-desk"><div className="skill-list" aria-label="Included skills">{skills.map(item => <button key={item.name} type="button" onClick={() => setSelected(item.name)} aria-pressed={selected === item.name}><span>{item.name}</span><ArrowUpRight size={13} /></button>)}</div><div className="skill-detail" aria-live="polite"><span className="eyebrow">{skill.name}</span><h3>{skill.label}</h3><p>{skill.description}</p><div className="prompt-window"><div className="prompt-window-header"><span><Terminal size={13} />Try asking your agent</span><CopyButton key={skill.name} text={skill.prompt} label={`Copy ${skill.name} example prompt`} /></div><blockquote><span aria-hidden="true">›</span>{skill.prompt}</blockquote><div className="prompt-result"><Check size={13} />Saved work is available in your local workspace.</div></div><p className="skill-note">Ask naturally or use a skill name.</p></div></div>;
}

function Installation() {
  const [mode, setMode] = useState<InstallMode>("cli");
  const commands = `git clone ${REPO}.git\ncd CV-Tailor\npython scripts/install.py --${mode === "cli" ? "cli-only" : "with-dashboard"}`;
  return <section className="install-section section" id="install" aria-labelledby="install-title"><div className="install-copy"><span className="eyebrow">MAKE IT YOUR WORKSPACE</span><h2 id="install-title">Start with your agent.</h2><div className="install-requirements"><span><Check size={14} />Python 3.12 or newer</span><span><Check size={14} />{mode === "cli" ? "No Node.js needed" : "Node.js 22+ to install the dashboard"}</span><span><Check size={14} />No CV Tailor account needed</span></div><a className="text-link" href={README} target="_blank" rel="noreferrer">Read the full installation guide<ArrowUpRight size={14} /></a></div><div className="install-panel"><div className="install-options" aria-label="Installation options"><button type="button" aria-pressed={mode === "cli"} onClick={() => setMode("cli")}><Terminal size={16} /><span>CLI only<small>The default</small></span></button><button type="button" aria-pressed={mode === "dashboard"} onClick={() => setMode("dashboard")}><LayoutDashboard size={16} /><span>CLI + dashboard</span></button></div><div className="install-code"><div className="code-header"><span>YOUR TERMINAL</span><CopyButton key={mode} text={commands} label="Copy installation commands" /></div><pre><code>{commands}</code></pre></div><div className="after-install"><p>Activate <code>.venv</code>, then ask your agent to use CV Tailor.</p>{mode === "dashboard" && <div className="launch-command"><code>cv-tailor dashboard</code><span>Launch the local UI <ArrowUpRight size={12} /></span></div>}{mode === "cli" && <div className="launch-command"><code>cv-tailor dashboard install</code><span>Add the UI later <ArrowUpRight size={12} /></span></div>}</div></div></section>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="#" aria-label="CV Tailor home">CV Tailor</a><nav className="desktop-nav" aria-label="Main navigation"><a href="#workflow">How it works</a><a href="#features">Features</a><a href="#templates">Templates</a><a href="#apply">Apply</a><a href="#integrations">Connect</a><a href="#skills">The skills</a></nav><div className="header-actions"><ThemeToggle /><StarLink className="header-star" /><button className="menu-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></div><nav hidden={!menuOpen} id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{[["#workflow", "How it works"], ["#features", "Features"], ["#templates", "Templates"], ["#apply", "Application forms"], ["#integrations", "Connect your tools"], ["#skills", "The skills"], ["#install", "Get started"]].map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowUpRight size={15} /></a>)}</nav></header>
    <main id="main">
      <section className="hero section" aria-labelledby="hero-title"><div className="hero-copy"><span className="hero-eyebrow"><span />YOUR AGENT. YOUR MACHINE.</span><h1 id="hero-title">Your career, <em>open source.</em></h1><p className="hero-description">An open-source AI resume builder and job application tracker. Tailor CVs and prepare for interviews with your agent, in one local workspace.</p><div className="hero-actions"><ArrowLink href="#install">Get started</ArrowLink><StarLink className="button" /></div><a className="hero-watch-link" href="#watch">Watch the 1-minute demo<ArrowRight size={14} aria-hidden="true" /></a><div className="hero-note"><Check size={13} /><span>MIT licensed. Local data. No CV Tailor account.</span></div></div><WorkspacePreview /></section>
      <AgentCarousel />
      <ProductDemo />
      <section className="workflow-section section" id="workflow" aria-labelledby="workflow-title"><div className="section-heading"><div><span className="eyebrow">A WORKFLOW THAT STAYS WITH YOU</span><h2 id="workflow-title">From search to interview.</h2></div></div><div className="workflow-steps">{[
        ["01", "Your profile", "Import your CV and confirm your skills."],
        ["02", "Pick a role", "Paste a job description or link."],
        ["03", "Tailor it", "Review your CV and cover letter."],
        ["04", "Apply", "Submit, track, and prepare for interviews."],
      ].map(([number, title, text]) => <article key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section className="features-section section" id="features" aria-labelledby="features-title"><div className="section-heading"><div><span className="eyebrow">THE TOOLS FOR YOUR NEXT STEP</span><h2 id="features-title">Every step, one place.</h2></div></div><div className="feature-grid">{features.map(({ icon: Icon, title }) => <article className="feature-card" key={title}><span className="feature-icon"><Icon size={20} strokeWidth={1.5} /></span><h3>{title}</h3></article>)}</div></section>
      <ApplicationSnapshots />
      <ResumeGallery />
      <ApplicationAssistance />
      <TrackingIntegrations />
      <section className="skills-section section" id="skills" aria-labelledby="skills-title"><div className="section-heading"><div><span className="eyebrow">{skills.length} SKILLS. ONE SHARED WORKSPACE.</span><h2 id="skills-title">Just ask your agent.</h2></div></div><SkillDesk /><div className="skills-footnote"><GitBranch size={15} /><p>Switch agents. Keep your saved work.</p><a href={`${REPO}#included-skills`} target="_blank" rel="noreferrer">Explore the skills<ArrowUpRight size={13} /></a></div></section>
      <Installation />
      <section className="guides-section section" id="guides" aria-labelledby="guides-title"><div className="section-heading"><div><span className="eyebrow">PUT IT INTO PRACTICE</span><h2 id="guides-title">A guide for your next step.</h2></div></div><div className="guide-cards">
        <Link className="guide-card" href="/guides/ai-resume-builder/"><span className="eyebrow">RESUMES</span><h3>Tailor a one-page resume.</h3><p>Build from your real experience, review the draft, and understand the ATS checks.</p><span className="text-link">Explore the resume guide<ArrowRight size={15} aria-hidden="true" /></span></Link>
        <Link className="guide-card" href="/guides/local-job-application-tracker/"><span className="eyebrow">LOCAL DATA</span><h3>Keep your job search together.</h3><p>Track applications and documents locally, with optional publishing to your own tools.</p><span className="text-link">Explore the tracking guide<ArrowRight size={15} aria-hidden="true" /></span></Link>
        <Link className="guide-card" href="/guides/coding-agent-career-workspace/"><span className="eyebrow">YOUR AI AGENT</span><h3>Bring the agent you use.</h3><p>Set up a career workspace for Claude Code, Codex, OpenCode, or Antigravity.</p><span className="text-link">Explore the agent guide<ArrowRight size={15} aria-hidden="true" /></span></Link>
      </div></section>
      <section className="faq-section section" id="faq" aria-labelledby="faq-title"><div><span className="eyebrow">A FEW THINGS TO KNOW</span><h2 id="faq-title">Before you begin.</h2></div><div className="faq-list">{questions.map(question => <details key={question.title}><summary>{question.title}<ChevronDown size={16} aria-hidden="true" /></summary><p>{question.answer}</p></details>)}</div></section>
      <section className="closing-section section" id="open-source" aria-labelledby="open-source-title"><div className="closing-mark"><GitBranch size={26} strokeWidth={1.4} /></div><a className="license-badge" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer"><span />OPEN SOURCE · MIT LICENSE</a><h2 id="open-source-title">Make it yours.</h2><p>Star the project, share an idea, or contribute.</p><div className="community-actions"><StarLink className="button" /><ArrowLink href="#install">Start locally</ArrowLink></div><nav className="community-links" aria-label="Contribute to CV Tailor"><a href={REPO} target="_blank" rel="noreferrer">Browse the code<ArrowUpRight size={12} /></a><a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report a bug or share an idea<ArrowUpRight size={12} /></a><a href={`${REPO}/pulls`} target="_blank" rel="noreferrer">Explore pull requests<ArrowUpRight size={12} /></a></nav></section>
    </main>
    <footer className="site-footer" id="footer">
      <div className="footer-content section">
        <p className="footer-message">Your next chapter starts here.</p>
        <p className="footer-note">Open source. Local by default.</p>
        <nav aria-label="Footer navigation">
          <a href="#guides">Guides<ArrowUpRight size={12} aria-hidden="true" /></a>
          <a href={README} target="_blank" rel="noreferrer">Documentation<ArrowUpRight size={12} /></a>
          <a href={REPO} target="_blank" rel="noreferrer">Star on GitHub<Star size={12} /></a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Feedback<ArrowUpRight size={12} /></a>
        </nav>
      </div>
      <div className="footer-landscape" aria-hidden="true" />
    </footer>
  </>;
}
