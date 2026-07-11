// ONE-OFF HISTORICAL BACKFILL — Expense + DailySalesSummary only.
//
// Source: "_temp/backfill-data/1. VEDAM PRODUCTION.xlsx" (gitignored, not committed).
// Each of its 4 sheets (one per fiscal year) lays months out horizontally as
// repeating 27-column blocks (+1 blank separator column = 28-wide stride).
// Within a block: row 0-1 = a two-row wrapped header, row 2 = a month label
// (best-effort only — NOT used to assign dates, see below), row 3+ = one row
// per day. Column 0 (DATE) is always an Excel serial number.
//
// IMPORTANT — header text is NOT reliable across blocks/sheets (typos, stray
// month-label bleed-through, renamed vehicles over the years). What IS
// reliable, confirmed by direct inspection of every block in every sheet,
// is COLUMN POSITION: columns 7-26 always carry the same role regardless of
// what their header literally says. Only columns 1-6 (QTY / SALE-AMOUNT /
// EXP / production-machine columns) change order between blocks, so those
// two are located by matching header text, not position. See
// handoff/REVIEW-REQUEST.md for the full list of discrepancies found
// between this actual layout and the one described in the brief.
//
// Usage:
//   npx ts-node prisma/backfill-historical.ts               (dry run, default)
//   npx ts-node prisma/backfill-historical.ts --dry-run      (explicit dry run)
//   npx ts-node prisma/backfill-historical.ts --confirm      (writes — NOT to be run without sign-off)
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { EXPENSE_CATEGORIES } from "../src/modules/expenses/expense.service";

const prisma = new PrismaClient();

const CONFIRM = process.argv.includes("--confirm");

const REPO_ROOT = path.resolve(__dirname, "../../.."); // packages/backend/prisma -> repo root
const DATA_DIR = path.join(REPO_ROOT, "_temp/backfill-data");
const TALLY_DIR = "C:/Program Files/TallyPrime";

const BLOCK_WIDTH = 28; // 27 data columns + 1 blank separator
const BLOCK_DATA_COLS = 27;

// Column position (relative to block start) -> EXPENSE_CATEGORIES entry.
// Confirmed stable across every sheet/block inspected, independent of header text.
//
// Columns 18 (OFFICIAL) and 22 (PAYMENTS) are handled specially below rather than
// through this generic map — see OFFICIAL_COL/PAYMENTS_COL — per Owner decisions made
// after reviewing the first dry run (handoff/ARCHITECT-BRIEF.md):
//   - "PAYMENTS" (was unmapped) -> staff_salary. TO WHOM still -> Expense.toWhom.
//   - OFFICIAL entries whose adjacent free-text description matches loan/bill
//     patterns -> loan_payment instead of official (see LOAN_KEYWORD_RE).
const FIXED_CATEGORY_COLS: Record<number, string> = {
  7: "block_rent",
  8: "royalty",
  9: "block_purchase_transport",
  10: "consumables_epoxy_battery",
  11: "maintenance",
  12: "construction",
  13: "contractor_pay",
  // 14 = vehicle (name resolved dynamically from header text per block, see resolveVehicleName)
  // 15 = BIKE — handled specially below (needs vehicleName: "Bike" tagged on), NOT through
  //      this generic map — leaving it here double-counted every bike amount (Must Fix,
  //      Richard's review 2026-07-11): once untagged via this loop, once again tagged via
  //      the explicit bike block. Mirrors why col 14 is excluded too.
  16: "mess",
  17: "phone",
  // 18 = OFFICIAL — handled specially, see OFFICIAL_COL below
  // 19 = free-text description tied to 18 (OFFICIAL) — no target field, not stored
  20: "commission",
  21: "medical",
  // 22 = PAYMENTS — handled specially, see PAYMENTS_COL below
  // 23 = "TO WHOM" — free text, attached to Expense.toWhom
  24: "misc",
  // 25 = free-text description tied to 24 (MISC) — no target field, not stored
  // 26 = "TOTAL" — row cross-check only (should equal EXP at relative col 1-6), not stored
};
const VEHICLE_COL = 14;
const BIKE_COL = 15;
const OFFICIAL_COL = 18;
const OFFICIAL_DESC_COL = 19;
const PAYMENTS_COL = 22;
const TOWHOM_COL = 23;

