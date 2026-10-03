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
export function clampPresenceBounds(workArea: Rectangle, bounds: Rectangle): Rectangle {
  const gapX = presenceInset(workArea.width), gapY = presenceInset(workArea.height);
  const width = Math.min(bounds.width, Math.max(1, workArea.width - 2 * gapX));
  const height = Math.min(bounds.height, Math.max(1, workArea.height - 2 * gapY));
  return { width, height,
    x: Math.round(Math.max(workArea.x + gapX, Math.min(bounds.x, workArea.x + workArea.width - gapX - width))),
    y: Math.round(Math.max(workArea.y + gapY, Math.min(bounds.y, workArea.y + workArea.height - gapY - height))) };
}

export function wakeOrbHoverBounds(workArea: Rectangle, anchor?: Rectangle): Rectangle {
  const orb = anchor ? clampPresenceBounds(workArea, anchor) : wakeOrbBounds(workArea);
  const gapX = presenceInset(workArea.width);
  const gapY = presenceInset(workArea.height);
  const width = Math.min(MORPHEUS_ORB_HOVER_WIDTH, Math.max(1, workArea.width - 2 * gapX));
  const height = Math.min(MORPHEUS_ORB_HOVER_HEIGHT, Math.max(1, workArea.height - 2 * gapY));
  return clampPresenceBounds(workArea, {
    x: orb.x + orb.width - width,
    y: orb.y - workArea.y >= height - orb.height + gapY ? orb.y + orb.height - height : orb.y,
    width,
    height,
  });
}

export function wakeCompactBounds(workArea: Rectangle, width: number, height: number, anchor?: Rectangle): Rectangle {
  const orb = anchor ? clampPresenceBounds(workArea, anchor) : wakeOrbBounds(workArea);
  const gapX = presenceInset(workArea.width);
  const gapY = presenceInset(workArea.height);
  const fittedWidth = Math.min(width, Math.max(1, workArea.width - 2 * gapX));
  const fittedHeight = Math.min(height, Math.max(1, workArea.height - 2 * gapY));
  return clampPresenceBounds(workArea, {
    x: orb.x + orb.width - fittedWidth,
    y: orb.y - workArea.y >= fittedHeight + 12 + gapY ? orb.y - fittedHeight - 12 : orb.y + orb.height + 12,
    width: fittedWidth,
    height: fittedHeight,
  });
}
