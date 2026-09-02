import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const C = {
  ink: "#101713",
  charcoal: "#17211c",
  cream: "#f5f2e9",
  paper: "#fffdf7",
  green: "#0f9f71",
  moss: "#52705d",
  brass: "#c9a96a",
  rust: "#b65e3f",
  muted: "#aab5ad",
};

const full: CSSProperties = {
  fontFamily: "Arial, sans-serif",
  background: C.ink,
  color: C.cream,
};

const FadeIn = ({children, delay = 0}: {children: ReactNode; delay?: number}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [delay, delay + 22], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{opacity, transform: `translateY(${y}px)`}}>{children}</div>;
};

const DemoPill = () => (
  <div style={{position: "absolute", top: 34, right: 42, zIndex: 20, border: "1px solid rgba(201,169,106,.72)", background: "rgba(16,23,19,.9)", color: "#ead6a7", borderRadius: 24, padding: "9px 17px", fontSize: 14, fontWeight: 700, letterSpacing: 1.1}}>
    FICTIONAL PARTNER DEMO DATA
  </div>
);

const Progress = ({index}: {index: number}) => (
  <div style={{position: "absolute", zIndex: 18, left: 420, top: 24, display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderRadius: 16, background: "rgba(16,23,19,.92)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 12px 34px rgba(0,0,0,.24)"}}>
    <div style={{fontWeight: 800, fontSize: 22, letterSpacing: -0.5}}>StoneOS</div>
    <div style={{width: 1, height: 22, background: "rgba(255,255,255,.28)"}} />
    <div style={{fontSize: 13, color: "#d1d8d2", letterSpacing: 1.6}}>PARTNER PRODUCT DEMO</div>
    <div style={{display: "flex", gap: 5, marginLeft: 12}}>{Array.from({length: 6}).map((_, i) => <span key={i} style={{height: 4, width: i === index ? 42 : 17, borderRadius: 4, background: i === index ? C.brass : "rgba(255,255,255,.24)"}} />)}</div>
  </div>
);

const Caption = ({kicker, title, body, accent = C.green}: {kicker: string; title: string; body: string; accent?: string}) => (
  <div style={{position: "absolute", zIndex: 15, left: 56, right: 56, bottom: 42, display: "grid", gridTemplateColumns: "440px 1fr", overflow: "hidden", borderRadius: 14, background: "rgba(13,19,16,.94)", border: "1px solid rgba(255,255,255,.13)", boxShadow: "0 24px 70px rgba(0,0,0,.35)"}}>
    <div style={{padding: "22px 28px", borderLeft: `7px solid ${accent}`}}>
      <div style={{fontSize: 13, letterSpacing: 1.9, color: accent, fontWeight: 800}}>{kicker}</div>
      <div style={{fontSize: 29, lineHeight: 1.12, marginTop: 7, fontWeight: 800}}>{title}</div>
    </div>
    <div style={{padding: "25px 30px", display: "flex", alignItems: "center", fontSize: 19, lineHeight: 1.45, color: "#d9e0db", borderLeft: "1px solid rgba(255,255,255,.1)"}}>{body}</div>
  </div>
);

