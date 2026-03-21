"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const API = "http://localhost:8000";

// ── Icons ────────────────────────────────────────────────────────
const IconDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IconGenerate = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 2H10.5L13 4.5V14H3V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M10.5 2V4.5H13" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="5.5" y1="7" x2="10.5" y2="7" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="5.5" y1="9.5" x2="9" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5.5 12l1.5-1.5L8.5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconTracker = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="1.5" y1="7" x2="14.5" y2="7" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="5" cy="10" r="1" fill="currentColor"/>
    <circle cx="8" cy="10" r="1" fill="currentColor"/>
    <circle cx="11" cy="10" r="1" fill="currentColor"/>
  </svg>
);

const IconLogout = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M10.5 5L14 8l-3.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IconChevron = ({ collapsed }: { collapsed: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}>
    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard",   href: "/dashboard",   icon: <IconDashboard /> },
  { label: "Generate CV", href: "/generate",    icon: <IconGenerate /> },
  { label: "Job Tracker", href: "/tracker",     icon: <IconTracker /> },
];

// ── Sidebar ───────────────────────────────────────────────────────
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setUserEmail(data.email); })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className="flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? "56px" : "200px",
        background: "#edeae4",
        borderRight: "1px solid #d4cfc7",
        fontFamily: "ui-monospace, 'Courier New', monospace",
      }}>

      {/* ── Logo + collapse ── */}
      <div className="flex items-center justify-between px-3 py-4 shrink-0"
        style={{ borderBottom: "1px solid #d4cfc7" }}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0"
              style={{ background: "#3d6600" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white"/>
                <path d="M4 5H7" stroke="#3d6600" strokeWidth="1"/>
                <path d="M4 6.5H6" stroke="#3d6600" strokeWidth="1"/>
              </svg>
            </div>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase overflow-hidden whitespace-nowrap"
              style={{ color: "#1a1814" }}>
              cv_tailor
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-5 h-5 rounded-sm flex items-center justify-center mx-auto"
            style={{ background: "#3d6600" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white"/>
            </svg>
          </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: "#a8a39c" }}
            onMouseEnter={e => e.currentTarget.style.color = "#4a4540"}
            onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}
            title="Collapse sidebar">
            <IconChevron collapsed={false} />
          </button>
        )}
        {collapsed && (
          <button onClick={() => setCollapsed(false)}
            className="absolute left-0 w-full flex items-center justify-center mt-8 opacity-0 hover:opacity-100 transition-opacity"
            style={{ color: "#a8a39c" }}
            title="Expand sidebar">
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)}
          className="flex items-center justify-center py-2 w-full transition-colors"
          style={{ color: "#a8a39c", borderBottom: "1px solid #d4cfc7" }}
          onMouseEnter={e => e.currentTarget.style.color = "#4a4540"}
          onMouseLeave={e => e.currentTarget.style.color = "#a8a39c"}
          title="Expand sidebar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: "rotate(270deg)" }}>
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* ── Nav items ── */}
      <nav className="flex flex-col gap-1 px-2 pt-4 flex-1">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              onMouseEnter={() => setHoveredItem(item.href)}
              onMouseLeave={() => setHoveredItem(null)}
              className="flex items-center gap-3 rounded-sm transition-all duration-150 relative group"
              style={{
                padding: collapsed ? "8px 0" : "8px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? "#e8f5c0" : hoveredItem === item.href ? "#ece9e3" : "transparent",
                color: active ? "#3d6600" : hoveredItem === item.href ? "#1a1814" : "#7a7570",
                borderLeft: active ? "2px solid #3d6600" : "2px solid transparent",
              }}>
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="text-[11px] tracking-[0.1em] uppercase font-medium whitespace-nowrap overflow-hidden">
                  {item.label}
                </span>
              )}

              {/* Tooltip when collapsed */}
              {collapsed && hoveredItem === item.href && (
                <div className="absolute left-full ml-2 px-2 py-1 rounded-sm text-[11px] whitespace-nowrap z-50 pointer-events-none"
                  style={{ background: "#1a1814", color: "#f5f2ed", border: "1px solid #2a2520" }}>
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom: user + logout ── */}
      <div className="shrink-0 px-2 pb-4" style={{ borderTop: "1px solid #d4cfc7", paddingTop: "12px" }}>
        {/* User email */}
        {!collapsed && userEmail && (
          <div className="px-2 pb-3">
            <div className="text-[9px] tracking-[0.2em] uppercase mb-0.5" style={{ color: "#a8a39c" }}>Signed in as</div>
            <div className="text-[10px] truncate" style={{ color: "#7a7570" }}>{userEmail}</div>
          </div>
        )}
        {collapsed && userEmail && (
          <div className="flex justify-center pb-3" title={userEmail}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
              {userEmail[0].toUpperCase()}
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          onMouseEnter={() => setHoveredItem("logout")}
          onMouseLeave={() => setHoveredItem(null)}
          className="flex items-center gap-3 w-full rounded-sm transition-all duration-150 relative"
          style={{
            padding: collapsed ? "8px 0" : "8px 10px",
            justifyContent: collapsed ? "center" : "flex-start",
            background: hoveredItem === "logout" ? "#ffeaea" : "transparent",
            color: hoveredItem === "logout" ? "#b83030" : "#a8a39c",
          }}>
          <span className="shrink-0"><IconLogout /></span>
          {!collapsed && (
            <span className="text-[11px] tracking-[0.1em] uppercase font-medium">Logout</span>
          )}
          {collapsed && hoveredItem === "logout" && (
            <div className="absolute left-full ml-2 px-2 py-1 rounded-sm text-[11px] whitespace-nowrap z-50 pointer-events-none"
              style={{ background: "#1a1814", color: "#f5f2ed", border: "1px solid #2a2520" }}>
              Logout
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}