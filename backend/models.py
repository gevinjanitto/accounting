import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from sqlalchemy import String, Text, Boolean, Integer, Numeric, Date, DateTime, JSON, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id():
    return str(uuid.uuid4())


MONEY = Numeric(18, 2)
RATE = Numeric(9, 4)


class Base(DeclarativeBase):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = 'users'
    email: Mapped[str] = mapped_column(String(190), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(40), default='pending')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LoginAttempt(Base):
    __tablename__ = 'login_attempts'
    key: Mapped[str] = mapped_column(String(190), index=True)


class AuditLog(Base):
    __tablename__ = 'audit_logs'
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_email: Mapped[str | None] = mapped_column(String(190), nullable=True)
    action: Mapped[str] = mapped_column(String(40))
    module: Mapped[str] = mapped_column(String(60), index=True)
    record_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    summary: Mapped[str] = mapped_column(String(500), default='')
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __table_args__ = (Index('ix_audit_created', 'created_at'),)


class Entity(Base):
    __tablename__ = 'entities'
    name: Mapped[str] = mapped_column(String(190))
    type: Mapped[str] = mapped_column(String(30), default='CV')
    npwp: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    tax_status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_pkp: Mapped[bool] = mapped_column(Boolean, default=False)
    default_bank_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Party(Base):
    __tablename__ = 'parties'
    kind: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(190))
    party_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    npwp: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_person: Mapped[str | None] = mapped_column(String(150), nullable=True)
    email: Mapped[str | None] = mapped_column(String(190), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Employee(Base):
    __tablename__ = 'employees'
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    position: Mapped[str | None] = mapped_column(String(100), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    base_salary: Mapped[Decimal] = mapped_column(MONEY, default=0)
    allowance: Mapped[Decimal] = mapped_column(MONEY, default=0)
    other_cost: Mapped[Decimal] = mapped_column(MONEY, default=0)
    monthly_cost: Mapped[Decimal] = mapped_column(MONEY, default=0)
    productive_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=120)
    status: Mapped[str] = mapped_column(String(30), default='Aktif')


class Account(Base):
    __tablename__ = 'accounts'
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    group_code: Mapped[str] = mapped_column(String(10))
    account_type: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BankAccount(Base):
    __tablename__ = 'bank_accounts'
    name: Mapped[str] = mapped_column(String(150))
    kind: Mapped[str] = mapped_column(String(20), default='Bank')
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    account_holder: Mapped[str | None] = mapped_column(String(150), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    opening_balance: Mapped[Decimal] = mapped_column(MONEY, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TaxCode(Base):
    __tablename__ = 'tax_codes'
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(150))
    tax_type: Mapped[str] = mapped_column(String(30))
    rate: Mapped[Decimal] = mapped_column(RATE, default=0)
    base: Mapped[str | None] = mapped_column(String(100), nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    legal_basis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CostType(Base):
    __tablename__ = 'cost_types'
    name: Mapped[str] = mapped_column(String(150), unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Period(Base):
    __tablename__ = 'periods'
    code: Mapped[str] = mapped_column(String(10), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default='Open')


class Project(Base):
    __tablename__ = 'projects'
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(190))
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    entity_id: Mapped[str] = mapped_column(String(36))
    contract_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contract_value: Mapped[Decimal] = mapped_column(MONEY, default=0)
    contract_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='Draft')
    target_margin: Mapped[Decimal] = mapped_column(RATE, default=20)
    tax_classification: Mapped[str | None] = mapped_column(String(100), nullable=True)
    costing_method: Mapped[str] = mapped_column(String(30), default='Hybrid')
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    simulation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    simulation_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closing: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProjectBudget(Base):
    __tablename__ = 'project_budgets'
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    component: Mapped[str] = mapped_column(String(30))
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    __table_args__ = (UniqueConstraint('project_id', 'component', name='uq_budget_component'),)


class ProjectCost(Base):
    __tablename__ = 'project_costs'
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    date: Mapped[date] = mapped_column(Date)
    vendor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    component: Mapped[str] = mapped_column(String(30))
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expense_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)


class Timesheet(Base):
    __tablename__ = 'timesheets'
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey('projects.id', ondelete='CASCADE'), index=True)
    employee_id: Mapped[str] = mapped_column(String(36), index=True)
    date: Mapped[date] = mapped_column(Date)
    hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    rate: Mapped[Decimal] = mapped_column(MONEY, default=0)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class OverheadPool(Base):
    __tablename__ = 'overhead_pools'
    period: Mapped[str] = mapped_column(String(7), unique=True)
    components: Mapped[dict] = mapped_column(JSON)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)


