"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, BookOpen, BriefcaseBusiness, Check, ChevronDown, FileText, Globe2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { API_URL, getApiError } from "@/lib/api";
import { queryKeys, useProfile, useTrackerJobs } from "@/lib/queries";
import FormattedOutput from "@/components/FormattedOutput";

type Source = { title: string; url: string };
type DraftType = "resume" | "cover_letter" | "interview_plan" | "cheat_sheet" | "research" | "job_context";
type Draft = { id: number; type: DraftType; content: string; metadata?: { sources?: Source[]; [key: string]: unknown } | null; created_at: string };
type Message = { id: number; role: "user" | "assistant"; content: string; created_at: string };
type ConversationSummary = { id: number; job_id: number | null; title: string; updated_at: string };
type Conversation = ConversationSummary & { messages: Message[]; drafts: Draft[] };

const labels: Record<DraftType, string> = { resume: "CV", cover_letter: "Cover letter", interview_plan: "Interview plan", cheat_sheet: "Cheat sheet", research: "Company research", job_context: "Job description" };
const suggestions = [
  { icon: Globe2, title: "Research the company", prompt: "Research this company and show me the sources." },
  { icon: FileText, title: "Tailor my application", prompt: "Write a cover letter tailored to this role using my real experience." },
  { icon: BookOpen, title: "Prepare for an interview", prompt: "Help me prepare for an interview for this role." },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(await getApiError(response, "Something went wrong. Please try again."));
  return response.json() as Promise<T>;
}

function safeSource(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" || parsed.protocol === "http:"; } catch { return false; }
}

