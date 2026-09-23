import type { Rectangle } from 'electron';

export const MORPHEUS_ORB_SIZE = 100;
export const MORPHEUS_PRESENCE_EDGE_GAP = 20;

export function wakeOrbBounds(workArea: Rectangle): Rectangle {
  return {
    x: workArea.x + MORPHEUS_PRESENCE_EDGE_GAP,
    y: workArea.y + Math.max(0, workArea.height - MORPHEUS_ORB_SIZE - MORPHEUS_PRESENCE_EDGE_GAP),
    width: MORPHEUS_ORB_SIZE,
    height: MORPHEUS_ORB_SIZE,
  };
}

export function wakeCompactBounds(workArea: Rectangle, width: number, height: number): Rectangle {
  const orb = wakeOrbBounds(workArea);
  const fittedWidth = Math.min(width, Math.max(1, workArea.width - 2 * MORPHEUS_PRESENCE_EDGE_GAP));
  const fittedHeight = Math.min(height, Math.max(1, workArea.height - 2 * MORPHEUS_PRESENCE_EDGE_GAP));
  return {
    x: orb.x,
    y: Math.max(workArea.y + MORPHEUS_PRESENCE_EDGE_GAP, orb.y - fittedHeight - 12),
    width: fittedWidth,
    height: fittedHeight,
  };
}
