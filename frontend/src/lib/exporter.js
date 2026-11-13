import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { rp, n } from "@/lib/format";

// Satu desain untuk PDF, Excel & CSV: pita brand, judul, info cetak, tabel, baris total.
const BRAND = "MaiHarta Finance";
const C = { brand: "0F52BA", dark: "12151C", zebra: "F3F6FB", total: "DBE8FB", line: "D5DEEA", muted: "64748B" };
const rgb = (h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)];
const NUMERIC = ["rp", "num", "pct"];
const ISO = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
const STATUS = { paid: "15803D", lunas: "15803D", closed: "15803D", posted: "15803D", active: "15803D", unpaid: "B45309", partial: "B45309", draft: "64748B", overdue: "B91C1C", cancelled: "B91C1C", void: "B91C1C" };

const raw = (r, c) => (typeof c.v === "function" ? c.v(r) : r[c.k]);
const fmtDate = (v) => new Date(v.length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const text = (v) => (v === null || v === undefined ? "" : typeof v === "string" && ISO.test(v) ? fmtDate(v) : String(v));
const pretty = (r, c) => {
  const v = raw(r, c);
  if (v === null || v === undefined || v === "") return "";
  if (c.t === "rp") return rp(v);
  if (c.t === "num") return n(v);
  if (c.t === "pct") return `${n(v)}%`;
  return text(v);
};
const statusColor = (v) => STATUS[String(v || "").toLowerCase()];
const isTotalRow = (r) => !!r && (r._total === true || (Array.isArray(r) && r[2] === true));

function meta({ title, subtitle, columns, rows, total }) {
  const printed = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
  const info = [subtitle, `${rows.filter((r) => !isTotalRow(r)).length} baris data`, `Dicetak ${printed}`].filter(Boolean).join("  ·  ");
  const sums = columns.map((c) => (c.t === "rp" ? rows.reduce((a, r) => a + Number(raw(r, c) || 0), 0) : null));
  const hasTotal = !!total && rows.length > 0 && sums.some((s) => s !== null);
  return { title, info, sums, hasTotal };
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function logo() {
  const blob = await (await fetch("/assets/logo-long.png")).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
}

function toCsv({ columns, rows }, m) {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const pad = (first) => [esc(first), ...columns.slice(1).map(() => "")].join(",");
  const lines = [pad(BRAND.toUpperCase()), pad(m.title), pad(m.info), "",
    columns.map((c) => esc(c.l)).join(","),
    ...rows.map((r) => columns.map((c) => esc(NUMERIC.includes(c.t) ? raw(r, c) ?? "" : text(raw(r, c)))).join(","))];
  if (m.hasTotal) lines.push(columns.map((c, i) => esc(i === 0 ? "TOTAL" : m.sums[i] ?? "")).join(","));
  return new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

async function toXlsx({ columns, rows }, m) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND;
  const ws = wb.addWorksheet("Laporan", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }], pageSetup: { orientation: columns.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const last = columns.length;
  const fill = (h) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${h}` } });
  const border = { bottom: { style: "thin", color: { argb: `FF${C.line}` } } };
  const band = (row, height, value, font, bg) => {
    ws.mergeCells(row, 1, row, last);
    const cell = ws.getCell(row, 1);
    cell.value = value;
    cell.font = { name: "Calibri", ...font };
    cell.alignment = { vertical: "middle", horizontal: row === 1 ? "right" : "left", indent: 1 };
    if (bg) for (let i = 1; i <= last; i += 1) ws.getCell(row, i).fill = fill(bg);
    ws.getRow(row).height = height;
  };
  band(1, 40, BRAND.toUpperCase(), { size: 10, bold: true, color: { argb: "FFFFFFFF" } }, C.brand);
  band(2, 30, m.title, { size: 18, bold: true, color: { argb: `FF${C.dark}` } });
  band(3, 18, m.info, { size: 9, color: { argb: `FF${C.muted}` } });
  ws.getRow(4).height = 8;
  ws.addImage(wb.addImage({ base64: await logo(), extension: "png" }), { tl: { col: 0.15, row: 0.2 }, ext: { width: 120, height: 29 } });

  const head = ws.getRow(5);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.l;
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = fill(C.dark);
    cell.alignment = { vertical: "middle", horizontal: NUMERIC.includes(c.t) ? "right" : "left", indent: 1 };
  });
  head.height = 24;

  const numFmt = { rp: '"Rp"#,##0;[Red]-"Rp"#,##0', num: "#,##0.##", pct: '0.##"%"' };
  rows.forEach((r, ri) => {
    const row = ws.getRow(6 + ri);
    const tot = isTotalRow(r);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = raw(r, c);
      cell.value = NUMERIC.includes(c.t) ? (v === null || v === undefined || v === "" ? null : Number(v)) : text(v);
      if (numFmt[c.t]) cell.numFmt = numFmt[c.t];
      const sc = c.k === "status" && statusColor(v);
      cell.font = { name: "Calibri", size: 10, bold: !!sc || tot, color: { argb: `FF${sc || C.dark}` } };
      cell.alignment = { vertical: "middle", horizontal: NUMERIC.includes(c.t) ? "right" : "left", indent: 1, wrapText: c.k === "description" };
      cell.border = border;
      if (tot) cell.fill = fill(C.total);
      else if (ri % 2) cell.fill = fill(C.zebra);
    });
    row.height = 20;
  });

  if (m.hasTotal) {
    const row = ws.getRow(6 + rows.length);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = i === 0 ? "TOTAL" : m.sums[i];
      if (m.sums[i] !== null) cell.numFmt = numFmt.rp;
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: `FF${C.dark}` } };
      cell.fill = fill(C.total);
      cell.alignment = { vertical: "middle", horizontal: m.sums[i] !== null ? "right" : "left", indent: 1 };
      cell.border = { top: { style: "medium", color: { argb: `FF${C.brand}` } } };
    });
    row.height = 22;
  }

  columns.forEach((c, i) => {
    const longest = Math.max(c.l.length, ...rows.slice(0, 300).map((r) => pretty(r, c).length));
    ws.getColumn(i + 1).width = Math.min(c.k === "description" ? 48 : 34, Math.max(12, longest + 4));
  });
  ws.headerFooter.oddFooter = `&L&8${BRAND} · ${m.title}&R&8Halaman &P dari &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function toPdf({ columns, rows }, m, base) {
  const wide = columns.length > 10;
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "pt", format: columns.length > 12 ? "a3" : "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const img = await logo();
  const header = () => {
    doc.setFillColor(...rgb(C.brand));
    doc.rect(0, 0, W, 34, "F");
    doc.addImage(img, "PNG", 40, 9, 66, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(BRAND.toUpperCase(), W - 40, 21, { align: "right" });
  };
  header();
  doc.setTextColor(...rgb(C.dark));
  doc.setFontSize(18);
  doc.text(m.title, 40, 66);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...rgb(C.muted));
  doc.text(m.info, 40, 82);

  const body = rows.map((r) => columns.map((c) => pretty(r, c)));
  const foot = m.hasTotal ? [columns.map((c, i) => (i === 0 ? "TOTAL" : m.sums[i] !== null ? rp(m.sums[i]) : ""))] : undefined;
  autoTable(doc, {
    startY: 94, head: [columns.map((c) => c.l)], body, foot, showFoot: "lastPage",
    margin: { left: 40, right: 40, top: 50, bottom: 40 },
    styles: { font: "helvetica", fontSize: wide ? 7 : 8, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: rgb(C.dark), lineColor: rgb(C.line), lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: rgb(C.dark), textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: rgb(C.total), textColor: rgb(C.dark), fontStyle: "bold", lineColor: rgb(C.brand), lineWidth: { top: 1.2 } },
    alternateRowStyles: { fillColor: rgb(C.zebra) },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, NUMERIC.includes(c.t) ? { halign: "right", cellWidth: "wrap" } : { halign: "left" }])),
    didParseCell: (d) => {
      const c = columns[d.column.index];
      d.cell.styles.minCellWidth = NUMERIC.includes(c.t) ? (wide ? 0 : 58) : /date|tanggal/i.test(`${c.k}`) ? 54 : wide ? 60 : 0;
      if (d.section === "head" && NUMERIC.includes(c.t)) d.cell.styles.halign = "right";
      if (d.section !== "body") return;
      if (isTotalRow(rows[d.row.index])) { d.cell.styles.fillColor = rgb(C.total); d.cell.styles.fontStyle = "bold"; }
      if (c.k !== "status") return;
      const sc = statusColor(d.cell.raw);
      if (sc) { d.cell.styles.textColor = rgb(sc); d.cell.styles.fontStyle = "bold"; }
    },
    willDrawPage: (d) => { if (d.pageNumber > 1) header(); },
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...rgb(C.muted));
    doc.text(`${BRAND} · ${m.title}`, 40, H - 20);
    doc.text(`Halaman ${p} dari ${pages}`, W - 40, H - 20, { align: "right" });
  }
  doc.save(`${base}.pdf`);
}

// columns: [{k, l, t: 'rp'|'num'|'pct'|'text', v?: (row) => value}]
export async function exportData(fmt, spec) {
  const base = `maiharta-${(spec.filename || spec.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const m = meta(spec);
  if (fmt === "csv") return download(toCsv(spec, m), `${base}.csv`);
  if (fmt === "xlsx") return download(await toXlsx(spec, m), `${base}.xlsx`);
  return toPdf(spec, m, base);
}