export default function AssistantPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: jobs = [], isPending: loadingJobs } = useTrackerJobs();
  const { data: profile } = useProfile();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showSaveJob, setShowSaveJob] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingRequestRef = useRef<{ conversationId: number; content: string; id: string } | null>(null);
  const selectedDraft = conversation?.drafts.find(draft => draft.id === selectedDraftId) || null;
  const selectedJob = jobs.find(job => job.id === conversation?.job_id);
  const unconfirmedSkills = profile?.skills.filter(skill => !skill.is_confirmed).length || 0;

  const refreshList = useCallback(async () => {
    const list = await api<ConversationSummary[]>("/assistant/conversations");
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshList().then(list => {
      if (!cancelled && list.length) {
        const previous = Number(sessionStorage.getItem("career-assistant-active"));
        setActiveId(list.find(item => item.id === previous)?.id || list[0].id);
      }
    })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load conversations."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshList]);

  useEffect(() => {
    if (activeId === null) return;
    sessionStorage.setItem("career-assistant-active", String(activeId));
    let cancelled = false;
    api<Conversation>(`/assistant/conversations/${activeId}`)
      .then(data => { if (!cancelled) { setConversation(data); setSelectedDraftId(data.drafts.at(-1)?.id || null); setEditing(false); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this conversation."); });
    return () => { cancelled = true; };
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conversation?.messages.length, busy]);

  async function createConversation(jobId: number | null) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<ConversationSummary>("/assistant/conversations", { method: "POST", body: JSON.stringify({ job_id: jobId }) });
      await refreshList();
      if (activeId === result.id) setConversation(await api<Conversation>(`/assistant/conversations/${result.id}`));
      else { setConversation(null); setActiveId(result.id); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start a conversation."); }
    finally { setBusy(false); }
  }

  async function deleteConversation() {
    if (!conversation || busy || !window.confirm("Delete this conversation and its drafts? The tracked application will stay.")) return;
    setBusy(true); setError("");
    try {
      await api(`/assistant/conversations/${conversation.id}`, { method: "DELETE" });
      const remaining = await refreshList();
      setConversation(null); setSelectedDraftId(null); setActiveId(remaining[0]?.id || null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete this conversation."); }
    finally { setBusy(false); }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || !conversation || busy) return;
    setBusy(true); setError(""); setNotice(""); setInput("");
    const previous = pendingRequestRef.current;
    const requestId = previous && previous.conversationId === conversation.id && previous.content === content
      ? previous.id : crypto.randomUUID();
    pendingRequestRef.current = { conversationId: conversation.id, content, id: requestId };
    try {
      const data = await api<Conversation>(`/assistant/conversations/${conversation.id}/messages`, { method: "POST", body: JSON.stringify({ content, request_id: requestId }) });
      setConversation(data);
      pendingRequestRef.current = null;
      if (data.drafts.length > conversation.drafts.length) setSelectedDraftId(data.drafts.at(-1)?.id || null);
      await refreshList().catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send your message."); setInput(content); }
    finally { setBusy(false); }
  }

  async function reviseDraft() {
    if (!conversation || !selectedDraft || !draftText.trim()) return;
    setBusy(true); setError("");
    try {
      const draft = await api<Draft>(`/assistant/conversations/${conversation.id}/drafts/${selectedDraft.id}/revise`, { method: "POST", body: JSON.stringify({ content: draftText }) });
      setConversation({ ...conversation, drafts: [...conversation.drafts, draft] }); setSelectedDraftId(draft.id); setEditing(false); setNotice("New draft version saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this draft."); }
    finally { setBusy(false); }
  }

  async function applyDraft(draft: Draft) {
    if (!conversation || !conversation.job_id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/assistant/conversations/${conversation.id}/drafts/${draft.id}/apply`, { method: "POST" });
      setConversation(await api<Conversation>(`/assistant/conversations/${conversation.id}`));
      void queryClient.invalidateQueries({ queryKey: queryKeys.tracker });
      setNotice(`${labels[draft.type]} saved to your application.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not apply this draft."); }
    finally { setBusy(false); }
  }

  async function downloadCheatSheet(draft: Draft) {
    if (!conversation) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API_URL}/assistant/conversations/${conversation.id}/drafts/${draft.id}/pdf`, { credentials: "include" });
      if (!response.ok) throw new Error(await getApiError(response, "Could not export this cheat sheet."));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "interview-cheat-sheet.pdf"; link.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not export this cheat sheet."); }
    finally { setBusy(false); }
  }

  function openResume(draft: Draft) {
    if (!conversation) return;
    sessionStorage.setItem("career-assistant-resume", JSON.stringify({ jobId: conversation.job_id, latex: draft.content, conversationId: conversation.id, draftId: draft.id }));
    router.push(conversation.job_id ? `/generate?job_id=${conversation.job_id}` : "/generate?assistant_draft=1");
  }

  async function saveJob(event: FormEvent) {
    event.preventDefault();
    if (!conversation || !company.trim() || !jobTitle.trim() || !jobDescription.trim()) return;
    setBusy(true); setError("");
    try {
      const job = await api<{ id: number }>("/tracker", { method: "POST", body: JSON.stringify({ company_name: company.trim(), job_title: jobTitle.trim(), job_description: jobDescription.trim() }) });
      try {
        await api(`/assistant/conversations/${conversation.id}/link-job`, { method: "POST", body: JSON.stringify({ job_id: job.id }) });
      } catch (err) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trackerJobs });
        throw new Error(`The application was saved, but could not be linked to this chat. ${err instanceof Error ? err.message : ""}`);
      }
      const updated = await api<Conversation>(`/assistant/conversations/${conversation.id}`);
      setConversation(updated); await refreshList(); void queryClient.invalidateQueries({ queryKey: queryKeys.trackerJobs });
      setShowSaveJob(false); setNotice("Application saved and linked to this conversation.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the application."); }
    finally { setBusy(false); }
  }

  const activeLabel = selectedJob ? `${selectedJob.job_title} · ${selectedJob.company_name}` : conversation?.title || "General conversation";
  const sources = selectedDraft?.metadata?.sources?.filter(source => safeSource(source.url)) || [];

  return (
    <div className="h-full overflow-auto bg-[#f5f2ed] text-[#1a1814]">
      <div className="mx-auto flex min-h-full max-w-[1500px] flex-col px-4 py-5 sm:px-7 sm:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[#d7d1c8] pb-5">
          <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#688046]">Your application workspace</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Career Agent<span className="text-[#6b8d35]">.</span></h1><p className="mt-2 text-sm leading-6 text-[#777169]">Research, prepare and shape your application in one conversation.</p></div>
        </header>

        {unconfirmedSkills > 0 && <div className="mb-4 rounded-lg border border-[#ded5af] bg-[#faf7e8] px-4 py-3 text-xs leading-5 text-[#6a603f]">Review your skills before using them in documents. {unconfirmedSkills} {unconfirmedSkills === 1 ? "skill needs" : "skills need"} confirmation. <Link href="/dashboard" className="font-semibold underline underline-offset-2">Open your profile and choose Skills →</Link></div>}
        <div className="grid flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="rounded-xl border border-[#ddd7cd] bg-[#efebe4] p-4">
            <div className="mb-4 flex items-center justify-between"><span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[#817a71]">Conversations</span><button disabled={busy} onClick={() => void createConversation(null)} aria-label="New general conversation" title="New general conversation" className="rounded-md p-1 text-[#536b37] hover:bg-[#e2ead3] focus-visible:outline-2 focus-visible:outline-[#536b37] disabled:opacity-40"><Plus size={17} /></button></div>
            <label htmlFor="start-application" className="sr-only">Open an application conversation</label>
            <div className="relative mb-4"><select id="start-application" value="" disabled={busy || loadingJobs} onChange={event => { if (event.target.value) void createConversation(Number(event.target.value)); }} className="w-full appearance-none rounded-lg border border-[#d6d0c6] bg-[#fffefa] px-3 py-2.5 pr-8 text-xs text-[#4d5147] outline-none focus:ring-2 focus:ring-[#8bac6c] disabled:opacity-40"><option value="">+ Open an application</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.company_name} · {job.job_title}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[#929087]" /></div>
            <div className="flex max-h-52 gap-2 overflow-x-auto lg:max-h-none lg:flex-col lg:overflow-visible">{conversations.map(item => <button key={item.id} disabled={busy} onClick={() => { if (item.id !== activeId) { setConversation(null); setActiveId(item.id); } setError(""); setNotice(""); }} className={`min-w-40 rounded-lg px-3 py-2.5 text-left transition lg:min-w-0 ${item.id === activeId ? "bg-[#dfead1] text-[#35532e]" : "text-[#6c6b61] hover:bg-[#e3ded6]"}`}><span className="block truncate text-xs font-semibold">{item.title || (item.job_id ? "Application" : "General chat")}</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-wider opacity-70">{item.job_id ? "Application" : "General"}</span></button>)}</div>
            {!loading && !conversations.length && <p className="text-xs leading-5 text-[#847e73]">Start a general chat or choose an application.</p>}
            <button disabled={busy} onClick={() => void createConversation(null)} className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#557442] hover:underline disabled:opacity-40"><Plus size={14} /> New general chat</button>
          </aside>

          <section className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-[#ddd7cd] bg-[#fffefa]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e2d9] px-5 py-4"><div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#8b9181]">{conversation?.job_id ? "Application conversation" : "General conversation"}</p><h2 className="mt-1 truncate text-sm font-semibold">{conversation ? activeLabel : "Choose a conversation"}</h2></div><div className="flex items-center gap-2">{conversation && !conversation.job_id && <button onClick={() => setShowSaveJob(true)} className="rounded-md border border-[#d9ded2] px-3 py-1.5 text-xs text-[#536b37] hover:bg-[#f3f8ee]">Save a job</button>}{conversation && <button disabled={busy} onClick={() => void deleteConversation()} aria-label="Delete conversation" title="Delete conversation" className="rounded-md p-2 text-[#918b81] hover:bg-[#fff1ee] hover:text-[#aa443d] disabled:opacity-40"><Trash2 size={15} /></button>}</div></div>
            <div className="flex-1 overflow-y-auto px-5 py-6 lg:max-h-[60vh]" aria-live="polite">
              {!conversation ? <div className="flex h-full flex-col items-center justify-center text-center"><Sparkles className="mb-4 text-[#789762]" size={25} /><p className="font-semibold">Your next step starts here.</p><p className="mt-2 max-w-xs text-sm leading-6 text-[#817c73]">Start a conversation or choose an application from the left.</p></div> : conversation.messages.length === 0 ? <div className="mx-auto max-w-2xl py-6"><div className="mb-5 inline-flex rounded-xl bg-[#e3eed9] p-3 text-[#51713f]"><Sparkles size={20} /></div><h3 className="text-2xl font-medium tracking-tight">What are you working toward?</h3><p className="mt-2 text-sm leading-6 text-[#777a70]">Ask about a company, shape a document, or get ready for an interview.</p><div className="mt-6 grid gap-2 sm:grid-cols-3">{suggestions.map(({ icon: Icon, title, prompt }) => <button key={title} disabled={busy} onClick={() => setInput(prompt)} className="flex min-h-24 flex-col items-start justify-between rounded-lg border border-[#e3e4db] p-3 text-left text-xs font-semibold text-[#4e6350] hover:border-[#9ab590] hover:bg-[#f7fbf4] disabled:opacity-40"><Icon size={17} /><span>{title} ↗</span></button>)}</div></div> : <div className="mx-auto max-w-3xl space-y-5">{conversation.messages.map(message => <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[85%] ${message.role === "user" ? "bg-[#3f5b3c] text-white" : "border border-[#e5e8df] bg-[#f8faf5] text-[#303a32]"}`}><div className="mb-1 font-mono text-[9px] uppercase tracking-[0.15em] opacity-60">{message.role === "user" ? "You" : "Career Agent"}</div>{message.role === "assistant" ? <FormattedOutput content={message.content} copyLabel="Copy response" /> : <div className="whitespace-pre-wrap break-words">{message.content}</div>}</div></article>)}{busy && <p role="status" className="text-sm text-[#7b8275]">Working on it…</p>}<div ref={bottomRef} /></div>}
            </div>
            {conversation && <form onSubmit={event => { event.preventDefault(); void send(input); }} className="border-t border-[#e7e2d9] p-4"><label htmlFor="career-message" className="sr-only">Message the Career Agent</label><textarea id="career-message" value={input} maxLength={12000} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} placeholder="Ask about a company, your CV, or an upcoming interview…" rows={2} className="w-full resize-none rounded-lg border border-[#e3e6dc] bg-[#fbfcf9] px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#a3bc95]" /><div className="mt-3 flex justify-end"><button type="submit" disabled={busy || !input.trim()} aria-label="Send message" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3f5b3c] text-white hover:bg-[#304a30] disabled:opacity-40"><ArrowUp size={18} /></button></div></form>}
            {(error || notice) && <p role={error ? "alert" : "status"} className={`border-t border-[#e7e2d9] px-5 py-3 text-xs ${error ? "text-[#ae4038]" : "text-[#4e733c]"}`}>{error || notice}</p>}
          </section>

          <aside className="rounded-xl border border-[#ddd7cd] bg-[#fffefa] p-4 lg:col-span-2 xl:col-span-1">
            <div className="mb-4 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e3eed9] text-[#567b46]"><BriefcaseBusiness size={16} /></span><div><h2 className="text-sm font-semibold">Application workspace</h2><p className="mt-0.5 text-[11px] text-[#88877d]">Research and draft versions</p></div></div>
            {!conversation?.drafts.length ? <div className="rounded-lg border border-dashed border-[#dce2d6] px-4 py-6 text-center text-xs leading-5 text-[#8a9183]">Your research and drafts will appear here as you work.</div> : <><div className="flex max-h-36 gap-1.5 overflow-x-auto xl:max-h-48 xl:flex-col xl:overflow-y-auto">{[...conversation.drafts].reverse().map(draft => <button key={draft.id} onClick={() => { setSelectedDraftId(draft.id); setEditing(false); }} className={`min-w-36 rounded-lg px-3 py-2 text-left text-xs xl:min-w-0 ${selectedDraftId === draft.id ? "bg-[#e6efdc] text-[#365833]" : "bg-[#f5f5ef] text-[#6f7569] hover:bg-[#edf1e9]"}`}><span className="block font-semibold">{labels[draft.type] || "Draft"}</span><span className="mt-1 block text-[10px] opacity-70">{new Date(draft.created_at).toLocaleString()}</span></button>)}</div>{selectedDraft && <div className="mt-4 border-t border-[#e6e8df] pt-4"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">{labels[selectedDraft.type]}</h3><span className="font-mono text-[9px] uppercase tracking-wider text-[#929a8c]">Draft</span></div>{editing ? <textarea aria-label="Edit draft" value={draftText} onChange={event => setDraftText(event.target.value)} rows={12} className="w-full rounded-lg border border-[#cbd8c8] p-3 text-xs leading-6 outline-none focus:ring-2 focus:ring-[#a3bc95]" /> : <div className="max-h-80 overflow-auto rounded-lg bg-[#f7f8f3] p-3 text-xs leading-6 text-[#596259]">{selectedDraft.type === "resume" ? "Open this CV in the editor to review its content and PDF preview." : <FormattedOutput key={selectedDraft.id} content={selectedDraft.content} copyLabel="Copy draft" />}</div>}{selectedDraft.type === "resume" && selectedDraft.metadata?.one_page === false && <p role="alert" className="mt-2 text-xs leading-5 text-[#a84f3f]">This CV exceeds one page. Open the editor to resolve the overflow before applying it.</p>}{!!sources.length && <div className="mt-3"><h4 className="mb-2 text-xs font-semibold">Sources</h4><ul className="space-y-1.5">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-xs text-[#4a753c] underline underline-offset-2">{source.title || source.url} ↗</a></li>)}</ul></div>}<div className="mt-4 flex flex-wrap gap-2">{selectedDraft.type === "resume" ? <button onClick={() => openResume(selectedDraft)} className="rounded-lg bg-[#3f5b3c] px-3 py-2 text-xs font-semibold text-white">Open in editor →</button> : selectedDraft.type !== "research" && (editing ? <><button disabled={busy || !draftText.trim()} onClick={() => void reviseDraft()} className="rounded-lg bg-[#3f5b3c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save new version</button><button onClick={() => setEditing(false)} className="rounded-lg border border-[#d7dfd2] px-3 py-2 text-xs">Cancel</button></> : <button onClick={() => { setDraftText(selectedDraft.content); setEditing(true); }} className="rounded-lg border border-[#d7dfd2] px-3 py-2 text-xs font-semibold text-[#557442]">Edit draft</button>)}{!editing && (selectedDraft.type === "interview_plan" || selectedDraft.type === "cheat_sheet") && conversation.job_id && <Link href={`/interview?job_id=${conversation.job_id}`} className="rounded-lg border border-[#d7dfd2] px-3 py-2 text-xs font-semibold text-[#557442]">Practice interview →</Link>}{!editing && selectedDraft.type === "cheat_sheet" && <button disabled={busy} onClick={() => void downloadCheatSheet(selectedDraft)} className="rounded-lg bg-[#3f5b3c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Download PDF</button>}{!editing && selectedDraft.type === "job_context" && !conversation.job_id && <button onClick={() => { setJobDescription(selectedDraft.content); setShowSaveJob(true); }} className="rounded-lg bg-[#3f5b3c] px-3 py-2 text-xs font-semibold text-white">Save this job</button>}{!editing && selectedDraft.type === "cover_letter" && conversation.job_id && <button disabled={busy} onClick={() => void applyDraft(selectedDraft)} className="rounded-lg bg-[#3f5b3c] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save to application</button>}{!editing && selectedDraft.type === "resume" && conversation.job_id && <button disabled={busy} onClick={() => void applyDraft(selectedDraft)} className="rounded-lg border border-[#d7dfd2] px-3 py-2 text-xs font-semibold text-[#557442] disabled:opacity-40">Apply draft</button>}</div></div>}</>}
            {conversation?.job_id && <Link href="/tracker" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-[#607f4d] hover:underline"><Check size={13} /> View in job tracker</Link>}
          </aside>
        </div>
      </div>
      {showSaveJob && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="save-job-title" className="w-full max-w-md rounded-xl bg-[#fffefa] p-6 shadow-xl"><div className="flex items-center justify-between"><h2 id="save-job-title" className="text-lg font-semibold">Save this application</h2><button aria-label="Close" onClick={() => setShowSaveJob(false)}><X size={18} /></button></div><p className="mt-2 text-xs leading-5 text-[#777a70]">Add the role and description to your tracker and link this conversation.</p><form onSubmit={event => void saveJob(event)} className="mt-5 space-y-3"><label className="block text-xs font-semibold text-[#5f665d]">Company<input required value={company} onChange={event => setCompany(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d9ded2] p-2.5 text-sm" /></label><label className="block text-xs font-semibold text-[#5f665d]">Job title<input required value={jobTitle} onChange={event => setJobTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d9ded2] p-2.5 text-sm" /></label><label className="block text-xs font-semibold text-[#5f665d]">Job description<textarea required rows={5} value={jobDescription} onChange={event => setJobDescription(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-[#d9ded2] p-2.5 text-sm" /></label>{error && <p role="alert" className="text-xs text-[#ae4038]">{error}</p>}<button disabled={busy} className="rounded-lg bg-[#3f5b3c] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Save and link</button></form></div></div>}
    </div>
  );
}
