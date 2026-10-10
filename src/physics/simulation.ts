import { G, GEOM, XB, XFLOOR_END, chuteFloorY, type Params } from '../config';
import { S_END, S_RAMP } from '../geometry';

export const DT = 1 / 240;

type Mode =
  | 'cart'
  | 'flight'
  | 'miss'
  | 'platform'
  | 'eject'
  | 'chute'
  | 'spring'
  | 'hold'
  | 'release'
  | 'drop';

export type Outcome = 'idle' | 'running' | 'done' | 'failed';

export interface Report {
  outcome: 'done' | 'failed';
  message: string;
  aRope: number;
  vRope: number;
  vCartImpact: number;
  vox: number;
  tFlight: number;
  xLand: number;
  rhoLand: number;
  rhoStuck: number;
  stuck: boolean;
  vExit: number;
  vBar: number;
  xSpringMax: number;
  tTotal: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const S_COLL = S_END - 2 * GEOM.rs - GEOM.cartHalf;
const S_RELEASE = GEOM.s0 + GEOM.Lrope;

export class Simulation {
  readonly p: Params;
  readonly yE: number;

  t = 0;
  outcome: Outcome = 'idle';
  message = 'Listo para iniciar.';
  stage = 0;
  mode: Mode = 'cart';

  cartS = GEOM.s0;
  cartV = 0;
  cartA = 0;
  cartState: 'run' | 'brake' | 'stopped' = 'run';
  ropeAttached = true;
  releaseT = 0;
  m1Y = GEOM.m1Y0 + GEOM.Lrope;

  sphere = { x: -GEOM.rs, y: 0, z: 0 };
  sphereSpeed = 0;
  platformAngle = 0;
  springX = 0;
  gateLift = 0;

  rep: Omit<Report, 'outcome' | 'message' | 'tTotal'> = {
    aRope: 0,
    vRope: 0,
    vCartImpact: 0,
    vox: 0,
    tFlight: 0,
    xLand: 0,
    rhoLand: 0,
    rhoStuck: 0,
    stuck: false,
    vExit: 0,
    vBar: 0,
    xSpringMax: 0,
  };

  private brakeA = 0;
  private fvx = 0;
  private fvy = 0;
  private flightT = 0;
  private px = 0;
  private pz = 0;
  private vx = 0;
  private vz = 0;
  private stuck = false;
  private grooved = false;
  private phi = 0;
  private phiDot = 0;
  private tLand = 0;
  private ex = 0;
  private ez = 0;
  private ev = 0;
  private cv = 0;
  private spv = 0;
  private holdT = 0;
  private relT = 0;
  private dropVy = 0;
  private dropAir = false;

  constructor(p: Params) {
    this.p = { ...p };
    this.yE = GEOM.Ytop + p.h;
    this.sphere.y = this.yE + GEOM.rs;
  }

  start(): void {
    if (this.outcome !== 'idle') return;
    const { mh, mc, mu } = this.p;
    if (mh * G <= mu * mc * G) {
      this.fail(
        'La masa colgante no vence la fricción del riel: el carro no se mueve. Aumenta m_h o reduce μ.',
      );
      return;
    }
    this.outcome = 'running';
    this.stage = 1;
  }

  private fail(msg: string): void {
    this.outcome = 'failed';
    this.message = msg;
  }

  step(dt: number): void {
    if (this.outcome !== 'running') return;
    this.t += dt;
    if (this.t > 90) {
      this.fail('Tiempo agotado: el ciclo no se completó.');
      return;
    }
    this.platformAngle += this.p.omega * dt;
    this.stepCart(dt);
    if (this.outcome !== 'running') return;

    switch (this.mode) {
      case 'flight':
      case 'miss':
        this.stepFlight(dt);
        break;
      case 'platform':
        this.stepPlatform(dt);
        break;
      case 'eject':
        this.stepEject(dt);
        break;
      case 'chute':
        this.stepChute(dt);
        break;
      case 'spring':
        this.stepSpring(dt);
        break;
      case 'hold':
      case 'release':
      case 'drop':
        this.stepDischarge(dt);
        break;
      default:
        break;
    }
    if (this.outcome === 'running') this.updateStage();
  }

