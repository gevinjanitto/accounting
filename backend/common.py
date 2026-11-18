from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from fastapi import HTTPException, Request
from models import AuditLog


def conv(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, datetime):
        return v.isoformat() + 'Z'
    if isinstance(v, date):
        return v.isoformat()
    return v


def row(obj, exclude=('password_hash',)):
    return {c.name: conv(getattr(obj, c.name)) for c in obj.__table__.columns if c.name not in exclude}


def D(v) -> Decimal:
    if v is None or v == '':
        return Decimal('0')
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        raise HTTPException(422, f'Nilai angka tidak valid: {v}')


def parse_field(name, ftype, value):
    required = ftype.endswith('!')
    t = ftype.rstrip('!')
    if value is None or (isinstance(value, str) and value.strip() == ''):
        if required:
            raise HTTPException(422, f'Field "{name}" wajib diisi')
        return False if t == 'bool' else (Decimal('0') if t == 'num' else None)
    try:
        if t == 'str':
            return str(value).strip()
        if t == 'num':
            return D(value)
        if t == 'int':
            return int(value)
        if t == 'bool':
            return value if isinstance(value, bool) else str(value).lower() in ('1', 'true', 'ya', 'yes')
        if t == 'date':
            return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        raise HTTPException(422, f'Format field "{name}" tidak valid')
    if t.startswith('enum:'):
        opts = t[5:].split('|')
        if str(value) not in opts:
            raise HTTPException(422, f'Field "{name}" harus salah satu dari: {", ".join(opts)}')
        return str(value)
    return value


def clean(spec: dict, payload: dict, partial=False):
    out = {}
    for name, ftype in spec.items():
        if partial and name not in payload:
            continue
        out[name] = parse_field(name, ftype, payload.get(name))
    return out


def client_ip(request: Request | None):
    if request is None:
        return None
    fwd = request.headers.get('x-forwarded-for', '')
    return fwd.split(',')[0].strip() if fwd else (request.client.host if request.client else None)


def jsonable(d):
    return {k: conv(v) for k, v in (d or {}).items()} if d is not None else None


async def audit(s, user, action, module, record_id=None, summary='', before=None, after=None, request=None):
    s.add(AuditLog(user_id=user['id'] if user else None, user_email=user['email'] if user else None,
                   action=action, module=module, record_id=record_id, summary=summary[:500],
                   before=jsonable(before), after=jsonable(after), ip=client_ip(request)))


def paginate_args(page: int, page_size: int):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    return page, page_size, (page - 1) * page_size
