export const G = 9.81;

export interface Params {
  mh: number;
  mc: number;
  mu: number;
  theta: number;
  h: number;
  me: number;
  omega: number;
  muS: number;
  k: number;
}

// Datos del informe: m_c = 0,28976 kg; θ = 10°; y0 = 0,90 m; m_e = 0,050 kg; ω = 4,000 rad/s; r = 0,12 m
export const DEFAULTS: Params = {
  mh: 0.02,
  mc: 0.28976,
  mu: 0.023,
  theta: 10,
  h: 0.9,
  me: 0.05,
  omega: 4,
  muS: 0.6,
  k: 20,
};

export interface ControlDef {
  key: keyof Params;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number | 'any';
  decimals: number;
}

export const CONTROLS: ControlDef[] = [
  { key: 'mh', label: 'Masa colgante m_h', unit: 'kg', min: 0.01, max: 0.04, step: 0.005, decimals: 3 },
  { key: 'mc', label: 'Masa del carro m_c', unit: 'kg', min: 0.2, max: 0.5, step: 'any', decimals: 6 },
  { key: 'mu', label: 'Fricción del riel μ', unit: '', min: 0, max: 0.05, step: 0.001, decimals: 3 },
  { key: 'theta', label: 'Ángulo de la rampa θ', unit: '°', min: 3, max: 10, step: 0.5, decimals: 1 },
  { key: 'h', label: 'Altura de salida y₀', unit: 'm', min: 0.7, max: 1.2, step: 0.05, decimals: 2 },
  { key: 'me', label: 'Masa de la esfera mₑ', unit: 'kg', min: 0.05, max: 0.2, step: 0.05, decimals: 3 },
  { key: 'omega', label: 'Velocidad angular ω', unit: 'rad/s', min: 1, max: 6, step: 0.5, decimals: 1 },
  { key: 'muS', label: 'Fricción plataforma μₛ', unit: '', min: 0.3, max: 1, step: 0.05, decimals: 2 },
  { key: 'k', label: 'Constante del resorte k', unit: 'N/m', min: 5, max: 100, step: 5, decimals: 0 },
];

// Datos experimentales del informe (aceleración media de las gráficas v-t) por carga colgante
export const EXPERIMENTAL_A: Record<number, number> = {
  0.01: 0.032697,
  0.02: 0.3103,
  0.04: 1.1167,
};

export const REPORT = {
  vs: 1.4873,
  rTeo: 0.6371,
  rExp: 0.6684,
  tc: 0.4284,
  fcModel: 0.096,
  muSMin: 0.196,
};

export const GEOM = {
  Ytop: 0.6,
  Lh: 1.2,
  Lramp: 0.6,
  Llip: 0.4,
  s0: 0.2,
  Lrope: 0.7,
  cartHalf: 0.15,
  hookH: 0.2,
  rp: 0.1,
  zArm: -0.4,
  m1Y0: 0.1,
  m1H: 0.2,
  m1R: 0.07,
  rs: 0.04,
  R: 0.5,
  rimW: 0.02,
  rg: 0.12,
  grooveHalf: 0.045,
  xp: 0.757, // R teórico (0,6371) + r: la esfera cae sobre la pista circular
  restitution: 0.186, // calibrada para vₛ = 1,4873 m/s con θ = 10°
  muChute: 0.05, // menor que tan(5°) = 0,0875: con r = 0,12 la esfera sale lenta y no debe frenarse en el canal
  chuteAlpha: (5 * Math.PI) / 180,
  chuteLen: 0.9,
  chuteZ: 0.56,
  gateHold: 0.5,
  binFloor: 0.05,
};

export const XB = GEOM.xp + GEOM.chuteLen;
export const XFLOOR_END = XB + 0.15;

export function chuteFloorY(x: number): number {
  return GEOM.Ytop - Math.max(0, x - GEOM.xp) * Math.tan(GEOM.chuteAlpha);
}
