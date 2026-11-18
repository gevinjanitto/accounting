from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import select, func
from models import Income, IncomePayment, Expense, Journal, Project, Entity, BankAccount, Party
from ledger import next_number, acc_id, post_journal, bank_coa_id
from cash import add_cash
from finance import _post_income, _post_expense, income_status

SEED_USER = {'id': None, 'email': 'seed'}


async def seed_finance(s):
    """Contoh transaksi Fase 2 (dapat diubah/dibatalkan) bila belum ada jurnal sama sekali."""
    if await s.scalar(select(func.count()).select_from(Journal)):
        return
    pa = await s.scalar(select(Project).where(Project.code == 'PRJ-CONTOH-A'))
    pb = await s.scalar(select(Project).where(Project.code == 'PRJ-CONTOH-B'))
    ent = await s.scalar(select(Entity).where(Entity.name == 'CV Maiharta'))
    bank = await s.scalar(select(BankAccount).where(BankAccount.name == 'Rekening Operasional CV'))
    if not (pa and pb and ent and bank):
        return
    vendor = await s.scalar(select(Party).where(Party.kind == 'vendor', Party.name == 'Cloud Hosting Contoh'))
    today = date.today()
    inc = Income(number=await next_number(s, Income, f'INC-{today.year}-'), date=today - timedelta(days=12), invoice_number='INV/CONTOH/001',
                 invoice_date=today - timedelta(days=12), due_date=today + timedelta(days=18), entity_id=ent.id, project_id=pa.id,
                 customer_id=pa.customer_id, description='Contoh: termin 1 (50%) Sistem Informasi Keuangan', dpp=Decimal('100000000'),
                 ppn_pct=Decimal('11'), pph_pct=Decimal('2'), tax_classification='Jasa (PPN + PPh 23)', created_by='seed')
    s.add(inc)
    await s.flush()
    await _post_income(s, inc, SEED_USER)
    pay_date = today - timedelta(days=10)
    amt = Decimal('60000000')
    pay = IncomePayment(income_id=inc.id, date=pay_date, amount=amt, bank_account_id=bank.id, note='Contoh pembayaran sebagian')
    s.add(pay)
    await s.flush()
    tx = await add_cash(s, pay_date, bank, 'in', amt, 'income_payment', SEED_USER, 'income_payment', pay.id, await acc_id(s, '1200'),
                        entity_id=ent.id, description='Penerimaan INV/CONTOH/001')
    pay.cash_tx_id = tx.id
    await post_journal(s, pay_date, f'Penerimaan {inc.number} ke {bank.name}', [(await bank_coa_id(s, bank), amt, 0, bank.name),
                       (await acc_id(s, '1200'), 0, amt, inc.invoice_number)], SEED_USER, 'income_payment', pay.id, entity_id=ent.id, project_id=pa.id)
    inc.paid_amount = amt
    inc.status = income_status(inc)
    samples = [
        ('Labor Cost', '5100', None, None, 'Contoh: gaji tim engineering bulan ini', 50000000, 0, 'Transfer'),
        ('Overhead', '6200', None, vendor.id if vendor else None, 'Contoh: server umum kantor', 3000000, 11, 'Transfer'),
        ('Administrative Expense', '6500', None, None, 'Contoh: biaya administrasi bank', 250000, 0, 'Utang'),
    ]
    for cat, code, pid, vid, desc, dpp, ppn, method in samples:
        e = Expense(number=await next_number(s, Expense, f'EXP-{today.year}-'), date=today - timedelta(days=8), entity_id=ent.id, project_id=pid,
                    vendor_id=vid, category=cat, account_id=await acc_id(s, code), description=desc, dpp=Decimal(dpp), ppn_pct=Decimal(ppn),
                    payment_method=method, bank_account_id=bank.id if method != 'Utang' else None, fiscal_treatment='Deductible',
                    tax_classification='PPN Masukan' if ppn else 'Non-PPN', created_by='seed')
        s.add(e)
        await s.flush()
        await _post_expense(s, e, SEED_USER, None)
