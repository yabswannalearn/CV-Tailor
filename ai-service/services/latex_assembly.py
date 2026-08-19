from models.schemas import UserProfile
from services.templates import TEMPLATES

_HEADING_STYLES = {
    "classic": {"name_color": "NavyBlue", "name_vspace": "2pt", "small_prefix": r"\small ", "block_vspace": "-12pt"},
    "modern": {"name_color": "primaryColor", "name_vspace": "4pt", "small_prefix": r"\small\color{textColor} ", "block_vspace": "-10pt"},
}


def _escape_latex(text: str) -> str:
    if not text:
        return text
    replacements = [
        ("\\", r"\textbackslash{}"),
        ("%", r"\%"),
        ("&", r"\&"),
        ("$", r"\$"),
        ("#", r"\#"),
        ("_", r"\_"),
        ("~", r"\textasciitilde{}"),
        ("^", r"\^{}"),
    ]
    for char, escaped in replacements:
        text = text.replace(char, escaped)
    return text


def _build_contact_line(profile: UserProfile) -> tuple[str, str]:
    contact_parts = []
    if profile.mobile_no:
        contact_parts.append(r"\faPhone\ " + profile.mobile_no)
    if profile.email:
        contact_parts.append(r"\href{mailto:" + profile.email + r"}{\faEnvelope\ \underline{" + profile.email + r"}}")
    if profile.linkedin:
        display = profile.linkedin.replace("https://", "").replace("http://", "")
        contact_parts.append(r"\href{" + profile.linkedin + r"}{\faLinkedinSquare\ \underline{" + display + r"}}")
    if profile.github:
        display = profile.github.replace("https://", "").replace("http://", "")
        contact_parts.append(r"\href{" + profile.github + r"}{\faGithub\ \underline{" + display + r"}}")
    contact_line = " $|$ ".join(contact_parts)
    portfolio_line = ""
    if profile.portfolio:
        display = profile.portfolio.replace("https://", "").replace("http://", "")
        portfolio_line = r"\\ \href{" + profile.portfolio + r"}{\faGlobe\ \underline{" + display + r"}}"
    return contact_line, portfolio_line


def _build_heading(profile: UserProfile, template_id: str = "classic") -> str:
    name = f"{profile.first_name} {profile.last_name}".upper()
    contact_line, portfolio_line = _build_contact_line(profile)
    style = _HEADING_STYLES.get(template_id, _HEADING_STYLES["classic"])
    return (
        r"\begin{center}" + "\n"
        r"    {\Huge \textbf{\textcolor{" + style["name_color"] + r"}{" + name + r"}}} \\ \vspace{" + style["name_vspace"] + r"}" + "\n"
        "    " + style["small_prefix"] + contact_line + portfolio_line + "\n"
        r"    \vspace{" + style["block_vspace"] + r"}" + "\n"
        r"\end{center}"
    )


def _build_education(profile: UserProfile) -> str:
    lines = []
    if not profile.education:
        return r"    \item {No education history provided.}"
    for edu in profile.education:
        desc = edu.description or ""
        lines.append(r"    \resumeSubheading")
        lines.append(f"      {{{edu.school_name}}}{{{edu.location}}}")
        lines.append(f"      {{{edu.course}{' --- ' + desc if desc else ''}}}{{}}")
    return "\n".join(lines)


def _build_experience(entries: list) -> str:
    lines = []
    if not entries:
        return r"    \item {No experience entries provided.}"
    for exp in entries:
        lines.append(r"    \resumeSubheading")
        lines.append(f"      {{{_escape_latex(exp['company'])}}}{{{_escape_latex(exp['location'])}}}")
        lines.append(f"      {{{_escape_latex(exp['title'])}}}{{{_escape_latex(exp['date'])}}}")
        lines.append(r"      \resumeItemListStart")
        for b in exp.get("bullets", []):
            lines.append(f"        \\resumeItem{{{_escape_latex(b)}}}")
        lines.append(r"      \resumeItemListEnd")
        lines.append("")
    return "\n".join(lines)


def _build_projects(entries: list) -> str:
    lines = []
    if not entries:
        return r"      \item {No projects provided.}"
    for proj in entries:
        lines.append(r"      \resumeProjectHeading")
        lines.append(f"          {{\\textbf{{{_escape_latex(proj['name'])}}} $|$ \\emph{{{_escape_latex(proj['tech'])}}}}}{{\\textbf{{\\small {_escape_latex(proj['date'])}}}}}")
        lines.append(r"          \resumeItemListStart")
        for b in proj.get("bullets", []):
            lines.append(f"            \\resumeItem{{{_escape_latex(b)}}}")
        lines.append(r"          \resumeItemListEnd")
        lines.append(r"          \vspace{-13pt}")
        lines.append("")
    return "\n".join(lines)


def _build_skills(skills_dict: dict) -> str:
    lines = []
    if not skills_dict:
        return r"     \item {No skills provided.}"
    for category, items in skills_dict.items():
        lines.append(f"     \\textbf{{{_escape_latex(category)}}}{{: {_escape_latex(items)}}} \\\\")
    return "\n".join(lines)


def _build_certifications(cert_line: str) -> str:
    if not cert_line or not cert_line.strip():
        return ""
    cert_line = cert_line.replace(" | ", " $|$ ")
    return r"""\section{Certifications}
 \begin{itemize}[leftmargin=0.15in, label={}]
    \small{\item{
     """ + cert_line + r"""
    }}
 \end{itemize}"""


def assemble_latex(profile: UserProfile, ai_content: dict, template_id: str = "classic") -> str:
    doc = TEMPLATES.get(template_id, TEMPLATES["classic"])

    num_exp = len(ai_content.get("experience", []))
    num_proj = len(ai_content.get("projects", []))
    if (num_exp + num_proj) <= 3:
        doc = doc.replace(r"\vspace{-4pt}", r"\vspace{2pt}")
        doc = doc.replace(r"\vspace{-5pt}", r"\vspace{0pt}")
        doc = doc.replace(r"\vspace{-7pt}", r"\vspace{-3pt}")
        doc = doc.replace(r"\vspace{-2pt}", r"\vspace{1pt}")
        doc = doc.replace(r"\vspace{-16pt}", r"\vspace{-4pt}")
        doc = doc.replace(r"\vspace{-13pt}", r"\vspace{-2pt}")

    heading = _build_heading(profile, template_id)

    doc = doc.replace("<<HEADING>>", heading)
    doc = doc.replace("<<SUMMARY>>", ai_content.get("summary", ""))
    doc = doc.replace("<<EDUCATION>>", _build_education(profile))
    doc = doc.replace("<<EXPERIENCE>>", _build_experience(ai_content.get("experience", [])))
    doc = doc.replace("<<PROJECTS>>", _build_projects(ai_content.get("projects", [])))
    doc = doc.replace("<<SKILLS>>", _build_skills(ai_content.get("skills", {})))
    doc = doc.replace("<<CERTIFICATIONS>>", _build_certifications(ai_content.get("certifications", "")))
    return doc
