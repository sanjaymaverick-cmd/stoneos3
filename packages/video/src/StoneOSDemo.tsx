import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";

export const StoneOSDemo = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        background: "#101512",
        color: "#f1f0e8",
        display: "flex",
        fontFamily: "Arial, sans-serif",
        justifyContent: "center",
      }}
    >
      <div style={{opacity, textAlign: "center"}}>
        <div style={{fontSize: 112, fontWeight: 700, letterSpacing: -4}}>StoneOS</div>
        <div style={{color: "#c7a96b", fontSize: 42, marginTop: 18}}>From raw block to revenue.</div>
      </div>
    </AbsoluteFill>
  );
};
