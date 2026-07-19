# Comprehensive Implementation Plan: 02_single_page_overflow_resolution_assistant

## 1. Overview & Objectives
Eliminate the rigid 1-page requirement failure (`422 Unprocessable Entity`) by introducing an intelligent, automated **"Auto-fit to 1 Page"** feature. This tool automatically adjusts LaTeX geometry, vertical padding, line spacing, and font metrics whenever a resume spills over onto a second page.

---

## 2. ✂️ Ponytail Anti-Overengineering Guardrails (KISS & YAGNI)
- **Single-Pass Deterministic Overrides**: Avoid building complex multi-iteration loop solvers that re-compile 10 times testing 0.1pt variations. Apply a single, proven set of LaTeX layout-compression macros.
- **Direct String/Regex Injections**: Use reliable Python regex/string replacements on the LaTeX preamble rather than introducing heavy external TeX AST parsers.
- **Explicit User Control**: Give the user a clear toggle switch ("Auto-fit to 1 Page") and an optional "Apply Auto-fit to Source Code" button to make modifications transparent.

---

## 3. Detailed Architecture & Technical Solutions

### A. The Auto-fit LaTeX Transformation Engine
Located in `ai-service/services/pdf_service.py`:

```python
def apply_single_page_autofit(latex_code: str) -> str:
    """
    Applies deterministic LaTeX layout compression rules to ensure the output fits on 1 page.
    """
    # 1. Compress Margins (Geometry)
    if r"\usepackage" in latex_code and "geometry" in latex_code:
        latex_code = re.sub(
            r"\\usepackage\[.*?\]\{geometry\}",
            r"\\usepackage[margin=0.4in,top=0.35in,bottom=0.35in]{geometry}",
            latex_code
        )
    else:
        # Inject geometry package if not present
        latex_code = latex_code.replace(
            r"\begin{document}",
            r"\usepackage[margin=0.4in,top=0.35in,bottom=0.35in]{geometry}" + "\n" + r"\begin{document}"
        )

    # 2. Inject Line Spacing Compression
    if r"\linespread" not in latex_code:
        latex_code = latex_code.replace(
            r"\begin{document}",
            r"\linespread{0.93}" + "\n" + r"\begin{document}"
        )

    # 3. Compress Enumitem List Spacing (itemize/enumerate bullet points)
    enumitem_config = (
        r"\usepackage{enumitem}" + "\n"
        r"\setlist{nosep, topsep=1pt, partopsep=0pt, parsep=0pt, itemsep=1pt, leftmargin=*}" + "\n"
    )
    if r"\usepackage{enumitem}" not in latex_code:
        latex_code = latex_code.replace(r"\begin{document}", enumitem_config + r"\begin{document}")

    # 4. Compress Section Title Spacing if titlesec package is used
    if r"\usepackage{titlesec}" in latex_code and r"\titlespacing" not in latex_code:
        title_spacing = r"\titlespacing*{\section}{0pt}{4pt}{2pt}" + "\n"
        latex_code = latex_code.replace(r"\begin{document}", title_spacing + r"\begin{document}")

    return latex_code
```

---

### B. Backend API Integration & Fallback Sequence

#### Updated Endpoint Logic in `ai-service/routers/generate_routes.py`:

```
[ POST /generate/compile ]
  │ Payload: { latex: string, auto_fit: bool = False }
  │
  ├── Step 1: Perform primary compilation
  │     pdf_bytes = compile_latex_to_pdf(latex)
  │     page_count = pdf_page_count(pdf_bytes)
  │
  ├── Step 2: Check Page Count & Auto-fit condition
  │     IF page_count > 1 AND (auto_fit == True OR request.headers.get("X-Auto-Fit-Fallback") == "true"):
  │         tightened_latex = apply_single_page_autofit(latex)
  │         pdf_bytes = compile_latex_to_pdf(tightened_latex)
  │         page_count = pdf_page_count(pdf_bytes)
  │         latex = tightened_latex
  │
  └── Step 3: Return Response
        Return PDF + page_count + auto_fitted_flag
```

---

### C. Frontend UX & Control Specifications

1. **Auto-fit Toggle Switch** (`AutoFitToggle.tsx`):
   * Located in the editor control header: `[ Auto-fit 1-Page: ON/OFF ]`.
   * When enabled, appends `auto_fit: true` to `/generate/compile` requests.

2. **Visual Page Indicator**:
   * **`1 Page ✓` (Green Badge)**: Displayed when output is exactly 1 page.
   * **`2 Pages ⚠️` (Amber Badge + Banner)**: Displayed when output exceeds 1 page (if auto-fit is OFF). Includes a 1-click button: `[ 🪄 Click to Auto-fit to 1 Page ]`.

3. **"Apply Auto-fit to Source Code" Button**:
   * When auto-fit is active, users can click this button to permanently replace the editor's raw LaTeX text with the auto-fitted code.

---

## 4. Step-by-Step Implementation Roadmap

### Step 1: Backend Implementation
1. Add `apply_single_page_autofit()` function to `ai-service/services/pdf_service.py`.
2. Update `CompileLatexRequest` in `ai-service/routers/generate_routes.py` with `auto_fit: bool = False`.
3. Add unit test `test_auto_fit_two_page_latex_reduces_to_one_page()`.

### Step 2: Frontend UI Component Implementation
1. Create `frontend/src/components/builder/AutoFitToggle.tsx`.
2. Add page count indicator badge in `PreviewPane.tsx`.
3. Connect toggle state to API request state in `SplitScreenBuilder.tsx`.

---

## 5. Comprehensive Verification Matrix

| Scenario | Input Condition | Expected Result | Pass Criteria |
| :--- | :--- | :--- | :--- |
| **Normal 1-Page CV** | Auto-fit OFF | Compiles normally, 1 Page | Page count = 1, Auto-fit not triggered |
| **Long 2-Page CV (Auto-fit OFF)** | Auto-fit OFF | Shows amber warning `2 Pages` | User sees clear overflow warning banner |
| **Long 2-Page CV (Auto-fit ON)** | Auto-fit ON | Re-compiles with geometry compression | Page count drops from 2 to 1 automatically |
| **Apply to Code Action** | Click "Apply Auto-fit" | Editor text updates with tightened LaTeX | Editor state reflects compressed preamble |
