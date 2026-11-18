import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from a2wsgi import ASGIMiddleware  # noqa: E402
from db import engine  # noqa: E402
from server import app, init_db  # noqa: E402


async def _startup():
    await init_db()
    await engine.dispose()

asyncio.run(_startup())
application = ASGIMiddleware(app)
