import json
from sqlalchemy import create_engine, text

engine = create_engine('postgresql://postgres:reinael123@localhost:5432/cv_tailor')

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_template VARCHAR(50) DEFAULT 'classic';"))
    conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preset_slug VARCHAR(50) DEFAULT 'blank';"))
    conn.execute(text("ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) NOT NULL DEFAULT 'classic';"))
    
    conn.execute(text("""
    CREATE TABLE IF NOT EXISTS resume_presets (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      target_summary_prompt TEXT NOT NULL,
      core_skills_bank JSON NOT NULL,
      metric_prompts JSON NOT NULL,
      section_order JSON NOT NULL,
      recommended_template VARCHAR(50) NOT NULL DEFAULT 'classic',
      lever_guidance TEXT NOT NULL
    );
    """))

    presets = [
        {
            "slug": "virtual-assistant",
            "display_name": "Virtual Assistant",
            "target_summary_prompt": "Reliable virtual assistant experienced in supporting busy entrepreneurs and small business owners remotely. Emphasize calendar/email management, responsiveness, organization, and trustworthiness.",
            "core_skills_bank": ["Email & Calendar Management", "Customer Service / Live Chat", "Data Entry & Reporting", "Social Media Scheduling", "File & Document Management", "CRM Management", "Microsoft 365 / Google Workspace"],
            "metric_prompts": ["Managed [X]'s inbox and calendar, reducing scheduling conflicts by [X]%", "Handled [X]+ customer inquiries daily via email/chat with a [X]% satisfaction rate", "Organized [X]+ files and records, cutting retrieval time from [X] to [X] minutes"],
            "section_order": ["Summary", "Experience", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "classic",
            "lever_guidance": "Experience bullets are your main lever — write 3-4 detailed bullets per role. Emphasize organization, responsiveness, and volume handled. Use verbs like Managed, Coordinated, Organized, Handled, Streamlined. Projects usually don't apply; if the profile has none, do not invent any."
        },
        {
            "slug": "software-developer",
            "display_name": "Software Developer",
            "target_summary_prompt": "Software developer with strong engineering background. Emphasize technical depth, system design, and measurable impact on products.",
            "core_skills_bank": ["JavaScript", "TypeScript", "Python", "React", "Node.js", "PostgreSQL", "Git", "REST APIs", "Docker"],
            "metric_prompts": ["Built [X] feature used by [X]+ users, reducing [metric] by [X]%", "Engineered [X] service handling [X] requests/day with [X]% uptime", "Improved [X] performance by [X]% through [specific optimization]"],
            "section_order": ["Summary", "Experience", "Projects", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "modern",
            "lever_guidance": "Projects are your main lever — write 3 detailed bullets per project, each 1.5-2 lines, explaining what you built, how, and the measurable impact. Experience bullets should also be detailed. Use verbs like Architected, Engineered, Designed, Implemented, Optimized."
        },
        {
            "slug": "customer-support",
            "display_name": "Customer Support / BPO Specialist",
            "target_summary_prompt": "Customer support specialist with experience in high-volume ticket resolution and cross-channel communication. Emphasize CSAT/NPS, ticket volume, and tools used.",
            "core_skills_bank": ["Zendesk", "Intercom", "Freshdesk", "Live Chat Support", "Ticket Escalation", "CSAT/NPS Management", "Multi-channel Support", "Email Support"],
            "metric_prompts": ["Resolved [X]+ tickets/day with a [X]% CSAT score", "Reduced average response time from [X] to [X]", "Maintained [X]% NPS across [X]+ monthly interactions"],
            "section_order": ["Summary", "Experience", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "classic",
            "lever_guidance": "Experience bullets are your main lever — write 3-4 detailed bullets per role. Quantify ticket volume, CSAT, response time, and channels. Use verbs like Resolved, Handled, Reduced, Maintained, Escalated. Projects usually don't apply; do not invent any."
        },
        {
            "slug": "bookkeeping-finance",
            "display_name": "Bookkeeping / Accounting / Finance Support",
            "target_summary_prompt": "Detail-oriented bookkeeper and accounting support specialist experienced in maintaining accurate financial records for small businesses. Emphasize accuracy, reconciliation, and tools (QuickBooks, Xero).",
            "core_skills_bank": ["QuickBooks", "Xero", "Wave", "Bank Reconciliation", "Accounts Payable / Receivable", "Invoicing", "Financial Reporting", "Excel / Google Sheets"],
            "metric_prompts": ["Managed [X]+ monthly transactions with [X]% accuracy across [X] accounts", "Reduced reconciliation time from [X] to [X] hours per month", "Processed [X]+ invoices/month with [X]% error rate"],
            "section_order": ["Summary", "Experience", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "classic",
            "lever_guidance": "Experience bullets are your main lever — write 3-4 detailed bullets per role. Emphasize accuracy, volume, and reconciliation metrics. Use verbs like Managed, Reconciled, Processed, Maintained, Audited. Projects usually don't apply; do not invent any."
        },
        {
            "slug": "sales-sdr",
            "display_name": "Sales / Appointment Setter / SDR",
            "target_summary_prompt": "Outbound sales specialist with experience in lead generation, cold outreach, and appointment setting. Emphasize call volume, conversion rates, and pipeline contribution.",
            "core_skills_bank": ["Cold Calling", "Lead Generation", "Appointment Setting", "CRM (HubSpot / Salesforce)", "Email Outreach", "Pipeline Management", "Discovery Calls", "Sales Scripting"],
            "metric_prompts": ["Booked [X]+ qualified meetings/month with a [X]% show rate", "Made [X]+ cold calls/day, converting [X]% to opportunities", "Generated [X]+ in pipeline from [X]+ outbound touches per month"],
            "section_order": ["Summary", "Experience", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "classic",
            "lever_guidance": "Experience bullets are your main lever — write 3-4 detailed bullets per role. Quantify call volume, meetings booked, conversion rates, and pipeline. Use verbs like Booked, Generated, Pitched, Closed, Nurtured. Projects usually don't apply; do not invent any."
        },
        {
            "slug": "content-marketing",
            "display_name": "Content Writer / Copywriter / Digital Marketing",
            "target_summary_prompt": "Content writer and digital marketing specialist experienced in creating SEO-driven content and campaigns. Emphasize content output, engagement metrics, and tools.",
            "core_skills_bank": ["SEO Writing", "Copywriting", "Content Strategy", "WordPress", "Google Analytics", "Social Media Marketing", "Email Marketing", "Keyword Research"],
            "metric_prompts": ["Published [X]+ articles/month driving [X]% organic traffic growth", "Grew social engagement by [X]% across [X]+ followers", "Ran [X]+ campaigns generating [X]+ leads at [X]% conversion"],
            "section_order": ["Summary", "Experience", "Projects", "Technical Skills", "Education", "Certifications"],
            "recommended_template": "modern",
            "lever_guidance": "Projects (campaigns, published content, portfolios) are your main lever alongside experience — write 2-3 detailed bullets per project and 3 per role. Emphasize content output, engagement, and traffic metrics. Use verbs like Wrote, Published, Grew, Optimized, Launched, Drove."
        }
    ]

    for p in presets:
        conn.execute(text("""
        INSERT INTO resume_presets (
            slug, display_name, target_summary_prompt, core_skills_bank, metric_prompts, section_order, recommended_template, lever_guidance
        ) VALUES (
            :slug, :display_name, :target_summary_prompt, :core_skills_bank, :metric_prompts, :section_order, :recommended_template, :lever_guidance
        ) ON CONFLICT (slug) DO NOTHING
        """), {
            "slug": p["slug"],
            "display_name": p["display_name"],
            "target_summary_prompt": p["target_summary_prompt"],
            "core_skills_bank": json.dumps(p["core_skills_bank"]),
            "metric_prompts": json.dumps(p["metric_prompts"]),
            "section_order": json.dumps(p["section_order"]),
            "recommended_template": p["recommended_template"],
            "lever_guidance": p["lever_guidance"]
        })

    conn.commit()
print("Migration successful")
