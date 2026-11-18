# Panduan Deploy Maiharta Finance ke cPanel

Aplikasi terdiri dari 2 bagian:

| Bagian | Teknologi | Di cPanel dipasang di |
|---|---|---|
| Frontend | React (file statis hasil build) | `public_html` domain utama, mis. `https://domainanda.com` |
| Backend (API) | Python FastAPI | Menu **Setup Python App** di subdomain, mis. `https://api.domainanda.com` |
| Database | MySQL / MariaDB bawaan cPanel | Menu **MySQL® Databases** |

Syarat hosting: cPanel dengan menu **Setup Python App** (CloudLinux / Passenger) dan **Python 3.10 atau lebih baru**
(3.11 disarankan). Tanyakan ke penyedia hosting bila menu ini belum ada.

---

## Langkah 1 — Siapkan project di komputer

1. Jalankan `bash setup.sh` (dari link yang diberikan) → project terekstrak ke folder `maiharta-finance`.
2. Pastikan Node.js 18/20 + yarn dan perintah `zip` tersedia.
3. Buat paket upload (ganti dengan subdomain API Anda):

```bash
cd maiharta-finance
API_URL=https://api.domainanda.com bash scripts/build_cpanel.sh
```

Hasilnya di folder `dist-cpanel/`:
- `frontend.zip` → isi untuk `public_html`
- `backend.zip` → isi untuk folder aplikasi Python
- `env-backend.txt` → contoh isi `.env` backend

> Bila nanti alamat API berubah, ulangi langkah 3 lalu upload ulang `frontend.zip`.

---

## Langkah 2 — Buat database MySQL

1. cPanel → **MySQL® Databases**.
2. *Create New Database*, mis. `maiharta` → nama lengkap jadi `cpaneluser_maiharta`.
3. *Add New User*, mis. `finance` + password kuat → `cpaneluser_finance`.
4. *Add User To Database* → pilih user & database → centang **ALL PRIVILEGES** → *Make Changes*.

Tabel dibuat otomatis oleh aplikasi saat pertama kali jalan (tidak perlu import SQL).

---

## Langkah 3 — Buat subdomain API

1. cPanel → **Domains** (atau **Subdomains**) → buat `api.domainanda.com`.
2. cPanel → **SSL/TLS Status** → jalankan *Run AutoSSL* agar `https://api.domainanda.com` aktif.

---

## Langkah 4 — Pasang backend (Setup Python App)

1. cPanel → **Setup Python App** → **Create Application**:
   - Python version: **3.11** (minimal 3.10)
   - Application root: `maiharta-api`
   - Application URL: `api.domainanda.com` (kosongkan kolom path di sebelahnya)
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`
   - Klik **Create**.
2. cPanel → **File Manager** → buka folder `/home/cpaneluser/maiharta-api`:
   - hapus file contoh `passenger_wsgi.py` bawaan cPanel,
   - **Upload** `backend.zip` → klik kanan → **Extract** di folder itu.
3. Buat file `.env` di folder `maiharta-api` (File Manager → *+ File*, aktifkan *Show Hidden Files* di Settings),
   isi dengan `env-backend.txt` lalu sesuaikan:

```
MYSQL_HOST="localhost"
MYSQL_PORT="3306"
MYSQL_USER="cpaneluser_finance"
MYSQL_PASSWORD="password database langkah 2"
MYSQL_DATABASE="cpaneluser_maiharta"
UPLOAD_DIR="/home/cpaneluser/maiharta-uploads"
CORS_ORIGINS="https://domainanda.com,https://www.domainanda.com"
JWT_SECRET="string acak panjang, mis. 48 karakter"
SEED_PASSWORD="password admin awal"
ADMIN_EMAIL="admin@domainanda.com"
```

4. Buat folder `/home/cpaneluser/maiharta-uploads` (tempat lampiran/bukti; di luar `public_html` agar tidak bisa diakses publik).
5. Kembali ke **Setup Python App** → klik aplikasi → bagian *Configuration files* isi `requirements.txt` → **Run Pip Install**.
   Alternatif lewat **Terminal** cPanel (perintah `source` ditampilkan di bagian atas halaman aplikasi):

```bash
source /home/cpaneluser/virtualenv/maiharta-api/3.11/bin/activate
cd ~/maiharta-api
pip install -r requirements.txt
```

6. Klik **Restart** pada aplikasi.
7. Tes di browser: `https://api.domainanda.com/api/health` → harus tampil `{"status":"ok",...}`.
   Bila error, lihat log `~/maiharta-api/stderr.log` (atau `passenger.log`).

---

## Langkah 5 — Pasang frontend

1. File Manager → `public_html` (kosongkan file lama bila ada, simpan cadangan dulu).
2. Upload `frontend.zip` → **Extract** di `public_html`.
3. Pastikan file `.htaccess` ikut terekstrak (aktifkan *Show Hidden Files*). File ini membuat halaman seperti
   `/pengeluaran` tetap terbuka saat di-refresh.
4. Buka `https://domainanda.com` → login dengan `ADMIN_EMAIL` / `SEED_PASSWORD`, lalu segera ganti password.

---

## Update aplikasi di kemudian hari

- **Backend**: upload & extract `backend.zip` baru ke `maiharta-api` (file `.env` tidak tertimpa karena tidak ikut di zip),
  jalankan *Run Pip Install* bila `requirements.txt` berubah, lalu **Restart**. Kolom database baru ditambahkan otomatis.
- **Frontend**: build ulang (`scripts/build_cpanel.sh`) lalu extract `frontend.zip` ke `public_html`.

## Backup

- Database: cPanel → **phpMyAdmin** → pilih database → **Export**, atau menu **Backup** cPanel.
- Lampiran: unduh folder `maiharta-uploads`.
- Aplikasi juga punya menu Backup di dalamnya.

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| Login gagal / "Network Error" | `API_URL` saat build salah, atau `CORS_ORIGINS` belum berisi domain frontend. Perbaiki lalu Restart / build ulang. |
| `/api/health` error 500/503 | Cek `stderr.log`. Biasanya `.env` salah (nama DB/user harus lengkap dengan prefix `cpaneluser_`) atau pip install belum dijalankan. |
| `Access denied for user` | User belum ditambahkan ke database dengan ALL PRIVILEGES (Langkah 2.4). |
| Halaman blank saat refresh | `.htaccess` tidak ada di `public_html`. |
| Python 3.10+ tidak tersedia | Minta penyedia hosting mengaktifkan Python 3.10/3.11 di Setup Python App. |
