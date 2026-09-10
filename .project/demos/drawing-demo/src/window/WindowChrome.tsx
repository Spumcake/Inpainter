import { WindowEdgeLayer } from './WindowEdgeLayer';
import { useWindowGestureRouter } from './useWindowGestureRouter';

/**
 * App composition entry — wires the sole window gesture router and mounts
 * edge resize chrome (cursors). Window controls stay in app-header.
 */
export function WindowChrome() {
  useWindowGestureRouter();
  return <WindowEdgeLayer />;
}
