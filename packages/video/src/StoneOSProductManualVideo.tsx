import type {CSSProperties, ReactNode} from "react";
import {AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {flowStages, mockFactory} from "./mockData";

const C = {
  ink: "#16201b",
  paper: "#f3f0e7",
  panel: "#fffdf7",
  brass: "#b48a43",
  moss: "#55705d",
  rust: "#a4553d",
  muted: "#6f776f",
  line: "#d8d1c1",
  dark: "#101612",
};

const shell: CSSProperties = {
  background: C.paper,
  color: C.ink,
  fontFamily: "Arial, sans-serif",
};

const Fade = ({children}: {children: ReactNode}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.45], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const lift = interpolate(frame, [0, fps * 0.55], [22, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <div style={{opacity, transform: `translateY(${lift}px)`, height: "100%"}}>{children}</div>;
};

const Sidebar = ({active}: {active: string}) => (
  <div style={{width: 285, background: C.dark, color: "#edf0e9", padding: "38px 24px", boxSizing: "border-box"}}>
    <div style={{fontSize: 31, fontWeight: 800, letterSpacing: -1}}>StoneOS</div>
    <div style={{fontSize: 13, color: "#a9b5aa", marginTop: 5}}>ATLAS STONE WORKS · DEMO</div>
    <div style={{marginTop: 40, fontSize: 12, color: "#7f9182", letterSpacing: 1.8}}>WORKSPACE</div>
    {["My Work", "Receive", "Inventory", "Cutting", "Polishing", "Orders & Dispatch", "Expenses"].map((item) => (
      <div key={item} style={{marginTop: 10, padding: "13px 14px", borderRadius: 9, background: active === item ? "#27352c" : "transparent", color: active === item ? "#f1d49a" : "#d2d9d2", fontWeight: active === item ? 700 : 500, fontSize: 17}}>{item}</div>
    ))}
    <div style={{position: "absolute", bottom: 34, left: 28, display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#b8c4ba"}}>
      <span style={{width: 10, height: 10, borderRadius: 10, background: "#6cb67e", boxShadow: "0 0 12px #6cb67e"}} /> System online
    </div>
  </div>
);

const DemoBadge = () => <div style={{position: "absolute", top: 24, right: 30, zIndex: 5, background: "#fff6d9", border: `1px solid ${C.brass}`, color: "#6d501e", borderRadius: 18, padding: "7px 14px", fontSize: 13, fontWeight: 700}}>FICTIONAL DEMONSTRATION DATA</div>;

const Screen = ({active, title, subtitle, children}: {active: string; title: string; subtitle: string; children: ReactNode}) => (
  <AbsoluteFill style={{...shell, display: "flex", flexDirection: "row"}}>
    <Sidebar active={active} />
    <DemoBadge />
    <div style={{flex: 1, padding: "42px 52px", boxSizing: "border-box", overflow: "hidden"}}>
      <div style={{fontSize: 38, fontWeight: 800, letterSpacing: 1.2}}>{title}</div>
      <div style={{fontSize: 14, color: C.muted, letterSpacing: 1.5, marginTop: 5}}>{subtitle}</div>
      <div style={{marginTop: 30}}>{children}</div>
    </div>
  </AbsoluteFill>
);

const Card = ({title, value, subtitle, accent = C.brass, children}: {title: string; value?: string; subtitle?: string; accent?: string; children?: ReactNode}) => (
  <div style={{background: C.panel, border: `1px solid ${C.line}`, borderTop: `5px solid ${accent}`, borderRadius: 12, padding: "20px 22px", boxShadow: "0 8px 24px rgba(32,38,32,.07)", boxSizing: "border-box"}}>
    <div style={{fontSize: 14, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2}}>{title}</div>
    {value && <div style={{fontSize: 36, fontWeight: 800, marginTop: 9}}>{value}</div>}
    {subtitle && <div style={{fontSize: 15, color: C.muted, marginTop: 5}}>{subtitle}</div>}
    {children}
  </div>
);

const Caption = ({kicker, title, body}: {kicker: string; title: string; body: string}) => (
  <div style={{position: "absolute", zIndex: 8, left: 330, right: 60, bottom: 38, background: "rgba(16,22,18,.94)", color: "#f7f4eb", borderLeft: `6px solid ${C.brass}`, borderRadius: 10, padding: "18px 24px", boxShadow: "0 14px 35px rgba(0,0,0,.22)"}}>
    <div style={{fontSize: 13, color: "#d3b777", letterSpacing: 1.6, fontWeight: 700}}>{kicker}</div>
    <div style={{fontSize: 26, fontWeight: 750, marginTop: 4}}>{title}</div>
    <div style={{fontSize: 17, color: "#d7ddd7", marginTop: 5}}>{body}</div>
  </div>
);

const Flow = ({activeIndex}: {activeIndex: number}) => (
  <div style={{display: "flex", alignItems: "center", gap: 8}}>
    {flowStages.map((stage, index) => <div key={stage} style={{display: "flex", alignItems: "center", flex: 1}}>
      <div style={{width: "100%", textAlign: "center", padding: "14px 5px", borderRadius: 9, background: index < activeIndex ? "#dfe9e1" : index === activeIndex ? C.moss : "#ece8de", color: index === activeIndex ? "white" : C.ink, fontWeight: 700, fontSize: 15, border: `1px solid ${index === activeIndex ? C.moss : C.line}`}}>{stage}</div>
      {index < flowStages.length - 1 && <div style={{width: 12, height: 2, background: C.line}} />}
    </div>)}
  </div>
);

const Table = ({headers, rows}: {headers: string[]; rows: string[][]}) => (
  <div style={{border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.panel}}>
    <div style={{display: "grid", gridTemplateColumns: `repeat(${headers.length}, 1fr)`, background: "#e8e4d9", padding: "13px 16px", fontWeight: 700, fontSize: 14}}>{headers.map((h) => <div key={h}>{h}</div>)}</div>
    {rows.map((row, i) => <div key={i} style={{display: "grid", gridTemplateColumns: `repeat(${headers.length}, 1fr)`, padding: "15px 16px", borderTop: `1px solid ${C.line}`, fontSize: 15, alignItems: "center"}}>{row.map((cell, j) => <div key={j} style={{fontWeight: j === 0 ? 700 : 500, color: j === row.length - 1 ? C.moss : C.ink}}>{cell}</div>)}</div>)}
  </div>
);

const Intro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = spring({frame, fps, config: {damping: 18, stiffness: 80}, from: .93, to: 1});
  return <AbsoluteFill style={{background: C.dark, color: "#f6f2e7", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif"}}>
    <div style={{transform: `scale(${scale})`, textAlign: "center"}}>
      <div style={{fontSize: 19, color: "#c6aa70", letterSpacing: 4, fontWeight: 700}}>PRODUCT MANUAL VIDEO</div>
      <div style={{fontSize: 106, fontWeight: 800, letterSpacing: -5, marginTop: 16}}>StoneOS</div>
      <div style={{fontSize: 40, color: "#cfd6cf", marginTop: 8}}>From raw block to revenue.</div>
      <div style={{marginTop: 38, display: "inline-block", padding: "11px 18px", border: "1px solid #8d7b58", borderRadius: 20, color: "#d6c49b", fontSize: 14}}>All names, serials and financial values shown are fictional.</div>
    </div>
  </AbsoluteFill>;
};

const Dashboard = () => {
  const frame = useCurrentFrame();
  const active = Math.min(7, Math.floor(frame / 48));
  return <Screen active="My Work" title="CONTROL ROOM" subtitle={`${mockFactory.name.toUpperCase()} · ${mockFactory.shift.toUpperCase()}`}>
    <Fade>
      <Flow activeIndex={active} />
      <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginTop: 24}}>
        <Card title="Raw blocks" value="18" subtitle="3 ready for B-21" />
        <Card title="Awaiting grinding" value="126" subtitle="Across 3 cut batches" accent={C.moss} />
        <Card title="Finished slabs" value="84" subtitle="62 available · 22 reserved" accent={C.moss} />
        <Card title="Dispatches today" value="2" subtitle="₹4.85 lakh invoiced" accent={C.rust} />
      </div>
      <div style={{display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 20}}>
        <Card title="Factory flow map" subtitle="Live material pressure by stage">
          <div style={{height: 210, display: "flex", alignItems: "end", gap: 20, paddingTop: 18}}>{[58, 78, 45, 66, 38, 52].map((h, i) => <div key={i} style={{flex: 1}}><div style={{height: h * 1.8, background: i === 2 ? C.brass : C.moss, borderRadius: "8px 8px 3px 3px"}} /><div style={{fontSize: 12, textAlign: "center", marginTop: 7, color: C.muted}}>{["Yard", "B-21", "Grind", "Epoxy", "Polish", "Stock"][i]}</div></div>)}</div>
        </Card>
        <Card title="Next best action" accent={C.brass}>
          <div style={{fontSize: 23, fontWeight: 750, marginTop: 25}}>Move batch V101 to grinding</div>
          <div style={{fontSize: 16, lineHeight: 1.5, color: C.muted, marginTop: 12}}>50 cut slabs are waiting. LPM-01 is available and today’s dispatch stock is covered.</div>
          <div style={{marginTop: 20, display: "inline-block", background: C.ink, color: "white", borderRadius: 7, padding: "11px 16px", fontWeight: 700}}>Open LPM workflow →</div>
        </Card>
      </div>
    </Fade>
    <Caption kicker="1 · START WITH MY WORK" title="See live factory pressure before choosing the next action." body="StoneOS turns receiving, production, inventory and commercial events into one operational pulse." />
  </Screen>;
};

const Receive = () => <Screen active="Receive" title="RAW BLOCK RECEIPTS" subtitle="PHYSICAL GOODS RECEIPT · INVOICE CAN FOLLOW LATER">
  <Fade>
    <div style={{display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24}}>
      <Card title="Receive blocks" subtitle="Stock history is recorded automatically" accent={C.moss}>
        {[['Receipt date','15 Jul 2026'],['Serial number','V104'],['Variety','Viscount White'],['Weight','23.6 t'],['Location','Raw yard']].map(([label, value]) => <div key={label} style={{marginTop: 17}}><div style={{fontSize: 12, color: C.muted, textTransform: "uppercase"}}>{label}</div><div style={{marginTop: 5, border: `1px solid ${C.line}`, padding: "11px 12px", borderRadius: 7, fontSize: 17, background: "white"}}>{value}</div></div>)}
        <div style={{marginTop: 20, background: C.ink, color: "white", padding: "13px", borderRadius: 7, textAlign: "center", fontWeight: 700}}>Record receipt</div>
      </Card>
      <div>
        <Card title="Receipt lines · 3 today">
          <div style={{marginTop: 18}}><Table headers={["Block", "Variety", "Weight", "Status"]} rows={mockFactory.blocks.map((b) => [b.serial, b.variety, b.weight, b.stage])} /></div>
        </Card>
        <div style={{marginTop: 20}}><Card title="System result" accent={C.brass}><div style={{fontSize: 20, lineHeight: 1.55, marginTop: 16}}>V104 becomes <b>available raw stock</b> in the Raw Yard. A goods-receipt ledger event is appended with the operator and timestamp.</div></Card></div>
      </div>
    </div>
  </Fade>
  <Caption kicker="2 · RECEIVE ONCE" title="Record the physical block when it enters the yard." body="Supplier and invoice details can follow; operations no longer wait for paperwork before stock becomes visible." />
</Screen>;

const Cutting = () => <Screen active="Cutting" title="PRODUCTION — B-21" subtitle="BLOCK-CENTRIC CUTTING · DAILY LOGS · AUTOMATIC SLAB REGISTRATION">
  <Fade>
    <Flow activeIndex={1} />
    <div style={{display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 22, marginTop: 24}}>
      <Card title="Active cutting session" accent={C.rust}>
        <div style={{fontSize: 42, fontWeight: 800, marginTop: 16}}>V101</div>
        <div style={{fontSize: 18, color: C.muted, marginTop: 4}}>Viscount White · B-21-01</div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 24}}>
          <Card title="Runtime" value="18.4 h" /><Card title="Downtime" value="35 min" accent={C.rust} />
        </div>
        <div style={{marginTop: 20, padding: 14, background: "#fff4ee", borderRadius: 8, color: "#743d2e"}}>Power interruption logged at 14:20 · supervisor verified</div>
      </Card>
      <Card title="Complete session" subtitle="Enter two physical counts after inspection" accent={C.moss}>
        <div style={{display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 18}}>
          <Card title="Total slabs cut" value="50" /><Card title="Final good slabs" value="47" accent={C.moss} />
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 13, marginTop: 17}}>
          <Card title="Damaged" value="3" accent={C.rust} /><Card title="Length" value="10.2 ft" /><Card title="Width" value="5.8 ft" />
        </div>
        <div style={{marginTop: 18, fontSize: 17, lineHeight: 1.5}}>StoneOS generates <b>V101/50/01 … V101/50/47</b>, links every good slab to block V101, and moves them to Awaiting Grinding.</div>
      </Card>
    </div>
  </Fade>
  <Caption kicker="3 · CUT AND REGISTER" title="One B-21 session preserves the block-to-slab genealogy." body="Supervisors enter actual cut and good counts; damaged pieces are recorded without creating false inventory." />
