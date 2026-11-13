import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

load_dotenv(Path(__file__).parent / '.env')


def _env(*keys):
    for k in keys:
        v = os.environ.get(k)
        if v:
            return v
    raise RuntimeError(f"Environment variable {' / '.join(keys)} belum di-set")


def database_url() -> str:
    url = os.environ.get('MYSQL_URL') or os.environ.get('DATABASE_URL')
    if url:
        for prefix in ('mysql://', 'mysql+pymysql://'):
            if url.startswith(prefix):
                return 'mysql+aiomysql://' + url[len(prefix):]
        return url
    host = _env('MYSQL_HOST', 'MYSQLHOST')
    port = _env('MYSQL_PORT', 'MYSQLPORT')
    user = _env('MYSQL_USER', 'MYSQLUSER')
    pwd = quote_plus(_env('MYSQL_PASSWORD', 'MYSQLPASSWORD'))
    name = _env('MYSQL_DATABASE', 'MYSQLDATABASE')
    return f"mysql+aiomysql://{user}:{pwd}@{host}:{port}/{name}?charset=utf8mb4"


engine = create_async_engine(database_url(), pool_pre_ping=True, pool_recycle=280, pool_size=10, max_overflow=10)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session():
    async with SessionLocal() as s:
        yield s
