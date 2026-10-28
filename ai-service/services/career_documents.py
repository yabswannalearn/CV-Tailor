"""Render interview-day notes as a downloadable PDF."""
import io
from xml.sax.saxutils import escape


def cheat_sheet_pdf(content: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    output = io.BytesIO()
    document = SimpleDocTemplate(output, rightMargin=0.7 * inch, leftMargin=0.7 * inch,
                                 topMargin=0.65 * inch, bottomMargin=0.65 * inch,
                                 title="Interview cheat sheet")
    heading = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=14, leading=18,
                             textColor=colors.HexColor("#36553b"), spaceAfter=6)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=15,
                          alignment=TA_LEFT, spaceAfter=4, wordWrap="CJK")
    flow = [Paragraph("Interview cheat sheet", heading), Spacer(1, 8)]
    for line in content.splitlines():
        stripped = line.strip()
        if not stripped:
            flow.append(Spacer(1, 5))
        elif stripped.startswith("#"):
            flow.append(Paragraph(escape(stripped.lstrip("# ")), heading))
        else:
            flow.append(Paragraph(escape(stripped), body))
    document.build(flow)
    return output.getvalue()
