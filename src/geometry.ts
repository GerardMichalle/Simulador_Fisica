import { GEOM } from './config';

export interface Layout {
  theta: number;
  xA: number;
  yA: number;
  yE: number;
  xRamp: number;
  yRamp: number;
}

export interface TrackPoint {
  x: number;
  y: number;
  angle: number;
}

export const S_RAMP = GEOM.Lh;
export const S_LIP = GEOM.Lh + GEOM.Lramp;
export const S_END = S_LIP + GEOM.Llip;

export function makeLayout(thetaDeg: number, h: number): Layout {
  const th = (thetaDeg * Math.PI) / 180;
  const yE = GEOM.Ytop + h;
  const xLip = -GEOM.Llip;
  const xRamp = xLip - GEOM.Lramp * Math.cos(th);
  const yRamp = yE + GEOM.Lramp * Math.sin(th);
  return { theta: th, xA: xRamp - GEOM.Lh, yA: yRamp, yE, xRamp, yRamp };
}

export function trackPoint(l: Layout, s: number): TrackPoint {
  if (s <= S_RAMP) return { x: l.xA + s, y: l.yA, angle: 0 };
  if (s <= S_LIP) {
    const u = s - S_RAMP;
    return { x: l.xRamp + u * Math.cos(l.theta), y: l.yRamp - u * Math.sin(l.theta), angle: -l.theta };
  }
  return { x: -GEOM.Llip + (s - S_LIP), y: l.yE, angle: 0 };
}
