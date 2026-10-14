import { RotationAngle } from '../types';

/**
 * Maps a normalized point (u', v') in [0, 1] x [0, 1] on the displayed rotated canvas
 * back to the canonical normalized point (u, v) in [0, 1] x [0, 1] of the original unrotated artboard.
 */
export function screenToCanonical(
  uPrime: number,
  vPrime: number,
  rotation: RotationAngle
): { u: number; v: number } {
  switch (rotation) {
    case 90:
      // 90 deg CW: u' = 1 - v, v' = u => u = v', v = 1 - u'
      return {
        u: Math.max(0, Math.min(1, vPrime)),
        v: Math.max(0, Math.min(1, 1 - uPrime)),
      };
    case 180:
      // 180 deg CW: u' = 1 - u, v' = 1 - v => u = 1 - u', v = 1 - v'
      return {
        u: Math.max(0, Math.min(1, 1 - uPrime)),
        v: Math.max(0, Math.min(1, 1 - vPrime)),
      };
    case 270:
      // 270 deg CW: u' = v, v' = 1 - u => u = 1 - v', v = u'
      return {
        u: Math.max(0, Math.min(1, 1 - vPrime)),
        v: Math.max(0, Math.min(1, uPrime)),
      };
    case 0:
    default:
      return {
        u: Math.max(0, Math.min(1, uPrime)),
        v: Math.max(0, Math.min(1, vPrime)),
      };
  }
}

/**
 * Maps a canonical normalized point (u, v) in [0, 1] x [0, 1] on the original unrotated artboard
 * to the displayed normalized point (u', v') in [0, 1] x [0, 1] on the rotated canvas.
 */
export function canonicalToScreen(
  u: number,
  v: number,
  rotation: RotationAngle
): { uPrime: number; vPrime: number } {
  switch (rotation) {
    case 90:
      return {
        uPrime: Math.max(0, Math.min(1, 1 - v)),
        vPrime: Math.max(0, Math.min(1, u)),
      };
    case 180:
      return {
        uPrime: Math.max(0, Math.min(1, 1 - u)),
        vPrime: Math.max(0, Math.min(1, 1 - v)),
      };
    case 270:
      return {
        uPrime: Math.max(0, Math.min(1, v)),
        vPrime: Math.max(0, Math.min(1, 1 - u)),
      };
    case 0:
    default:
      return {
        uPrime: Math.max(0, Math.min(1, u)),
        vPrime: Math.max(0, Math.min(1, v)),
      };
  }
}

/**
 * Given two drag corners in screen normalized space [0, 1], returns the canonical
 * bounding box { norm_x, norm_y, norm_w, norm_h } in [0, 1] for the original unrotated artboard.
 */
export function screenDragToCanonicalBox(
  start: { uPrime: number; vPrime: number },
  current: { uPrime: number; vPrime: number },
  rotation: RotationAngle
): { norm_x: number; norm_y: number; norm_w: number; norm_h: number } {
  const minUPrime = Math.min(start.uPrime, current.uPrime);
  const maxUPrime = Math.max(start.uPrime, current.uPrime);
  const minVPrime = Math.min(start.vPrime, current.vPrime);
  const maxVPrime = Math.max(start.vPrime, current.vPrime);

  // Map the two opposite corners
  const p1 = screenToCanonical(minUPrime, minVPrime, rotation);
  const p2 = screenToCanonical(maxUPrime, maxVPrime, rotation);

  const norm_x = Math.min(p1.u, p2.u);
  const norm_y = Math.min(p1.v, p2.v);
  const norm_w = Math.abs(p1.u - p2.u);
  const norm_h = Math.abs(p1.v - p2.v);

  return { norm_x, norm_y, norm_w, norm_h };
}

/**
 * Returns the displayed dimensions (width, height) after rotation.
 */
export function getDisplayedDimensions(
  naturalW: number,
  naturalH: number,
  rotation: RotationAngle
): { displayedW: number; displayedH: number } {
  if (rotation === 90 || rotation === 270) {
    return { displayedW: naturalH, displayedH: naturalW };
  }
  return { displayedW: naturalW, displayedH: naturalH };
}
