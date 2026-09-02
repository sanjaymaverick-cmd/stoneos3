import {Composition} from "remotion";
import {StoneOSProductManualVideo} from "./StoneOSProductManualVideo";
import {StoneOSDemo} from "./StoneOSDemo";
import {StoneOSPartnerMarketingVideo} from "./StoneOSPartnerMarketingVideo";

export const RemotionRoot = () => (
  <>
  <Composition
    id="StoneOSDemo"
    component={StoneOSDemo}
    durationInFrames={1800}
    fps={30}
    width={1920}
    height={1080}
  />
  <Composition
    id="StoneOSProductManual"
    component={StoneOSProductManualVideo}
    durationInFrames={3600}
    fps={30}
    width={1920}
    height={1080}
  />
  <Composition
    id="StoneOSPartnerMarketing"
    component={StoneOSPartnerMarketingVideo}
    durationInFrames={2700}
    fps={30}
    width={1920}
    height={1080}
  />
  </>
);
