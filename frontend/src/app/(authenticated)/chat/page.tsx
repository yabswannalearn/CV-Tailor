"use client"
import { useCallback, useRef, useState, type KeyboardEvent } from "react"
import { API_URL } from "@/lib/api";

type Message = { role: "user" | "agent"; text: string }

const inputClass =
  "w-full bg-[#e8e4dd] text-[#1a1814] text-sm p-3 outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"

const USER_BUBBLE = { background: "#e8f5c0", color: "#3d6600" } as const
const AGENT_BUBBLE = { background: "#ffffff", color: "#1a1814", border: "1px solid #e2ded6" } as const

// One user id for the whole local app; sessions are separated server-side by
// session_id so a "New chat" button simply rotates it.
const LOCAL_USER = "web-local"

function newSessionId() {
  return Math.random().toString(36).slice(2, 10)
}

function Bubble({ message }: { message: Message }) {
  const style = message.role === "user" ? USER_BUBBLE : AGENT_BUBBLE
  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed"
        style={style}
      >
        {message.text}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState(newSessionId)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streaming) return
      setError(null)
      setStreaming(true)
      setMessages((prev) => [...prev, { role: "user", text: trimmed }, { role: "agent", text: "" }])
      inputRef.current!.value = ""
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })

      const patchLast = (fn: (m: Message) => Message) =>
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = fn(copy[copy.length - 1])
          return copy
        })

      try {
        const response = await fetch(`${API_URL}/chat/${LOCAL_USER}/message`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, session_id: sessionId }),
        })
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = JSON.parse(line.slice(6)) as { delta?: string; done?: boolean; error?: string }
            if (payload.error) throw new Error(payload.error)
            if (payload.delta) patchLast((last) => ({ ...last, text: last.text + payload.delta }))
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat failed")
      } finally {
        setStreaming(false)
      }
    },
    [sessionId, streaming],
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputRef.current!.value)
    }
  }

  const clearChat = () => {
    setSessionId(newSessionId())
    setMessages([])
    setError(null)
  }

  return (
    <main className="min-h-screen bg-[#f5f2ed] px-4 py-6 font-mono text-[#1a1814] sm:px-8 sm:py-10">
      <div className="mx-auto flex h-[75vh] max-w-3xl flex-col rounded-lg border border-[#d4cfc7] bg-[#edeae4] p-4">
        <div className="mb-3 flex items-center justify-between border-b border-[#d4cfc7] pb-3">
          <div>
            <h1 className="text-sm font-bold tracking-[0.2em] uppercase">Career Copilot</h1>
            <p className="text-[10px]" style={{ color: "#7a7570" }}>
              Paste a job URL — I&apos;ll analyze it, score it against your profile, and offer a cover letter.
            </p>
          </div>
          <button
            onClick={clearChat}
            className="rounded-md border border-[#d4cfc7] px-2 py-1 text-[10px] tracking-[0.15em] uppercase transition-colors duration-150 hover:bg-[#e2ded6]"
            style={{ color: "#7a7570" }}
            title="Start a new conversation"
          >
            New chat
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="m-auto text-center text-[11px]" style={{ color: "#a8a39c" }}>
              e.g. https://remoteok.com/jobs/123
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "agent" && !m.text && streaming ? (
              <div key={i} className="animate-pulse text-[11px]" style={{ color: "#a8a39c" }}>
                …analyzing
              </div>
            ) : (
              <Bubble key={i} message={m} />
            ),
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="mt-2 text-[11px]" style={{ color: "#cc3333" }}>
            {error}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            className={inputClass}
            placeholder={streaming ? "Copilot is replying…" : "Paste a job URL or ask anything…"}
            disabled={streaming}
            onKeyDown={handleKeyDown}
            aria-label="Chat input"
          />
          <button
            onClick={() => sendMessage(inputRef.current!.value)}
            disabled={streaming}
            className="shrink-0 rounded-sm px-4 text-[11px] font-bold tracking-[0.15em] uppercase transition-opacity duration-150 disabled:opacity-50"
            style={{ background: "#3d6600", color: "#f5f2ed" }}
          >
            Send
          </button>
        </div>
      </div>
    </main>
  )
}
