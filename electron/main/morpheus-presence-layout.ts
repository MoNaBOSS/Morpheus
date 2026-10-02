import type { Rectangle } from 'electron';

export const MORPHEUS_ORB_SIZE = 56;
export const MORPHEUS_ORB_HOVER_WIDTH = 360;
export const MORPHEUS_ORB_HOVER_HEIGHT = 132;
export const MORPHEUS_PRESENCE_EDGE_GAP = 16;

function presenceInset(size: number): number {
  return Math.min(MORPHEUS_PRESENCE_EDGE_GAP, Math.max(0, Math.floor((size - 1) / 2)));
}

export function wakeOrbBounds(workArea: Rectangle): Rectangle {
  const gapX = presenceInset(workArea.width);
  const gapY = presenceInset(workArea.height);
  const width = Math.min(MORPHEUS_ORB_SIZE, Math.max(1, workArea.width - 2 * gapX));
  const height = Math.min(MORPHEUS_ORB_SIZE, Math.max(1, workArea.height - 2 * gapY));
  return {
    x: workArea.x + workArea.width - width - gapX,
    y: workArea.y + workArea.height - height - gapY,
    width,
    height,
  };
}

/** Expand upward and left while keeping the orb at exactly the same screen position. */
export function wakeOrbHoverBounds(workArea: Rectangle): Rectangle {
  const orb = wakeOrbBounds(workArea);
  const gapX = presenceInset(workArea.width);
  const gapY = presenceInset(workArea.height);
  const width = Math.min(MORPHEUS_ORB_HOVER_WIDTH, Math.max(1, workArea.width - 2 * gapX));
  const height = Math.min(MORPHEUS_ORB_HOVER_HEIGHT, Math.max(1, workArea.height - 2 * gapY));
  return {
    x: orb.x + orb.width - width,
    y: orb.y + orb.height - height,
    width,
    height,
  };
}

export function wakeCompactBounds(workArea: Rectangle, width: number, height: number): Rectangle {
  const orb = wakeOrbBounds(workArea);
  const gapX = presenceInset(workArea.width);
  const gapY = presenceInset(workArea.height);
  const fittedWidth = Math.min(width, Math.max(1, workArea.width - 2 * gapX));
  const fittedHeight = Math.min(height, Math.max(1, workArea.height - 2 * gapY));
  return {
    x: orb.x + orb.width - fittedWidth,
    y: Math.max(workArea.y + gapY, orb.y - fittedHeight - 12),
    width: fittedWidth,
    height: fittedHeight,
  };
}
