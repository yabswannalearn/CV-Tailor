import io
import shutil
import subprocess
from pypdf import PdfReader

def ats_check(pdf_bytes: bytes, preset_section_order: list[str] | None = None) -> dict:
    warnings = []
    extracted_text = ""
    
    # Try pdftotext (poppler)
    has_pdftotext = shutil.which("pdftotext") is not None
    if has_pdftotext:
        import tempfile
        import os
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name
        
        try:
            result = subprocess.run(["pdftotext", "-layout", tmp_path, "-"], capture_output=True, text=True, check=True)
            extracted_text = result.stdout
        except Exception as e:
            warnings.append(f"pdftotext failed: {str(e)}; used pypdf fallback — order check less reliable.")
            has_pdftotext = False
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    if not has_pdftotext:
        if not warnings:
            warnings.append("pdftotext (poppler) not found; used pypdf fallback — order check less reliable.")
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            extracted_text = "\n".join(page.extract_text() for page in reader.pages)
        except Exception as e:
            warnings.append(f"Failed to extract text using pypdf: {str(e)}")
            return {"pass": False, "warnings": warnings, "extracted_text": ""}

    # Clean the extracted text
    import re
    extracted_text = re.sub(r'\s+', ' ', extracted_text).strip()
    extracted_lower = extracted_text.lower()
    
    # Check A: Section order
    if preset_section_order:
        last_pos = -1
        out_of_order = False
        missing_headings = []
        for heading in preset_section_order:
            # Handle variants
            search_str = heading.lower()
            if search_str == "experience":
                search_variants = ["experience", "work experience"]
            elif search_str == "technical skills":
                search_variants = ["technical skills", "skills"]
            elif search_str == "summary":
                search_variants = ["summary", "professional summary", "profile"]
            else:
                search_variants = [search_str]
            
            found_pos = -1
            for variant in search_variants:
                pos = extracted_lower.find(variant)
                if pos != -1:
                    found_pos = pos
                    break
            
            if found_pos == -1:
                missing_headings.append(heading)
            else:
                if found_pos < last_pos:
                    out_of_order = True
                last_pos = found_pos
                
        if missing_headings:
            for h in missing_headings:
                warnings.append(f"Required heading not found in extracted text: {h}.")
        if out_of_order:
            warnings.append(f"Section headings out of order in extracted text: expected {preset_section_order}.")

    # Check B: Selectable text
    num_pages = 1
    if len(extracted_text) < 50 * num_pages:
        warnings.append("Very little selectable text extracted — PDF may contain image-based text that ATS cannot parse.")
        
    # Check C: ATS-recognizable headings present
    whitelist = {"experience", "work experience", "education", "skills", "technical skills", "summary", "professional summary", "projects", "certifications"}
    
    found_any = any(h in extracted_lower for h in whitelist)
    if not found_any:
        warnings.append("No ATS-conventional section headings found in extracted text.")
        
    if preset_section_order:
        for heading in preset_section_order:
            if heading.lower() not in whitelist:
                warnings.append(f"Heading '{heading}' may not be ATS-recognized; consider a conventional variant.")

    return {
        "pass": len(warnings) == 0,
        "warnings": warnings,
        "extracted_text": extracted_text
    }
