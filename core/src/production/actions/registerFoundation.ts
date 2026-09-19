import {
  updateLayerKeyframeTimeHandler,
  updateLayerTextHandler,
} from "./motionLayer.ts";
import { projectRenameHandler } from "./projectRename.ts";
import { registerActionHandler } from "./registry.ts";
import { trackAddHandler, trackRemoveHandler, trackRestoreHandler } from "./tracks.ts";

let registered = false;

/** Registers foundation document handlers. Creation, multicam, overlay, and remaining motion actions stay off. */
export function registerFoundationActions(): void {
  if (registered) {
    return;
  }
  registerActionHandler(projectRenameHandler);
  registerActionHandler(trackAddHandler);
  registerActionHandler(trackRemoveHandler);
  registerActionHandler(trackRestoreHandler);
  registerActionHandler(updateLayerTextHandler);
  registerActionHandler(updateLayerKeyframeTimeHandler);
  registered = true;
}
