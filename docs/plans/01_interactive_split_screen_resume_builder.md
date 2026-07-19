# Comprehensive Implementation Plan: 01_interactive_split_screen_resume_builder

## 1. Overview & Objectives
Transform the CV Tailor resume generator page (`/generate`) into a real-time, interactive split-screen workspace. The left pane provides an editor for raw LaTeX code, while the right pane displays a live, debounced PDF preview rendered directly in the browser.

---

## 2. ✂️ Ponytail Anti-Overengineering Guardrails (KISS & YAGNI)
- **Editor Choice**: Use `@uiw/react-codemirror` with `@codemirror/lang-stex` (lightweight, zero heavy engine dependencies, fast SSR bundle size) rather than heavy full-blown IDE packages.
- **PDF Renderer Choice**: Render PDFs using a native browser `<iframe>` with `URL.createObjectURL(pdfBlob)` instead of heavy custom canvas PDF parsers.
- **Debounce Strategy**: Use a lightweight custom React `useDebounce` hook (800ms threshold) to limit backend compilation load.
- **State Scope**: Keep transient LaTeX string edits in component state (`useState`), avoiding unnecessary global state store overhead until export.

---

## 3. Detailed Architecture & Technical Solutions

### A. Component Hierarchy & File Structure
```
frontend/src/
├── app/
│   └── generate/
│       └── page.tsx                         # Top-level Page Shell (Auth check + Builder mounting)
├── components/
│   └── builder/
│       ├── SplitScreenBuilder.tsx           # Layout Orchestrator (Flex/Grid split-pane)
│       ├── EditorPane.tsx                   # CodeMirror LaTeX Editor Container
│       ├── PreviewPane.tsx                  # PDF Iframe + Overlay Spinner + Page Indicator
│       ├── CompilationStatusBar.tsx         # Real-time Status (Compiling, Ready, Error, Pages)
│       └── ExportToolbar.tsx                # Export Actions Bar (integrated from Plan 03)
└── hooks/
    └── useDebounce.ts                       # Generic Debounce Hook
```

---

### B. State Machine & Flow Diagram

```
 [ User Edits LaTeX in EditorPane ]
                │
                ▼
      setLatexCode(newCode)
                │
                ▼ (Wait 800ms inactive)
    debouncedLatexCode Updates
                │
                ▼
      setIsCompiling(true)
                │
                ▼
  POST /api/generate/compile-with-check
      ├── Payload: { latex: debouncedLatexCode, auto_fit: autoFitState }
      │
      ├── [Success 200]:
      │     1. Convert base64 / blob to PDF Object URL
      │     2. Revoke previous Object URL (prevent memory leak)
      │     3. setPdfUrl(newUrl), setPageCount(pages), setAtsResult(ats)
      │     4. setIsCompiling(false)
      │
      └── [Error 422 / 500]:
            1. setCompileError(detailMessage)
            2. setIsCompiling(false)
            3. Retain previous valid PDF preview URL (don't blank the screen!)
```

---

### C. Specific Technical Solutions & Code Specifications

#### Solution 1: Responsive Layout & Mobile Fallback
* **Desktop (`>= 768px`)**: Split 50/50 CSS Grid or Flex container (`grid-cols-2 gap-4 h-[calc(100vh-4rem)]`). Includes a subtle vertical drag divider handle for custom pane width resizing.
* **Mobile (`< 768px`)**: Tabbed toggle control (`[ 📝 Editor | 👁️ Preview ]`) allowing users to switch between full-screen editor and full-screen preview.

#### Solution 2: Memory Leak Prevention & Blob Lifecycle
```typescript
// Memory cleanup algorithm in PreviewPane.tsx
useEffect(() => {
  if (!pdfBlob) return;
  const objectUrl = URL.createObjectURL(pdfBlob);
  setPdfUrl(objectUrl);

  return () => {
    URL.revokeObjectURL(objectUrl);
  };
}, [pdfBlob]);
```

#### Solution 3: Non-Intrusive Error Handling
* If compilation fails (syntax error in LaTeX):
  * Display a floating red warning badge at the bottom of the editor pane showing the exact compiler error message.
  * **Keep the previous valid PDF visible** with a subtle grey overlay so the user never sees a blank white box.

---

## 4. Step-by-Step Implementation Roadmap

### Step 1: Install & Configure CodeMirror
* Run `npm install @uiw/react-codemirror @codemirror/lang-stex` in `frontend/`.
* Create `frontend/src/hooks/useDebounce.ts`.

### Step 2: Build Builder Components
* Create `EditorPane.tsx` with line numbers, code folding, and auto-closing brackets for LaTeX.
* Create `PreviewPane.tsx` with iframe viewer, loading skeleton, and page count badge.
* Create `SplitScreenBuilder.tsx` to handle state synchronization.

### Step 3: Integrate with Backend `/generate/compile`
* Update `frontend/src/app/generate/page.tsx` to mount `SplitScreenBuilder`.
* Wire debounced API calls to backend proxy.

---

## 5. Comprehensive Verification Matrix

| Test Scenario | Expected Outcome | Verification Method |
| :--- | :--- | :--- |
| **Typing Latency** | Editor remains buttery smooth (60fps) while typing. | Manual typing test |
| **Debounce Execution** | API compilation is triggered exactly once 800ms after last keystroke. | DevTools Network tab |
| **Memory Cleanup** | Old Blob URLs are revoked; memory stays flat over 50 edits. | Chrome Heap Snapshot |
| **Invalid LaTeX** | Error banner displays LaTeX error; previous PDF stays visible. | Insert syntax error `\badcmd` |
| **Mobile Responsiveness** | Tab bar appears on screens `< 768px`; switching tabs renders cleanly. | Browser Responsive Mode |
