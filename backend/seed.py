import os
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import select, func
from models import (User, Entity, Party, Employee, Account, BankAccount, TaxCode, Period, Project, ProjectBudget,
                    ProjectCost, Timesheet, OverheadPool, OverheadAllocation, TaxRule, new_id)
from security import hash_password
from seed_finance import seed_finance

COA = [
    ('1000', 'Aset', '1000', 'Asset'), ('1100', 'Kas', '1000', 'Asset'), ('1110', 'Bank', '1000', 'Asset'),
    ('1120', 'Rekening Penampung (dana CV di rekening pemilik)', '1000', 'Asset'), ('1200', 'Piutang Usaha', '1000', 'Asset'), ('1500', 'Aset Tetap', '1000', 'Asset'), ('1510', 'Akumulasi Penyusutan Aset Tetap', '1000', 'Asset'),
    ('1300', 'Pajak Dibayar di Muka', '1300', 'Tax'), ('1310', 'PPN Masukan', '1300', 'Tax'), ('1320', 'Kredit Pajak PPh 23', '1300', 'Tax'), ('1330', 'PPh 25 Dibayar di Muka', '1300', 'Tax'),
    ('2000', 'Liabilitas', '2000', 'Liability'), ('2100', 'Utang Usaha', '2000', 'Liability'), ('2120', 'Utang Gaji & Potongan', '2000', 'Liability'), ('2200', 'Utang Pajak', '2000', 'Liability'), ('2210', 'Utang PPh 21', '2000', 'Liability'), ('2300', 'Utang kepada Pemilik', '2000', 'Liability'),
    ('3000', 'Ekuitas', '3000', 'Equity'), ('3100', 'Modal', '3000', 'Equity'), ('3200', 'Saldo Laba', '3000', 'Equity'),
    ('4000', 'Pendapatan', '4000', 'Revenue'), ('4100', 'Pendapatan Project', '4000', 'Revenue'), ('4900', 'Pendapatan Lainnya', '4000', 'Revenue'),
    ('5000', 'Direct Cost', '5000', 'Expense'), ('5100', 'Tenaga Kerja Langsung', '5000', 'Expense'), ('5200', 'Freelancer', '5000', 'Expense'), ('5300', 'Lisensi & Hosting Khusus', '5000', 'Expense'),
    ('6000', 'Operational Expense', '6000', 'Expense'), ('6100', 'Gaji Kantor', '6000', 'Expense'), ('6200', 'Server Umum', '6000', 'Expense'),
    ('6300', 'Listrik & Internet', '6000', 'Expense'), ('6400', 'Marketing', '6000', 'Expense'), ('6500', 'Administrasi', '6000', 'Expense'),
    ('7000', 'Depreciation', '7000', 'Expense'), ('7100', 'Beban Penyusutan', '7000', 'Expense'),
    ('8000', 'Tax Expense', '8000', 'Tax'), ('8100', 'Beban Pajak Penghasilan', '8000', 'Tax'),
    ('8200', 'Beban PPN Ditanggung Perusahaan', '8000', 'Tax'),
]
TAXES = [
    ('PPN-11', 'PPN Keluaran/Masukan', 'PPN', '11', 'DPP (nilai jasa)', 'UU HPP & PMK terkait'),
    ('PPH23-JASA', 'PPh 23 atas jasa', 'PPh 23', '2', 'Bruto jasa', 'UU PPh Pasal 23'),
    ('PPH21', 'PPh 21 karyawan', 'PPh 21', '5', 'Penghasilan bruto (TER)', 'PP 58/2023'),
    ('PPH-FINAL', 'PPh Final UMKM', 'PPh 4(2) Final', '0.5', 'Omzet bruto', 'PP 55/2022'),
]