class OverheadAllocation(Base):
    __tablename__ = 'overhead_allocations'
    pool_id: Mapped[str] = mapped_column(String(36), ForeignKey('overhead_pools.id', ondelete='CASCADE'), index=True)
    project_id: Mapped[str] = mapped_column(String(36), index=True)
    run_id: Mapped[str] = mapped_column(String(36), index=True)
    method: Mapped[str] = mapped_column(String(30))
    basis_value: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=0)
    share_pct: Mapped[Decimal] = mapped_column(Numeric(9, 4), default=0)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class Simulation(Base):
    __tablename__ = 'simulations'
    name: Mapped[str] = mapped_column(String(190))
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='Draft')
    latest_version: Mapped[int] = mapped_column(Integer, default=0)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class SimulationVersion(Base):
    __tablename__ = 'simulation_versions'
    simulation_id: Mapped[str] = mapped_column(String(36), ForeignKey('simulations.id', ondelete='CASCADE'), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    inputs: Mapped[dict] = mapped_column(JSON)
    outputs: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


# ---------- Fase 2: Transaksi, Kas & Akuntansi ----------
class Income(Base):
    __tablename__ = 'incomes'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    date: Mapped[date] = mapped_column(Date)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    invoice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    customer_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    revenue_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dpp: Mapped[Decimal] = mapped_column(MONEY, default=0)
    ppn_pct: Mapped[Decimal] = mapped_column(RATE, default=0)
    ppn: Mapped[Decimal] = mapped_column(MONEY, default=0)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    pph_pct: Mapped[Decimal] = mapped_column(RATE, default=0)
    pph: Mapped[Decimal] = mapped_column(MONEY, default=0)
    net_receivable: Mapped[Decimal] = mapped_column(MONEY, default=0)
    ppn_paid_by: Mapped[str] = mapped_column(String(10), default='client')
    pph_paid_by: Mapped[str] = mapped_column(String(10), default='kita')
    paid_amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    status: Mapped[str] = mapped_column(String(20), default='Unpaid')
    tax_classification: Mapped[str] = mapped_column(String(100), default='Jasa (PPN + PPh 23)')
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class IncomePayment(Base):
    __tablename__ = 'income_payments'
    income_id: Mapped[str] = mapped_column(String(36), ForeignKey('incomes.id', ondelete='CASCADE'), index=True)
    date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    bank_account_id: Mapped[str] = mapped_column(String(36))
    cash_tx_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)


class Expense(Base):
    __tablename__ = 'expenses'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    date: Mapped[date] = mapped_column(Date)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    vendor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    category: Mapped[str] = mapped_column(String(40))
    account_id: Mapped[str] = mapped_column(String(36))
    component: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dpp: Mapped[Decimal] = mapped_column(MONEY, default=0)
    ppn_pct: Mapped[Decimal] = mapped_column(RATE, default=0)
    ppn: Mapped[Decimal] = mapped_column(MONEY, default=0)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    payment_method: Mapped[str] = mapped_column(String(20), default='Transfer')
    bank_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='Paid')
    fiscal_treatment: Mapped[str] = mapped_column(String(30), default='Deductible')
    fiscal_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fiscal_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_classification: Mapped[str] = mapped_column(String(100), default='Non-PPN')
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class CashTransaction(Base):
    __tablename__ = 'cash_transactions'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    bank_account_id: Mapped[str] = mapped_column(String(36), index=True)
    direction: Mapped[str] = mapped_column(String(3))
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    kind: Mapped[str] = mapped_column(String(20))
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    counter_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transfer_group: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    reconciliation_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class Reconciliation(Base):
    __tablename__ = 'reconciliations'
    bank_account_id: Mapped[str] = mapped_column(String(36), index=True)
    statement_date: Mapped[date] = mapped_column(Date)
    statement_balance: Mapped[Decimal] = mapped_column(MONEY, default=0)
    book_balance: Mapped[Decimal] = mapped_column(MONEY, default=0)
    difference: Mapped[Decimal] = mapped_column(MONEY, default=0)
    items: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class Journal(Base):
    __tablename__ = 'journals'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)
    description: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20), default='auto')
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default='Posted')
    reversal_of: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    total: Mapped[Decimal] = mapped_column(MONEY, default=0)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class JournalLine(Base):
    __tablename__ = 'journal_lines'
    journal_id: Mapped[str] = mapped_column(String(36), ForeignKey('journals.id', ondelete='CASCADE'), index=True)
    account_id: Mapped[str] = mapped_column(String(36), index=True)
    debit: Mapped[Decimal] = mapped_column(MONEY, default=0)
    credit: Mapped[Decimal] = mapped_column(MONEY, default=0)
    memo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class Document(Base):
    __tablename__ = 'documents'
    doc_type: Mapped[str] = mapped_column(String(40))
    original_name: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(100))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer, default=0)
    linked_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    linked_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


