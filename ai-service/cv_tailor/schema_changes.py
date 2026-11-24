"""Versioned SQLite initialization and shared preset seeds."""
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import json
from uuid import uuid4
from contextlib import closing

SCHEMA_VERSION = 4

PRESETS = [{'core_skills_bank': ['Email & Calendar Management',
                       'Customer Service / Live Chat',
                       'Data Entry & Reporting',
                       'Social Media Scheduling',
                       'File & Document Management',
                       'CRM Management',
                       'Microsoft 365 / Google Workspace'],
  'display_name': 'Virtual Assistant',
  'lever_guidance': 'Experience bullets are your main lever â€” write 3-4 detailed bullets per role. Emphasize '
                    'organization, responsiveness, and volume handled. Use verbs like Managed, Coordinated, '
                    "Organized, Handled, Streamlined. Projects usually don't apply; if the profile has none, "
                    'do not invent any.',
  'metric_prompts': ["Managed [X]'s inbox and calendar, reducing scheduling conflicts by [X]%",
                     'Handled [X]+ customer inquiries daily via email/chat with a [X]% satisfaction rate',
                     'Organized [X]+ files and records, cutting retrieval time from [X] to [X] minutes'],
  'recommended_template': 'classic',
  'section_order': ['Summary', 'Experience', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'virtual-assistant',
  'target_summary_prompt': 'Reliable virtual assistant experienced in supporting busy entrepreneurs and '
                           'small business owners remotely. Emphasize calendar/email management, '
                           'responsiveness, organization, and trustworthiness.'},
 {'core_skills_bank': ['JavaScript',
                       'TypeScript',
                       'Python',
                       'React',
                       'Node.js',
                       'PostgreSQL',
                       'Git',
                       'REST APIs',
                       'Docker'],
  'display_name': 'Software Developer',
  'lever_guidance': 'Projects are your main lever â€” write 3 detailed bullets per project, each 1.5-2 lines, '
                    'explaining what you built, how, and the measurable impact. Experience bullets should '
                    'also be detailed. Use verbs like Architected, Engineered, Designed, Implemented, '
                    'Optimized.',
  'metric_prompts': ['Built [X] feature used by [X]+ users, reducing [metric] by [X]%',
                     'Engineered [X] service handling [X] requests/day with [X]% uptime',
                     'Improved [X] performance by [X]% through [specific optimization]'],
  'recommended_template': 'modern',
  'section_order': ['Summary', 'Experience', 'Projects', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'software-developer',
  'target_summary_prompt': 'Software developer with strong engineering background. Emphasize technical '
                           'depth, system design, and measurable impact on products.'},
 {'core_skills_bank': ['Zendesk',
                       'Intercom',
                       'Freshdesk',
                       'Live Chat Support',
                       'Ticket Escalation',
                       'CSAT/NPS Management',
                       'Multi-channel Support',
                       'Email Support'],
  'display_name': 'Customer Support / BPO Specialist',
  'lever_guidance': 'Experience bullets are your main lever â€” write 3-4 detailed bullets per role. Quantify '
                    'ticket volume, CSAT, response time, and channels. Use verbs like Resolved, Handled, '
                    "Reduced, Maintained, Escalated. Projects usually don't apply; do not invent any.",
  'metric_prompts': ['Resolved [X]+ tickets/day with a [X]% CSAT score',
                     'Reduced average response time from [X] to [X]',
                     'Maintained [X]% NPS across [X]+ monthly interactions'],
  'recommended_template': 'classic',
  'section_order': ['Summary', 'Experience', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'customer-support',
  'target_summary_prompt': 'Customer support specialist with experience in high-volume ticket resolution and '
                           'cross-channel communication. Emphasize CSAT/NPS, ticket volume, and tools used.'},
 {'core_skills_bank': ['QuickBooks',
                       'Xero',
                       'Wave',
                       'Bank Reconciliation',
                       'Accounts Payable / Receivable',
                       'Invoicing',
                       'Financial Reporting',
                       'Excel / Google Sheets'],
  'display_name': 'Bookkeeping / Accounting / Finance Support',
  'lever_guidance': 'Experience bullets are your main lever â€” write 3-4 detailed bullets per role. Emphasize '
                    'accuracy, volume, and reconciliation metrics. Use verbs like Managed, Reconciled, '
                    "Processed, Maintained, Audited. Projects usually don't apply; do not invent any.",
  'metric_prompts': ['Managed [X]+ monthly transactions with [X]% accuracy across [X] accounts',
                     'Reduced reconciliation time from [X] to [X] hours per month',
                     'Processed [X]+ invoices/month with [X]% error rate'],
  'recommended_template': 'classic',
  'section_order': ['Summary', 'Experience', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'bookkeeping-finance',
  'target_summary_prompt': 'Detail-oriented bookkeeper and accounting support specialist experienced in '
                           'maintaining accurate financial records for small businesses. Emphasize accuracy, '
                           'reconciliation, and tools (QuickBooks, Xero).'},
 {'core_skills_bank': ['Cold Calling',
                       'Lead Generation',
                       'Appointment Setting',
                       'CRM (HubSpot / Salesforce)',
                       'Email Outreach',
                       'Pipeline Management',
                       'Discovery Calls',
                       'Sales Scripting'],
  'display_name': 'Sales / Appointment Setter / SDR',
  'lever_guidance': 'Experience bullets are your main lever â€” write 3-4 detailed bullets per role. Quantify '
                    'call volume, meetings booked, conversion rates, and pipeline. Use verbs like Booked, '
                    "Generated, Pitched, Closed, Nurtured. Projects usually don't apply; do not invent any.",
  'metric_prompts': ['Booked [X]+ qualified meetings/month with a [X]% show rate',
                     'Made [X]+ cold calls/day, converting [X]% to opportunities',
                     'Generated [X]+ in pipeline from [X]+ outbound touches per month'],
  'recommended_template': 'classic',
  'section_order': ['Summary', 'Experience', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'sales-sdr',
  'target_summary_prompt': 'Outbound sales specialist with experience in lead generation, cold outreach, and '
                           'appointment setting. Emphasize call volume, conversion rates, and pipeline '
                           'contribution.'},
 {'core_skills_bank': ['SEO Writing',
                       'Copywriting',
                       'Content Strategy',
                       'WordPress',
                       'Google Analytics',
                       'Social Media Marketing',
                       'Email Marketing',
                       'Keyword Research'],
  'display_name': 'Content Writer / Copywriter / Digital Marketing',
  'lever_guidance': 'Projects (campaigns, published content, portfolios) are your main lever alongside '
                    'experience â€” write 2-3 detailed bullets per project and 3 per role. Emphasize content '
                    'output, engagement, and traffic metrics. Use verbs like Wrote, Published, Grew, '
                    'Optimized, Launched, Drove.',
  'metric_prompts': ['Published [X]+ articles/month driving [X]% organic traffic growth',
                     'Grew social engagement by [X]% across [X]+ followers',
                     'Ran [X]+ campaigns generating [X]+ leads at [X]% conversion'],
  'recommended_template': 'modern',
  'section_order': ['Summary', 'Experience', 'Projects', 'Technical Skills', 'Education', 'Certifications'],
  'slug': 'content-marketing',
  'target_summary_prompt': 'Content writer and digital marketing specialist experienced in creating '
                           'SEO-driven content and campaigns. Emphasize content output, engagement metrics, '
                           'and tools.'}]



def apply_schema_changes(engine):
    from cv_tailor.database import Base
    from cv_tailor.models.database_models import ResumePreset
    database = engine.url.database
    if database and database != ":memory:":
        Path(database).parent.mkdir(parents=True, exist_ok=True)
    with engine.connect() as connection:
        version = connection.exec_driver_sql("PRAGMA user_version").scalar_one()
        if version > SCHEMA_VERSION:
            raise RuntimeError("This workspace requires a newer CV Tailor version.")
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
        connection.commit()
    if version == SCHEMA_VERSION:
        return
    if version and version < SCHEMA_VERSION and database:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        with closing(sqlite3.connect(database)) as source, closing(sqlite3.connect(database + ".backup-" + stamp)) as dest:
            source.backup(dest)
    with engine.begin() as connection:
        # Serialize first-run initialization across independent CLI processes.
        connection.exec_driver_sql("BEGIN IMMEDIATE")
        Base.metadata.create_all(bind=connection)
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(workspace_preferences)")}
        if "calendar_connections" not in columns:
            connection.exec_driver_sql("ALTER TABLE workspace_preferences ADD COLUMN calendar_connections JSON NOT NULL DEFAULT '[]'")
        if "portfolio_preference" not in columns:
            connection.exec_driver_sql("ALTER TABLE workspace_preferences ADD COLUMN portfolio_preference JSON")
        connection.exec_driver_sql("INSERT OR IGNORE INTO workspaces (id) VALUES (1)")
        connection.exec_driver_sql("INSERT OR IGNORE INTO workspace_preferences (workspace_id, revision, workspace_uuid) VALUES (1, 1, ?)", (uuid4().hex,))
        table = ResumePreset.__table__
        for preset in PRESETS:
            connection.exec_driver_sql("INSERT OR IGNORE INTO resume_presets (slug, display_name, target_summary_prompt, core_skills_bank, metric_prompts, section_order, recommended_template, lever_guidance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (preset["slug"], preset["display_name"], preset["target_summary_prompt"], json.dumps(preset["core_skills_bank"]), json.dumps(preset["metric_prompts"]), json.dumps(preset["section_order"]), preset["recommended_template"], preset["lever_guidance"]))
        connection.exec_driver_sql(f"PRAGMA user_version={SCHEMA_VERSION}")