TAX_RULES = TAXES + [
    ('PPH23-DIPUNGUT', 'PPh 23 dipungut atas jasa vendor', 'PPh 23', '2', 'Bruto jasa vendor', 'UU PPh Pasal 23'),
    ('PPH25', 'Angsuran PPh 25 bulanan', 'PPh 25', '0', 'PPh terutang tahun lalu / 12', 'UU PPh Pasal 25'),
    ('PPH-BADAN', 'PPh Badan (tarif umum)', 'PPh Badan', '22', 'Penghasilan Kena Pajak', 'UU PPh Pasal 17 & 31E (fasilitas 50%)'),
]


async def seed(s):
    admin_email = os.environ['ADMIN_EMAIL'].strip().lower()
    if not await s.scalar(select(func.count()).select_from(User)):
        s.add(User(email=admin_email, name='Owner Maiharta', password_hash=hash_password(os.environ['SEED_PASSWORD']),
                   role='owner', must_change_password=False))
    for u in (await s.scalars(select(User).where(User.role == 'owner', User.must_change_password.is_(True)))).all():
        u.must_change_password = False
    existing = set((await s.scalars(select(Account.code))).all())
    for code, name, grp, typ in COA:
        if not existing or code in ('1120', '2300', '1330', '1510', '2120', '2210', '8200') and code not in existing:
            s.add(Account(code=code, name=name, group_code=grp, account_type=typ))
    if not await s.scalar(select(func.count()).select_from(TaxCode)):
        for code, name, typ, rate, base, legal in TAXES:
            s.add(TaxCode(code=code, name=name, tax_type=typ, rate=Decimal(rate), base=base, legal_basis=legal, effective_from=date(2025, 1, 1)))
    if not await s.scalar(select(func.count()).select_from(TaxRule)):
        for code, name, typ, rate, base, legal in TAX_RULES:
            s.add(TaxRule(code=code, version=1, name=name, tax_type=typ, rate=Decimal(rate), base=base, legal_basis=legal,
                          effective_from=date(2025, 1, 1), created_by='seed'))
    if not await s.scalar(select(func.count()).select_from(Period)):
        today = date.today()
        for i in range(12):
            start = date(today.year, i + 1, 1)
            end = (date(today.year + (i == 11), (i + 1) % 12 + 1, 1) - timedelta(days=1))
            s.add(Period(code=start.strftime('%Y-%m'), name=start.strftime('%m/%Y'), start_date=start, end_date=end))
    if not await s.scalar(select(func.count()).select_from(Entity)):
        await seed_demo(s)
    await s.flush()
    await seed_finance(s)
    await s.commit()


