import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from urllib.parse import quote
from fastapi.responses import Response
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_session
from models import Document, Project, Income, Expense, CashTransaction, Journal, TaxRecord
from common import row, audit, paginate_args
from security import require_access
import storage

router = APIRouter(prefix='/api/documents')
DOC_TYPES = ['Kontrak', 'SPK', 'Invoice', 'Kwitansi', 'Bukti Transfer', 'Nota Pembelian', 'Dokumen Pendukung', 'Faktur Pajak', 'Bukti Potong', 'Bukti Setor']
ALLOWED = {'.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
           '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
MAX_BYTES = 10 * 1024 * 1024
LINKS = {'project': Project, 'income': Income, 'expense': Expense, 'cash': CashTransaction, 'journal': Journal, 'tax': TaxRecord}


def link_label(obj):
    return getattr(obj, 'number', None) or f"{getattr(obj, 'code', '')} · {getattr(obj, 'name', '')}"


@router.get('/meta')
async def meta(user: dict = Depends(require_access)):
    return {'doc_types': DOC_TYPES, 'extensions': list(ALLOWED), 'max_mb': MAX_BYTES // (1024 * 1024), 'storage': storage.backend_name()}


@router.get('')
async def list_docs(q: str = '', doc_type: str = '', linked_type: str = '', linked_id: str = '', project_id: str = '', page: int = 1, page_size: int = 20,
                    user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    stmt = select(Document)
    if q:
        stmt = stmt.where(or_(Document.original_name.ilike(f'%{q}%'), Document.description.ilike(f'%{q}%')))
    if doc_type:
        stmt = stmt.where(Document.doc_type == doc_type)
    if linked_type:
        stmt = stmt.where(Document.linked_type == linked_type)
    if linked_id:
        stmt = stmt.where(Document.linked_id == linked_id)
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    total = await s.scalar(select(func.count()).select_from(stmt.subquery()))
    page, page_size, offset = paginate_args(page, page_size)
    docs = (await s.scalars(stmt.order_by(Document.created_at.desc()).offset(offset).limit(page_size))).all()
    items = []
    for d in docs:
        obj = await s.get(LINKS[d.linked_type], d.linked_id) if d.linked_type in LINKS and d.linked_id else None
        items.append({**row(d), 'linked_label': link_label(obj) if obj else None})
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


@router.post('')
async def upload(request: Request, file: UploadFile = File(...), doc_type: str = Form(...), linked_type: str = Form(''), linked_id: str = Form(''),
                 description: str = Form(''), user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    if doc_type not in DOC_TYPES:
        raise HTTPException(422, 'Jenis dokumen tidak dikenal')
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(422, 'Format file harus PDF, JPG, PNG, atau XLSX')
    data = await file.read()
    if not data:
        raise HTTPException(422, 'File kosong')
    if len(data) > MAX_BYTES:
        raise HTTPException(422, f'Ukuran file maksimal {MAX_BYTES // (1024 * 1024)} MB')
    project_id = None
    if linked_type:
        if linked_type not in LINKS:
            raise HTTPException(422, 'Tipe tautan dokumen tidak dikenal')
        obj = await s.get(LINKS[linked_type], linked_id)
        if not obj:
            raise HTTPException(422, 'Transaksi/project yang ditautkan tidak ditemukan')
        project_id = obj.id if linked_type == 'project' else getattr(obj, 'project_id', None)
    stored = f'{uuid.uuid4().hex}{ext}'
    await storage.save(stored, data, ALLOWED[ext])
    d = Document(doc_type=doc_type, original_name=(file.filename or stored)[:255], stored_name=stored, mime=ALLOWED[ext], size=len(data),
                 linked_type=linked_type or None, linked_id=linked_id or None, project_id=project_id, description=description or None,
                 uploaded_by=user['email'])
    s.add(d)
    await s.flush()
    await audit(s, user, 'upload', 'documents', d.id, f'Upload {doc_type}: {d.original_name}', after=row(d), request=request)
    await s.commit()
    return row(d)


@router.get('/{did}/file')
async def download(did: str, download: bool = False, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    d = await s.get(Document, did)
    data = await storage.load(d.stored_name) if d else None
    if data is None:
        raise HTTPException(404, 'File tidak ditemukan')
    disp = 'attachment' if download else 'inline'
    return Response(data, media_type=d.mime, headers={'Content-Disposition': f"{disp}; filename*=UTF-8''{quote(d.original_name)}"})


@router.delete('/{did}')
async def remove(did: str, request: Request, user: dict = Depends(require_access), s: AsyncSession = Depends(get_session)):
    d = await s.get(Document, did)
    if not d:
        raise HTTPException(404, 'Dokumen tidak ditemukan')
    before = row(d)
    await storage.remove(d.stored_name)
    await s.delete(d)
    await audit(s, user, 'delete', 'documents', did, f'Menghapus dokumen {before["original_name"]}', before=before, request=request)
    await s.commit()
    return {'ok': True}
