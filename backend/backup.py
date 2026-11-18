import json
from datetime import datetime, date, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import text, insert, delete, select, Date, DateTime, Numeric
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Base
from common import audit
from security import require_owner

router = APIRouter(prefix='/api/backup')
SKIP = {'login_attempts'}


def tables():
    return [t for t in Base.metadata.sorted_tables if t.name not in SKIP]


def dump(v):
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def load(col, v):
    if v is None:
        return None
    if isinstance(col.type, DateTime):
        return datetime.fromisoformat(v)
    if isinstance(col.type, Date):
        return date.fromisoformat(v)
    if isinstance(col.type, Numeric):
        return Decimal(str(v))
    return v


@router.get('')
async def download(request: Request, owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    data = {}
    for t in tables():
        rows = (await s.execute(select(t))).mappings().all()
        data[t.name] = [{k: dump(v) for k, v in r.items()} for r in rows]
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')
    body = json.dumps({'app': 'Maiharta Finance', 'version': 1, 'created_at': stamp, 'tables': data}, ensure_ascii=False)
    await audit(s, owner, 'backup', 'backup', None, f'Download backup {stamp}', request=request)
    await s.commit()
    return Response(body, media_type='application/json', headers={'Content-Disposition': f'attachment; filename="maiharta-finance-backup-{stamp}.json"'})


@router.post('/restore')
async def restore(request: Request, file: UploadFile = File(...), owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    try:
        payload = json.loads(await file.read())
        data = payload['tables']
        assert payload.get('app') == 'Maiharta Finance' and isinstance(data, dict)
    except Exception:
        raise HTTPException(422, 'File backup tidak valid')
    if not data.get('users'):
        raise HTTPException(422, 'File backup tidak berisi data user, restore dibatalkan')
    counts = {}
    try:
        await s.execute(text('SET FOREIGN_KEY_CHECKS=0'))
        for t in reversed(tables()):
            await s.execute(delete(t))
        for t in tables():
            rows = [{c.name: load(c, r.get(c.name)) for c in t.columns if c.name in r} for r in data.get(t.name, [])]
            if rows:
                await s.execute(insert(t), rows)
            counts[t.name] = len(rows)
        await audit(s, owner, 'restore', 'backup', None, f"Restore backup {payload.get('created_at', '')}", request=request)
        await s.commit()
    except HTTPException:
        raise
    except Exception as e:
        await s.rollback()
        raise HTTPException(422, f'Restore gagal, data tidak diubah: {e.__class__.__name__}')
    finally:
        await s.execute(text('SET FOREIGN_KEY_CHECKS=1'))
    return {'ok': True, 'restored': counts}
