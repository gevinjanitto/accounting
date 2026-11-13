import os
import json
import asyncio
import random
import urllib.parse
import urllib.request
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import User, LoginAttempt, utcnow
from common import row, audit

router = APIRouter(prefix='/api')

ROLES = {
    'owner': 'Owner',
    'finance_admin': 'Finance Admin',
    'project_manager': 'Project Manager',
    'accountant': 'Accountant',
    'tax_consultant': 'Tax Consultant',
    'pending': 'Menunggu Akses',
}
ACTIVE_ROLES = {'owner', 'finance_admin', 'accountant'}
MAX_FAILS = 5
LOCK_MINUTES = 15
_used_captcha = {}

CAPTCHA_CATEGORIES = {
    'koin': 'koin', 'kalkulator': 'kalkulator', 'grafik': 'grafik', 'dokumen': 'dokumen',
    'dompet': 'dompet', 'kartu': 'kartu bank',
}


def secret():
    return os.environ['JWT_SECRET']


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def make_token(user: User) -> str:
    payload = {'sub': user.id, 'role': user.role, 'type': 'access',
               'exp': datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, secret(), algorithm='HS256')


def public_user(u: User):
    d = row(u)
    d['role_label'] = ROLES.get(u.role, u.role)
    d['has_access'] = u.role in ACTIVE_ROLES and u.is_active
    return d