  private stepCart(dt: number): void {
    if (this.cartState === 'stopped') {
      this.cartA = 0;
      return;
    }
    const { mc, mh, mu } = this.p;
    const th = rad(this.p.theta);
    let a: number;
    if (this.cartState === 'brake') {
      a = -this.brakeA;
    } else if (this.ropeAttached) {
      a = (mh * G - mu * mc * G) / (mc + mh);
      this.rep.aRope = a;
    } else if (this.cartS < S_RAMP) {
      a = -mu * G;
    } else if (this.cartS < S_END - GEOM.Llip) {
      a = G * (Math.sin(th) - mu * Math.cos(th));
    } else {
      a = -mu * G;
    }
    this.cartA = a;
    this.cartV += a * dt;
    if (this.cartV <= 0 && a < 0) {
      this.cartV = 0;
      if (this.cartState === 'brake') {
        this.cartState = 'stopped';
      } else if (this.mode === 'cart') {
        this.fail(
          'El carro se detuvo antes de llegar a la esfera: la fricción lo frenó. Aumenta m_h o θ, o reduce μ.',
        );
        return;
      }
    }
    this.cartS += this.cartV * dt;

    if (this.ropeAttached) {
      const fall = this.cartS - GEOM.s0;
      this.m1Y = GEOM.m1Y0 + Math.max(0, GEOM.Lrope - fall);
      if (this.cartS >= S_RELEASE) {
        this.ropeAttached = false;
        this.releaseT = this.t;
        this.m1Y = GEOM.m1Y0;
        this.rep.vRope = this.cartV;
      }
    }

    if (this.mode === 'cart' && this.cartState === 'run' && this.cartS >= S_COLL) this.collide();
  }

  private collide(): void {
    const { mc, me } = this.p;
    const e = GEOM.restitution;
    const vc = this.cartV;
    const vs = (((1 + e) * mc) / (mc + me)) * vc;
    const vc2 = ((mc - e * me) / (mc + me)) * vc;
    this.rep.vCartImpact = vc;
    this.rep.vox = vs;
    this.cartV = vc2;
    this.cartState = 'brake';
    this.brakeA = (vc2 * vc2) / (2 * 0.1);
    this.sphere.x = 0;
    this.sphere.y = this.yE + GEOM.rs;
    this.fvx = vs;
    this.fvy = 0;
    this.flightT = 0;
    this.mode = 'flight';
  }

  private stepFlight(dt: number): void {
    this.flightT += dt;
    this.fvy -= G * dt;
    this.sphere.x += this.fvx * dt;
    this.sphere.y += this.fvy * dt;
    this.sphereSpeed = Math.hypot(this.fvx, this.fvy);

    if (this.mode === 'flight' && this.sphere.y <= GEOM.Ytop + GEOM.rs) {
      this.landing();
      return;
    }
    if (this.mode === 'miss' && this.sphere.y <= GEOM.rs) {
      this.sphere.y = GEOM.rs;
      const px = this.rep.xLand - GEOM.xp;
      this.fail(
        px < 0
          ? `La esfera cayó antes de la plataforma (x = ${this.rep.xLand.toFixed(2)} m). Aumenta θ o y₀ para darle más alcance.`
          : `La esfera pasó de largo de la plataforma (x = ${this.rep.xLand.toFixed(2)} m). Reduce θ, m_h o y₀.`,
      );
    }
  }

