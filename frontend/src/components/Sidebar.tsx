"use client";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useDispatch } from "react-redux";
import { API_URL } from "@/lib/api";
import { useCurrentUser, useTrackerJobs, type ApplicationStatus } from "@/lib/queries";
import { queryClient } from "@/lib/queryClient";
import { setExpandedJob } from "@/lib/store";

const API = API_URL;

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

const IconDiscover = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="7" cy="7" r="1.6" fill="currentColor"/>
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

const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line x1="2.5" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <line x1="2.5" y1="9" x2="15.5" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <line x1="2.5" y1="13" x2="15.5" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

// ── Nav items ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard",   href: "/dashboard",   icon: <IconDashboard /> },
  { label: "Generate CV", href: "/generate",    icon: <IconGenerate /> },
  { label: "Discover",    href: "/discover",    icon: <IconDiscover /> },
  { label: "Job Tracker", href: "/tracker",     icon: <IconTracker /> },
];

const STATUS_DOT: Record<ApplicationStatus, string> = {
  Saved: "#a8a39c",
  Applied: "#4a7acc",
  Interview: "#c8a800",
  "Tech Test": "#8a4acc",
  Offer: "#5a8a00",
  Rejected: "#cc3333",
  Ghosted: "#b0aba4",
};

// ── Sidebar ───────────────────────────────────────────────────────
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const { data: trackerJobs = [], isPending: trackerJobsLoading } = useTrackerJobs(trackerOpen);
  const userEmail = user?.email || "";

  const closeMobile = () => setMobileOpen(false);

  const openTrackedJob = (id: number) => {
    dispatch(setExpandedJob(id));
    router.push("/tracker");
    closeMobile();
  };

  const handleLogout = async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    queryClient.clear();
    router.push("/login");
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile top bar — in normal document flow so page content can never overlap it */}
      <div className="flex md:hidden items-center gap-2 h-12 px-3 shrink-0"
        style={{ background: "#edeae4", borderBottom: "1px solid #d4cfc7" }}>
        <button onClick={() => { setCollapsed(false); setMobileOpen(o => !o); }}
          className="w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-150"
          style={{ color: "#1a1814" }}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}>
          <IconMenu />
        </button>
        <div className="w-4 h-4 rounded-sm flex items-center justify-center shrink-0"
          style={{ background: "#3d6600" }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white"/>
          </svg>
        </div>
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: "#1a1814" }}>cv_tailor</span>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30" style={{ background: "rgba(26,24,20,0.45)" }}
          onClick={closeMobile} aria-hidden="true" />
      )}

      <aside
        className={`mobile-sidebar${mobileOpen ? " mobile-sidebar-open" : ""} flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out`}
        style={{
          width: collapsed ? "56px" : "200px",
          background: "#edeae4",
          borderRight: "1px solid #d4cfc7",
          boxShadow: "2px 0 16px rgba(26,24,20,0.05)",
          fontFamily: "ui-monospace, 'Courier New', monospace",
        }}>

      {/* ── Logo + collapse ── */}
      <div className="flex items-center justify-between px-3 py-4 shrink-0"
        style={{ borderBottom: "1px solid #d4cfc7" }}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ background: "#3d6600", boxShadow: "0 1px 3px rgba(61,102,0,0.35)" }}>
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
          <div className="w-5 h-5 rounded-md flex items-center justify-center mx-auto"
            style={{ background: "#3d6600", boxShadow: "0 1px 3px rgba(61,102,0,0.35)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2H6.5L8 3.5V8H2V2Z" fill="white"/>
            </svg>
          </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)}
            className="hidden md:flex w-6 h-6 items-center justify-center rounded-full transition-colors duration-150"
            style={{ color: "#a8a39c" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#4a4540"; e.currentTarget.style.background = "#e2ded6" }}
            onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent" }}
            title="Collapse sidebar">
            <IconChevron collapsed={false} />
          </button>
        )}
        <button onClick={closeMobile}
          className="flex md:hidden w-6 h-6 items-center justify-center rounded-full transition-colors duration-150"
          style={{ color: "#a8a39c" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#4a4540"; e.currentTarget.style.background = "#e2ded6" }}
          onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent" }}
          aria-label="Close menu">
          <IconClose />
        </button>
      </div>

      {/* Expand button when collapsed (desktop only) */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)}
          className="hidden md:flex items-center justify-center py-2 w-full transition-colors duration-150"
          style={{ color: "#a8a39c", borderBottom: "1px solid #d4cfc7" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#4a4540"; e.currentTarget.style.background = "#e2ded6" }}
          onMouseLeave={e => { e.currentTarget.style.color = "#a8a39c"; e.currentTarget.style.background = "transparent" }}
          title="Expand sidebar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: "rotate(270deg)" }}>
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* ── Nav items ── */}
      <nav className="flex flex-col gap-1.5 px-2 pt-4 flex-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href);
          const hovered = hoveredItem === item.href;
          const isTracker = item.href === "/tracker";

          const link = (
            <Link
              href={item.href}
              prefetch
              onClick={closeMobile}
              onMouseEnter={() => setHoveredItem(item.href)}
              onMouseLeave={() => setHoveredItem(null)}
              onFocus={() => setHoveredItem(item.href)}
              onBlur={() => setHoveredItem(null)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className="flex items-center gap-3 rounded-lg transition-all duration-150 relative group flex-1 min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d6600]"
              style={{
                padding: collapsed ? "8px 0" : "8px 10px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: active ? "#e8f5c0" : hovered ? "#e2ded6" : "transparent",
                color: active ? "#3d6600" : hovered ? "#1a1814" : "#7a7570",
                boxShadow: active ? "0 1px 3px rgba(61,102,0,0.18)" : "none",
                transform: hovered && !active && !collapsed ? "translateX(2px)" : "translateX(0)",
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
            </Link>
          );

          if (!isTracker) return <div key={item.href}>{link}</div>;

          return (
            <div key={item.href} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                {link}
                {!collapsed && (
                  <button
                    onClick={() => setTrackerOpen(o => !o)}
                    aria-expanded={trackerOpen}
                    aria-label={trackerOpen ? "Hide recent applications" : "Show recent applications"}
                    title={trackerOpen ? "Hide recent applications" : "Show recent applications"}
                    className="w-6 h-6 flex items-center justify-center rounded-md shrink-0 transition-colors duration-150"
                    style={{ color: "#a8a39c" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#e2ded6"; e.currentTarget.style.color = "#4a4540" }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a8a39c" }}>
                    <IconChevron collapsed={trackerOpen} />
                  </button>
                )}
              </div>

              {/* Recent applications preview */}
              {!collapsed && trackerOpen && (
                <div className="ml-2 pl-2 flex flex-col gap-0.5" style={{ borderLeft: "1px solid #d4cfc7" }}>
                  {trackerJobsLoading && (
                    <div className="px-2 py-1.5 text-[10px]" style={{ color: "#a8a39c" }}>Loading…</div>
                  )}
                  {!trackerJobsLoading && trackerJobs.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px]" style={{ color: "#a8a39c" }}>No applications yet</div>
                  )}
                  {trackerJobs.slice(0, 5).map(job => (
                    <button
                      key={job.id}
                      onClick={() => openTrackedJob(job.id)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors duration-150 min-w-0"
                      style={{ background: "transparent" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#e2ded6"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[job.status] }} />
                      <span className="flex flex-col min-w-0">
                        <span className="text-[10px] font-medium truncate" style={{ color: "#1a1814" }}>{job.job_title}</span>
                        <span className="text-[9px] truncate" style={{ color: "#7a7570" }}>{job.company_name}</span>
                      </span>
                    </button>
                  ))}
                  {trackerJobs.length > 5 && (
                    <Link href="/tracker" onClick={closeMobile}
                      className="px-2 py-1 text-[9px] tracking-[0.15em] uppercase font-medium"
                      style={{ color: "#5a8a00" }}>
                      View all →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Bottom: user + logout ── */}
      <div className="shrink-0 px-2 pb-4" style={{ borderTop: "1px solid #d4cfc7", paddingTop: "12px" }}>
        {/* User email */}
        {!collapsed && userEmail && (
          <div className="flex items-center gap-2 px-2 pb-3 overflow-hidden">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: "#e8f5c0", color: "#3d6600", border: "1px solid #8ab030" }}>
              {userEmail[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-[9px] tracking-[0.2em] uppercase" style={{ color: "#a8a39c" }}>Signed in</div>
              <div className="text-[10px] truncate" style={{ color: "#7a7570" }}>{userEmail}</div>
            </div>
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
          className="flex items-center gap-3 w-full rounded-lg transition-all duration-150 relative"
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
    </>
  );
}