// Matches "LOAN", "KIST" (loan installment), "BILL", "EMI", "INT" (interest) as
// whole tokens — excludes hits where the keyword is a substring of an unrelated
// word (e.g. "PRINTER" contains "INT" but isn't loan-related) while still
// matching the common case in this data of a number run directly into the
// keyword with no space ("214285LOAN KIST", "209087INT"). Verified against
// every non-zero OFFICIAL-column entry in the ledger: 79 entries / ₹31,798,091
// match, and every single one is genuinely loan/bill/interest/EMI related on
// manual inspection (CC INT, SOLAR EMI/KIST, LOAN KIST, BILL, etc.) with zero
// false positives.
const LOAN_KEYWORD_RE = /(?<![A-Za-z])(LOAN|KIST|BILL|EMI|INT)(?![A-Za-z])/i;

interface CategoryHit {
  category: string;
  amount: number;
  vehicleName?: string; // only set for category === "vehicle"
  toWhom?: string; // only set for the staff_salary hit (see PAYMENTS/TOWHOM handling below)
}

interface DailyRecord {
  date: Date;
  qty: number;
  sale: number;
  categories: CategoryHit[];
  sheet: string;
  block: number;
}

function excelSerialToDate(serial: number): Date {
  // Excel (1900 date system) epoch offset used by SheetJS convention.
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs);
}