</Screen>;

const Lpm = () => {
  const frame = useCurrentFrame();
  const phase = Math.min(2, Math.floor(frame / 190));
  const labels = ["GRINDING", "EPOXY", "POLISHING"];
  const activeStage = [2, 3, 4][phase];
  return <Screen active="Polishing" title="LPM — GRINDING & POLISHING" subtitle="CONTROLLED THREE-STEP FINISHING FLOW">
    <Fade>
      <Flow activeIndex={activeStage} />
      <div style={{display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24, marginTop: 25}}>
        <Card title={`Current step · ${labels[phase]}`} accent={[C.brass, C.rust, C.moss][phase]}>
          <div style={{display: "flex", gap: 12, marginTop: 20}}>{labels.map((label, i) => <div key={label} style={{flex: 1, padding: 16, borderRadius: 8, textAlign: "center", fontWeight: 800, background: i === phase ? [C.brass, C.rust, C.moss][i] : "#ebe7dd", color: i === phase ? "white" : C.muted}}>{i + 1}. {label}</div>)}</div>
          <div style={{marginTop: 26, fontSize: 18, lineHeight: 1.55}}>{[
            "Issue 47 cut slabs to LPM-01. Completion moves the batch to Grinding Complete in the LPM queue.",
            "Confirm epoxy only for ground, available slabs. This gate prevents a slab from entering polishing early.",
            "Issue epoxy-applied slabs for final polishing. Completion moves them to Finished Stock as sale-ready.",
          ][phase]}</div>
          <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 24}}><Card title="Batch" value="47" /><Card title="Runtime" value={phase === 0 ? "5.2 h" : phase === 1 ? "—" : "6.1 h"} /><Card title="Power" value={phase === 1 ? "—" : phase === 0 ? "186 kWh" : "228 kWh"} /></div>
        </Card>
        <Card title="Eligible slabs" subtitle="Only the correct previous stage appears">
          <div style={{marginTop: 18}}><Table headers={["Slab", "Stage", "Location"]} rows={mockFactory.slabs.slice(0, 2).map((s, i) => [s.serial, phase === 0 ? "Awaiting grinding" : phase === 1 ? (i ? "Grinding complete" : "Epoxy applied") : "Epoxy applied", "LPM queue"])} /></div>
          <div style={{marginTop: 20, padding: 16, borderRadius: 8, background: "#e7efe8", color: "#33513b", fontSize: 16}}><b>Workflow guard:</b> reservations, location and production stage must all agree before StoneOS starts or completes the run.</div>
        </Card>
      </div>
    </Fade>
    <Caption kicker="4 · FINISH IN ORDER" title="Grinding, epoxy and polishing are separate, traceable events." body="Eligibility gates keep the physical process and StoneOS inventory state aligned at every hand-off." />
  </Screen>;
};