async def seed_demo(s):
    """Editable sample data (labelled 'Contoh') following BRD test scenarios."""
    ent = Entity(name='CV Maiharta', type='CV', npwp='00.000.000.0-000.000', address='Denpasar, Bali', tax_status='Normal', is_pkp=True)
    s.add(ent)
    await s.flush()
    bank = BankAccount(name='Rekening Operasional CV', kind='Bank', bank_name='BCA', account_number='0000000000', account_holder='CV Maiharta', entity_id=ent.id)
    kas = BankAccount(name='Kas Kecil', kind='Kas', entity_id=ent.id)
    s.add_all([bank, kas])
    await s.flush()
    ent.default_bank_account_id = bank.id
    c1 = Party(kind='customer', name='PT Contoh Nusantara', party_type='Perusahaan', email='finance@contoh.co.id', phone='0361-000000', contact_person='Bu Sari')
    c2 = Party(kind='customer', name='Dinas Contoh Kota', party_type='Instansi', email='pengadaan@contoh.go.id')
    v1 = Party(kind='vendor', name='Freelancer Contoh (Andi)', party_type='Perorangan', email='andi@contoh.com')
    v2 = Party(kind='vendor', name='Cloud Hosting Contoh', party_type='Perusahaan')
    s.add_all([c1, c2, v1, v2])
    emps = [
        Employee(code='EMP-001', name='Budi (Backend)', position='Backend Developer', department='Engineering', base_salary=5000000, allowance=1000000, monthly_cost=6000000, productive_hours=120),
        Employee(code='EMP-002', name='Citra (Frontend)', position='Frontend Developer', department='Engineering', base_salary=4500000, allowance=900000, monthly_cost=5400000, productive_hours=120),
        Employee(code='EMP-003', name='Dewi (UI/UX)', position='UI/UX Designer', department='Design', base_salary=4000000, allowance=800000, monthly_cost=4800000, productive_hours=120),
        Employee(code='EMP-004', name='Eka (PM)', position='Project Manager', department='Delivery', base_salary=7000000, allowance=1400000, monthly_cost=8400000, productive_hours=120),
    ]
    s.add_all(emps)
    await s.flush()
    today = date.today()
    pa = Project(code='PRJ-CONTOH-A', name='Contoh: Sistem Informasi Keuangan', customer_id=c1.id, entity_id=ent.id, contract_number='SPK/001/CONTOH',
                 contract_value=200000000, contract_date=today - timedelta(days=60), start_date=today - timedelta(days=45), end_date=today + timedelta(days=75),
                 status='Running', target_margin=25, tax_classification='Jasa (PPN + PPh 23)', description='Data contoh sesuai skenario uji BRD: kontrak Rp200 jt.')
    pb = Project(code='PRJ-CONTOH-B', name='Contoh: Aplikasi Layanan Publik', customer_id=c2.id, entity_id=ent.id, contract_number='SPK/002/CONTOH',
                 contract_value=300000000, contract_date=today - timedelta(days=30), start_date=today - timedelta(days=20), end_date=today + timedelta(days=100),
                 status='Running', target_margin=30, tax_classification='Jasa (PPN + PPh 23)', description='Data contoh untuk alokasi overhead.')
    s.add_all([pa, pb])
    await s.flush()
    for comp, amt in {'gaji': 60000000, 'operasional': 20000000, 'bonus': 30000000, 'freelancer': 10000000, 'server': 5000000, 'cadangan': 10000000}.items():
        s.add(ProjectBudget(project_id=pa.id, component=comp, amount=amt))
    for comp, amt in {'gaji': 90000000, 'operasional': 25000000, 'bonus': 30000000, 'freelancer': 20000000, 'server': 8000000, 'cadangan': 15000000}.items():
        s.add(ProjectBudget(project_id=pb.id, component=comp, amount=amt))
    s.add_all([
        ProjectCost(project_id=pa.id, date=today - timedelta(days=20), vendor_id=v1.id, component='freelancer', amount=12000000, description='Contoh: jasa freelancer modul laporan'),
        ProjectCost(project_id=pa.id, date=today - timedelta(days=15), vendor_id=v2.id, component='server', amount=4000000, description='Contoh: hosting khusus project'),
        ProjectCost(project_id=pb.id, date=today - timedelta(days=10), vendor_id=v2.id, component='server', amount=3000000, description='Contoh: server staging'),
    ])
    for emp, hrs, proj in [(emps[0], 80, pa), (emps[1], 60, pa), (emps[3], 30, pa), (emps[0], 40, pb), (emps[2], 50, pb)]:
        rate = Decimal(emp.monthly_cost) / Decimal(emp.productive_hours)
        s.add(Timesheet(project_id=proj.id, employee_id=emp.id, date=today - timedelta(days=7), hours=hrs, rate=rate.quantize(Decimal('0.01')),
                        total=(rate * hrs).quantize(Decimal('0.01')), description='Contoh timesheet'))
    period = today.strftime('%Y-%m')
    comps = {'Internet': 500000, 'Listrik': 700000, 'Server umum': 3000000, 'Administrasi': 1000000, 'Sewa': 2000000, 'Lain-lain': 2800000}
    pool = OverheadPool(period=period, components=comps, total=10000000, note='Contoh cost pool bulanan')
    s.add(pool)
    await s.flush()
    run = new_id()
    s.add(OverheadAllocation(pool_id=pool.id, project_id=pa.id, run_id=run, method='manual', basis_value=40, share_pct=40, amount=4000000, created_by='seed'))
    s.add(OverheadAllocation(pool_id=pool.id, project_id=pb.id, run_id=run, method='manual', basis_value=60, share_pct=60, amount=6000000, created_by='seed'))