  private landing(): void {
    const px = this.sphere.x - GEOM.xp;
    this.rep.tFlight = this.flightT;
    this.rep.xLand = this.sphere.x;
    this.rep.rhoLand = Math.abs(px);
    if (Math.abs(px) <= GEOM.R - GEOM.rs - GEOM.rimW) {
      this.sphere.y = GEOM.Ytop + GEOM.rs;
      this.px = px;
      this.pz = 0;
      this.vx = this.fvx;
      this.vz = 0;
      this.stuck = false;
      this.grooved = Math.abs(Math.abs(px) - GEOM.rg) <= GEOM.grooveHalf;
      this.phi = px < 0 ? Math.PI : 0;
      this.phiDot = 0;
      this.tLand = this.t;
      this.mode = 'platform';
    } else {
      this.mode = 'miss';
    }
  }

  private stepPlatform(dt: number): void {
    const w = this.p.omega;
    const mu = this.p.muS;
    const rmax = GEOM.R - GEOM.rs - GEOM.rimW;
    const prevPx = this.px;

    if (this.grooved) {
      // La pista circular fija el radio en r; la fricción solo acelera la esfera tangencialmente.
      const rho = GEOM.rg;
      const delta = this.phiDot + w;
      const tol = 1.5 * ((mu * G) / rho) * dt + 0.005;
      if (Math.abs(delta) > tol) {
        this.phiDot -= Math.sign(delta) * ((mu * G) / rho) * dt;
        this.stuck = false;
      } else {
        this.phiDot = -w;
        this.stuck = true;
      }
      this.phi += this.phiDot * dt;
      this.px = rho * Math.cos(this.phi);
      this.pz = rho * Math.sin(this.phi);
      this.vx = -rho * this.phiDot * Math.sin(this.phi);
      this.vz = rho * this.phiDot * Math.cos(this.phi);
    } else if (this.stuck) {
      const rho = Math.hypot(this.px, this.pz);
      const phi = Math.atan2(this.pz, this.px) - w * dt;
      this.px = rho * Math.cos(phi);
      this.pz = rho * Math.sin(phi);
      this.vx = w * this.pz;
      this.vz = -w * this.px;
    } else {
      const rvx = this.vx - w * this.pz;
      const rvz = this.vz + w * this.px;
      const rv = Math.hypot(rvx, rvz);
      let ax = 0;
      let az = 0;
      if (rv > 0.03) {
        ax = (-mu * G * rvx) / rv;
        az = (-mu * G * rvz) / rv;
      } else {
        const rho = Math.hypot(this.px, this.pz);
        if (w * w * rho <= mu * G || rho >= rmax - 1e-3) {
          this.stuck = true;
          this.vx = w * this.pz;
          this.vz = -w * this.px;
        }
      }
      this.vx += ax * dt;
      this.vz += az * dt;
      this.px += this.vx * dt;
      this.pz += this.vz * dt;

      const rho = Math.hypot(this.px, this.pz);
      if (rho > rmax) {
        const ux = this.px / rho;
        const uz = this.pz / rho;
        const vr = this.vx * ux + this.vz * uz;
        if (vr > 0) {
          this.vx -= vr * ux;
          this.vz -= vr * uz;
        }
        this.px = ux * rmax;
        this.pz = uz * rmax;
      }
    }

    this.sphere.x = GEOM.xp + this.px;
    this.sphere.z = this.pz;
    this.sphere.y = GEOM.Ytop + GEOM.rs;
    this.sphereSpeed = Math.hypot(this.vx, this.vz);

    if (prevPx < 0 && this.px >= 0 && this.pz > 0) {
      this.ev = Math.max(this.sphereSpeed, 0.4);
      this.ex = this.sphere.x;
      this.ez = this.pz;
      this.rep.vExit = this.ev;
      this.rep.stuck = this.stuck;
      this.rep.rhoStuck = Math.hypot(this.px, this.pz);
      this.mode = 'eject';
      return;
    }
    if (this.t - this.tLand > 25) {
      this.fail('La esfera no encontró la salida de la plataforma. Revisa ω y μₛ.');
    }
  }