const Inventory = () => <Screen active="Inventory" title="INVENTORY" subtitle="ON HAND · RESERVATIONS · MOVEMENT HISTORY">
  <Fade>
    <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18}}><Card title="Raw blocks" value="18" /><Card title="Unpolished" value="126" /><Card title="Finished" value="84" accent={C.moss} /><Card title="Reserved" value="22" accent={C.brass} /></div>
    <div style={{display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, marginTop: 22}}>
      <Card title="Slab genealogy · V101/50/01" accent={C.moss}>
        <div style={{display: "flex", gap: 10, alignItems: "stretch", marginTop: 20}}>{["Block V101", "B-21 session", "Grinding run", "Epoxy event", "Polishing run", "Available stock"].map((s, i) => <div key={s} style={{flex: 1, border: `1px solid ${C.line}`, background: i === 5 ? "#dfe9e1" : "white", borderRadius: 8, padding: "18px 10px", fontWeight: 700, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center"}}>{s}</div>)}</div>
        <div style={{marginTop: 28}}><Table headers={["Time", "Event", "From", "To"]} rows={[["08:10", "Grinding issue", "Awaiting grinding", "At LPM"],["13:25", "Grinding complete", "At LPM", "LPM queue"],["15:05", "Epoxy applied", "LPM queue", "LPM queue"],["Next day", "Polishing complete", "At LPM", "Finished stock"]]} /></div>
      </Card>
      <Card title="Manager exception" subtitle="Used only when physical stock differs" accent={C.rust}>
        <div style={{fontSize: 18, lineHeight: 1.55, marginTop: 22}}>Every adjustment requires a reason, operator, timestamp and append-only reversal link.</div>
        <div style={{marginTop: 22, padding: 16, borderRadius: 8, background: "#fff2ed", color: "#723827"}}><b>Protected:</b> an active production reservation cannot be silently overwritten by session completion or abort.</div>
      </Card>
    </div>
  </Fade>
  <Caption kicker="5 · TRACE EVERY SLAB" title="Inventory is a live workflow state, not an end-of-day spreadsheet." body="Open a slab to trace backward to its block and production runs, then forward to reservation and delivery." />
</Screen>;

const Sales = () => {
  const frame = useCurrentFrame();
  const active = Math.min(7, 5 + Math.floor(frame / 170));
  return <Screen active="Orders & Dispatch" title="SALES" subtitle="RESERVE · DISPATCH · INVOICE · PAYMENT">
    <Fade>
      <Flow activeIndex={active} />
      <div style={{display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 22, marginTop: 24}}>
        <Card title={`${mockFactory.order} · ${mockFactory.customer}`} accent={C.moss}>
          <Table headers={["Slab", "Finish", "Sq ft", "State"]} rows={[["V099/46/11", "Glossy", "58.4", active === 5 ? "Reserved" : "Dispatched"],["V099/46/12", "Glossy", "57.9", active < 6 ? "Reserved" : "Dispatched"],["V100/48/04", "Leather", "61.2", "Reserved"]]} />
          <div style={{marginTop: 22, fontSize: 17, color: C.muted}}>Partial dispatch is supported: remaining slabs stay reserved for the next vehicle.</div>
        </Card>
        <Card title="Commercial record" accent={C.brass}>
          {[['Customer',mockFactory.customer],['Invoice',mockFactory.invoice],['Invoice value','₹4,85,000'],['Payment recorded','₹3,00,000'],['Balance','₹1,85,000']].map(([l,v]) => <div key={l} style={{display: "flex", justifyContent: "space-between", padding: "15px 0", borderBottom: `1px solid ${C.line}`, fontSize: 17}}><span style={{color:C.muted}}>{l}</span><b>{v}</b></div>)}
          <div style={{marginTop: 20, background: C.ink, color: "white", padding: "14px", borderRadius: 8, textAlign: "center", fontWeight: 700}}>{active < 6 ? "Dispatch selected slabs" : active < 7 ? "Create invoice" : "Record payment"}</div>
        </Card>
      </div>
    </Fade>
    <Caption kicker="6 · CONVERT STOCK TO REVENUE" title="Reservations protect selected slabs through dispatch and billing." body="Commercial actions stay linked to the same material trail, including partial delivery, invoice and payment status." />
  </Screen>;
};

const Roles = () => <Screen active="My Work" title="ROLE-BASED WORKSPACES" subtitle="EACH PERSON SEES THE WORK THEY NEED">
  <Fade>
    <div style={{display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20}}>{[
      ["Operator", "Record B-21 and LPM production", ["Cutting", "Polishing"]],
      ["Supervisor", "Keep material moving through operations", ["Receive", "Inventory", "Cutting", "Polishing"]],
      ["Manager", "Control operations, sales and exceptions", ["All operations", "Expenses", "Adjustments"]],
      ["Owner", "Retain final authority and team access", ["All modules", "Team Access", "Administration"]],
    ].map(([role, desc, items], i) => <Card key={String(role)} title={String(role)} accent={[C.brass,C.moss,C.rust,C.ink][i]}><div style={{fontSize: 19, lineHeight: 1.5, marginTop: 17, minHeight: 86}}>{String(desc)}</div>{(items as string[]).map((item) => <div key={item} style={{marginTop: 10, padding: "10px 12px", background: "#ece8de", borderRadius: 7, fontWeight: 700}}>{item}</div>)}</Card>)}</div>
    <div style={{marginTop: 28}}><Card title="Security model" accent={C.moss}><div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginTop: 14, fontSize: 18}}><div><b>Tenant scoped</b><br/><span style={{color:C.muted}}>Every query belongs to one factory.</span></div><div><b>Role enforced</b><br/><span style={{color:C.muted}}>Backend guards protect every mutation.</span></div><div><b>Append-only history</b><br/><span style={{color:C.muted}}>Events are corrected through reversals, not deletion.</span></div></div></Card></div>
  </Fade>
  <Caption kicker="7 · GOVERN ACCESS" title="Operational simplicity does not weaken control." body="Roles reduce clutter for each person while tenant boundaries and audit trails remain enforced in the backend." />
</Screen>;

const Outro = () => <AbsoluteFill style={{background: C.dark, color: "#f6f2e7", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif"}}><Fade><div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}><div><div style={{fontSize: 94, fontWeight: 800, letterSpacing: -4}}>StoneOS</div><div style={{fontSize: 42, color: "#d2b77d", marginTop: 8}}>One trusted workflow from raw block to revenue.</div><div style={{fontSize: 20, color: "#aeb9af", marginTop: 30}}>Receive · Cut · Grind · Epoxy · Polish · Reserve · Dispatch · Bill</div></div></div></Fade></AbsoluteFill>;

export const StoneOSProductManualVideo = () => (
  <AbsoluteFill style={shell}>
    <Sequence from={0} durationInFrames={240}><Intro /><Audio src={staticFile("audio/01-intro.wav")} volume={0.92} /></Sequence>
    <Sequence from={240} durationInFrames={420}><Dashboard /><Audio src={staticFile("audio/02-dashboard.wav")} volume={0.92} /></Sequence>
    <Sequence from={660} durationInFrames={420}><Receive /><Audio src={staticFile("audio/03-receive.wav")} volume={0.92} /></Sequence>
    <Sequence from={1080} durationInFrames={480}><Cutting /><Audio src={staticFile("audio/04-cutting.wav")} volume={0.92} /></Sequence>
    <Sequence from={1560} durationInFrames={600}><Lpm /><Audio src={staticFile("audio/05-lpm.wav")} volume={0.92} /></Sequence>
    <Sequence from={2160} durationInFrames={480}><Inventory /><Audio src={staticFile("audio/06-inventory.wav")} volume={0.92} /></Sequence>
    <Sequence from={2640} durationInFrames={540}><Sales /><Audio src={staticFile("audio/07-sales.wav")} volume={0.92} /></Sequence>
    <Sequence from={3180} durationInFrames={300}><Roles /><Audio src={staticFile("audio/08-roles.wav")} volume={0.92} /></Sequence>
    <Sequence from={3480} durationInFrames={120}><Outro /></Sequence>
  </AbsoluteFill>
);
