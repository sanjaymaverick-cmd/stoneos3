export const mockFactory = {
  name: "Atlas Stone Works",
  shift: "Day shift · 07:00–19:00",
  blocks: [
    {serial: "V101", variety: "Viscount White", weight: "24.8 t", stage: "Queued for B-21"},
    {serial: "V102", variety: "Alaska Gold", weight: "22.1 t", stage: "Raw yard"},
    {serial: "V103", variety: "Steel Grey", weight: "26.3 t", stage: "Raw yard"},
  ],
  slabs: [
    {serial: "V101/50/01", stage: "Epoxy applied", location: "LPM queue", status: "Available"},
    {serial: "V101/50/02", stage: "Grinding complete", location: "LPM queue", status: "Available"},
    {serial: "V099/46/11", stage: "Sale ready", location: "Finished stock", status: "Reserved"},
  ],
  customer: "Northstar Surfaces",
  invoice: "INV-DEMO-1048",
  order: "SO-DEMO-218",
};

export const flowStages = ["Receive", "Cut", "Grind", "Epoxy", "Polish", "Reserve", "Dispatch", "Bill"];