async def current_user(request: Request, s: AsyncSession = Depends(get_session)) -> dict:
    auth = request.headers.get('authorization', '')
    if not auth.lower().startswith('bearer '):
        raise HTTPException(401, 'Silakan login terlebih dahulu')
    try:
        payload = jwt.decode(auth[7:], secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(401, 'Sesi berakhir, silakan login kembali')
    if payload.get('type') != 'access':
        raise HTTPException(401, 'Token tidak valid')
    u = await s.get(User, payload['sub'])
    if not u or not u.is_active:
        raise HTTPException(401, 'Akun tidak aktif')
    return public_user(u)


async def require_access(user: dict = Depends(current_user)) -> dict:
    if not user['has_access']:
        raise HTTPException(403, 'Akun Anda belum diberi akses oleh Owner')
    return user


async def require_owner(user: dict = Depends(current_user)) -> dict:
    if user['role'] != 'owner':
        raise HTTPException(403, 'Hanya Owner yang dapat melakukan tindakan ini')
    return user


# ---------- Captcha: Google reCAPTCHA v2 bila key di-set, selain itu captcha bawaan (lokal) ----------
def _first_env(*keys):
    for k in keys:
        v = (os.environ.get(k) or '').strip()
        if v:
            return v
    return None


def recaptcha_keys():
    site = _first_env('RECAPTCHA_SITE_KEY', 'REACT_APP_RECAPTCHA_SITE_KEY', 'GOOGLE_RECAPTCHA_SITE_KEY')
    sec = _first_env('RECAPTCHA_SECRET_KEY', 'RECAPTCHA_SECRET', 'GOOGLE_RECAPTCHA_SECRET_KEY')
    return (site, sec) if sec else (site, None)


@router.get('/captcha/config')
async def captcha_config():
    site, sec = recaptcha_keys()
    return {'provider': 'google', 'site_key': site} if sec else {'provider': 'builtin'}


def _google_verify(token, ip):
    body = urllib.parse.urlencode({'secret': recaptcha_keys()[1], 'response': token, 'remoteip': ip or ''}).encode()
    with urllib.request.urlopen('https://www.google.com/recaptcha/api/siteverify', data=body, timeout=10) as r:
        return json.loads(r.read())


async def verify_google(token, ip):
    if not token:
        raise HTTPException(400, 'Centang reCAPTCHA "Saya bukan robot" terlebih dahulu')
    try:
        res = await asyncio.to_thread(_google_verify, token, ip)
    except Exception:
        raise HTTPException(503, 'Server tidak dapat menghubungi Google reCAPTCHA, coba lagi')
    if not res.get('success'):
        codes = res.get('error-codes') or []
        if 'invalid-input-secret' in codes:
            raise HTTPException(500, 'RECAPTCHA_SECRET_KEY di server tidak valid')
        raise HTTPException(400, 'Verifikasi reCAPTCHA gagal atau kedaluwarsa, silakan centang ulang')

def _answer_hash(nonce, indices):
    raw = f"{nonce}:{','.join(str(i) for i in sorted(indices))}:{secret()}"
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get('/captcha/challenge')
async def captcha_challenge():
    cats = list(CAPTCHA_CATEGORIES)
    target = random.choice(cats)
    count = random.randint(3, 4)
    idx = random.sample(range(9), count)
    others = [c for c in cats if c != target]
    tiles = [target if i in idx else random.choice(others) for i in range(9)]
    nonce = secrets.token_hex(8)
    token = jwt.encode({'type': 'captcha', 'n': nonce, 'h': _answer_hash(nonce, idx),
                        'exp': datetime.now(timezone.utc) + timedelta(minutes=3)}, secret(), algorithm='HS256')
    return {'token': token, 'target': target, 'target_label': CAPTCHA_CATEGORIES[target], 'tiles': tiles}


class CaptchaVerify(BaseModel):
    token: str
    selected: list[int]


@router.post('/captcha/verify')
async def captcha_verify(body: CaptchaVerify):
    try:
        p = jwt.decode(body.token, secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(400, 'Captcha kedaluwarsa, silakan ulangi')
    if p.get('type') != 'captcha' or _answer_hash(p['n'], body.selected) != p['h']:
        raise HTTPException(400, 'Pilihan captcha belum tepat, coba lagi')
    pass_token = jwt.encode({'type': 'captcha_pass', 'jti': secrets.token_hex(12),
                             'exp': datetime.now(timezone.utc) + timedelta(minutes=3)}, secret(), algorithm='HS256')
    return {'pass_token': pass_token}


def consume_captcha(token: str | None):
    if not token:
        raise HTTPException(400, 'Selesaikan captcha terlebih dahulu')
    try:
        p = jwt.decode(token, secret(), algorithms=['HS256'])
    except jwt.PyJWTError:
        raise HTTPException(400, 'Captcha kedaluwarsa, silakan verifikasi ulang')
    now = datetime.now(timezone.utc).timestamp()
    for k in [k for k, exp in _used_captcha.items() if exp < now]:
        _used_captcha.pop(k, None)
    if p.get('type') != 'captcha_pass' or p['jti'] in _used_captcha:
        raise HTTPException(400, 'Captcha tidak valid, silakan verifikasi ulang')
    _used_captcha[p['jti']] = p['exp']


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str
    captcha_token: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post('/auth/login')
async def login(body: LoginIn, request: Request, s: AsyncSession = Depends(get_session)):
    if recaptcha_keys()[1]:
        await verify_google(body.captcha_token, request.client.host if request.client else None)
    else:
        consume_captcha(body.captcha_token)
    email = body.email.lower()
    since = utcnow() - timedelta(minutes=LOCK_MINUTES)
    fails = await s.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.key == email, LoginAttempt.created_at >= since))
    if fails >= MAX_FAILS:
        raise HTTPException(429, f'Terlalu banyak percobaan gagal. Coba lagi dalam {LOCK_MINUTES} menit.')
    u = await s.scalar(select(User).where(User.email == email))
    if not u or not verify_password(body.password, u.password_hash):
        s.add(LoginAttempt(key=email))
        await audit(s, None, 'login_failed', 'auth', summary=f'Login gagal: {email}', request=request)
        await s.commit()
        raise HTTPException(401, 'Email atau password salah')
    if not u.is_active:
        raise HTTPException(403, 'Akun dinonaktifkan oleh Owner')
    await s.execute(delete(LoginAttempt).where(LoginAttempt.key == email))
    u.last_login_at = utcnow()
    await audit(s, {'id': u.id, 'email': u.email}, 'login', 'auth', u.id, f'{u.email} login', request=request)
    await s.commit()
    return {'token': make_token(u), 'user': public_user(u)}