# ---------- Fase 3: Pajak, Fiskal, Payroll, Aset ----------
class TaxRule(Base):
    __tablename__ = 'tax_rules'
    code: Mapped[str] = mapped_column(String(30), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(150))
    tax_type: Mapped[str] = mapped_column(String(40))
    rate: Mapped[Decimal] = mapped_column(RATE, default=0)
    base: Mapped[str | None] = mapped_column(String(150), nullable=True)
    criteria: Mapped[str | None] = mapped_column(String(255), nullable=True)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    legal_basis: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)
    __table_args__ = (UniqueConstraint('code', 'version', name='uq_tax_rule_version'),)


class TaxRecord(Base):
    __tablename__ = 'tax_records'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    side: Mapped[str] = mapped_column(String(10))
    date: Mapped[date] = mapped_column(Date, index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    party_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    dpp: Mapped[Decimal] = mapped_column(MONEY, default=0)
    rate: Mapped[Decimal] = mapped_column(RATE, default=0)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    doc_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    doc_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doc_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default='Terutang')
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    ntpn: Mapped[str | None] = mapped_column(String(60), nullable=True)
    bank_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    settlement_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    accrued: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class FiscalCorrection(Base):
    __tablename__ = 'fiscal_corrections'
    year: Mapped[int] = mapped_column(Integer, index=True)
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(255))
    direction: Mapped[str] = mapped_column(String(10))
    category: Mapped[str] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class PayrollRun(Base):
    __tablename__ = 'payroll_runs'
    number: Mapped[str] = mapped_column(String(40), unique=True)
    period: Mapped[str] = mapped_column(String(7), index=True)
    pay_date: Mapped[date] = mapped_column(Date)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    bank_account_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='Draft')
    gross: Mapped[Decimal] = mapped_column(MONEY, default=0)
    pph21: Mapped[Decimal] = mapped_column(MONEY, default=0)
    deductions: Mapped[Decimal] = mapped_column(MONEY, default=0)
    net: Mapped[Decimal] = mapped_column(MONEY, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(190), nullable=True)


class PayrollLine(Base):
    __tablename__ = 'payroll_lines'
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey('payroll_runs.id', ondelete='CASCADE'), index=True)
    employee_id: Mapped[str] = mapped_column(String(36))
    base_salary: Mapped[Decimal] = mapped_column(MONEY, default=0)
    allowance: Mapped[Decimal] = mapped_column(MONEY, default=0)
    other_income: Mapped[Decimal] = mapped_column(MONEY, default=0)
    gross: Mapped[Decimal] = mapped_column(MONEY, default=0)
    pph21_rate: Mapped[Decimal] = mapped_column(RATE, default=0)
    pph21: Mapped[Decimal] = mapped_column(MONEY, default=0)
    deductions: Mapped[Decimal] = mapped_column(MONEY, default=0)
    net: Mapped[Decimal] = mapped_column(MONEY, default=0)


class FixedAsset(Base):
    __tablename__ = 'fixed_assets'
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(190))
    category: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    acquisition_date: Mapped[date] = mapped_column(Date)
    cost: Mapped[Decimal] = mapped_column(MONEY, default=0)
    residual: Mapped[Decimal] = mapped_column(MONEY, default=0)
    useful_life_months: Mapped[int] = mapped_column(Integer, default=48)
    expense_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='Aktif')
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)


class AssetDepreciation(Base):
    __tablename__ = 'asset_depreciations'
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey('fixed_assets.id', ondelete='CASCADE'), index=True)
    period: Mapped[str] = mapped_column(String(7))
    amount: Mapped[Decimal] = mapped_column(MONEY, default=0)
    journal_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)
