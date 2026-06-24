"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import AppLayout from "@/components/AppLayout";
import { API_URL } from "@/lib/api";

const GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`

const API = API_URL

const inputClass =
  "w-full bg-[#e8e4dd] text-[#1a1814] text-sm p-3 outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"
const labelClass =
  "block text-[10px] tracking-[0.25em] text-[#7a7570] uppercase mb-2"

type Education = {
  school_name: string
  course: string
  location: string
  description: string
}
type Experience = {
  job_title: string
  company: string
  location: string
  description: string
  date_range: string
}
type Project = { name: string; description: string; date_range: string }
type Certification = { name: string; issuer: string; date_issued: string }

interface Profile {
  first_name: string
  last_name: string
  mobile_no: string
  email: string
  linkedin: string
  github: string
  portfolio: string
  education: Education[]
  experience: Experience[]
  projects: Project[]
  skills: { skill_name: string }[]
  certifications: Certification[]
}

const emptyProfile: Profile = {
  first_name: "", last_name: "", mobile_no: "", email: "",
  linkedin: "", github: "", portfolio: "",
  education: [], experience: [], projects: [], skills: [], certifications: [],
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [activeTab, setActiveTab] = useState<
    "personal" | "education" | "experience" | "projects" | "skills" | "certifications"
  >("personal")
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [userEmail, setUserEmail] = useState("")

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) { router.push("/login"); return null }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        setUserEmail(data.email)
        return fetch(`${API}/profile/load/${data.email}`, { credentials: "include" })
      })
      .then((res) => {
        if (!res || !res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (!data) return
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          mobile_no: data.mobile_no || "",
          email: data.email || "",
          linkedin: data.linkedin || "",
          github: data.github || "",
          portfolio: data.portfolio || "",
          education: (data.education || []).map((e: any) => ({
            school_name: e.school_name,
            course: e.course,
            location: e.location,
            description: e.description || "",
          })),
          experience: (data.experience || []).map((e: any) => ({
            job_title: e.job_title,
            company: e.company,
            location: e.location,
            description: e.description,
            date_range: e.date_range,
          })),
          projects: (data.projects || []).map((p: any) => ({
            name: p.name,
            description: p.description,
            date_range: p.date_range,
          })),
          skills: (data.skills || []).map((s: any) => ({ skill_name: s.skill_name })),
          certifications: (data.certifications || []).map((c: any) => ({
            name: c.name || "",
            issuer: c.issuer || "",
            date_issued: c.date_issued || "",
          })),
        })
      })
      .catch(() => router.push("/login"))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await fetch(`${API}/profile/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      })
      if (!res.ok) throw new Error()
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" })
    router.push("/login")
  }

  const updateField = (field: keyof Profile, value: any) =>
    setProfile((p) => ({ ...p, [field]: value }))
  const updateListItem = <T,>(field: keyof Profile, index: number, updated: T) =>
    setProfile((p) => ({
      ...p,
      [field]: (p[field] as T[]).map((item, i) => i === index ? updated : item),
    }))
  const addListItem = <T,>(field: keyof Profile, empty: T) =>
    setProfile((p) => ({ ...p, [field]: [...(p[field] as T[]), empty] }))
  const removeListItem = (field: keyof Profile, index: number) =>
    setProfile((p) => ({
      ...p,
      [field]: (p[field] as any[]).filter((_, i) => i !== index),
    }))

  const tabs = ["personal", "education", "experience", "projects", "skills", "certifications"] as const

  return (
      <AppLayout>
    <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono">
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-[#5a8a00] uppercase mb-1">cv_tailor</div>
            <h1 className="text-2xl font-bold text-[#1a1814]" style={{ fontFamily: "'Georgia', serif" }}>
              Profile Dashboard
            </h1>
            <p className="text-[#b0aba4] text-xs mt-1">{userEmail}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/generate")}
              className="px-4 py-2 bg-[#1a1814] text-[#f5f2ed] text-xs font-bold tracking-[0.15em] uppercase rounded-sm hover:bg-[#2a2520] transition-colors">
              Generate CV →
            </button>
            <button onClick={handleLogout}
              className="px-4 py-2 border border-[#d4cfc7] text-[#7a7570] text-xs font-bold tracking-[0.15em] uppercase rounded-sm hover:border-[#b0aba4] hover:text-[#1a1814] transition-colors">
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-[#d4cfc7]">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[10px] tracking-[0.2em] uppercase transition-colors duration-200 border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-[#5a8a00] text-[#5a8a00]"
                  : "border-transparent text-[#b0aba4] hover:text-[#7a7570]"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Personal Tab */}
        {activeTab === "personal" && (
          <div className="mb-10">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>First Name</label>
                <input className={inputClass} value={profile.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)} placeholder="John" />
              </div>
              <div>
                <label className={labelClass}>Last Name</label>
                <input className={inputClass} value={profile.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Mobile No</label>
                <input className={inputClass} value={profile.mobile_no}
                  onChange={(e) => updateField("mobile_no", e.target.value)} placeholder="+63 912 345 6789" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} value={profile.email}
                  onChange={(e) => updateField("email", e.target.value)} placeholder="you@email.com" />
              </div>
            </div>
            <div className="mb-4">
              <label className={labelClass}>LinkedIn</label>
              <input className={inputClass} value={profile.linkedin}
                onChange={(e) => updateField("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="mb-4">
              <label className={labelClass}>GitHub</label>
              <input className={inputClass} value={profile.github}
                onChange={(e) => updateField("github", e.target.value)} placeholder="https://github.com/..." />
            </div>
            <div>
              <label className={labelClass}>Portfolio</label>
              <input className={inputClass} value={profile.portfolio}
                onChange={(e) => updateField("portfolio", e.target.value)} placeholder="https://yoursite.dev" />
            </div>
          </div>
        )}

        {/* Education Tab */}
        {activeTab === "education" && (
          <div className="mb-10">
            {profile.education.map((edu, i) => (
              <div key={i} className="mb-6 p-4 bg-[#eeebe5] border border-[#d4cfc7] rounded-sm relative">
                <button onClick={() => removeListItem("education", i)}
                  className="absolute top-3 right-3 text-[#b0aba4] hover:text-[#cc3333] text-xs transition-colors">✕</button>
                <div className="mb-3">
                  <label className={labelClass}>School Name</label>
                  <input className={inputClass} value={edu.school_name}
                    onChange={(e) => updateListItem("education", i, { ...edu, school_name: e.target.value })}
                    placeholder="University Name" />
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={labelClass}>Course / Degree</label>
                    <input className={inputClass} value={edu.course}
                      onChange={(e) => updateListItem("education", i, { ...edu, course: e.target.value })}
                      placeholder="BS Computer Engineering" />
                  </div>
                  <div>
                    <label className={labelClass}>Location</label>
                    <input className={inputClass} value={edu.location}
                      onChange={(e) => updateListItem("education", i, { ...edu, location: e.target.value })}
                      placeholder="City, Country" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea className={`${inputClass} resize-none h-20`} value={edu.description}
                    onChange={(e) => updateListItem("education", i, { ...edu, description: e.target.value })}
                    placeholder="Awards, honors, relevant coursework, GPA..." />
                </div>
              </div>
            ))}
            <button onClick={() => addListItem("education", { school_name: "", course: "", location: "", description: "" })}
              className="w-full py-3 border border-dashed border-[#d4cfc7] text-[#b0aba4] text-xs tracking-widest uppercase hover:border-[#5a8a0044] hover:text-[#5a8a00] transition-colors rounded-sm">
              + Add Education
            </button>
          </div>
        )}

        {/* Experience Tab */}
        {activeTab === "experience" && (
          <div className="mb-10">
            {profile.experience.map((exp, i) => (
              <div key={i} className="mb-6 p-4 bg-[#eeebe5] border border-[#d4cfc7] rounded-sm relative">
                <button onClick={() => removeListItem("experience", i)}
                  className="absolute top-3 right-3 text-[#b0aba4] hover:text-[#cc3333] text-xs transition-colors">✕</button>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={labelClass}>Job Title</label>
                    <input className={inputClass} value={exp.job_title}
                      onChange={(e) => updateListItem("experience", i, { ...exp, job_title: e.target.value })}
                      placeholder="Software Engineer" />
                  </div>
                  <div>
                    <label className={labelClass}>Company</label>
                    <input className={inputClass} value={exp.company}
                      onChange={(e) => updateListItem("experience", i, { ...exp, company: e.target.value })}
                      placeholder="Company Name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={labelClass}>Location</label>
                    <input className={inputClass} value={exp.location}
                      onChange={(e) => updateListItem("experience", i, { ...exp, location: e.target.value })}
                      placeholder="Remote / City" />
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input className={inputClass} value={exp.date_range}
                      onChange={(e) => updateListItem("experience", i, { ...exp, date_range: e.target.value })}
                      placeholder="Jan 2024 – Present" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea className={`${inputClass} resize-none h-24`} value={exp.description}
                    onChange={(e) => updateListItem("experience", i, { ...exp, description: e.target.value })}
                    placeholder="What you did and its impact..." />
                </div>
              </div>
            ))}
            <button onClick={() => addListItem("experience", { job_title: "", company: "", location: "", description: "", date_range: "" })}
              className="w-full py-3 border border-dashed border-[#d4cfc7] text-[#b0aba4] text-xs tracking-widest uppercase hover:border-[#5a8a0044] hover:text-[#5a8a00] transition-colors rounded-sm">
              + Add Experience
            </button>
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === "projects" && (
          <div className="mb-10">
            {profile.projects.map((proj, i) => (
              <div key={i} className="mb-6 p-4 bg-[#eeebe5] border border-[#d4cfc7] rounded-sm relative">
                <button onClick={() => removeListItem("projects", i)}
                  className="absolute top-3 right-3 text-[#b0aba4] hover:text-[#cc3333] text-xs transition-colors">✕</button>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className={labelClass}>Project Name</label>
                    <input className={inputClass} value={proj.name}
                      onChange={(e) => updateListItem("projects", i, { ...proj, name: e.target.value })}
                      placeholder="Project Name" />
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input className={inputClass} value={proj.date_range}
                      onChange={(e) => updateListItem("projects", i, { ...proj, date_range: e.target.value })}
                      placeholder="2024" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea className={`${inputClass} resize-none h-24`} value={proj.description}
                    onChange={(e) => updateListItem("projects", i, { ...proj, description: e.target.value })}
                    placeholder="What you built and its impact..." />
                </div>
              </div>
            ))}
            <button onClick={() => addListItem("projects", { name: "", description: "", date_range: "" })}
              className="w-full py-3 border border-dashed border-[#d4cfc7] text-[#b0aba4] text-xs tracking-widest uppercase hover:border-[#5a8a0044] hover:text-[#5a8a00] transition-colors rounded-sm">
              + Add Project
            </button>
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === "skills" && (
          <div className="mb-10">
            <div className="flex flex-wrap gap-2 mb-4">
              {profile.skills.map((skill, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-[#eeebe5] border border-[#d4cfc7] rounded-sm">
                  <span className="text-xs text-[#1a1814]">{skill.skill_name}</span>
                  <button onClick={() => removeListItem("skills", i)}
                    className="text-[#b0aba4] hover:text-[#cc3333] text-xs transition-colors">✕</button>
                </div>
              ))}
            </div>
            <SkillInput onAdd={(skill) => updateField("skills", [...profile.skills, { skill_name: skill }])} />
          </div>
        )}

        {/* Certifications Tab */}
        {activeTab === "certifications" && (
          <div className="mb-10">
            {profile.certifications.map((cert, i) => (
              <div key={i} className="mb-6 p-4 bg-[#eeebe5] border border-[#d4cfc7] rounded-sm relative">
                <button onClick={() => removeListItem("certifications", i)}
                  className="absolute top-3 right-3 text-[#b0aba4] hover:text-[#cc3333] text-xs transition-colors">✕</button>
                <div className="mb-3">
                  <label className={labelClass}>Certification Name</label>
                  <input className={inputClass} value={cert.name}
                    onChange={(e) => updateListItem("certifications", i, { ...cert, name: e.target.value })}
                    placeholder="AWS Certified Solutions Architect" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Issuer</label>
                    <input className={inputClass} value={cert.issuer}
                      onChange={(e) => updateListItem("certifications", i, { ...cert, issuer: e.target.value })}
                      placeholder="Amazon Web Services" />
                  </div>
                  <div>
                    <label className={labelClass}>Date Issued</label>
                    <input className={inputClass} value={cert.date_issued}
                      onChange={(e) => updateListItem("certifications", i, { ...cert, date_issued: e.target.value })}
                      placeholder="March 2026" />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => addListItem("certifications", { name: "", issuer: "", date_issued: "" })}
              className="w-full py-3 border border-dashed border-[#d4cfc7] text-[#b0aba4] text-xs tracking-widest uppercase hover:border-[#5a8a0044] hover:text-[#5a8a00] transition-colors rounded-sm">
              + Add Certification
            </button>
          </div>
        )}

        {/* Save button */}
        <div className="mt-8 flex items-center gap-4">
          <button onClick={handleSave} disabled={saving}
            className="px-8 py-3 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm disabled:cursor-not-allowed"
            style={{ background: saving ? "#d4cfc7" : "#1a1814", color: saving ? "#b0aba4" : "#f5f2ed" }}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
          {saveStatus === "success" && <span className="text-[#5a8a00] text-xs">✓ Saved successfully</span>}
          {saveStatus === "error" && <span className="text-[#cc3333] text-xs">✗ Save failed</span>}
        </div>
      </div>
    </main>
      </AppLayout>
  )
}

function SkillInput({ onAdd }: { onAdd: (skill: string) => void }) {
  const [value, setValue] = useState("")
  const handleAdd = () => {
    if (!value.trim()) return
    onAdd(value.trim())
    setValue("")
  }
  return (
    <div className="flex gap-2">
      <input
        className="flex-1 bg-[#e8e4dd] text-[#1a1814] text-sm p-3 outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="Type a skill and press Enter..."
      />
      <button onClick={handleAdd}
        className="px-4 py-2 bg-[#1a1814] text-[#f5f2ed] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#2a2520] transition-colors">
        Add
      </button>
    </div>
  )
}
