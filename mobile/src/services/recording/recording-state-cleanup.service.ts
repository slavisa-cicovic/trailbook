import { clearAllAutoRecordingSamples } from "./auto-recording.service";
import { clearRecordingConfigCache } from "./recording-config.service";
import { clearRecordingPipelineState } from "./recording-pipeline.service";
import { clearMotionActivityCache } from "../motion/motion-activity.service";
import { clearAllTripPointDiagnostics } from "../trip-points/trip-point-diagnostics.service";
import { clearAllPendingTripPointContinuity } from "../trip-points/trip-points.service";

export function clearAllRecordingServiceState(): void {
  clearRecordingPipelineState();
  clearAllAutoRecordingSamples();
  clearAllTripPointDiagnostics();
  clearAllPendingTripPointContinuity();
  clearMotionActivityCache();
  clearRecordingConfigCache();
}
