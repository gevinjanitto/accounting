import os
import asyncio
import logging
from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError
from contextlib import asynccontextmanager
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from db import engine, SessionLocal
from models import Base
from seed import seed, default_category, EN_NAMES
import security
import master
import projects
import simulator
import overhead
import dashboard
import ledger
import cash
import finance
import documents
import company
import tax
import payroll
import forecast
import backup

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


def migrate(conn):
    """Kolom baru Fase 2 pada tabel Fase 1 yang sudah ada."""
    cols = {c['name'] for c in inspect(conn).get_columns('project_costs')}
    if 'expense_id' not in cols:
        conn.execute(text('ALTER TABLE project_costs ADD COLUMN expense_id VARCHAR(36) NULL'))
    inc_cols = {c['name'] for c in inspect(conn).get_columns('incomes')}
    if 'ppn_paid_by' not in inc_cols:
        conn.execute(text("ALTER TABLE incomes ADD COLUMN ppn_paid_by VARCHAR(10) NOT NULL DEFAULT 'client'"))
    if 'pph_paid_by' not in inc_cols:
        conn.execute(text("ALTER TABLE incomes ADD COLUMN pph_paid_by VARCHAR(10) NOT NULL DEFAULT 'kita'"))
    prj_cols = {c['name'] for c in inspect(conn).get_columns('projects')}
    for col, ddl in [('ppn_mode', "VARCHAR(10) NOT NULL DEFAULT 'pct'"), ('ppn_value', 'DECIMAL(18,2) NOT NULL DEFAULT 11'),
                     ('ppn_paid_by', "VARCHAR(10) NOT NULL DEFAULT 'client'"), ('pph_mode', "VARCHAR(10) NOT NULL DEFAULT 'pct'"),
                     ('pph_value', 'DECIMAL(18,2) NOT NULL DEFAULT 2'), ('pph_paid_by', "VARCHAR(10) NOT NULL DEFAULT 'kita'")]:
        if col not in prj_cols:
            conn.execute(text(f'ALTER TABLE projects ADD COLUMN {col} {ddl}'))
    if 'percent' not in {c['name'] for c in inspect(conn).get_columns('project_budgets')}:
        conn.execute(text('ALTER TABLE project_budgets ADD COLUMN percent DECIMAL(9,4) NULL'))
    acc_cols = {c['name'] for c in inspect(conn).get_columns('accounts')}
    if 'category' not in acc_cols:
        conn.execute(text('ALTER TABLE accounts ADD COLUMN category VARCHAR(40) NULL'))
        for aid, code, grp in conn.execute(text('SELECT id, code, group_code FROM accounts')).all():
            cat = default_category(code, grp)
            if cat:
                conn.execute(text('UPDATE accounts SET category = :c WHERE id = :i'), {'c': cat, 'i': aid})
        for en, idn in EN_NAMES.items():
            conn.execute(text('UPDATE accounts SET name = :n WHERE name = :e'), {'n': idn, 'e': en})


async def init_db():
    for attempt in range(60):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                await conn.run_sync(migrate)
            break
        except OperationalError:
            if attempt == 59:
                raise
            logging.warning('Database belum siap, mencoba lagi (%s/60)…', attempt + 1)
            await asyncio.sleep(2)
    async with SessionLocal() as s:
        await seed(s)
        await master.seed_cost_types(s)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await engine.dispose()


app = FastAPI(title='Maiharta Finance API', lifespan=lifespan)


@app.get('/api/health')
async def health():
    return {'status': 'ok', 'app': 'Maiharta Finance', 'phase': 3}


@app.get('/api/')
async def root():
    return {'message': 'Maiharta Finance API'}


for r in (security.router, master.router, projects.router, simulator.router, overhead.router, dashboard.router,
          ledger.router, cash.router, finance.router, documents.router, company.router, tax.router, payroll.router, forecast.router, backup.router):
    app.include_router(r)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip().rstrip('/') for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()],
    allow_methods=['*'],
    allow_headers=['*'],
)