function numOrZero(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function textOrUndefined(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Vehicle name at VEHICLE_COL changes over the years (Van/Isuzu -> Nexon EV).
// Resolved from that block's own header text; if it doesn't clearly match a
// known name, the amount is logged as unmapped rather than guessed at.
function resolveVehicleName(headerText: string): string | undefined {
  const t = headerText.toUpperCase();
  if (t.includes("NEXON")) return "Nexon EV";
  if (t.includes("VAN") || t.includes("ISUZU") || t.includes("ISIZU")) return "Van (Isuzu)";
  if (t.includes("EV")) return "Nexon EV";
  return undefined;
}

function getR0R1MergedCols(ws: XLSX.WorkSheet): Set<number> {
  const set = new Set<number>();
  for (const m of ws["!merges"] || []) {
    if (m.s.r === 0 && m.e.r === 1 && m.s.c === m.e.c) set.add(m.s.c);
  }
  return set;
}

interface ParseResult {
  records: DailyRecord[];
  unmappedVehicleHeaders: Map<string, number>; // header text -> total amount
  rowCrossCheckMismatches: number;
  officialKeptCount: number;
  officialKeptTotal: number;
  loanReclassifiedCount: number;
  loanReclassifiedTotal: number;
}

function parseProductionLedger(filePath: string): ParseResult {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const records: DailyRecord[] = [];
  const unmappedVehicleHeaders = new Map<string, number>();
  let rowCrossCheckMismatches = 0;
  let officialKeptCount = 0;
  let officialKeptTotal = 0;
  let loanReclassifiedCount = 0;
  let loanReclassifiedTotal = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    const merged = getR0R1MergedCols(ws);
    const totalCols = rows[0]?.length ?? 0;
    const numBlocks = Math.ceil(totalCols / BLOCK_WIDTH);

    for (let b = 0; b < numBlocks; b++) {
      const off = b * BLOCK_WIDTH;
      const row0 = (rows[0] ?? []).slice(off, off + BLOCK_DATA_COLS);
      const row1 = (rows[1] ?? []).slice(off, off + BLOCK_DATA_COLS);
      if (row0.every((v) => v == null)) continue; // empty padding block

      const header = row0.map((v, i) => {
        if (v == null) return "";
        const cont = !merged.has(off + i) && row1[i] != null ? " " + String(row1[i]).trim() : "";
        return String(v).trim() + cont;
      });

      // Locate QTY and SALE/AMOUNT columns among relative positions 1-6 (order varies).
      let qtyCol = -1;
      let saleCol = -1;
      for (let i = 1; i <= 6 && i < header.length; i++) {
        const h = header[i].toUpperCase();
        if (h === "QTY") qtyCol = i;
        if (h === "SALE" || h === "AMOUNT") saleCol = i;
      }

      const vehicleName = resolveVehicleName(header[VEHICLE_COL] ?? "");

      for (let r = 3; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const dateCell = row[off];
        if (typeof dateCell !== "number" || !Number.isFinite(dateCell) || dateCell <= 0) continue; // filters totals/header-repeat/blank rows

        const qty = qtyCol >= 0 ? numOrZero(row[off + qtyCol]) : 0;
        const sale = saleCol >= 0 ? numOrZero(row[off + saleCol]) : 0;

        const categories: CategoryHit[] = [];
        for (const [colStr, category] of Object.entries(FIXED_CATEGORY_COLS)) {
          const col = Number(colStr);
          const amount = numOrZero(row[off + col]);
          if (amount === 0) continue;
          categories.push({ category, amount });
        }
        const vehicleAmount = numOrZero(row[off + VEHICLE_COL]);
        if (vehicleAmount !== 0) {
          if (vehicleName) {
            categories.push({ category: "vehicle", amount: vehicleAmount, vehicleName });
          } else {
            const key = `${sheetName}/block${b}: "${header[VEHICLE_COL]}"`;
            unmappedVehicleHeaders.set(key, (unmappedVehicleHeaders.get(key) ?? 0) + vehicleAmount);
          }
        }
        const bikeAmount = numOrZero(row[off + BIKE_COL]);
        if (bikeAmount !== 0) categories.push({ category: "vehicle", amount: bikeAmount, vehicleName: "Bike" });

        // OFFICIAL: split loan/bill lump sums (identified by adjacent free-text
        // description) into loan_payment; everything else stays official.
        // Owner decision, post dry-run-1 — see handoff/ARCHITECT-BRIEF.md.
        const officialAmount = numOrZero(row[off + OFFICIAL_COL]);
        if (officialAmount !== 0) {
          const officialDesc = textOrUndefined(row[off + OFFICIAL_DESC_COL]) ?? "";
          if (LOAN_KEYWORD_RE.test(officialDesc)) {
            categories.push({ category: "loan_payment", amount: officialAmount });
            loanReclassifiedCount++;
            loanReclassifiedTotal += officialAmount;
          } else {
            categories.push({ category: "official", amount: officialAmount });
            officialKeptCount++;
            officialKeptTotal += officialAmount;
          }
        }

        // PAYMENTS: previously unmapped, now staff_salary per Owner decision,
        // post dry-run-1 — see handoff/ARCHITECT-BRIEF.md. TO WHOM (col 23, immediately
        // adjacent) -> Expense.toWhom, attached ONLY to this staff_salary hit — not to
        // every category on the day (Must Fix, Richard's review 2026-07-11). Column
        // adjacency plus the sample TO WHOM values themselves (COOK, MUKESH, SANDEEP —
        // staff names) confirm TO WHOM describes who the PAYMENTS/staff_salary amount went
        // to, not an unrelated category (e.g. block_rent/royalty have no "who" — they're
        // institutional payments, and MISC already has its own dedicated description
        // column at relative col 25 rather than sharing TO WHOM).
        const paymentsAmount = numOrZero(row[off + PAYMENTS_COL]);
        const toWhomText = textOrUndefined(row[off + TOWHOM_COL]);
        if (paymentsAmount !== 0) categories.push({ category: "staff_salary", amount: paymentsAmount, toWhom: toWhomText });

        // ONE-OFF EXCEPTION — 2026-04-20 only (Owner decision, post local --confirm-1,
        // 2026-07-11). Verified by raw cell inspection: sheet 26-27, DATE serial 46132,
        // this single row's PAYMENTS cell (relative col 22) is blank, and its true value
        // (550000) plus note ("50k sandeep, 5lac wppf") landed one column to the right, in
        // the TO WHOM/MISC slots instead — a manual data-entry slip in the source
        // spreadsheet for this row only (confirmed: EXP/TOTAL still tie out at 550965, so
        // the row's overall total is unaffected, only this internal breakdown is scrambled).
        // Of the 550000: Owner decision is to record only the 50000 staff payment to
        // Sandeep; the remaining 500000 is a partner profit distribution ("WPPF"), not a
        // business expense, and deliberately has no EXPENSE_CATEGORIES entry — do not
        // record it anywhere. This is a documented one-off for this exact date, NOT a
        // general shifted-column detector — do not generalize this into a pattern match.
        if (sheetName === "26-27" && dateCell === 46132) {
          categories.push({ category: "staff_salary", amount: 50000, toWhom: "Sandeep" });
        }

        const rowTotal = numOrZero(row[off + 26]);
        const expCell = header.findIndex((h) => h.toUpperCase() === "EXP");
        if (expCell >= 1 && expCell <= 6) {
          const expVal = numOrZero(row[off + expCell]);
          if (rowTotal !== 0 && Math.abs(expVal - rowTotal) > 1) rowCrossCheckMismatches++;
        }

        const isEmpty = qty === 0 && sale === 0 && categories.length === 0;
        if (isEmpty) continue;

        records.push({
          date: excelSerialToDate(dateCell),
          qty,
          sale,
          categories,
          sheet: sheetName,
          block: b,
        });
      }
    }
  }

  return {
    records,
    unmappedVehicleHeaders,
    rowCrossCheckMismatches,
    officialKeptCount,
    officialKeptTotal,
    loanReclassifiedCount,
    loanReclassifiedTotal,
  };
}

interface MonthlyTotal {
  qty: number;
  sale: number;
  categoryTotals: Record<string, number>;
  total: number;
  dayCount: number;
}

function buildMonthlyTotals(records: DailyRecord[]): Map<string, MonthlyTotal> {
  const map = new Map<string, MonthlyTotal>();
  for (const rec of records) {
    const key = monthKey(rec.date);
    if (!map.has(key)) map.set(key, { qty: 0, sale: 0, categoryTotals: {}, total: 0, dayCount: 0 });
    const m = map.get(key)!;
    m.qty += rec.qty;
    m.sale += rec.sale;
    m.dayCount++;
    for (const c of rec.categories) {
      m.categoryTotals[c.category] = (m.categoryTotals[c.category] ?? 0) + c.amount;
      m.total += c.amount;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Reconciliation source 1: "4. VEDAM YEALY DATA.xlsx" — monthly rollups.
// ---------------------------------------------------------------------------
interface YearlyMonthRow {
  sale: number; // qty sqft
  amount: number; // sale currency
  expenses: number; // total expense
}

function parseYearlyDataFile(filePath: string): Map<string, YearlyMonthRow> {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const result = new Map<string, YearlyMonthRow>();
  const monthNameToNum: Record<string, number> = {
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7,
    AUGUEST: 8, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  };
  // Sheet name "23-24" means FY starting 2023; a month name resolves to a
  // calendar year depending on whether it falls in the Apr-Dec or Jan-Mar half.
  for (const sheetName of wb.SheetNames) {
    const fyStartYear = 2000 + Number(sheetName.split("-")[0]);
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
    // Header row (row1) tells us which columns are SALE/AMOUNT/EXPENCESS for this sheet;
    // FY 25-26 / 26-27 sheets don't have those as the first 3 columns (production-only layout).
    const header = (rows[1] ?? []).map((v) => (typeof v === "string" ? v.trim().toUpperCase() : ""));
    const saleIdx = header.indexOf("SALE");
    const amountIdx = header.indexOf("AMOUNT");
    const expIdx = header.findIndex((h) => h.startsWith("EXPENCESS") || h.startsWith("EXPENSES"));
    if (saleIdx < 0 || amountIdx < 0 || expIdx < 0) continue; // this FY sheet doesn't carry sale/expense rollups at all

    for (let r = 4; r < rows.length; r++) {
      const row = rows[r];
      if (!row || typeof row[0] !== "string") continue;
      const monthName = row[0].trim().toUpperCase();
      if (monthName === "TOTAL" || monthName === "EVERAGE" || monthName === "AVERAGE") continue;
      const monthNum = monthNameToNum[monthName];
      if (!monthNum) continue;
      const calYear = monthNum >= 4 ? fyStartYear : fyStartYear + 1; // Apr-Dec = FY start year, Jan-Mar = next
      const key = `${calYear}-${String(monthNum).padStart(2, "0")}`;
      result.set(key, {
        sale: numOrZero(row[saleIdx]),
        amount: numOrZero(row[amountIdx]),
        expenses: numOrZero(row[expIdx]),
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reconciliation source 2: Tally salesregister.xml / purchaseregister.xml (UTF-16).
// ---------------------------------------------------------------------------
function readUtf16(filePath: string): string {
  return fs.readFileSync(filePath).toString("utf16le");
}

const MONTH_NAME_TO_NUM: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// salesregister.xml: one <DSPPERIOD>MonthName</DSPPERIOD> per month with a
// monthly Cr total already aggregated by Tally. Year is NOT stated in the
// file — assumed to be the most recent fiscal year (see review request).
function parseTallySalesRegister(filePath: string): Map<number, number> {
  const text = readUtf16(filePath);
  const re = /<DSPPERIOD>([^<]*)<\/DSPPERIOD>[\s\S]*?<DSPCRAMTA>([^<]*)<\/DSPCRAMTA>/g;
  const result = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const monthNum = MONTH_NAME_TO_NUM[m[1].trim().slice(0, 3).toUpperCase()];
    const val = numOrZero(m[2]);
    if (monthNum && val !== 0) result.set(monthNum, (result.get(monthNum) ?? 0) + val);
  }
  return result;
}

// purchaseregister.xml: voucher-level, one <DSPPERIOD>D-Mon</DSPPERIOD> per
// transaction with a DR amount — aggregate by month ourselves.
function parseTallyPurchaseRegister(filePath: string): Map<number, number> {
  const text = readUtf16(filePath);
  const re = /<DSPPERIOD>(\d{1,2}-([A-Za-z]{3}))<\/DSPPERIOD>[\s\S]*?<DSPDRAMTA>([^<]*)<\/DSPDRAMTA>/g;
  const result = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const monthNum = MONTH_NAME_TO_NUM[m[2].toUpperCase()];
    const val = numOrZero(m[3]);
    if (monthNum && val !== 0) result.set(monthNum, (result.get(monthNum) ?? 0) + val);
  }
  return result;
}

function parseTallyTrialBalTotals(filePath: string): { salesAccountsCr: number; purchaseAccountsDr: number } {
  const text = readUtf16(filePath);
  function extract(name: string, tag: "DSPCRAMTA" | "DSPDRAMTA"): number {
    const re = new RegExp(`<DSPDISPNAME>${name}</DSPDISPNAME>[\\s\\S]*?<${tag}>([^<]*)</${tag}>`);
    const m = re.exec(text);
    return m ? numOrZero(m[1]) : 0;
  }
  return {
    salesAccountsCr: extract("Sales Accounts", "DSPCRAMTA"),
    purchaseAccountsDr: Math.abs(extract("Purchase Accounts", "DSPDRAMTA")),
  };
}

// ---------------------------------------------------------------------------
// Reconciliation source 3 (added per Architect update): per-day DPR files —
// an independent day-level cross-check for whichever dates overlap.
// ---------------------------------------------------------------------------
interface DprDayTotals {
  totalSale: number;
  totalExp: number;
}

const DPR_MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7,
  AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

function parseDprFilename(name: string): { date: Date; revised: boolean } | null {
  // e.g. "DPR VEDAM 01 APRIL 2026.xlsx", "REVISE DPR VEDAM 31 MAY 2026.xlsx",
  // "REVISED DPR VEDAM 25 JUNE  2026.xlsx"
  const m = /DPR VEDAM\s+(\d{1,2})\s+([A-Z]+)\s+(\d{4})/i.exec(name);
  if (!m) return null;
  const day = Number(m[1]);
  const monthNum = DPR_MONTHS[m[2].toUpperCase()];
  const year = Number(m[3]);
  if (!monthNum) return null;
  const revised = /^REVISE/i.test(name);
  return { date: new Date(Date.UTC(year, monthNum - 1, day)), revised };
}

function parseDprDailyDir(dir: string): Map<string, DprDayTotals> {
  const result = new Map<string, DprDayTotals>();
  if (!fs.existsSync(dir)) return result;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx"));
  for (const file of files) {
    const parsed = parseDprFilename(file);
    if (!parsed) continue;
    const key = parsed.date.toISOString().slice(0, 10);
    if (result.has(key) && !parsed.revised) continue; // prefer REVISE(D) version already stored, skip original if seen after
    const wb = XLSX.readFile(path.join(dir, file), { cellDates: false });
    const ws = wb.Sheets["Sheet1"];
    if (!ws) continue;
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: "A1:C40" });
    let totalSale = 0;
    let totalExp = 0;
    for (const row of rows) {
      if (!row || typeof row[0] !== "string") continue;
      const label = row[0].trim().toLowerCase();
      if (label === "total") totalSale = numOrZero(row[1]); // "Total " row after Sales section (exact match — "Total Exp." also starts with "total " and must not match here)
      if (label.startsWith("total exp")) totalExp = numOrZero(row[1]);
    }
    result.set(key, { totalSale, totalExp });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reconciliation source 4 (added per Architect update): monthly balance
// sheets — best-effort keyword scan (free-form layout, varies file to file).
// ---------------------------------------------------------------------------
function parseBalanceSheetGross(filePath: string): { label: string; value: number }[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets["FINAL"];
  if (!ws) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const hits: { label: string; value: number }[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (typeof cell !== "string") continue;
      const upper = cell.toUpperCase();
      if (upper.includes("GROSS OF") || upper.includes("SELL OF") || upper.includes("SALE OF")) {
        // value is conventionally in the column immediately before the label in this layout
        const value = numOrZero(row[i - 1]);
        if (value !== 0) hits.push({ label: cell.trim(), value });
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== StoneOS Historical Backfill — ${CONFIRM ? "CONFIRM (writes)" : "DRY RUN (no writes)"} ===\n`);

  const ledgerPath = path.join(DATA_DIR, "1. VEDAM PRODUCTION.xlsx");
  if (!fs.existsSync(ledgerPath)) throw new Error(`Not found: ${ledgerPath}`);

  const parsed = parseProductionLedger(ledgerPath);
  const monthly = buildMonthlyTotals(parsed.records);

  // --- Step 3: per-month summary (dry-run output) ---
  console.log("--- Parsed monthly summary (from 1. VEDAM PRODUCTION.xlsx) ---");
  const sortedMonths = [...monthly.keys()].sort();
  let grandQty = 0, grandSale = 0, grandExp = 0, grandDays = 0;
  for (const key of sortedMonths) {
    const m = monthly.get(key)!;
    grandQty += m.qty; grandSale += m.sale; grandExp += m.total; grandDays += m.dayCount;
    console.log(
      `${key}  days=${String(m.dayCount).padStart(3)}  qty=${m.qty.toFixed(0).padStart(8)}  sale=${m.sale.toFixed(0).padStart(10)}  expTotal=${m.total.toFixed(0).padStart(10)}`,
    );
  }
  console.log(`TOTAL  days=${grandDays}  qty=${grandQty.toFixed(0)}  sale=${grandSale.toFixed(0)}  expTotal=${grandExp.toFixed(0)}`);
  console.log(`Row-level EXP-vs-TOTAL cross-check mismatches: ${parsed.rowCrossCheckMismatches}`);

  console.log("\n--- Category totals (all months combined) ---");
  const categoryGrand: Record<string, number> = {};
  for (const m of monthly.values()) {
    for (const [cat, amt] of Object.entries(m.categoryTotals)) categoryGrand[cat] = (categoryGrand[cat] ?? 0) + amt;
  }
  for (const cat of EXPENSE_CATEGORIES) {
    if (categoryGrand[cat]) console.log(`  ${cat.padEnd(28)} ${categoryGrand[cat].toFixed(2)}`);
  }

  console.log("\n--- OFFICIAL / loan-bill split (Owner decision, post dry-run-1) ---");
  console.log(`  Kept as official: ${parsed.officialKeptCount} entries, total ${parsed.officialKeptTotal.toFixed(2)}`);
  console.log(`  Reclassified to loan_payment (description matched LOAN/KIST/BILL/EMI/INT): ${parsed.loanReclassifiedCount} entries, total ${parsed.loanReclassifiedTotal.toFixed(2)}`);

  console.log("\n--- Flagged items ---");
  if (parsed.unmappedVehicleHeaders.size > 0) {
    console.log(`  Vehicle column header text that didn't resolve to a known vehicle name:`);
    for (const [key, total] of parsed.unmappedVehicleHeaders) console.log(`    ${key} — total ${total.toFixed(2)}`);
  } else {
    console.log(`  All vehicle-column headers resolved to a known name (Nexon EV / Van (Isuzu)).`);
  }

  // --- Step 4: reconciliation ---
  console.log("\n=== Reconciliation ===");

  console.log("\n--- vs 4. VEDAM YEALY DATA.xlsx (monthly rollups) ---");
  const yearlyPath = path.join(DATA_DIR, "4. VEDAM YEALY DATA.xlsx");
  const yearly = fs.existsSync(yearlyPath) ? parseYearlyDataFile(yearlyPath) : new Map<string, YearlyMonthRow>();
  for (const key of sortedMonths) {
    const parsedM = monthly.get(key)!;
    const y = yearly.get(key);
    if (!y) { console.log(`${key}  no yearly-data row found`); continue; }
    const dSale = parsedM.sale - y.amount;
    const dExp = parsedM.total - y.expenses;
    const flag = Math.abs(dSale) > 1 || Math.abs(dExp) > 1 ? "  <-- DELTA" : "";
    console.log(`${key}  sale ${parsedM.sale.toFixed(0)} vs ${y.amount.toFixed(0)} (Δ${dSale.toFixed(0)})   exp ${parsedM.total.toFixed(0)} vs ${y.expenses.toFixed(0)} (Δ${dExp.toFixed(0)})${flag}`);
  }

  console.log("\n--- vs Tally salesregister.xml / purchaseregister.xml (assumed FY 25-26, Apr'25-Mar'26 — year not stated in file, see review request) ---");
  const salesRegPath = path.join(TALLY_DIR, "salesregister.xml");
  const purchRegPath = path.join(TALLY_DIR, "purchaseregister.xml");
  if (fs.existsSync(salesRegPath) && fs.existsSync(purchRegPath)) {
    const tallySales = parseTallySalesRegister(salesRegPath);
    const tallyPurch = parseTallyPurchaseRegister(purchRegPath);
    for (const key of sortedMonths) {
      const [y, mo] = key.split("-").map(Number);
      if (y !== 2025 && !(y === 2026 && mo <= 3)) continue; // only months plausibly in the assumed FY
      const parsedM = monthly.get(key)!;
      const tSale = tallySales.get(mo);
      const tPurch = tallyPurch.get(mo);
      const parts: string[] = [];
      if (tSale !== undefined) parts.push(`sale ${parsedM.sale.toFixed(0)} vs Tally Cr ${tSale.toFixed(0)} (Δ${(parsedM.sale - tSale).toFixed(0)})`);
      if (tPurch !== undefined) parts.push(`purchase-exp ${(parsedM.categoryTotals["block_purchase_transport"] ?? 0).toFixed(0)} vs Tally Dr ${tPurch.toFixed(0)} (Δ${((parsedM.categoryTotals["block_purchase_transport"] ?? 0) - tPurch).toFixed(0)})`);
      if (parts.length) console.log(`${key}  ${parts.join("   ")}`);
    }
    const trialBalPath = path.join(TALLY_DIR, "TrialBal.xml");
    if (fs.existsSync(trialBalPath)) {
      const tb = parseTallyTrialBalTotals(trialBalPath);
      const salesRegSum = [...tallySales.values()].reduce((a, b) => a + b, 0);
      const purchRegSum = [...tallyPurch.values()].reduce((a, b) => a + b, 0);
      console.log(`  TrialBal Sales Accounts Cr=${tb.salesAccountsCr.toFixed(0)} vs salesregister.xml sum=${salesRegSum.toFixed(0)} (Δ${(tb.salesAccountsCr - salesRegSum).toFixed(0)})`);
      console.log(`  TrialBal Purchase Accounts Dr=${tb.purchaseAccountsDr.toFixed(0)} vs purchaseregister.xml sum=${purchRegSum.toFixed(0)} (Δ${(tb.purchaseAccountsDr - purchRegSum).toFixed(0)})`);
    }
  } else {
    console.log("  Tally XML files not found at " + TALLY_DIR + " — skipped.");
  }

  console.log("\n--- vs dpr-daily/ per-day source files (independent day-level cross-check, added per Architect update) ---");
  const dprDir = path.join(DATA_DIR, "dpr-daily");
  const dprTotals = parseDprDailyDir(dprDir);
  let dprMatched = 0, dprMismatched = 0, dprChecked = 0;
  for (const rec of parsed.records) {
    const key = rec.date.toISOString().slice(0, 10);
    const dpr = dprTotals.get(key);
    if (!dpr) continue;
    dprChecked++;
    const dprExpTotal = dpr.totalExp;
    const ledgerExpTotal = rec.categories.reduce((s, c) => s + c.amount, 0);
    if (Math.abs(dprExpTotal - ledgerExpTotal) <= 1 && Math.abs(dpr.totalSale - rec.sale) <= 1) dprMatched++;
    else dprMismatched++;
  }
  console.log(`  ${dprTotals.size} DPR daily files parsed; ${dprChecked} overlap with ledger dates; ${dprMatched} match, ${dprMismatched} differ by >₹1 (see notes in review request — DPR "Total Sale"/"Total Exp." row labels are matched by best-effort text search, verify a mismatch sample before trusting this count).`);

  console.log("\n--- vs balance-sheets/ monthly BS files (best-effort GROSS-OF-<month> keyword match) ---");
  const bsDir = path.join(DATA_DIR, "balance-sheets");
  if (fs.existsSync(bsDir)) {
    for (const file of fs.readdirSync(bsDir).filter((f) => f.toLowerCase().endsWith(".xlsx"))) {
      const hits = parseBalanceSheetGross(path.join(bsDir, file));
      if (hits.length === 0) { console.log(`  ${file}: no "GROSS OF"/"SELL OF" cell found — skipped (layout may differ from June template).`); continue; }
      for (const h of hits) console.log(`  ${file}: "${h.label}" = ${h.value.toFixed(0)}`);
    }
  } else {
    console.log("  balance-sheets/ directory not found — skipped.");
  }
  const legacyBs = path.join(DATA_DIR, "BS MONTH OF JUNE 2026.xlsx");
  if (fs.existsSync(legacyBs) && !fs.existsSync(path.join(bsDir, "BS MONTH OF JUNE 2026.xlsx"))) {
    const hits = parseBalanceSheetGross(legacyBs);
    for (const h of hits) console.log(`  BS MONTH OF JUNE 2026.xlsx (root copy): "${h.label}" = ${h.value.toFixed(0)}`);
  }

  // --- DB-touching part: read-only in dry run, writes only under --confirm ---
  console.log(`\n=== ${CONFIRM ? "Writing to database" : "Database checks (read-only)"} ===`);
  const factory = await prisma.factory.findFirst();
  if (!factory) {
    if (CONFIRM) throw new Error("No Factory row found — run prisma/bootstrap.ts first.");
    console.log("No Factory row found in local Postgres yet (prisma/bootstrap.ts hasn't been run in this environment — it requires a live Clerk-authenticated owner and is out of scope for this dry run).");
    console.log("Vehicle lookup/creation and factory-scoped checks are skipped below; everything above (parsing + reconciliation) does not depend on a Factory row.");
    console.log("\n=== DRY RUN COMPLETE (factory-independent checks only) — no rows were written. ===");
    return;
  }
  console.log(`Factory: ${factory.name} (${factory.id})`);

  const neededVehicleNames = new Set<string>();
  for (const rec of parsed.records) for (const c of rec.categories) if (c.category === "vehicle" && c.vehicleName) neededVehicleNames.add(c.vehicleName);
  const existingVehicles = await prisma.vehicle.findMany({ where: { factoryId: factory.id } });
  const vehicleIdByName = new Map<string, string>(existingVehicles.map((v) => [v.name, v.id]));
  for (const name of neededVehicleNames) {
    if (vehicleIdByName.has(name)) { console.log(`Vehicle "${name}" already exists (${vehicleIdByName.get(name)})`); continue; }
    if (CONFIRM) {
      const created = await prisma.vehicle.create({ data: { factoryId: factory.id, name } });
      vehicleIdByName.set(name, created.id);
      console.log(`Created vehicle "${name}" (${created.id})`);
    } else {
      console.log(`Vehicle "${name}" does not exist yet — would be created under --confirm.`);
    }
  }

  if (!CONFIRM) {
    console.log("\n=== DRY RUN COMPLETE — no rows were written. Re-run with --confirm only after Architect + Project Owner sign-off on the reconciliation output above. ===");
    return;
  }

  // --- writes ---
  // Safety guard (Should Fix, Richard's review 2026-07-11): print + verify the resolved DB
  // target immediately before the destructive delete. Refuses to proceed under --confirm
  // unless the host is unambiguously local — this script must never write to production.
  const dbUrl = process.env.DATABASE_URL ?? "";
  let dbHost = "(unparseable)";
  try { dbHost = new URL(dbUrl).hostname; } catch { /* leave as unparseable */ }
  console.log(`\nDATABASE_URL target host: "${dbHost}" (full URL not printed — may contain credentials)`);
  if (!["localhost", "127.0.0.1"].includes(dbHost)) {
    throw new Error(`Refusing to run --confirm: DATABASE_URL host "${dbHost}" is not localhost/127.0.0.1. This script must only ever write to a local Postgres instance.`);
  }

  const minDate = parsed.records.reduce((min, r) => (r.date < min ? r.date : min), parsed.records[0].date);
  const maxDate = parsed.records.reduce((max, r) => (r.date > max ? r.date : max), parsed.records[0].date);
  const deleted = await prisma.expense.deleteMany({ where: { factoryId: factory.id, expenseDate: { gte: minDate, lte: maxDate } } });
  console.log(`Wiped ${deleted.count} existing Expense rows in ${minDate.toISOString().slice(0, 10)}..${maxDate.toISOString().slice(0, 10)} before reinsert (re-run safety).`);

  let expenseCount = 0;
  for (const rec of parsed.records) {
    await prisma.dailySalesSummary.upsert({
      where: { factoryId_summaryDate: { factoryId: factory.id, summaryDate: rec.date } },
      update: { totalQtySqft: rec.qty, invoicedAmount: rec.sale, isDerived: false },
      create: { factoryId: factory.id, summaryDate: rec.date, totalQtySqft: rec.qty, invoicedAmount: rec.sale, isDerived: false },
    });
    for (const c of rec.categories) {
      await prisma.expense.create({
        data: {
          factoryId: factory.id,
          category: c.category,
          amount: c.amount,
          expenseDate: rec.date,
          vehicleId: c.vehicleName ? vehicleIdByName.get(c.vehicleName) : undefined,
          toWhom: c.toWhom,
        },
      });
      expenseCount++;
    }
  }
  console.log(`Inserted ${expenseCount} Expense rows and upserted ${parsed.records.length} DailySalesSummary rows.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
