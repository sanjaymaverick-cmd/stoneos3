// Validates the Tally XML parsing logic against real exports BEFORE
// wiring it into the app. Run with: node prisma/validate-tally-parser.js /path/to/daybook.xml /path/to/TrialBal.xml
// No dependencies required — mirrors the regex/structure logic in
// tally-import.service.ts using plain string parsing, so it can run
// standalone to sanity-check any new export your accountant sends.
const fs = require("fs");

function decodeTallyXml(buf) {
  let text = buf.toString("utf16le");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\u0000")) text = buf.toString("utf8");
  return text;
}

function validateDaybook(path) {
  const text = decodeTallyXml(fs.readFileSync(path));
  const voucherBlocks = [...text.matchAll(/<VOUCHER[^>]*VCHTYPE="([^"]*)"[^>]*>([\s\S]*?)<\/VOUCHER>/g)];
  console.log(`Day Book: ${voucherBlocks.length} vouchers found`);

  let mismatches = 0;
  let totalLines = 0;
  for (const [, vchType, body] of voucherBlocks) {
    const allEntries = [...body.matchAll(/<ALLLEDGERENTRIES\.LIST>([\s\S]*?)<\/ALLLEDGERENTRIES\.LIST>/g)].map((m) => m[1]);
    const plainEntries = [...body.matchAll(/(?<!ALL)<LEDGERENTRIES\.LIST>([\s\S]*?)<\/LEDGERENTRIES\.LIST>/g)].map((m) => m[1]);
    const invEntries = [...body.matchAll(/<ALLINVENTORYENTRIES\.LIST>([\s\S]*?)<\/ALLINVENTORYENTRIES\.LIST>/g)].map((m) => m[1]);
    const allocEntries = invEntries.flatMap((inv) =>
      [...inv.matchAll(/<ACCOUNTINGALLOCATIONS\.LIST>([\s\S]*?)<\/ACCOUNTINGALLOCATIONS\.LIST>/g)].map((m) => m[1]),
    );
    const blocks = [...allEntries, ...plainEntries, ...allocEntries];

    let total = 0;
    for (const block of blocks) {
      const amt = block.match(/<AMOUNT>([^<]*)<\/AMOUNT>/);
      if (amt && amt[1].trim()) {
        total += parseFloat(amt[1]);
        totalLines++;
      }
    }
    if (Math.abs(total) > 0.01) mismatches++;
  }

  console.log(`Ledger lines that would be created: ${totalLines}`);
  console.log(`Vouchers that don't balance to zero: ${mismatches} (should be 0)`);
  if (mismatches > 0) {
    console.error("VALIDATION FAILED — do not trust this import until mismatches are understood.");
    process.exitCode = 1;
  }
}

function validateTrialBalance(path) {
  const text = decodeTallyXml(fs.readFileSync(path));
  const pattern = /<DSPDISPNAME>([^<]*)<\/DSPDISPNAME>[\s\S]*?<DSPDRAMTA>([^<]*)<\/DSPDRAMTA>[\s\S]*?<DSPCRAMTA>([^<]*)<\/DSPCRAMTA>/g;
  const rows = [...text.matchAll(pattern)];
  console.log(`Trial Balance: ${rows.length} accounts found`);
  for (const [, account, debit, credit] of rows) {
    console.log(`  ${account.trim()}: Dr ${debit.trim() || 0}  Cr ${credit.trim() || 0}`);
  }
}

const [, , daybookPath, trialBalPath] = process.argv;
if (!daybookPath || !trialBalPath) {
  console.error("Usage: node validate-tally-parser.js <daybook.xml> <TrialBal.xml>");
  process.exit(1);
}
validateDaybook(daybookPath);
console.log();
validateTrialBalance(trialBalPath);
