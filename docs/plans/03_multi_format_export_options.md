# Comprehensive Implementation Plan: 03_multi_format_export_options

## 1. Overview & Objectives
Provide an all-in-one **Export Toolbar** on the resume generator workspace, enabling users to download their tailored document in 4 distinct formats:
1. 📄 **PDF Document (`.pdf`)**
2. 💻 **LaTeX Source File (`.tex`)**
3. 📝 **Microsoft Word Document (`.docx`)**
4. 📋 **Copy to Clipboard (Raw LaTeX or Plain Text)**

---

## 2. ✂️ Ponytail Anti-Overengineering Guardrails (KISS & YAGNI)
- **Zero-Server Client Downloads for `.tex` & Clipboard**: Performing `.tex` file generation and clipboard copying entirely in browser JavaScript (0 API roundtrips).
- **Lightweight `.docx` Service**: Use `python-docx` in Python rather than installing heavy external binary dependencies like Pandoc or LibreOffice.
- **Unified UI Component**: Enclose all export actions in a clean, self-contained `ExportToolbar.tsx` component.

---

## 3. Detailed Architecture & Technical Solutions

### A. Export Actions Matrix & Execution Paths

| Export Format | Processing Location | Implementation Details | Endpoint / Library |
| :--- | :--- | :--- | :--- |
| **PDF (`.pdf`)** | Client + Backend | Uses existing compiled PDF blob URL | `URL.createObjectURL(blob)` |
| **LaTeX (`.tex`)** | Client Only | Browser `Blob` with `text/x-tex` mime type | Client-side `HTMLAnchorElement` trigger |
| **Word (`.docx`)** | Backend | Python `python-docx` section parser & builder | `POST /api/generate/export/docx` |
| **Copy Clipboard** | Client Only | `navigator.clipboard.writeText()` + Toast | Native Browser API |

---

### B. Microsoft Word (`.docx`) Generator Implementation

#### 1. Add `python-docx` dependency:
Add `python-docx>=1.1.0` to `ai-service/requirements.txt`.

#### 2. Create `ai-service/services/docx_service.py`:
```python
import io
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

def convert_latex_to_docx(latex_code: str) -> bytes:
    doc = Document()
    
    # Page Margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)
        
    # Standard Style Configurations
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(10.5)
    normal_style.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    # Clean TeX commands & extract sections
    lines = latex_code.split('\n')
    in_document = False
    
    for line in lines:
        line_str = line.strip()
        if r"\begin{document}" in line_str:
            in_document = True
            continue
        if r"\end{document}" in line_str:
            break
        if not in_document or not line_str or line_str.startswith('%'):
            continue
            
        # Parse Section Headers \section{...}
        section_match = re.search(r'\\section\*?\{(.*?)\}', line_str)
        if section_match:
            title = section_match.group(1)
            h = doc.add_heading(title.upper(), level=2)
            h.paragraph_format.space_before = Pt(8)
            h.paragraph_format.space_after = Pt(3)
            continue
            
        # Parse Bullet Items \item
        if line_str.startswith(r'\item'):
            item_text = re.sub(r'\\item\s*', '', line_str)
            item_text = strip_latex_formatting(item_text)
            p = doc.add_paragraph(item_text, style='List Bullet')
            p.paragraph_format.space_after = Pt(2)
            continue
            
        # Regular Paragraph
        clean_text = strip_latex_formatting(line_str)
        if clean_text:
            p = doc.add_paragraph(clean_text)
            p.paragraph_format.space_after = Pt(3)
            
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def strip_latex_formatting(text: str) -> str:
    text = re.sub(r'\\textbf\{(.*?)\}', r'\1', text)
    text = re.sub(r'\\textit\{(.*?)\}', r'\1', text)
    text = re.sub(r'\\href\{.*?\}\{(.*?)\}', r'\1', text)
    text = re.sub(r'\\[a-zA-Z]+\{?\}?', '', text)
    return text.replace('{', '').replace('}', '').strip()
```

---

### C. Client-Side Export Implementation (`ExportToolbar.tsx`)

```typescript
// Client-side helper functions in ExportToolbar.tsx

// 1. Download raw .tex file
const handleDownloadTex = () => {
  const blob = new Blob([latexCode], { type: "text/x-tex;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "CV_Tailor_Resume.tex";
  a.click();
  URL.revokeObjectURL(url);
};

// 2. Copy LaTeX / Plain text to Clipboard
const handleCopy = async (mode: "latex" | "plain") => {
  const textToCopy = mode === "latex" ? latexCode : stripLatexToPlainText(latexCode);
  await navigator.clipboard.writeText(textToCopy);
  setCopyToast(mode === "latex" ? "LaTeX copied!" : "Plain text copied!");
  setTimeout(() => setCopyToast(null), 2500);
};
```

---

## 4. Step-by-Step Implementation Roadmap

### Step 1: Backend Setup
1. Add `python-docx` to `ai-service/requirements.txt`.
2. Create `ai-service/services/docx_service.py`.
3. Add `POST /generate/export/docx` endpoint in `ai-service/routers/generate_routes.py`.

### Step 2: Frontend Export Components
1. Create `frontend/src/components/builder/ExportToolbar.tsx`.
2. Add PDF download, TeX download, Word download, and Clipboard copy event handlers.
3. Add toast notifications for copy feedback.

---

## 5. Comprehensive Verification Matrix

| Action | Input Data | Expected Result | Verification Method |
| :--- | :--- | :--- | :--- |
| **Download PDF** | Current PDF Blob | Browser downloads `CV_Tailor_Resume.pdf` | Inspect downloaded PDF |
| **Download .tex** | Current LaTeX string | Browser downloads `CV_Tailor_Resume.tex` | Open in TeX editor / VSCode |
| **Download Word** | LaTeX string | Browser downloads `CV_Tailor_Resume.docx` | Open in MS Word / Mac Pages |
| **Copy LaTeX** | Click "Copy LaTeX" | Raw code in clipboard + toast appears | Paste into text editor |
| **Copy Plain Text** | Click "Copy Text" | Clean plain text without TeX tags | Paste into text editor |
