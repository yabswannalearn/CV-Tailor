"use client";
import { Suspense, useState, useEffect, useRef, useCallback, useMemo, type RefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import InlineQueryError from "@/components/InlineQueryError";
import { useQueryClient } from "@tanstack/react-query";
import { trackerDetailsQueryOptions, useCurrentUser, useTrackerJobs, type JobDetails, type JobSummary } from "@/lib/queries";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const API = API_URL;
const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

interface DeliveryMetrics {
  eye_contact_pct: number;
  avg_smile: number;
  blink_rate: number;
  posture_score: number | null;
  answer_duration_seconds: number;
}

interface Feedback {
  content_score: number;
  delivery_score: number | null;
  overall_score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  tip: string;
  keyword_hits: string[];
  keyword_misses: string[];
  delivery_feedback: {
    eye_contact?: string;
    expression?: string;
    posture?: string;
    pacing?: string;
  };
}

type SessionState = "select" | "ready" | "question" | "recording" | "analyzing" | "feedback" | "complete";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } };
};
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function ScoreRing({ score, size = 72, label }: { score: number; size?: number; label?: string }) {
  const r = size * 0.39;
  const circ = 2 * Math.PI * r;
  const fill = (score / 10) * circ;
  const color = score >= 8 ? "#5a8a00" : score >= 6 ? "#c8a800" : score >= 4 ? "#e07a00" : "#b83030";
  const cx = size / 2;
  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e8e4dd" strokeWidth={size * 0.083} />
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={size * 0.083}
            strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-bold" style={{ color, fontFamily: "'Georgia', serif", fontSize: size * 0.27, lineHeight: 1 }}>{score}</span>
          <span style={{ color: "#a8a39c", fontSize: size * 0.115 }}>/10</span>
        </div>
      </div>
      {label && <span className="text-[9px] tracking-[0.15em] uppercase" style={{ color: "#a8a39c" }}>{label}</span>}
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-0.5 h-6">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="rounded-full shrink-0"
          style={{ width: 3, background: "#3d6600", height: active ? "100%" : "3px",
            transition: `height 0.15s ease ${i * 0.05}s`,
            animation: active ? "wv 0.7s ease-in-out infinite alternate" : "none",
            animationDelay: `${i * 0.08}s` }} />
      ))}
      <style>{`@keyframes wv { from { height: 20% } to { height: 100% } }`}</style>
    </div>
  );
}

function EyeContactMeter({ pct }: { pct: number }) {
  const color = pct >= 70 ? "#5a8a00" : pct >= 40 ? "#c8a800" : "#b83030";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>{Math.round(pct)}%</span>
    </div>
  );
}

type CameraPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraError: string;
  liveEyeContact: number;
  sessionState: SessionState;
  timeElapsed: number;
  formatTime: (seconds: number) => string;
  mediapipeReady: boolean;
};

function CameraPreview({ videoRef, cameraError, liveEyeContact, sessionState, timeElapsed, formatTime, mediapipeReady }: CameraPreviewProps) {
  return (
    <div className="relative rounded-sm overflow-hidden shrink-0"
      style={{ width: 200, height: 150, background: "#1a1814", border: "1px solid #d4cfc7" }}>
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }} />
      {cameraError ? (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <span className="text-[9px] text-center" style={{ color: "#a8a39c" }}>Camera unavailable</span>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: "rgba(26,24,20,0.75)" }}>
          <div className="flex items-center justify-between">
            <EyeContactMeter pct={liveEyeContact} />
            {sessionState === "recording" && (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#b83030" }} />
                <span className="text-[8px]" style={{ color: "#f0ede8" }}>{formatTime(timeElapsed)}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {mediapipeReady && (
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#5a8a00" }} />
          <span className="text-[8px]" style={{ color: "#5a8a00" }}>MP</span>
        </div>
      )}
    </div>
  );
}

function InterviewPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("job_id");

  const [sessionState, setSessionState] = useState<SessionState>("select");
  const userQuery = useCurrentUser();
  const jobsQuery = useTrackerJobs(!userQuery.isError);
  const jobs: JobSummary[] = useMemo(() => jobsQuery.data || [], [jobsQuery.data]);
  const [selectedJob, setSelectedJob] = useState<JobDetails | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [allFeedback, setAllFeedback] = useState<{ question: string; answer: string; feedback: Feedback }[]>([]);
  const [error, setError] = useState("");
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [mediapipeReady, setMediapipeReady] = useState(false);
  const [liveEyeContact, setLiveEyeContact] = useState(0);
  const [liveSmile, setLiveSmile] = useState(0);
  const [selectingJobId, setSelectingJobId] = useState<number | null>(null);
  const [selectionError, setSelectionError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isRecordingRef = useRef(false); 
  const transcriptRef = useRef("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const metricsRef = useRef({
    eyeContactFrames: 0, totalFrames: 0, smileSum: 0,
    blinkCount: 0, lastBlinkState: false, startTime: 0,
  });

  const prepareJob = useCallback(async (job: JobSummary) => {
    setSelectingJobId(job.id);
    setSelectionError("");
    try {
      const details = await queryClient.fetchQuery(trackerDetailsQueryOptions(job.id));
      setSelectedJob(details);
      setSessionState("ready");
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "We couldn’t load this application.");
    } finally {
      setSelectingJobId(null);
    }
  }, [queryClient]);

  useEffect(() => {
    if (userQuery.isError) router.replace("/login");
    if (!("SpeechRecognition" in window) && !("webkitSpeechRecognition" in window)) {
      setSpeechSupported(false);
    }
  }, [router, userQuery.isError]);

  useEffect(() => {
    if (!preselectedJobId || jobs.length === 0 || selectedJob) return;
    const job = jobs.find(item => item.id === Number(preselectedJobId));
    if (job) void prepareJob(job);
  }, [jobs, preselectedJobId, prepareJob, selectedJob]);

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => setCameraReady(true);
      }
    } catch {
      setCameraError("Camera access denied — delivery metrics unavailable");
    }
  };

  const initMediaPipe = async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1,
      });
      faceLandmarkerRef.current = landmarker;
      setMediapipeReady(true);
    } catch (e) {
      console.warn("MediaPipe failed to load — delivery tracking unavailable:", e);
    }
  };

  useEffect(() => {
    if (["ready", "question", "recording", "analyzing"].includes(sessionState)) {
      initCamera();
      initMediaPipe();
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [sessionState]);

  const runMediaPipeLoop = useCallback(() => {
    if (!faceLandmarkerRef.current || !videoRef.current || !cameraReady) return;
    const video = videoRef.current;
    if (video.readyState < 2) { animFrameRef.current = requestAnimationFrame(runMediaPipeLoop); return; }

    const result = faceLandmarkerRef.current.detectForVideo(video, performance.now());

    if (result?.faceLandmarks?.length > 0) {
      const landmarks = result.faceLandmarks[0];
      const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

      const leftIris = landmarks[468], rightIris = landmarks[473];
      const leftOuter = landmarks[33], leftInner = landmarks[133];
      const rightOuter = landmarks[263], rightInner = landmarks[362];
      const leftCenter = { x: (leftOuter.x + leftInner.x) / 2, y: (leftOuter.y + leftInner.y) / 2 };
      const rightCenter = { x: (rightOuter.x + rightInner.x) / 2, y: (rightOuter.y + rightInner.y) / 2 };
      const deviation = ((Math.abs(leftIris.x - leftCenter.x) + Math.abs(leftIris.y - leftCenter.y)) +
        (Math.abs(rightIris.x - rightCenter.x) + Math.abs(rightIris.y - rightCenter.y))) / 2;
      const isLooking = deviation < 0.025;

      metricsRef.current.totalFrames++;
      if (isLooking) metricsRef.current.eyeContactFrames++;

      const smileL = blendshapes.find(b => b.categoryName === "mouthSmileLeft")?.score || 0;
      const smileR = blendshapes.find(b => b.categoryName === "mouthSmileRight")?.score || 0;
      const smile = (smileL + smileR) / 2;
      metricsRef.current.smileSum += smile;

      const blinkL = blendshapes.find(b => b.categoryName === "eyeBlinkLeft")?.score || 0;
      const blinkR = blendshapes.find(b => b.categoryName === "eyeBlinkRight")?.score || 0;
      const isBlinking = (blinkL + blinkR) / 2 > 0.4;
      if (isBlinking && !metricsRef.current.lastBlinkState) metricsRef.current.blinkCount++;
      metricsRef.current.lastBlinkState = isBlinking;

      const eyePct = metricsRef.current.totalFrames > 0
        ? (metricsRef.current.eyeContactFrames / metricsRef.current.totalFrames) * 100 : 0;
      setLiveEyeContact(eyePct);
      setLiveSmile(smile);
    }
    animFrameRef.current = requestAnimationFrame(runMediaPipeLoop);
  }, [cameraReady]);

  useEffect(() => {
    if (sessionState === "recording" && cameraReady && mediapipeReady) {
      metricsRef.current = { eyeContactFrames: 0, totalFrames: 0, smileSum: 0, blinkCount: 0, lastBlinkState: false, startTime: Date.now() };
      animFrameRef.current = requestAnimationFrame(runMediaPipeLoop);
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [sessionState, cameraReady, mediapipeReady, runMediaPipeLoop]);

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

  const collectDeliveryMetrics = (): DeliveryMetrics | null => {
    const m = metricsRef.current;
    if (m.totalFrames < 10) return null;
    const durationSeconds = Math.round((Date.now() - m.startTime) / 1000);
    const minutesElapsed = durationSeconds / 60;
    return {
      eye_contact_pct: m.totalFrames > 0 ? (m.eyeContactFrames / m.totalFrames) * 100 : 0,
      avg_smile: m.totalFrames > 0 ? m.smileSum / m.totalFrames : 0,
      blink_rate: minutesElapsed > 0 ? m.blinkCount / minutesElapsed : 0,
      posture_score: null,
      answer_duration_seconds: durationSeconds,
    };
  };

  const startRecognition = useCallback(() => {
    if (!speechSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = event => {
      let final = "", interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      if (final) { transcriptRef.current += final; setTranscript(transcriptRef.current); }
      setInterimTranscript(interim);
    };

    recognition.onerror = e => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(`Speech error: ${e.error}`);
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        startRecognition(); 
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [speechSupported]);

  const startRecording = () => {
    isRecordingRef.current = true;
    transcriptRef.current = "";
    setTranscript(""); setInterimTranscript("");
    startRecognition();
    setSessionState("recording");
    setError("");
  };

  const stopRecording = () => {
    isRecordingRef.current = false; 
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setInterimTranscript("");
    setSessionState("question");
  };

  const startSession = async () => {
    if (!selectedJob) return;
    try {
      const res = await fetch(`${API}/interview/questions`, { credentials: "include" });
      const data = await res.json();
      setQuestions(data.questions);
      setCurrentQ(0); setAllFeedback([]);
      setSessionState("question");
    } catch { setError("Failed to load questions"); }
  };

  const submitAnswer = async () => {
    const answer = transcriptRef.current.trim() || transcript.trim();
    if (!answer || !selectedJob) return;
    isRecordingRef.current = false;
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    const delivery = collectDeliveryMetrics();
    setSessionState("analyzing"); setError("");
    try {
      const res = await fetch(`${API}/interview/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: questions[currentQ], answer, job_title: selectedJob.job_title, jd: selectedJob.job_description || "", delivery }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Analysis failed"); }
      const fb: Feedback = await res.json();
      setFeedback(fb);
      setAllFeedback(prev => [...prev, { question: questions[currentQ], answer, feedback: fb }]);
      setSessionState("feedback");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Analysis failed"); setSessionState("question"); }
  };

  const nextQuestion = () => {
    if (currentQ + 1 >= questions.length) { setSessionState("complete"); }
    else {
      setCurrentQ(q => q + 1);
      setTranscript(""); setInterimTranscript(""); transcriptRef.current = "";
      setFeedback(null); setLiveEyeContact(0); setLiveSmile(0);
      setSessionState("question");
    }
  };

  const avgScore = allFeedback.length > 0
    ? Math.round(allFeedback.reduce((s, f) => s + f.feedback.overall_score, 0) / allFeedback.length) : 0;

  if (sessionState === "select") {
    return (
      <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-2xl mx-auto px-6 py-12">
            <div className="mb-10">
              <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: "#5a8a00" }}>cv_tailor</div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Georgia', serif" }}>AI Interview Practice</h1>
              <p className="text-xs mt-1" style={{ color: "#a8a39c" }}>Select a job to practice for</p>
            </div>
            {jobsQuery.isPending && jobs.length === 0 ? (
              <div role="status" className="grid gap-3 py-8 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => <span key={index} className="h-24 animate-pulse rounded-sm bg-[#ddd8d0]" />)}
                <span className="sr-only">Loading applications…</span>
              </div>
            ) : jobsQuery.isError && jobs.length === 0 ? (
              <InlineQueryError message={jobsQuery.error instanceof Error ? jobsQuery.error.message : "We couldn’t load your applications."} onRetry={() => { void jobsQuery.refetch(); }} />
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm" style={{ color: "#a8a39c" }}>No jobs in your tracker yet</p>
                <Link href="/tracker" prefetch
                  className="text-xs px-4 py-2 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
                  Add a job first →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {selectionError && <InlineQueryError message={selectionError} onRetry={() => { setSelectionError(""); }} retryLabel="Dismiss" />}
                {jobs.map(job => (
                  <button key={job.id} onClick={() => { void prepareJob(job); }} disabled={selectingJobId !== null}
                    className="w-full text-left px-4 py-4 rounded-sm transition-all disabled:opacity-60"
                    style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#8ab030"; e.currentTarget.style.background = "#e8f5c0"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#d4cfc7"; e.currentTarget.style.background = "#edeae4"; }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold" style={{ color: "#1a1814" }}>{job.company_name}</div>
                        <div className="text-xs mt-0.5" style={{ color: "#7a7570" }}>{job.job_title}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectingJobId === job.id && <span className="text-[9px] px-2 py-0.5 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>Loading…</span>}
                        <span style={{ color: "#d4cfc7" }}>→</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
      </div>
    );
  }

  if (sessionState === "ready") {
    return (
      <div className="h-full overflow-auto font-mono flex items-center justify-center" style={{ background: "#f5f2ed" }}>
          <div className="max-w-xl w-full px-6">
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold mb-1" style={{ fontFamily: "'Georgia', serif", color: "#1a1814" }}>Ready to practice?</h2>
              <p className="text-sm" style={{ color: "#7a7570" }}>{selectedJob?.company_name} — {selectedJob?.job_title}</p>
            </div>

            <div className="flex gap-6 mb-6 p-5 rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <CameraPreview 
                videoRef={videoRef} 
                cameraError={cameraError} 
                liveEyeContact={liveEyeContact} 
                sessionState={sessionState} 
                timeElapsed={timeElapsed} 
                formatTime={formatTime} 
                mediapipeReady={mediapipeReady} 
              />
              <div className="flex-1">
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>What we track</div>
                <div className="space-y-2">
                  {[
                    ["👁", "Eye contact", mediapipeReady ? "Active" : "Loading..."],
                    ["😊", "Expression", mediapipeReady ? "Active" : "Loading..."],
                    ["👁‍🗨", "Blink rate", mediapipeReady ? "Active" : "Loading..."],
                    ["🎤", "Speech", speechSupported ? "Active" : "Chrome only"],
                  ].map(([icon, label, status]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: "#4a4540" }}>{icon} {label}</span>
                      <span className="text-[10px]" style={{ color: status === "Active" ? "#5a8a00" : status === "Loading..." ? "#c8a800" : "#b83030" }}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
                {cameraError && <p className="text-[10px] mt-3" style={{ color: "#b83030" }}>{cameraError}</p>}
              </div>
            </div>

            <div className="p-4 rounded-sm mb-6" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Questions", "10 (7 behavioral + 3 technical)"],
                  ["Feedback", "Per question, AI scored"],
                  ["Tracking", "Speech + eye contact + expression"],
                  ["Duration", "~15–20 minutes"],
                ].map(([k, v]) => (
                  <div key={String(k)}>
                    <div className="text-[9px] tracking-[0.15em] uppercase mb-0.5" style={{ color: "#a8a39c" }}>{k}</div>
                    <div className="text-xs" style={{ color: "#4a4540" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSessionState("select")}
                className="px-4 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm"
                style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}>← Back</button>
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
    );
  }

  if (["question", "recording", "analyzing"].includes(sessionState)) {
    const isRecording = sessionState === "recording";
    const isAnalyzing = sessionState === "analyzing";
    const displayText = transcript + (interimTranscript ? ` ${interimTranscript}` : "");

    return (
      <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-4xl mx-auto px-6 py-10">

            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => { stopRecording(); setSessionState("ready"); }}
                className="text-[10px] tracking-[0.3em] uppercase hover:opacity-60" style={{ color: "#5a8a00" }}>← exit</button>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(currentQ / questions.length) * 100}%`, background: "#5a8a00" }} />
              </div>
              <span className="text-[10px]" style={{ color: "#a8a39c" }}>{currentQ + 1} / {questions.length}</span>
            </div>

            <div className="flex gap-6">
              <div className="flex-1">
                <div className="p-6 rounded-sm mb-5" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] px-2 py-0.5 rounded-sm tracking-[0.1em] uppercase"
                      style={{ background: currentQ < 7 ? "#e8f0ff" : "#f0e8ff", color: currentQ < 7 ? "#2a4a8a" : "#5a2a8a", border: `1px solid ${currentQ < 7 ? "#b8d0f8" : "#d0b8f8"}` }}>
                      {currentQ < 7 ? "Behavioral" : "Technical"}
                    </span>
                    <span className="text-[10px]" style={{ color: "#a8a39c" }}>Question {currentQ + 1}</span>
                  </div>
                  <p className="text-base leading-relaxed" style={{ fontFamily: "'Georgia', serif", color: "#1a1814" }}>
                    &ldquo;{questions[currentQ]}&rdquo;
                  </p>
                </div>

                <div className="p-5 rounded-sm mb-5" style={{ background: "#ffffff", border: `1px solid ${isRecording ? "#8ab030" : "#d4cfc7"}`, transition: "border-color 0.3s" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {isRecording && <Waveform active />}
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
                      <span className="text-[10px] font-bold" style={{ color: "#b83030" }}>● {formatTime(timeElapsed)}</span>
                    )}
                  </div>

                  {speechSupported ? (
                    <div className="min-h-24 text-sm leading-relaxed" style={{ color: "#1a1814" }}>
                      {displayText || (
                        <span style={{ color: "#c0bbb4" }}>
                          {isRecording ? "Listening... speak your answer (pauses auto-resume)" : "Press Start Recording"}
                        </span>
                      )}
                      {interimTranscript && <span style={{ color: "#a8a39c" }}> {interimTranscript}</span>}
                    </div>
                  ) : (
                    <textarea value={transcript}
                      onChange={e => { setTranscript(e.target.value); transcriptRef.current = e.target.value; }}
                      placeholder="Type your answer here..." rows={5}
                      className="w-full text-sm p-2 resize-none outline-none rounded-sm"
                      style={{ background: "#f9f7f4", color: "#1a1814", border: "1px solid #d4cfc7" }} />
                  )}
                </div>

                {!isAnalyzing && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {speechSupported && !isRecording && (
                      <button onClick={startRecording}
                        className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                        style={{ background: "#1a1814", color: "#f5f2ed" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                        onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.1"/>
                          <circle cx="5.5" cy="5.5" r="2.2" fill="currentColor"/>
                        </svg>
                        {transcript ? "Re-record" : "Start Recording"}
                      </button>
                    )}
                    {isRecording && (
                      <button onClick={stopRecording}
                        className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.1em] uppercase rounded-sm"
                        style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>
                        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                          <rect x="1" y="1" width="7" height="7" rx="1" fill="currentColor"/>
                        </svg>
                        Stop Recording
                      </button>
                    )}
                    {transcript.trim() && !isRecording && (
                      <button onClick={submitAnswer}
                        className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                        style={{ background: "#3d6600", color: "#fff" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#2a4a00"}
                        onMouseLeave={e => e.currentTarget.style.background = "#3d6600"}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M1.5 5.5h8M6.5 2L10 5.5 6.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Submit Answer
                      </button>
                    )}
                    {transcript && !isRecording && (
                      <button onClick={() => { setTranscript(""); transcriptRef.current = ""; }}
                        className="px-3 py-2.5 text-[10px] uppercase tracking-wide rounded-sm"
                        style={{ color: "#a8a39c", border: "1px solid #d4cfc7" }}>Clear</button>
                    )}
                  </div>
                )}

                {error && (
                  <div className="mt-4 px-4 py-3 text-xs rounded-sm" style={{ background: "#ffeaea", border: "1px solid #ffcccc", color: "#b83030" }}>
                    ✗ {error}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 shrink-0" style={{ width: 200 }}>
                <CameraPreview 
                  videoRef={videoRef} 
                  cameraError={cameraError} 
                  liveEyeContact={liveEyeContact} 
                  sessionState={sessionState} 
                  timeElapsed={timeElapsed} 
                  formatTime={formatTime} 
                  mediapipeReady={mediapipeReady} 
                />
                {mediapipeReady && (
                  <div className="p-3 rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                    <div className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: "#a8a39c" }}>Live Metrics</div>
                    <div className="space-y-2.5">
                      <div>
                        <div className="text-[10px] mb-1" style={{ color: "#7a7570" }}>Eye contact</div>
                        <EyeContactMeter pct={liveEyeContact} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px]" style={{ color: "#7a7570" }}>Expression</span>
                          <span className="text-[10px]" style={{ color: liveSmile > 0.3 ? "#5a8a00" : "#a8a39c" }}>
                            {liveSmile > 0.5 ? "😊 Warm" : liveSmile > 0.2 ? "🙂 Neutral" : "😐 Flat"}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
                          <div className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${liveSmile * 100}%`, background: liveSmile > 0.3 ? "#5a8a00" : "#c8a800" }} />
                        </div>
                      </div>
                      {isRecording && (
                        <div className="pt-1.5" style={{ borderTop: "1px solid #d4cfc7" }}>
                          <div className="text-[9px]" style={{ color: "#a8a39c" }}>
                            {metricsRef.current.totalFrames} frames · {metricsRef.current.blinkCount} blinks
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
    );
  }

  if (sessionState === "feedback" && feedback) {
    const hasDelivery = feedback.delivery_score !== null && feedback.delivery_score !== undefined;
    return (
      <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-3xl mx-auto px-6 py-10">

            <div className="flex items-center gap-3 mb-8">
              <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#5a8a00" }}>feedback</span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#e8e4dd" }}>
                <div className="h-full rounded-full" style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, background: "#5a8a00" }} />
              </div>
              <span className="text-[10px]" style={{ color: "#a8a39c" }}>{currentQ + 1} / {questions.length}</span>
            </div>

            <div className="flex items-center gap-6 p-6 rounded-sm mb-5" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
              <ScoreRing score={feedback.overall_score} label="Overall" />
              {hasDelivery && (
                <>
                  <div className="w-px h-12 shrink-0" style={{ background: "#d4cfc7" }} />
                  <ScoreRing score={feedback.content_score} size={56} label="Content" />
                  <ScoreRing score={feedback.delivery_score!} size={56} label="Delivery" />
                </>
              )}
              <div className="flex-1">
                <div className="text-[10px] tracking-[0.15em] uppercase mb-1" style={{ color: "#a8a39c" }}>
                  Q{currentQ + 1}: {questions[currentQ].substring(0, 55)}...
                </div>
                <p className="text-sm font-bold leading-relaxed" style={{ color: "#1a1814", fontFamily: "'Georgia', serif" }}>
                  {feedback.verdict}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-4 rounded-sm" style={{ background: "#f0fde8", border: "1px solid #c8e890" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5" style={{ color: "#3d6600" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Strengths
                </div>
                <ul className="space-y-1.5">
                  {feedback.strengths.map((s, i) => <li key={i} className="text-xs leading-relaxed" style={{ color: "#2a4a1a" }}>· {s}</li>)}
                </ul>
              </div>
              <div className="p-4 rounded-sm" style={{ background: "#fff8e0", border: "1px solid #f0d880" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3 flex items-center gap-1.5" style={{ color: "#7a5a00" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="3" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="7" r="0.6" fill="currentColor"/></svg>
                  Improve
                </div>
                <ul className="space-y-1.5">
                  {feedback.improvements.map((s, i) => <li key={i} className="text-xs leading-relaxed" style={{ color: "#5a4000" }}>· {s}</li>)}
                </ul>
              </div>
            </div>

            {hasDelivery && feedback.delivery_feedback && Object.values(feedback.delivery_feedback).some(Boolean) && (
              <div className="p-4 rounded-sm mb-4" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>Delivery Analysis</div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(feedback.delivery_feedback).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2">
                      <span className="text-[9px] uppercase tracking-wide shrink-0 mt-0.5 px-1.5 py-0.5 rounded-sm"
                        style={{ background: "#f5f2ed", color: "#7a7570", border: "1px solid #d4cfc7" }}>{k}</span>
                      <span className="text-xs leading-relaxed" style={{ color: "#4a4540" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(feedback.keyword_hits?.length > 0 || feedback.keyword_misses?.length > 0) && (
              <div className="p-4 rounded-sm mb-4" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "#a8a39c" }}>JD Keywords</div>
                <div className="flex flex-wrap gap-1.5">
                  {feedback.keyword_hits?.map((k, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-sm" style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>✓ {k}</span>
                  ))}
                  {feedback.keyword_misses?.map((k, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-sm" style={{ background: "#ffeaea", color: "#b83030", border: "1px solid #f8b8b8" }}>✗ {k}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-sm mb-6 flex items-start gap-3" style={{ background: "#e8f0ff", border: "1px solid #b8d0f8" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                <circle cx="7" cy="7" r="5.5" stroke="#4a7acc" strokeWidth="1.2"/>
                <line x1="7" y1="6" x2="7" y2="9.5" stroke="#4a7acc" strokeWidth="1.2" strokeLinecap="round"/>
                <circle cx="7" cy="4.5" r="0.7" fill="#4a7acc"/>
              </svg>
              <p className="text-xs leading-relaxed" style={{ color: "#2a4a8a" }}><strong>Tip:</strong> {feedback.tip}</p>
            </div>

            <button onClick={nextQuestion}
              className="w-full py-3 text-sm font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
              style={{ background: "#1a1814", color: "#f5f2ed" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
              onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
              {currentQ + 1 >= questions.length ? "See Summary →" : `Next Question (${currentQ + 2}/${questions.length}) →`}
            </button>
          </div>
      </div>
    );
  }

  if (sessionState === "complete") {
    return (
      <div className="h-full overflow-auto font-mono" style={{ background: "#f5f2ed", color: "#1a1814" }}>
          <div className="max-w-3xl mx-auto px-6 py-10">
            <div className="text-center mb-10">
              <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: "#5a8a00" }}>session complete</div>
              <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Georgia', serif" }}>
                {selectedJob?.company_name} — {selectedJob?.job_title}
              </h1>
              <div className="flex items-center justify-center gap-6 mt-6">
                <ScoreRing score={avgScore} label="Average" />
                {allFeedback.some(f => f.feedback.delivery_score !== null) && (
                  <>
                    <ScoreRing
                      score={Math.round(allFeedback.reduce((s, f) => s + f.feedback.content_score, 0) / allFeedback.length)}
                      size={56} label="Content" />
                    <ScoreRing
                      score={Math.round(allFeedback.filter(f => f.feedback.delivery_score !== null).reduce((s, f) => s + (f.feedback.delivery_score || 0), 0) / Math.max(1, allFeedback.filter(f => f.feedback.delivery_score !== null).length))}
                      size={56} label="Delivery" />
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2 mb-8">
              {allFeedback.map((item, i) => {
                const c = item.feedback.overall_score >= 8 ? "#5a8a00" : item.feedback.overall_score >= 6 ? "#c8a800" : item.feedback.overall_score >= 4 ? "#e07a00" : "#b83030";
                return (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-sm" style={{ background: "#edeae4", border: "1px solid #d4cfc7" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: "#f5f2ed", color: c, border: `1.5px solid ${c}` }}>
                      {item.feedback.overall_score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate" style={{ color: "#4a4540" }}>{item.question}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "#a8a39c" }}>{item.feedback.verdict}</div>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ background: i < 7 ? "#e8f0ff" : "#f0e8ff", color: i < 7 ? "#2a4a8a" : "#5a2a8a" }}>
                      {i < 7 ? "BEH" : "TECH"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setSessionState("ready"); setAllFeedback([]); setCurrentQ(0); }}
                className="flex-1 py-3 text-xs font-bold tracking-[0.1em] uppercase rounded-sm transition-colors"
                style={{ border: "1px solid #d4cfc7", color: "#7a7570" }}>
                Practice Again
              </button>
              <Link href="/tracker" prefetch
                className="flex-1 py-3 text-xs font-bold tracking-[0.15em] uppercase rounded-sm transition-colors"
                style={{ background: "#1a1814", color: "#f5f2ed" }}
                onMouseEnter={e => e.currentTarget.style.background = "#2a2520"}
                onMouseLeave={e => e.currentTarget.style.background = "#1a1814"}>
                Back to Tracker
              </Link>
            </div>
          </div>
      </div>
    );
  }

  return null;
}

export default function InterviewPage() {
  return (
    <Suspense fallback={null}>
      <InterviewPageContent />
    </Suspense>
  );
}
