import sys, glob, os
from rembg import remove, new_session
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
shard, shards = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (0, 1)
os.makedirs(dst, exist_ok=True)
s = new_session('isnet-general-use')
files = sorted(glob.glob(f'{src}/*.png'))
for i, f in enumerate(files):
    out = f'{dst}/f{i:03d}.webp'
    if i % shards != shard or os.path.exists(out):
        continue
    o = remove(Image.open(f), session=s, post_process_mask=True)
    o = o.resize((o.width * 600 // o.height, 600), Image.LANCZOS)
    o.save(out, 'WEBP', quality=82, method=6)
    print(i, flush=True)
print('ALLDONE', flush=True)
