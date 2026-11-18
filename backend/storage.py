import os
import asyncio
from pathlib import Path


def _env(*keys):
    for k in keys:
        v = os.environ.get(k)
        if v:
            return v
    return None


def _s3_conf():
    conf = {
        'bucket': _env('BUCKET', 'S3_BUCKET'),
        'endpoint': _env('ENDPOINT', 'S3_ENDPOINT'),
        'key': _env('ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID'),
        'secret': _env('SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY'),
        'region': _env('REGION', 'S3_REGION') or 'auto',
        'style': _env('S3_ADDRESSING_STYLE') or 'virtual',
    }
    return conf if all(conf[k] for k in ('bucket', 'endpoint', 'key', 'secret')) else None


_client = None


def _s3():
    global _client
    if _client is None:
        import boto3
        from botocore.client import Config
        c = _s3_conf()
        _client = boto3.client('s3', endpoint_url=c['endpoint'], aws_access_key_id=c['key'], aws_secret_access_key=c['secret'],
                               region_name=c['region'], config=Config(signature_version='s3v4', s3={'addressing_style': c['style']}))
    return _client


def _local_dir() -> Path:
    p = Path(os.environ.get('UPLOAD_DIR') or Path(__file__).parent / 'uploads')
    p.mkdir(parents=True, exist_ok=True)
    return p


def backend_name() -> str:
    return 'bucket' if _s3_conf() else 'local'


def _key(name: str) -> str:
    return f'documents/{name}'


async def save(name: str, data: bytes, mime: str):
    c = _s3_conf()
    if c:
        await asyncio.to_thread(_s3().put_object, Bucket=c['bucket'], Key=_key(name), Body=data, ContentType=mime)
    else:
        (_local_dir() / name).write_bytes(data)


async def load(name: str) -> bytes | None:
    c = _s3_conf()
    if c:
        def get():
            try:
                return _s3().get_object(Bucket=c['bucket'], Key=_key(name))['Body'].read()
            except _s3().exceptions.NoSuchKey:
                return None
        return await asyncio.to_thread(get)
    p = _local_dir() / name
    return p.read_bytes() if p.exists() else None


async def remove(name: str):
    c = _s3_conf()
    if c:
        await asyncio.to_thread(_s3().delete_object, Bucket=c['bucket'], Key=_key(name))
    else:
        (_local_dir() / name).unlink(missing_ok=True)