const Screenshot = ({src, zoom = 1.03, panX = 0, panY = 0, dim = 0.1}: {src: string; zoom?: number; panX?: number; panY?: number; dim?: number}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const localScale = interpolate(frame, [0, durationInFrames], [1, zoom], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const x = interpolate(frame, [0, durationInFrames], [0, panX], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const y = interpolate(frame, [0, durationInFrames], [0, panY], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const opacity = interpolate(frame, [0, 12, durationInFrames - 10, durationInFrames], [0, 1, 1, .15], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return <AbsoluteFill style={{overflow: "hidden", background: C.ink, opacity}}>
    <Img src={staticFile(`marketing/${src}`)} style={{width: "100%", height: "100%", objectFit: "cover", transform: `translate(${x}px, ${y}px) scale(${localScale})`}} />
    <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(10,15,12,${dim + .2}) 0%, rgba(10,15,12,0) 24%, rgba(10,15,12,0) 56%, rgba(10,15,12,.46) 100%)`}} />
  </AbsoluteFill>;
};

const MetricChip = ({label, value, accent = C.green}: {label: string; value: string; accent?: string}) => (
  <div style={{minWidth: 180, padding: "14px 18px", borderRadius: 11, background: "rgba(255,253,247,.95)", color: C.ink, boxShadow: "0 14px 36px rgba(0,0,0,.22)", borderTop: `4px solid ${accent}`}}>
    <div style={{fontSize: 12, color: "#657068", textTransform: "uppercase", letterSpacing: 1.1}}>{label}</div>
    <div style={{fontSize: 26, fontWeight: 850, marginTop: 4}}>{value}</div>
  </div>
);

const Intro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = spring({frame, fps, config: {damping: 18, stiffness: 75}, from: .93, to: 1});
  return <AbsoluteFill style={{...full, overflow: "hidden"}}>
    <div style={{position: "absolute", inset: -120, opacity: .2, transform: "rotate(-5deg)"}}>
      <Img src={staticFile("marketing/04-control-room-live-pulse.png")} style={{width: "100%", height: "100%", objectFit: "cover", filter: "blur(4px) saturate(.45)"}} />
    </div>
    <AbsoluteFill style={{background: "radial-gradient(circle at 68% 35%, rgba(15,159,113,.23), transparent 38%), linear-gradient(110deg, rgba(11,16,13,.98) 28%, rgba(11,16,13,.76) 70%, rgba(11,16,13,.94))"}} />
    <div style={{position: "absolute", left: 116, top: 205, transform: `scale(${scale})`, transformOrigin: "left center"}}>
      <FadeIn><div style={{fontSize: 17, color: C.brass, letterSpacing: 3.2, fontWeight: 800}}>THE OPERATING SYSTEM FOR STONE FACTORIES</div></FadeIn>
      <FadeIn delay={8}><div style={{fontSize: 110, lineHeight: .95, fontWeight: 900, letterSpacing: -6, marginTop: 24}}>StoneOS</div></FadeIn>
      <FadeIn delay={15}><div style={{fontSize: 45, maxWidth: 950, lineHeight: 1.15, color: "#dfe6e0", marginTop: 24}}>See the next decision<br/>before it becomes the next delay.</div></FadeIn>
      <FadeIn delay={26}><div style={{fontSize: 18, color: "#b4c0b7", marginTop: 32}}>Real product screens · fictional operational data · partner demonstration</div></FadeIn>
    </div>
    <div style={{position: "absolute", right: 100, bottom: 94, color: "#d2b77f", fontSize: 17, letterSpacing: 2}}>RAW BLOCK → REVENUE</div>
  </AbsoluteFill>;
};

const ControlRoom = () => <AbsoluteFill style={full}>
  <Sequence from={0} durationInFrames={250}><Screenshot src="04-control-room-live-pulse.png" zoom={1.045} panX={-25} /></Sequence>
  <Sequence from={245} durationInFrames={85}><Screenshot src="05-control-room-actions-modules.png" zoom={1.025} panY={-12} /></Sequence>
  <Progress index={0}/><DemoPill/>
  <div style={{position: "absolute", top: 112, right: 58, display: "flex", gap: 12}}>
    <MetricChip label="Raw stock" value="14 blocks" />
    <MetricChip label="Finished" value="96 slabs" accent={C.moss} />
    <MetricChip label="Open orders" value="6" accent={C.brass} />
  </div>
  <Caption kicker="ONE OPERATIONAL PULSE" title="Know what is happening now." body="Receiving, cutting, finishing, inventory and commercial work resolve into one live control room—so every shift begins from the same source of truth." />
</AbsoluteFill>;

const Predictive = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame % 60, [0, 30, 60], [1, 1.04, 1]);
  return <AbsoluteFill style={full}>
    <Screenshot src="01-ai-predictive-dashboard.png" zoom={1.08} panX={42} panY={10} dim={.02}/>
    <Progress index={1}/><DemoPill/>
    <div style={{position: "absolute", top: 120, right: 54, width: 315, padding: "20px 22px", borderRadius: 13, background: "rgba(15,23,19,.94)", boxShadow: "0 18px 55px rgba(0,0,0,.35)", transform: `scale(${pulse})`, transformOrigin: "top right", border: "1px solid rgba(255,255,255,.12)"}}>
      <div style={{fontSize: 13, color: C.brass, fontWeight: 800, letterSpacing: 1.5}}>PREDICTIVE SIGNAL</div>
      <div style={{fontSize: 32, fontWeight: 850, marginTop: 8}}>LPM risk: Elevated</div>
      <div style={{fontSize: 16, color: "#cbd4cd", lineHeight: 1.45, marginTop: 8}}>68 slabs await conversion. Finish-group batching becomes the recommended intervention.</div>
    </div>
    <Caption kicker="PREDICTIVE ANALYTICS" title="Act before pressure becomes loss." body="StoneOS projects seven-day finished stock, open-order coverage, bottleneck risk and time-to-sale from current stock, work in progress, machine availability and order demand." accent={C.brass}/>
  </AbsoluteFill>;
};

const AIExperience = () => <AbsoluteFill style={full}>
  <Sequence from={0} durationInFrames={185}><Screenshot src="02-ai-sensemaking-workflow.png" zoom={1.05} panY={-18}/></Sequence>
  <Sequence from={180} durationInFrames={180}><Screenshot src="03-ai-next-best-actions.png" zoom={1.07} panX={-35}/></Sequence>
  <Progress index={2}/><DemoPill/>
  <div style={{position: "absolute", top: 112, left: 58, display: "flex", gap: 12}}>
    <MetricChip label="Model confidence" value="87%" />
    <MetricChip label="Conversion window" value="18–24 h" accent={C.brass}/>
    <MetricChip label="Next best action" value="Batch LPM" accent={C.rust}/>
  </div>
  <Caption kicker="AI DECISION LAYER" title="The right view for every decision." body="Role-aware sensemaking, a spatial factory twin and explainable next-best actions translate the same live workflow into priorities an owner, manager or operator can act on." />
</AbsoluteFill>;

const Operations = () => <AbsoluteFill style={full}>
  <Sequence from={0} durationInFrames={145}><Screenshot src="06-receive-block-v205.png" zoom={1.04} panX={-18}/></Sequence>
  <Sequence from={140} durationInFrames={145}><Screenshot src="08-b21-cutting-control.png" zoom={1.045} panY={-8}/></Sequence>
  <Sequence from={280} durationInFrames={140}><Screenshot src="09-lpm-grinding-epoxy-polishing.png" zoom={1.05} panX={32}/></Sequence>
  <Progress index={3}/><DemoPill/>
  <div style={{position: "absolute", top: 115, right: 56, display: "flex", gap: 9, alignItems: "center", padding: "12px 15px", background: "rgba(16,23,19,.93)", borderRadius: 12, fontSize: 17, fontWeight: 750}}>
    {['Receive','B-21 Cut','Grind','Epoxy','Polish'].map((s, i) => <div key={s} style={{display: "flex", alignItems: "center", gap: 9}}><span style={{color: i === 2 ? C.brass : "#f2f4ef"}}>{s}</span>{i < 4 && <span style={{color: "#718177"}}>→</span>}</div>)}
  </div>
  <Caption kicker="CONTROLLED EXECUTION" title="Record each physical event once." body="A raw block enters the yard, B-21 creates registered slabs, then LPM enforces grinding, epoxy and polishing as separate, traceable stages—not one ambiguous completion." accent={C.rust}/>
</AbsoluteFill>;

const Inventory = () => <AbsoluteFill style={full}>
  <Screenshot src="07-inventory-traceability.png" zoom={1.065} panX={-24} panY={12}/>
  <Progress index={4}/><DemoPill/>
  <div style={{position: "absolute", top: 118, right: 58, padding: "14px 20px", borderRadius: 12, background: "rgba(16,23,19,.93)", fontSize: 17, fontWeight: 750, letterSpacing: .5}}>BLOCK → SESSION → SLAB → CUSTOMER</div>
  <Caption kicker="FULL MATERIAL TRAIL" title="Trace every slab in both directions." body="Live stock states replace end-of-day spreadsheets. Open a slab to understand where it came from, what transformed it, what reserved it and where it is going." />
</AbsoluteFill>;

const Commercial = () => <AbsoluteFill style={full}>
  <Screenshot src="10-sales-reserve-dispatch.png" zoom={1.055} panX={-18}/>
  <Progress index={5}/><DemoPill/>
  <div style={{position: "absolute", top: 116, right: 58, display: "flex", gap: 12}}>
    <MetricChip label="Partner demo order" value="640 sq ft" />
    <MetricChip label="Order value" value="₹1,18,400" accent={C.brass}/>
  </div>
  <Caption kicker="RAW BLOCK TO REVENUE" title="Protect the promise to the customer." body="Reservations hold the right finished slabs through partial dispatch, billing and payment—while commercial status stays connected to the same material truth." accent={C.brass}/>
</AbsoluteFill>;

const Outro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const scale = spring({frame, fps, config: {damping: 19, stiffness: 68}, from: .95, to: 1});
  return <AbsoluteFill style={{...full, overflow: "hidden"}}>
    <div style={{position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", opacity: .18, filter: "saturate(.5)"}}>
      {["01-ai-predictive-dashboard.png", "04-control-room-live-pulse.png", "07-inventory-traceability.png"].map((src) => <Img key={src} src={staticFile(`marketing/${src}`)} style={{width: "100%", height: "100%", objectFit: "cover"}}/>)}
    </div>
    <AbsoluteFill style={{background: "radial-gradient(circle at center, rgba(15,159,113,.27), rgba(11,16,13,.92) 48%, #0b100d 78%)"}}/>
    <div style={{position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", transform: `scale(${scale})`}}>
      <div>
        <div style={{fontSize: 96, fontWeight: 900, letterSpacing: -5}}>StoneOS</div>
        <div style={{fontSize: 42, color: "#ead6a7", marginTop: 14}}>From raw block to revenue.</div>
        <div style={{fontSize: 24, color: "#d2dbd4", marginTop: 26}}>One operational truth. Predictive decisions. Complete traceability.</div>
        <div style={{marginTop: 42, display: "inline-block", borderRadius: 28, background: C.green, padding: "14px 28px", fontSize: 19, fontWeight: 800}}>Built for the realities of stone production</div>
      </div>
    </div>
    <div style={{position: "absolute", bottom: 48, left: 0, right: 0, textAlign: "center", color: "#91a096", fontSize: 15, letterSpacing: 1.5}}>DEMONSTRATION USES FICTIONAL FACTORY, CUSTOMER AND FINANCIAL DATA</div>
  </AbsoluteFill>;
};

export const StoneOSPartnerMarketingVideo = () => (
  <AbsoluteFill style={full}>
    <Audio src={staticFile("audio/marketing-bed.wav")} volume={0.16}/>
    <Sequence from={0} durationInFrames={150}><Intro/><Audio src={staticFile("audio/marketing-01-intro.wav")} volume={1}/></Sequence>
    <Sequence from={150} durationInFrames={330}><ControlRoom/><Audio src={staticFile("audio/marketing-02-control-room.wav")} volume={1}/></Sequence>
    <Sequence from={480} durationInFrames={450}><Predictive/><Audio src={staticFile("audio/marketing-03-predictive.wav")} volume={1}/></Sequence>
    <Sequence from={930} durationInFrames={360}><AIExperience/><Audio src={staticFile("audio/marketing-04-ai.wav")} volume={1}/></Sequence>
    <Sequence from={1290} durationInFrames={420}><Operations/><Audio src={staticFile("audio/marketing-05-operations.wav")} volume={1}/></Sequence>
    <Sequence from={1710} durationInFrames={300}><Inventory/><Audio src={staticFile("audio/marketing-06-inventory.wav")} volume={1}/></Sequence>
    <Sequence from={2010} durationInFrames={360}><Commercial/><Audio src={staticFile("audio/marketing-07-commercial.wav")} volume={1}/></Sequence>
    <Sequence from={2370} durationInFrames={330}><Outro/><Audio src={staticFile("audio/marketing-08-outro.wav")} volume={1}/></Sequence>
  </AbsoluteFill>
);