  private stepEject(dt: number): void {
    this.ex += this.ev * dt;
    this.ez += 3 * dt;
    this.sphere.x = this.ex;
    this.sphere.z = Math.min(this.ez, GEOM.chuteZ);
    this.sphere.y = chuteFloorY(this.ex) + GEOM.rs;
    this.sphereSpeed = this.ev;
    if (this.ez >= GEOM.chuteZ) {
      this.cv = this.ev;
      this.mode = 'chute';
    }
  }

  private stepChute(dt: number): void {
    const al = GEOM.chuteAlpha;
    this.cv += G * (Math.sin(al) - GEOM.muChute * Math.cos(al)) * dt;
    if (this.cv <= 0.02) {
      this.fail('La esfera se detuvo en el canal de salida. Aumenta ω para darle más velocidad.');
      return;
    }
    this.ex += this.cv * dt;
    this.sphere.x = this.ex;
    this.sphere.z = GEOM.chuteZ;
    this.sphere.y = chuteFloorY(this.ex) + GEOM.rs;
    this.sphereSpeed = this.cv;
    if (this.ex >= XB - GEOM.rs) {
      this.rep.vBar = this.cv;
      this.spv = this.cv;
      this.springX = 0;
      this.mode = 'spring';
    }
  }

  private stepSpring(dt: number): void {
    const m = this.p.me;
    const k = this.p.k;
    const c = Math.sqrt(k * m);
    const acc = (-k * this.springX - c * this.spv) / m;
    this.spv += acc * dt;
    this.springX += this.spv * dt;
    this.sphere.x = XB - GEOM.rs + this.springX;
    this.sphere.y = chuteFloorY(this.sphere.x) + GEOM.rs;
    this.sphereSpeed = Math.max(this.spv, 0);
    if (this.spv <= 0) {
      this.rep.xSpringMax = this.springX;
      this.sphereSpeed = 0;
      this.holdT = 0;
      this.mode = 'hold';
    }
  }

  private stepDischarge(dt: number): void {
    if (this.mode === 'hold') {
      this.holdT += dt;
      if (this.holdT >= GEOM.gateHold) {
        this.relT = 0;
        this.mode = 'release';
      }
      return;
    }
    if (this.mode === 'release') {
      this.relT += dt;
      const u = Math.min(1, this.relT / 0.35);
      this.gateLift = u;
      this.springX = this.rep.xSpringMax * (1 - u);
      if (u >= 1) {
        this.dropAir = false;
        this.dropVy = 0;
        this.mode = 'drop';
      }
      return;
    }
    const vxOut = 0.5;
    this.sphereSpeed = vxOut;
    this.sphere.x += vxOut * dt;
    if (!this.dropAir) {
      if (this.sphere.x >= XFLOOR_END) this.dropAir = true;
      else this.sphere.y = chuteFloorY(this.sphere.x) + GEOM.rs;
    }
    if (this.dropAir) {
      this.dropVy -= G * dt;
      this.sphere.y += this.dropVy * dt;
      if (this.sphere.y <= GEOM.binFloor + GEOM.rs) {
        this.sphere.y = GEOM.binFloor + GEOM.rs;
        this.sphereSpeed = 0;
        this.outcome = 'done';
        this.stage = 8;
        this.message = 'Ciclo completo: la esfera quedó clasificada en el depósito.';
      }
    }
  }

  private updateStage(): void {
    switch (this.mode) {
      case 'cart':
        this.stage = this.ropeAttached ? 1 : this.cartS < S_RAMP ? 2 : 3;
        break;
      case 'flight':
      case 'miss':
        this.stage = 4;
        break;
      case 'platform':
        this.stage = 5;
        break;
      case 'eject':
      case 'chute':
        this.stage = 6;
        break;
      default:
        this.stage = 7;
    }
  }
}

export function predict(p: Params): Report {
  const sim = new Simulation(p);
  sim.start();
  let n = 0;
  while (sim.outcome === 'running' && n < 240 * 95) {
    sim.step(DT);
    n++;
  }
  return {
    ...sim.rep,
    outcome: sim.outcome === 'done' ? 'done' : 'failed',
    message: sim.message,
    tTotal: sim.t,
  };
}