@router.get('/auth/me')
async def me(user: dict = Depends(current_user)):
    return user


@router.post('/auth/change-password')
async def change_password(body: ChangePasswordIn, request: Request, user: dict = Depends(current_user), s: AsyncSession = Depends(get_session)):
    u = await s.get(User, user['id'])
    if not verify_password(body.current_password, u.password_hash):
        raise HTTPException(400, 'Password saat ini salah')
    u.password_hash = hash_password(body.new_password)
    u.must_change_password = False
    await audit(s, user, 'change_password', 'auth', u.id, 'Mengganti password', request=request)
    await s.commit()
    return public_user(u)


@router.post('/auth/logout')
async def logout(request: Request, user: dict = Depends(current_user), s: AsyncSession = Depends(get_session)):
    await audit(s, user, 'logout', 'auth', user['id'], f"{user['email']} logout", request=request)
    await s.commit()
    return {'ok': True}


# ---------- User management (Owner) ----------
DEFAULT_USER_PASSWORD = '12345678'


class UserCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: str = 'finance_admin'


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


@router.get('/users')
async def list_users(owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    users = (await s.scalars(select(User).order_by(User.created_at))).all()
    return {'roles': [{'value': k, 'label': v, 'active': k in ACTIVE_ROLES} for k, v in ROLES.items()],
            'users': [public_user(u) for u in users]}


@router.post('/users')
async def create_user(body: UserCreate, request: Request, owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    if body.role not in ROLES:
        raise HTTPException(422, 'Role tidak dikenal')
    email = body.email.lower()
    if await s.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, 'Email sudah terdaftar')
    name = (body.name or '').strip() or email.split('@')[0].replace('.', ' ').title()
    u = User(email=email, name=name, password_hash=hash_password(DEFAULT_USER_PASSWORD), role=body.role, must_change_password=True)
    s.add(u)
    await s.flush()
    await audit(s, owner, 'create', 'users', u.id, f'Membuat user {email} ({body.role})', after={'email': email, 'role': body.role}, request=request)
    await s.commit()
    return public_user(u)


async def _owner_count(s):
    return await s.scalar(select(func.count()).select_from(User).where(User.role == 'owner', User.is_active.is_(True)))


@router.patch('/users/{user_id}')
async def update_user(user_id: str, body: UserUpdate, request: Request, owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    u = await s.get(User, user_id)
    if not u:
        raise HTTPException(404, 'User tidak ditemukan')
    before = {'name': u.name, 'role': u.role, 'is_active': u.is_active}
    if body.role is not None and body.role not in ROLES:
        raise HTTPException(422, 'Role tidak dikenal')
    losing_owner = u.role == 'owner' and ((body.role and body.role != 'owner') or body.is_active is False)
    if losing_owner and await _owner_count(s) <= 1:
        raise HTTPException(409, 'Minimal harus ada satu Owner aktif')
    if body.name is not None:
        u.name = body.name.strip()
    if body.role is not None:
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
    await audit(s, owner, 'update', 'users', u.id, f'Mengubah user {u.email}', before=before,
                after={'name': u.name, 'role': u.role, 'is_active': u.is_active}, request=request)
    await s.commit()
    return public_user(u)


@router.post('/users/{user_id}/reset-password')
async def reset_password(user_id: str, body: ResetPasswordIn, request: Request, owner: dict = Depends(require_owner), s: AsyncSession = Depends(get_session)):
    u = await s.get(User, user_id)
    if not u:
        raise HTTPException(404, 'User tidak ditemukan')
    u.password_hash = hash_password(body.new_password)
    u.must_change_password = u.id != owner['id']
    await s.execute(delete(LoginAttempt).where(LoginAttempt.key == u.email))
    await audit(s, owner, 'reset_password', 'users', u.id, f'Reset password {u.email}', request=request)
    await s.commit()
    return public_user(u)
