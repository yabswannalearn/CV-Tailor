"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import AppLayout from "@/components/AppLayout";
import { API_URL, getApiError } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/lib/queries";

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
  preset_slug: string
}

const emptyProfile: Profile = {
  first_name: "", last_name: "", mobile_no: "", email: "",
  linkedin: "", github: "", portfolio: "",
  education: [], experience: [], projects: [], skills: [], certifications: [],
  preset_slug: "blank",
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [activeTab, setActiveTab] = useState<
    "personal" | "education" | "experience" | "projects" | "skills" | "certifications"
  >("personal")
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [credits, setCredits] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { data: user, isError: userError } = useCurrentUser()
  const { data: profileData } = useQuery<Profile>({
    queryKey: ["profile", user?.email],
    enabled: Boolean(user?.email),
    queryFn: async () => {
      const res = await fetch(`${API}/profile/load/${encodeURIComponent(user!.email)}`, { credentials: "include" })
      if (!res.ok) throw new Error(await getApiError(res, "Unable to load your profile."))
      return res.json()
    },
  })
  const { data: presets = [] } = useQuery<{slug: string, display_name: string}[]>({
    queryKey: ["presets"],
    queryFn: async () => {
      const res = await fetch(`${API}/presets`)
      if (!res.ok) throw new Error("Unable to load resume presets.")
      return res.json()
    },
    staleTime: 10 * 60_000,
  })
  const userEmail = user?.email || ""

  useEffect(() => {
    if (user) setCredits(user.credits)
    if (userError) router.push("/login")
  }, [user, userError, router])

  useEffect(() => {
    if (!profileData) return
    const data = profileData
    setProfile({
      first_name: data.first_name || "",
      last_name: data.last_name || "",
      mobile_no: data.mobile_no || "",
      email: data.email || "",
      linkedin: data.linkedin || "",
      github: data.github || "",
      portfolio: data.portfolio || "",
      preset_slug: data.preset_slug || "blank",
      education: (data.education || []).map((e) => ({ school_name: e.school_name, course: e.course, location: e.location, description: e.description || "" })),
      experience: (data.experience || []).map((e) => ({ job_title: e.job_title, company: e.company, location: e.location, description: e.description || "", date_range: e.date_range || "" })),
      projects: (data.projects || []).map((p) => ({ name: p.name, description: p.description || "", date_range: p.date_range || "" })),
      skills: (data.skills || []).map((s) => ({ skill_name: s.skill_name })),
      certifications: (data.certifications || []).map((c) => ({ name: c.name || "", issuer: c.issuer || "", date_issued: c.date_issued || "" })),
    })
  }, [profileData])

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
      await queryClient.invalidateQueries({ queryKey: ["profile", userEmail] })
    } catch {
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" })
    queryClient.clear()
    router.push("/login")
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/profile/auto-fill-resume`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) {
        if (res.status === 402) throw new Error("Out of credits! Please upgrade to continue.");
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      if (data.status === "success" && data.data) {
        const parsed = data.data;
        setProfile((prev) => ({
          ...prev,
          first_name: parsed.first_name || prev.first_name,
          last_name: parsed.last_name || prev.last_name,
          mobile_no: parsed.mobile_no || prev.mobile_no,
          email: parsed.email || prev.email,
          linkedin: parsed.linkedin || prev.linkedin,
          github: parsed.github || prev.github,
          portfolio: parsed.portfolio || prev.portfolio,
          education: parsed.education?.length ? parsed.education : prev.education,
          experience: parsed.experience?.length ? parsed.experience : prev.experience,
          projects: parsed.projects?.length ? parsed.projects : prev.projects,
          skills: parsed.skills?.length ? parsed.skills : prev.skills,
          certifications: parsed.certifications?.length ? parsed.certifications : prev.certifications,
        }));
        setCredits((c) => Math.max(0, c - 1));
        alert("Profile successfully auto-filled! Please review and click 'Save Profile'.");
      }
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateField = (field: keyof Profile, value: unknown) =>
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
      [field]: (p[field] as unknown[]).filter((_, i) => i !== index),
    }))

  const tabs = ["personal", "education", "experience", "projects", "skills", "certifications"] as const

  return (
      <AppLayout>
    <main className="min-h-screen bg-[#f5f2ed] text-[#1a1814] font-mono">
      <div className="pointer-events-none fixed inset-0 opacity-[0.07] z-0"
        style={{ backgroundImage: GRAIN, backgroundRepeat: "repeat", backgroundSize: "128px" }} />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12">

        {/* Top bar */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5 sm:mb-12">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-[#5a8a00] uppercase mb-1">cv_tailor</div>
            <h1 className="text-2xl font-bold text-[#1a1814]" style={{ fontFamily: "'Georgia', serif" }}>
              Profile Dashboard
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-[#b0aba4] text-xs">{userEmail}</p>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#eeebe5] rounded-sm border border-[#d4cfc7]">
                <span className="text-[#5a8a00] text-[10px]">⚡</span>
                <span className="text-[#1a1814] text-[10px] font-bold tracking-[0.1em] uppercase">{credits} Credits</span>
              </div>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
            <button onClick={() => router.push("/generate")}
              className="flex-1 px-3 py-2 text-center bg-[#1a1814] text-[#f5f2ed] text-xs font-bold tracking-[0.15em] uppercase rounded-sm hover:bg-[#2a2520] transition-colors sm:flex-none sm:px-4">
              Generate CV →
            </button>
            <input 
              type="file" 
              accept=".pdf" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="flex-1 px-3 py-2 text-center bg-[#5a8a00] text-[#f5f2ed] text-xs font-bold tracking-[0.15em] uppercase rounded-sm hover:bg-[#4a7200] transition-colors disabled:opacity-50 sm:flex-none sm:px-4">
              {uploading ? "Parsing..." : "Auto-Fill via PDF"}
            </button>
            <button onClick={handleLogout}
              className="flex-1 px-3 py-2 text-center border border-[#d4cfc7] text-[#7a7570] text-xs font-bold tracking-[0.15em] uppercase rounded-sm hover:border-[#b0aba4] hover:text-[#1a1814] transition-colors sm:flex-none sm:px-4">
              Logout
            </button>
          </div>
        </div>

        {/* Mobile section picker */}
        <div className="mb-4 rounded-xl border border-[#d4cfc7] bg-[#fffdf9] p-3 shadow-sm md:hidden">
          <button
            type="button"
            onClick={() => setMobileSectionsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-[10px] uppercase tracking-[0.2em] text-[#7a7570]">Editing section</span>
              <span className="mt-1 block text-sm font-bold capitalize text-[#1a1814]">{activeTab}</span>
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d4cfc7] text-[#5a8a00]">
              {mobileSectionsOpen ? "−" : "+"}
            </span>
          </button>
          {mobileSectionsOpen && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eeeae4] pt-3">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setActiveTab(tab); setMobileSectionsOpen(false) }}
                  className={`rounded-lg px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] transition-colors ${
                    activeTab === tab ? "bg-[#e4f6ad] font-bold text-[#365400]" : "bg-[#f5f2ed] text-[#7a7570]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-8 hidden gap-1 overflow-x-auto border-b border-[#d4cfc7] md:flex">
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
            <div className="mb-4">
              <label className={labelClass}>Your Role / Niche</label>
              <input 
                list="role-presets"
                className={inputClass} 
                value={profile.preset_slug === 'blank' ? '' : profile.preset_slug}
                onChange={(e) => updateField("preset_slug", e.target.value || "blank")}
                placeholder="e.g. Full Stack Developer, Product Manager..."
              />
              <datalist id="role-presets">
                {presets.map(p => (
                  <option key={p.slug} value={p.display_name} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-[#b0aba4]">
                We&apos;ll tailor your resume toward {profile.preset_slug && profile.preset_slug !== 'blank' ? profile.preset_slug : 'your custom'} roles and suggest relevant skills.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 mb-3 sm:grid-cols-2">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button onClick={handleSave} disabled={saving}
            className="w-full px-8 py-3 text-sm tracking-[0.15em] uppercase font-bold transition-all duration-200 rounded-sm disabled:cursor-not-allowed sm:w-auto"
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
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        className="flex-1 bg-[#e8e4dd] text-[#1a1814] text-sm p-3 outline-none border border-[#d4cfc7] focus:border-[#c8f06088] rounded-sm placeholder-[#b0aba4] transition-colors duration-200"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        placeholder="Type a skill and press Enter..."
      />
      <button onClick={handleAdd}
        className="w-full px-4 py-2 bg-[#1a1814] text-[#f5f2ed] text-xs font-bold tracking-widest uppercase rounded-sm hover:bg-[#2a2520] transition-colors sm:w-auto">
        Add
      </button>
    </div>
  )
}
