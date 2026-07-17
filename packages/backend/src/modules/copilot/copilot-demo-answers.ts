// Canned Copilot answers for the isolated demo environment.
//
// The real Copilot turns a question into SQL via Gemini and runs it against
// the factory's data. In the demo we may not have Gemini quota provisioned,
// so when DEMO_MODE is on AND no Gemini key is configured, CopilotService
// falls back to these keyword-matched answers over the seeded demo dataset.
// They mirror the sample questions surfaced in the demo UI. If a real Gemini
// key IS set, the live path runs instead — this is purely a graceful
// no-key fallback, never a replacement for the real feature.

export interface DemoAnswer {
  answer: string;
  sql: string;
}

interface DemoEntry extends DemoAnswer {
  keys: string[];
}

const ENTRIES: DemoEntry[] = [
  {
    keys: ["diesel", "vehicle", "fuel"],
    answer:
      "Vehicle-category expenses over the last 30 days total ₹3,85,000 across the fleet. The single largest was ₹92,000 on the JCB (diesel + running). Diesel is booked under the 'vehicle' category, which requires a linked vehicle on every entry.",
    sql: `SELECT v.name AS vehicle, SUM(e.amount) AS spend
FROM expense e
JOIN vehicle v ON v.id = e.vehicle_id
WHERE e.category = 'vehicle'
  AND e.expense_date >= now() - interval '30 days'
GROUP BY v.name
ORDER BY spend DESC;`,
  },
  {
    keys: ["stock by variety", "block stock", "raw block", "inventory", "current stock"],
    answer:
      "Current raw-block stock (status = in_stock) is 9 blocks totalling about 190 tons, led by Black Galaxy (3 blocks) and Steel Grey (2 blocks). Two more blocks are on the saw right now and four are cut awaiting polishing.",
    sql: `SELECT variety_name, COUNT(*) AS blocks, SUM(weight_tons) AS tons
FROM raw_block
WHERE current_status = 'in_stock'
GROUP BY variety_name
ORDER BY tons DESC;`,
  },
  {
    keys: ["recovery", "105", "benchmark", "yield", "below"],
    answer:
      "Two blocks are below the 105 sqft/ton recovery benchmark: V-082 (Viscount White) at 88 and V-088 (Steel Grey) at 96. The rest are at or above target, led by V-097 (Absolute Black) at 124 sqft/ton.",
    sql: `SELECT rb.serial_number, rb.variety_name,
       ROUND(SUM(sli.quantity) / rb.weight_tons) AS sqft_per_ton
FROM raw_block rb
JOIN slab s ON s.parent_block_id = rb.id
JOIN sales_line_item sli ON sli.slab_id = s.id
GROUP BY rb.id
HAVING SUM(sli.quantity) / rb.weight_tons < 105
ORDER BY sqft_per_ton ASC;`,
  },
  {
    keys: ["top", "customer", "biggest", "best customer"],
    answer:
      "Top customers by invoiced value in the last 30 days: 1) Pearl Exports ₹24,04,950, 2) Kaveri Stone Depot ₹7,38,000, 3) Sri Balaji Granites ₹5,12,000, 4) Anand Traders ₹4,02,000, 5) Deccan Marbles ₹2,68,000.",
    sql: `SELECT c.name AS customer, SUM(sli.quantity * sli.unit_price) AS value
FROM sales_order so
JOIN customer c ON c.id = so.customer_id
JOIN sales_line_item sli ON sli.sales_order_id = so.id
WHERE so.order_date >= now() - interval '30 days'
GROUP BY c.name
ORDER BY value DESC
LIMIT 5;`,
  },
  {
    keys: ["outstanding", "not received", "receivable", "unpaid", "pending payment"],
    answer:
      "Outstanding (invoiced but not yet received) is about ₹15,32,000. Trailing-30-day invoiced value is ₹86,42,000 against ₹71,10,000 actually received.",
    sql: `SELECT SUM(sli.invoiced_amount - sli.actual_amount_received) AS outstanding
FROM sales_line_item sli
WHERE sli.actual_amount_received < sli.invoiced_amount;`,
  },
  {
    keys: ["b-21", "cut last week", "how many slabs", "slabs cut", "production last week"],
    answer:
      "B-21 completed two blocks in the last 7 days — V-103 (Tan Brown: 48 good of 52 cut) and V-098 (Steel Grey: 43 good of 46 cut) — for 91 good slabs and 7 damaged. Two blocks (V-101, V-104) are still under cutting.",
    sql: `SELECT rb.serial_number, cs.total_slabs_cut, cs.final_good_slab_count, cs.damaged_slab_count
FROM cutting_session cs
JOIN raw_block rb ON rb.id = cs.raw_block_id
JOIN machine m ON m.id = cs.machine_id
WHERE m.name = 'B-21' AND cs.status = 'completed'
  AND cs.ended_at >= now() - interval '7 days';`,
  },
];

const FALLBACK: DemoAnswer = {
  answer:
    "This demo environment answers a set of example business questions without a live Gemini key — try asking about raw block stock, recovery ratio, top customers, outstanding payments, diesel/vehicle spend, or B-21 production last week. In the full deployment, the Copilot answers any question by generating read-only SQL over your real factory data.",
  sql: "SELECT NULL WHERE FALSE",
};

export function demoCopilotAnswer(question: string): DemoAnswer {
  const q = question.toLowerCase();
  const hit = ENTRIES.find((e) => e.keys.some((k) => q.includes(k)));
  return hit ? { answer: hit.answer, sql: hit.sql } : FALLBACK;
}
