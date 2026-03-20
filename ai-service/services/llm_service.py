import requests
import re
from models.schemas import UserProfile
from services.templates.jakes_resume import JAKES_RESUME

def clean_latex_output(raw: str) -> str:
    # Strip markdown fences
    raw = re.sub(r"```(?:latex)?\s*", "", raw)
    raw = re.sub(r"```", "", raw)

    # Take only what's AFTER \begin{document} if AI included preamble
    match = re.search(r"\\begin\{document\}", raw)
    if match:
        raw = raw[match.end():]

    # Strip \end{document}
    raw = re.sub(r"\\end\{document\}", "", raw)

    return raw.strip()

def wrap_with_template(body: str, template: str) -> str:
    return template.replace("<<BODY>>", body)

def build_prompt(profile: UserProfile, jd: str) -> str:
    template_instruction = r"""
    USE THIS EXACT LATEX STRUCTURE (Jake's Resume):

    HEADER (always first, contains ALL contact info):
    \begin{center}
        \textbf{\Huge \scshape John Doe} \\ \vspace{1pt}
        \small +63 912 345 6789 $|$
        \href{mailto:john@example.com}{john@example.com} $|$
        \href{https://linkedin.com/in/johndoe}{linkedin.com/in/johndoe} $|$
        \href{https://github.com/johndoe}{github.com/johndoe} $|$
        \href{https://johndoe.dev}{johndoe.dev}
    \end{center}

    SECTIONS (use only these, no "Contact Information" section):
    \section{Education}
    \resumeSubHeadingListStart
        \resumeSubheading{School Name}{Location}{Degree}{Dates}
    \resumeSubHeadingListEnd

    \section{Experience}
    \resumeSubHeadingListStart
        \resumeSubheading{Job Title}{Location}{Company Name}{Dates}
        \resumeItemListStart
            \resumeItem{Bullet point tailored to JD}
            \resumeItem{Another bullet point}
        \resumeItemListEnd
    \resumeSubHeadingListEnd

    \section{Projects}
    \resumeSubHeadingListStart
        \resumeProjectHeading{\textbf{Project Name} $|$ \emph{Tech Stack}}{Date}
        \resumeItemListStart
            \resumeItem{What you built and its impact}
        \resumeItemListEnd
    \resumeSubHeadingListEnd

    \section{Skills}
    \begin{itemize}[leftmargin=0.15in, label={}]
        \small{\item{
            \textbf{Languages}{: Python, Go, TypeScript} \\
            \textbf{Frameworks}{: FastAPI, Next.js, Tailwind CSS} \\
            \textbf{Tools}{: PostgreSQL, LaTeX, Git}
        }}
    \end{itemize}
    """

    strict_rules = r"""
    STRICT RULES:
    1. CRITICAL: Output ONLY what goes between \begin{document} and \end{document}.
    Do NOT include \documentclass, \usepackage, \newcommand, \begin{document}, or \end{document}.
    2. Do NOT wrap output in markdown code fences.
    3. Start your output DIRECTLY with \begin{center} — nothing before it.
    4. NEVER create a "Contact Information" section — all contact info goes in the header \begin{center} block only.
    5. NEVER create a "Professional Summary" section — go straight to Education, Experience, Projects, Skills.
    6. Always wrap Education and Experience entries inside \resumeSubHeadingListStart and \resumeSubHeadingListEnd.
    7. Tailor bullet points to emphasize skills and keywords mentioned in the JD.
    8. Use the custom commands: \resumeSubheading, \resumeProjectHeading, \resumeItem.
    9. Escape all LaTeX special characters in user data (%, &, $, #).
    10. If any field is missing or unknown (e.g. dates, links), leave it BLANK — never write "N/A", "Unknown", or placeholder text.
    """

    return (
        "You are an expert technical resume writer.\n"
        "Task: Rewrite the following User Profile into a professional LaTeX resume body tailored to the Job Description.\n\n"
        f"JOB DESCRIPTION:\n{jd}\n\n"
        f"USER PROFILE:\n{profile.model_dump_json()}\n\n"
        f"{template_instruction}\n"
        f"{strict_rules}"
    )

def generate_latex_resume(profile: UserProfile, jd: str) -> str:
    prompt = build_prompt(profile, jd)

    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": "qwen2.5:7b", "prompt": prompt, "stream": False},
            timeout=120
        )
        response.raise_for_status()
        raw_latex = response.json().get("response", "")

        cleaned = clean_latex_output(raw_latex)
        full_latex = wrap_with_template(cleaned, JAKES_RESUME)

        return full_latex

    except requests.exceptions.Timeout:
        raise Exception("Ollama request timed out — is the model loaded?")
    except requests.exceptions.ConnectionError:
        raise Exception("Cannot connect to Ollama — is it running on port 11434?")
    except Exception as e:
        raise Exception(f"SERVICE ERROR: {str(e)}")