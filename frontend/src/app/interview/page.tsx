"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/AppLayout";

const API = "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────
interface Job {
  id: number;
  company_name: string;
  job_title: string;
  job_description?: string;
}

interface Feedback {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  tip: string;
  keyword_hits: string[];
  keyword_misses: string[];
}

type SessionState = "select" | "ready" | "question" | "recording" | "analyzing" | "feedback" | "complete";

// ── Web Speech API types ─────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// ── Score ring component ─────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = (score / 10) * circ;
  const color = score >= 8 ? "#5a8a00" : score >= 6 ? "#c8a800" : score >= 4 ? "#e07a00" : "#b83030";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e8e4dd" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-xl font-bold" style={{ color, fontFamily: "'Georgia', serif", lineHeight: 1 }}>{score}</span>
        <span className="text-[8px]" style={{ color: "#a8a39c" }}>/10</span>
      </div>
    </div>
  );
}

// ── Waveform animation ───────────────────────────────────────────
function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-8">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="rounded-full"
          style={{
            width: 3,
            background: "#3d6600",
            height: active ? `${20 + Math.sin(i * 0.8) * 12}px` : "4px",
            transition: `height 0.15s ease ${i * 0.04}s`,
            animation: active ? `wave-${i % 4} 0.8s ease-in-out infinite alternate` : "none",
            animationDelay: `${i * 0.07}s`,
          }} />
      ))}
      <style>{`
        @keyframes wave-0 { from { height: 6px } to { height: 24px } }
        @keyframes wave-1 { from { height: 10px } to { height: 20px } }
        @keyframes wave-2 { from { height: 14px } to { height: 28px } }
        @keyframes wave-3 { from { height: 8px } to { height: 22px } }
      `}</style>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function InterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("job_id");

  const [sessionState, setSessionState] = useState<SessionState>("select");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [allFeedback, setAllFeedback] = useState<{ question: string; answer: string; feedback: Feedback }[]>([]);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [error, setError] = useState("");
  const [timeElapsed, setTimeElapsed] = useState(0);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef("");

  // Auth + load jobs
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(res => { if (!res.ok) router.push("/login"); });

    fetch(`${API}/tracker/`, { credentials: "include" })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setJobs(data);
        // Auto-select if job_id in URL
        if (preselectedJobId) {
          const job = data.find((j: Job) => j.id === parseInt(preselectedJobId));
          if (job) { setSelectedJob(job); setSessionState("ready"); }
        }
      });

    // Check speech support
    if (!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      setSpeechSupported(false);
    }
  }, []);

  // Timer during recording
  useEffect(() => {
    if (sessionState === "recording") {
      setTimeElapsed(0);
      timerRef.current = setInterval(() => setTimeElapsed(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionState]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Load questions
  const startSession = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`${API}/interview/questions`, { credentials: "include" });
      const data = await res.json();
      setQuestions(data.questions);
      setCurrentQ(0);
      setAllFeedback([]);
      setSessionState("question");
    } catch {
      setError("Failed to load questions");
    }
  };

  // Start recording
  const startRecording = () => {
    if (!speechSupported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    transcriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      if (final) {
        transcriptRef.current += final;
        setTranscript(transcriptRef.current);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") setError(`Speech error: ${e.error}`);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setSessionState("recording");
    setError("");
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setInterimTranscript("");
    setSessionState("question");
  };

  const submitAnswer = async () => {
    const answer = transcriptRef.current.trim() || transcript.trim();
    if (!answer || !selectedJob) return;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setSessionState("analyzing");
    setError("");

    try {
      const res = await fetch(`${API}/interview/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: questions[currentQ],
          answer,
          job_title: selectedJob.job_title,
          jd: selectedJob.job_description || "",
        }),
      });

      if (!res.ok) throw new Error("Analysis failed");
      const fb: Feedback = await res.json();
      setFeedback(fb);
      setAllFeedback(prev => [...prev, { question: questions[currentQ], answer, feedback: fb }]);
      setSessionState("feedback");
    } catch (err: any) {
      setError(err.message);
      setSessionState("question");
    }
  };

  const nextQuestion = () => {
    if (currentQ + 1 >= questions.length) {
      setSessionState("complete");
    } else {
      setCurrentQ(q => q + 1);
      setTranscript("");
      setInterimTranscript("");
      transcriptRef.current = "";
      setFeedback(null);
      setSessionState("question");
    }
  };

  const avgScore = allFeedback.length > 0
    ? Math.round(allFeedback.reduce((s, f) => s + f.feedback.score, 0) / allFeedback.length)
    : 0;

  // ── SELECT JOB ───────────────────────────────────────────────────
  if (sessionState === "select") {
    return (
      <AppLayout>
        <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-2xl mx-auto px-6 py-12">
            <div className="mb-10">
              <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: "#5a8a00" }}>cv_tailor</div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Georgia', serif" }}>AI Interview Practice</h1>
              <p className="text-xs mt-1" style={{ color: "#a8a39c" }}>Select a job to practice for</p>
            </div>

            {!speechSupported && (
              <div className="mb-6 px-4 py-3 text-xs rounded-sm" style={{ background: "#ffeaea", border: "1px solid #ffcccc", color: "#b83030" }}>
                ⚠ Your browser doesn't support Web Speech API. Please use Chrome or Edge for voice recording.
              </div>
            )}

            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm" style={{ color: "#a8a39c" }}>No jobs in your tracker yet</p>
                <button onClick={() => router.push("/tracker")}
                  className="text-xs px-4 py-2 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
                  Add a job first →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map(job => (
                  <button key={job.id} onClick={() => { setSelectedJob(job); setSessionState("ready"); }}
                    className="w-full text-left px-4 py-4 rounded-sm transition-all"
                    style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#8ab030"; e.currentTarget.style.background = "#e8f5c0"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#d4cfc7"; e.currentTarget.style.background = "#edeae4"; }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold" style={{ color: "#1a1814" }}>{job.company_name}</div>
                        <div className="text-xs mt-0.5" style={{ color: "#7a7570" }}>{job.job_title}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {job.job_description
                          ? <span className="text-[9px] px-2 py-0.5 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>JD Ready</span>
                          : <span className="text-[9px] px-2 py-0.5 rounded-sm" style={{ background: "#f0ede8", color: "#a8a39c", border: "1px solid #d4cfc7" }}>No JD</span>
                        }
                        <span style={{ color: "#d4cfc7" }}>→</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── READY ────────────────────────────────────────────────────────
  if (sessionState === "ready") {
    return (
      <AppLayout>
        <div className="h-full overflow-auto font-mono flex items-center justify-center" style={{ background: "#f5f2ed" }}>
          <div className="max-w-lg w-full px-6">
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#e8f5c0", border: "2px solid #8ab030" }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="10" r="5" stroke="#3d6600" strokeWidth="1.5"/>
                  <path d="M6 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#3d6600" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "'Georgia', serif", color: "#1a1814" }}>
                Ready to practice?
              </h2>
              <p className="text-sm" style={{ color: "#7a7570" }}>
                {selectedJob?.company_name} — {selectedJob?.job_title}
              </p>
            </div>

            <div className="p-5 rounded-sm mb-6" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>Session Info</div>
              <div className="space-y-2">
                {[
                  ["Questions", "10 total (7 behavioral + 3 technical)"],
                  ["Format", "Speak your answer or type it"],
                  ["Feedback", "AI scores each answer 1-10"],
                  ["Duration", "~15-20 minutes"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4">
                    <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: "#a8a39c" }}>{k}</span>
                    <span className="text-xs text-right" style={{ color: "#4a4540" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {!speechSupported && (
              <div className="mb-4 px-4 py-3 text-xs rounded-sm" style={{ background: "#fff8e0", border: "1px solid #f0d880", color: "#7a5a00" }}>
                ⚠ Voice not available in this browser. You can still type your answers.
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setSessionState("select")}
                className="px-4 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#b8b3aa"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#d4cfc7"}>
                ← Back
              </button>
              <button onClick={startSession}
                className="flex-1 py-3 text-sm font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
                style={{ background: "#1a1814", color: "#f5f2ed" }}
                onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
                Start Interview →
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── QUESTION + RECORDING + ANALYZING ─────────────────────────────
  if (sessionState === "question" || sessionState === "recording" || sessionState === "analyzing") {
    const isRecording = sessionState === "recording";
    const isAnalyzing = sessionState === "analyzing";
    const displayText = transcript + (interimTranscript ? ` ${interimTranscript}` : "");

    return (
      <AppLayout>
        <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-3xl mx-auto px-6 py-10">

            {/* Progress */}
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => { stopRecording(); setSessionState("ready"); }}
                className="text-[10px] tracking-[0.3em] uppercase hover:opacity-60 transition-opacity" style={{ color: "#5a8a00" }}>
                ← exit
              </button>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((currentQ) / questions.length) * 100}%`, background: "#5a8a00" }} />
              </div>
              <span className="text-[10px]" style={{ color: "#a8a39c" }}>
                {currentQ + 1} / {questions.length}
              </span>
            </div>

            {/* Question card */}
            <div className="p-6 rounded-sm mb-6" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] px-2 py-0.5 rounded-sm tracking-[0.1em] uppercase"
                  style={{ background: currentQ < 7 ? "#e8f0ff" : "#f0e8ff", color: currentQ < 7 ? "#2a4a8a" : "#5a2a8a", border: `1px solid ${currentQ < 7 ? "#b8d0f8" : "#d0b8f8"}` }}>
                  {currentQ < 7 ? "Behavioral" : "Technical"}
                </span>
                <span className="text-[10px]" style={{ color: "#a8a39c" }}>Question {currentQ + 1}</span>
              </div>
              <p className="text-base leading-relaxed" style={{ fontFamily: "'Georgia', serif", color: "#1a1814" }}>
                "{questions[currentQ]}"
              </p>
            </div>

            {/* Answer area */}
            <div className="p-5 rounded-sm mb-5" style={{ background: "#ffffff", border: `1px solid ${isRecording ? "#8ab030" : "#d4cfc7"}`, transition: "border-color 0.3s" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {isRecording && <Waveform active={true} />}
                  {!isRecording && !isAnalyzing && (
                    <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: "#a8a39c" }}>Your Answer</span>
                  )}
                  {isAnalyzing && (
                    <span className="flex items-center gap-2 text-[10px]" style={{ color: "#5a8a00" }}>
                      <span className="inline-flex gap-0.5">
                        {[0,100,200].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#5a8a00", animationDelay: `${d}ms` }} />)}
                      </span>
                      Analyzing your answer...
                    </span>
                  )}
                </div>
                {isRecording && (
                  <span className="text-[10px] font-bold" style={{ color: "#b83030" }}>
                    ● {formatTime(timeElapsed)}
                  </span>
                )}
              </div>

              {/* Transcript display or textarea */}
              {speechSupported ? (
                <div className="min-h-24 text-sm leading-relaxed" style={{ color: "#1a1814", fontFamily: "inherit" }}>
                  {displayText || (
                    <span style={{ color: "#c0bbb4" }}>
                      {isRecording ? "Listening... speak your answer" : "Press 'Start Recording' or type below"}
                    </span>
                  )}
                  {interimTranscript && (
                    <span style={{ color: "#a8a39c" }}> {interimTranscript}</span>
                  )}
                </div>
              ) : (
                <textarea
                  value={transcript}
                  onChange={e => { setTranscript(e.target.value); transcriptRef.current = e.target.value; }}
                  placeholder="Type your answer here..."
                  rows={5}
                  className="w-full text-sm p-2 resize-none outline-none rounded-sm"
                  style={{ background: "#f9f7f4", color: "#1a1814", border: "1px solid #d4cfc7" }} />
              )}
            </div>

            {/* Controls */}
            {!isAnalyzing && (
              <div className="flex items-center gap-3">
                {speechSupported && !isRecording && (
                  <button onClick={startRecording}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                    style={{ background: "#1a1814", color: "#f5f2ed" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                    onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                      <circle cx="6" cy="6" r="2.5" fill="currentColor"/>
                    </svg>
                    {transcript ? "Re-record" : "Start Recording"}
                  </button>
                )}
                {isRecording && (
                  <button onClick={stopRecording}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm"
                    style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/>
                    </svg>
                    Stop Recording
                  </button>
                )}
                {(transcript.trim() || !speechSupported) && !isRecording && (
                  <button onClick={submitAnswer}
                    disabled={!transcript.trim()}
                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors disabled:cursor-not-allowed"
                    style={{ background: transcript.trim() ? "#3d6600" : "#d4cfc7", color: transcript.trim() ? "#fff" : "#a8a39c" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1.5 6h9M7 2.5L10.5 6 7 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Submit Answer
                  </button>
                )}
                {transcript && !isRecording && (
                  <button onClick={() => { setTranscript(""); transcriptRef.current = ""; setInterimTranscript(""); }}
                    className="px-3 py-3 text-[10px] uppercase tracking-wide rounded-sm transition-colors"
                    style={{ color: "#a8a39c", border: "1px solid #d4cfc7" }}>
                    Clear
                  </button>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 px-4 py-3 text-xs rounded-sm" style={{ background: "#ffeaea", border: "1px solid #ffcccc", color: "#b83030" }}>
                ✗ {error}
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── FEEDBACK ─────────────────────────────────────────────────────
  if (sessionState === "feedback" && feedback) {
    const scoreColor = feedback.score >= 8 ? "#5a8a00" : feedback.score >= 6 ? "#c8a800" : feedback.score >= 4 ? "#e07a00" : "#b83030";

    return (
      <AppLayout>
        <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-3xl mx-auto px-6 py-10">

            {/* Progress */}
            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#5a8a00" }}>feedback</span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
                <div className="h-full rounded-full" style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, background: "#5a8a00" }} />
              </div>
              <span className="text-[10px]" style={{ color: "#a8a39c" }}>{currentQ + 1} / {questions.length}</span>
            </div>

            {/* Score header */}
            <div className="flex items-center gap-6 p-6 rounded-sm mb-6" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <ScoreRing score={feedback.score} />
              <div className="flex-1">
                <div className="text-[10px] tracking-[0.2em] uppercase mb-1" style={{ color: "#a8a39c" }}>
                  Q{currentQ + 1}: {questions[currentQ].substring(0, 50)}...
                </div>
                <p className="text-sm font-bold leading-relaxed" style={{ color: "#1a1814", fontFamily: "'Georgia', serif" }}>
                  {feedback.verdict}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Strengths */}
              <div className="p-4 rounded-sm" style={{ background: "#f0fde8", border: "1px solid #c8e890" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5" style={{ color: "#3d6600" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Strengths
                </div>
                <ul className="space-y-2">
                  {feedback.strengths.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed" style={{ color: "#2a4a1a" }}>· {s}</li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div className="p-4 rounded-sm" style={{ background: "#fff8e0", border: "1px solid #f0d880" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5" style={{ color: "#7a5a00" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                    <line x1="5" y1="3" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="5" cy="7" r="0.6" fill="currentColor"/>
                  </svg>
                  Improve
                </div>
                <ul className="space-y-2">
                  {feedback.improvements.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed" style={{ color: "#5a4000" }}>· {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Keywords */}
            {(feedback.keyword_hits.length > 0 || feedback.keyword_misses.length > 0) && (
              <div className="p-4 rounded-sm mb-4" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>JD Keywords</div>
                <div className="flex flex-wrap gap-1.5">
                  {feedback.keyword_hits.map((k, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>✓ {k}</span>
                  ))}
                  {feedback.keyword_misses.map((k, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-sm" style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>✗ {k}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Tip */}
            <div className="p-4 rounded-sm mb-6 flex items-start gap-3" style={{ background: "#e8f0ff", border: "1px solid #b8d0f8" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
                <circle cx="8" cy="8" r="6.5" stroke="#4a7acc" strokeWidth="1.2"/>
                <line x1="8" y1="7" x2="8" y2="11" stroke="#4a7acc" strokeWidth="1.3" strokeLinecap="round"/>
                <circle cx="8" cy="5" r="0.8" fill="#4a7acc"/>
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: "#2a4a8a" }}><strong>Tip:</strong> {feedback.tip}</p>
            </div>

            {/* Next */}
            <button onClick={nextQuestion}
              className="w-full py-3 text-sm font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
              style={{ background: "#1a1814", color: "#f5f2ed" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
              onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
              {currentQ + 1 >= questions.length ? "See Summary →" : `Next Question (${currentQ + 2}/${questions.length}) →`}
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── COMPLETE ─────────────────────────────────────────────────────
  if (sessionState === "complete") {
    const scoreColor = avgScore >= 8 ? "#5a8a00" : avgScore >= 6 ? "#c8a800" : avgScore >= 4 ? "#e07a00" : "#b83030";

    return (
      <AppLayout>
        <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-3xl mx-auto px-6 py-10">

            {/* Header */}
            <div className="text-center mb-10">
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: "#5a8a00" }}>session complete</div>
              <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Georgia', serif" }}>
                {selectedJob?.company_name} — {selectedJob?.job_title}
              </h1>
              <div className="flex items-center justify-center gap-3 mt-4">
                <ScoreRing score={avgScore} />
                <div className="text-left">
                  <div className="text-sm font-bold" style={{ color: "#1a1814" }}>Overall Score</div>
                  <div className="text-xs" style={{ color: "#7a7570" }}>{allFeedback.length} questions answered</div>
                </div>
              </div>
            </div>

            {/* Per-question summary */}
            <div className="space-y-2 mb-8">
              {allFeedback.map((item, i) => {
                const c = item.feedback.score >= 8 ? "#5a8a00" : item.feedback.score >= 6 ? "#c8a800" : item.feedback.score >= 4 ? "#e07a00" : "#b83030";
                return (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#f5f2ed", color: c, border: `1.5px solid ${c}` }}>
                      {item.feedback.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate" style={{ color: "#4a4540" }}>{item.question}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "#a8a39c" }}>{item.feedback.verdict}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-sm shrink-0" style={{ background: i < 7 ? "#e8f0ff" : "#f0e8ff", color: i < 7 ? "#2a4a8a" : "#5a2a8a" }}>
                      {i < 7 ? "BEH" : "TECH"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => { setSessionState("ready"); setAllFeedback([]); setCurrentQ(0); }}
                className="flex-1 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#b8b3aa"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#d4cfc7"}>
                Practice Again
              </button>
              <button onClick={() => router.push("/tracker")}
                className="flex-1 py-3 text-xs font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
                style={{ background: "#1a1814", color: "#f5f2ed" }}
                onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
                Back to Tracker
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return null;
}