from sqlalchemy import create_engine, text
engine = create_engine('postgresql://postgres:reinael123@localhost:5432/cv_tailor')
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_template VARCHAR(50) DEFAULT 'classic';"))
    conn.commit()
print("Migration successful")
