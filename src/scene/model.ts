import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { G, GEOM, XB, XFLOOR_END, chuteFloorY, type Params } from '../config';
import { S_END, S_LIP, S_RAMP, makeLayout, trackPoint, type Layout } from '../geometry';
import type { Report, Simulation } from '../physics/simulation';

const COL = {
  steel: 0x6a7d92,
  steelLight: 0xa3b5c8,
  blue: 0x1e63d6,
  gold: 0xd9a526,
  orange: 0xe8812a,
  red: 0xd32f2f,
  water: 0x3b9be0,
  dark: 0x3a4757,
  rope: 0x1c2733,
};

const SPRING_L0 = 0.45;
const TRACK_W = 0.36;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

type V3 = [number, number, number];

export class Model {
  readonly focusPos = new THREE.Vector3();
  layout: Layout = makeLayout(5, 0.9);

  private root = new THREE.Group();
  private labels: CSS2DObject[] = [];
  private labelsOn = true;

  private cart = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private mass = new THREE.Group();
  private ropeL!: THREE.Mesh;
  private ropeR!: THREE.Mesh;
  private sphere!: THREE.Mesh;
  private spin = new THREE.Group();
  private gate = new THREE.Group();
  private plate!: THREE.Mesh;
  private spring!: THREE.Mesh;
  private trajectory: THREE.Line | null = null;

  private xP = 0;
  private cy = 0;
  private ropeY = 0;
  private rightAtRelease = 0;

  constructor(private scene: THREE.Scene) {
    scene.add(this.root);
  }

  private mesh(
    geo: THREE.BufferGeometry,
    color: number,
    opts: { metal?: number; rough?: number; shadow?: boolean } = {},
  ): THREE.Mesh {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        metalness: opts.metal ?? 0.3,
        roughness: opts.rough ?? 0.55,
      }),
    );
    const sh = opts.shadow ?? true;
    m.castShadow = sh;
    m.receiveShadow = sh;
    return m;
  }

  private box(w: number, h: number, d: number, color: number, pos: V3 = [0, 0, 0]): THREE.Mesh {
    const m = this.mesh(new THREE.BoxGeometry(w, h, d), color);
    m.position.set(...pos);
    return m;
  }

  private label(text: string, parent: THREE.Object3D, pos: V3, cls = ''): CSS2DObject {
    const div = document.createElement('div');
    div.className = `tag ${cls}`.trim();
    div.textContent = text;
    const o = new CSS2DObject(div);
    o.position.set(...pos);
    parent.add(o);
    this.labels.push(o);
    o.visible = this.labelsOn;
    return o;
  }

  setLabelsVisible(v: boolean): void {
    this.labelsOn = v;
    this.labels.forEach((l) => (l.visible = v));
  }

  private clear(): void {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.labels = [];
    this.wheels = [];
    this.trajectory = null;
    this.cart = new THREE.Group();
    this.mass = new THREE.Group();
    this.spin = new THREE.Group();
    this.gate = new THREE.Group();
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  build(p: Params): void {
    this.clear();
    const L = makeLayout(p.theta, p.h);
    this.layout = L;
    this.buildTrack(L);
    this.buildPulleyAndRope(L);
    this.buildCart();
    this.buildMass();
    this.buildPlatform(p);
    this.buildChute();
    this.buildSphere(L);
    this.buildMarkers(L, p);
  }

  private buildTrack(L: Layout): void {
    const add = (o: THREE.Object3D) => this.root.add(o);

    const beam = (a: number, b: number, color: number): THREE.Mesh => {
      const pm = trackPoint(L, (a + b) / 2);
      const nx = -Math.sin(pm.angle);
      const ny = Math.cos(pm.angle);
      const m = this.box(b - a, 0.06, TRACK_W, color);
      m.position.set(pm.x - nx * 0.03, pm.y - ny * 0.03, 0);
      m.rotation.z = pm.angle;
      for (const z of [-TRACK_W / 2 + 0.01, TRACK_W / 2 - 0.01]) {
        m.add(this.box(b - a, 0.04, 0.02, COL.dark, [0, 0.05, z]));
      }
      return m;
    };

    const rail = beam(0, S_RAMP, COL.steel);
    const ramp = beam(S_RAMP, S_LIP, COL.steelLight);
    const lip = beam(S_LIP, S_END, COL.steel);
    add(rail);
    add(ramp);
    add(lip);

    const joint = trackPoint(L, S_RAMP);
    add(this.box(0.05, 0.08, TRACK_W + 0.04, COL.dark, [joint.x, joint.y - 0.03, 0]));

    const slabX0 = L.xA - 0.35;
    const slabX1 = 0.15;
    add(this.box(slabX1 - slabX0, 0.08, 1.0, COL.steel, [(slabX0 + slabX1) / 2, 0.04, -0.1]));

    for (const s of [0.12, S_RAMP - 0.1, S_RAMP + 0.3, S_END - 0.12]) {
      const tp = trackPoint(L, s);
      const hgt = tp.y - 0.06 - 0.08;
      add(this.box(0.1, hgt, 0.3, COL.steel, [tp.x, 0.08 + hgt / 2, 0]));
    }

    this.label('Riel (tramo horizontal)', rail, [0, 0.35, 0.3]);
    this.label('Rampa inclinada', ramp, [0, 0.35, 0.3]);
  }

  private buildPulleyAndRope(L: Layout): void {
    const { rp, hookH, zArm } = GEOM;
    this.xP = L.xA + GEOM.Lh;
    this.cy = L.yA + hookH - rp - 0.012;
    this.ropeY = L.yA + hookH - 0.012;
    this.rightAtRelease = this.xP - (L.xA + GEOM.s0 + GEOM.Lrope + GEOM.cartHalf);

    const g = new THREE.Group();
    g.position.set(this.xP, this.cy, zArm);
    const disc = this.mesh(new THREE.CylinderGeometry(rp, rp, 0.03, 32), COL.steelLight, { metal: 0.6 });
    disc.rotation.x = Math.PI / 2;
    const hub = this.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12), COL.dark);
    hub.rotation.x = Math.PI / 2;
    g.add(disc, hub);
    for (const z of [-0.035, 0.035]) g.add(this.box(0.05, 0.22, 0.012, COL.steel, [0, -0.05, z]));
    this.root.add(g);

    const postTop = this.cy - 0.15;
    const postH = postTop - 0.08;
    this.root.add(this.box(0.08, postH, 0.08, COL.steel, [this.xP, 0.08 + postH / 2, zArm]));

    const arc: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI / 2 - (Math.PI / 2) * (i / 14);
      arc.push(new THREE.Vector3(this.xP + Math.cos(a) * rp, this.cy + Math.sin(a) * rp, zArm));
    }
    this.root.add(
      this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 20, 0.006, 6), COL.rope, {
        shadow: false,
      }),
    );

    const ropeGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6);
    this.ropeL = this.mesh(ropeGeo, COL.rope, { shadow: false });
    this.ropeR = this.mesh(ropeGeo.clone(), COL.rope, { shadow: false });
    this.root.add(this.ropeL, this.ropeR);

    this.label('Polea', g, [0, 0.28, 0]);
    this.label('Cuerda', this.root, [this.xP - 0.5, this.ropeY - 0.14, zArm - 0.12]);
  }

  private buildCart(): void {
    const half = GEOM.cartHalf;
    const body = this.box(half * 2, 0.12, 0.2, COL.blue, [0, 0.16, 0]);
    const cab = this.box(0.14, 0.06, 0.18, 0x174fa8, [0.02, 0.25, 0]);
    this.cart.add(body, cab);
    for (const x of [-0.09, 0.09]) {
      for (const z of [-0.12, 0.12]) {
        const w = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), COL.dark);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.05, z);
        for (const y of [-0.016, 0.016]) w.add(this.box(0.08, 0.004, 0.012, 0xdfe7ef, [0, y, 0]));
        this.cart.add(w);
        this.wheels.push(w);
      }
    }
    const armLen = Math.abs(GEOM.zArm) - 0.05;
    this.cart.add(this.box(0.03, 0.02, armLen, COL.dark, [half - 0.03, GEOM.hookH + 0.006, GEOM.zArm / 2 - 0.025]));
    const tip = this.mesh(new THREE.SphereGeometry(0.014, 10, 8), COL.dark);
    tip.position.set(half - 0.03, GEOM.hookH - 0.006, GEOM.zArm);
    this.cart.add(tip);
    this.label('Carro (m_c)', this.cart, [0, 0.5, 0]);
    this.root.add(this.cart);
  }

  private buildMass(): void {
    const r = GEOM.m1R;
    const cyl = this.mesh(new THREE.CylinderGeometry(r, r, GEOM.m1H, 24), COL.gold, { metal: 0.55 });
    cyl.position.y = GEOM.m1H / 2;
    const hook = this.mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 16), COL.dark);
    hook.position.y = GEOM.m1H + 0.02;
    this.mass.add(cyl, hook);
    this.mass.position.set(this.xP + GEOM.rp, GEOM.m1Y0 + GEOM.Lrope, GEOM.zArm);
    this.label('Masa colgante (m_h)', this.mass, [0.05, GEOM.m1H + 0.28, 0]);
    this.root.add(this.mass);
  }

  private buildPlatform(p: Params): void {
    const { R, Ytop, xp, rg, grooveHalf } = GEOM;
    const g = new THREE.Group();
    g.position.set(xp, 0, 0);

    const column = this.mesh(new THREE.CylinderGeometry(0.12, 0.15, Ytop - 0.14, 24), COL.steel, { metal: 0.6 });
    column.position.y = 0.06 + (Ytop - 0.14) / 2;
    g.add(column);
    const base = this.mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.08, 32), COL.steel);
    base.position.y = 0.04;
    g.add(base);

    this.spin.position.set(0, Ytop - 0.05, 0);
    const disc = this.mesh(new THREE.CylinderGeometry(R, R, 0.1, 64), COL.steel, { metal: 0.6 });
    const top = this.mesh(new THREE.CylinderGeometry(R - 0.015, R - 0.015, 0.01, 64), COL.water, {
      metal: 0.1,
      rough: 0.2,
    });
    top.position.y = 0.05;
    this.spin.add(disc, top);

    const groove = this.mesh(new THREE.RingGeometry(rg - grooveHalf, rg + grooveHalf, 64), 0x2b6fb0, {
      metal: 0.1,
      rough: 0.3,
    });
    groove.rotation.x = -Math.PI / 2;
    groove.position.y = 0.0565;
    (groove.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.spin.add(groove);
    for (const rr of [rg - grooveHalf, rg + grooveHalf]) {
      const w = this.mesh(new THREE.CylinderGeometry(rr, rr, 0.03, 64, 1, true), COL.steelLight, { metal: 0.5 });
      (w.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      w.position.y = 0.07;
      this.spin.add(w);
    }
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i * Math.PI) / 2;
      const m = this.box(R - 0.1, 0.004, 0.02, 0xeef6ff, [(R - 0.1) / 2 + 0.05, 0.056, 0]);
      pivot.add(m);
      this.spin.add(pivot);
    }
    const cap = this.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 24), COL.dark);
    cap.position.y = 0.058;
    this.spin.add(cap);
    g.add(this.spin);

    const gap = 0.5;
    const wall = this.mesh(
      new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.1, 64, 1, true, gap / 2, Math.PI * 2 - gap),
      COL.steelLight,
      { metal: 0.5 },
    );
    (wall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    wall.position.y = Ytop + 0.04;
    g.add(wall);
    const rimCap = this.mesh(
      new THREE.RingGeometry(R, R + 0.04, 64, 1, -Math.PI / 2 + gap / 2, Math.PI * 2 - gap),
      COL.steel,
    );
    (rimCap.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    rimCap.rotation.x = -Math.PI / 2;
    rimCap.position.y = Ytop + 0.09;
    g.add(rimCap);

    this.label('Plataforma rotatoria (r)', g, [0, Ytop + 0.55, -0.1]);
    this.label(`ω = ${p.omega.toFixed(1)} rad/s`, g, [0, Ytop + 0.35, -0.1], 'green');
    this.label('Superficie de transición (con bordes)', g, [-0.1, Ytop + 0.18, -0.52], 'wide');
    this.root.add(g);
  }

  private buildChute(): void {
    const a = GEOM.chuteAlpha;
    const x0 = GEOM.xp - 0.12;
    const x1 = XFLOOR_END;
    const xm = (x0 + x1) / 2;
    const len = (x1 - x0) / Math.cos(a);
    const zc = GEOM.chuteZ;

    const floor = this.box(len, 0.03, 0.2, COL.steelLight);
    floor.position.set(xm, chuteFloorY(xm) - 0.015, zc);
    floor.rotation.z = -a;
    for (const z of [-0.1, 0.1]) floor.add(this.box(len, 0.06, 0.016, COL.steel, [0, 0.045, z]));
    this.root.add(floor);

    for (const x of [GEOM.xp + 0.25, XB - 0.1]) {
      const hgt = chuteFloorY(x) - 0.03;
      for (const z of [-0.07, 0.07]) {
        this.root.add(this.box(0.04, hgt, 0.04, COL.steel, [x, hgt / 2, zc + z]));
      }
    }

    const bin = new THREE.Group();
    bin.position.set(XB + 0.25, 0, zc);
    bin.add(this.box(0.3, 0.03, 0.3, COL.orange, [0, 0.015, 0]));
    for (const z of [-0.15, 0.15]) bin.add(this.box(0.3, 0.2, 0.016, COL.orange, [0, 0.1, z]));
    for (const x of [-0.15, 0.15]) bin.add(this.box(0.016, 0.2, 0.3, COL.orange, [x, 0.1, 0]));
    this.root.add(bin);

    const yF = chuteFloorY(XB);
    const postX = XB + 0.5;
    for (const z of [-0.12, 0.12]) {
      this.root.add(this.box(0.06, yF + 0.35, 0.06, COL.steel, [postX, (yF + 0.35) / 2, zc + z]));
      this.root.add(this.box(0.025, yF + 0.7, 0.025, COL.steelLight, [XB, (yF + 0.7) / 2, zc + z * 1.2]));
    }
    this.root.add(this.box(0.06, 0.05, 0.3, COL.steel, [postX, yF + 0.35, zc]));
    this.root.add(this.box(0.03, 0.2, 0.2, COL.dark, [postX - 0.02, yF + 0.11, zc]));

    this.gate.position.set(0, 0, zc);
    this.plate = this.box(0.03, 0.2, 0.2, COL.steel, [XB + 0.015, yF + 0.1, 0]);
    this.plate.add(this.box(0.034, 0.04, 0.204, COL.red, [0, 0.08, 0]));

    const pts: THREE.Vector3[] = [];
    const turns = 9;
    const n = turns * 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(
        new THREE.Vector3(
          t * SPRING_L0,
          Math.cos(t * turns * Math.PI * 2) * 0.035,
          Math.sin(t * turns * Math.PI * 2) * 0.035,
        ),
      );
    }
    this.spring = this.mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.008, 6),
      COL.red,
      { metal: 0.6, rough: 0.3 },
    );
    this.spring.position.set(XB + 0.03, yF + 0.11, 0);
    this.gate.add(this.plate, this.spring);
    this.root.add(this.gate);

    this.label('Resorte (k)', this.spring, [SPRING_L0 / 2, 0.15, 0]);
    this.label('Barra de control de descarga', this.plate, [-0.05, 0.3, 0], 'wide');
    this.label('Canal de salida de clasificación', floor, [0, -0.28, 0.2], 'wide');
    this.label('Depósito', bin, [0, 0.4, 0]);
  }

  private buildSphere(L: Layout): void {
    this.sphere = this.mesh(new THREE.SphereGeometry(GEOM.rs, 24, 16), 0xdde5ee, { metal: 0.85, rough: 0.2 });
    this.sphere.position.set(-GEOM.rs, L.yE + GEOM.rs, 0);
    this.label('Esfera (mₑ)', this.sphere, [0, 0.22, 0]);
    this.root.add(this.sphere);
  }

  private buildMarkers(L: Layout, p: Params): void {
    const xm = 0.12;
    const zm = 0.4;
    const mat = new THREE.LineBasicMaterial({ color: 0x1b2a3a });
    const seg = (a: V3, b: V3) =>
      this.root.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]),
          mat,
        ),
      );
    seg([xm, GEOM.Ytop, zm], [xm, L.yE, zm]);
    for (const y of [GEOM.Ytop, L.yE]) seg([xm - 0.05, y, zm], [xm + 0.05, y, zm]);
    this.label(`y₀ = ${p.h.toFixed(2)} m`, this.root, [xm + 0.2, (GEOM.Ytop + L.yE) / 2, zm], 'dim');

    const tp = trackPoint(L, (S_RAMP + S_LIP) / 2);
    this.label(`θ = ${p.theta.toFixed(1)}°`, this.root, [tp.x, tp.y + 0.3, 0.25], 'dim');
  }

  setPrediction(rep: Report, p: Params): void {
    if (this.trajectory) {
      this.root.remove(this.trajectory);
      this.trajectory.geometry.dispose();
      (this.trajectory.material as THREE.Material).dispose();
      this.trajectory = null;
    }
    if (rep.vox <= 0) return;
    const y0 = GEOM.Ytop + p.h + GEOM.rs;
    const tf = Math.sqrt((2 * p.h) / G);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = (tf * i) / 24;
      pts.push(new THREE.Vector3(rep.vox * t, y0 - 0.5 * G * t * t, 0));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0xd32f2f, dashSize: 0.05, gapSize: 0.04 }),
    );
    line.computeLineDistances();
    this.trajectory = line;
    this.root.add(line);
  }

  private placeSegment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
    const dir = b.clone().sub(a);
    const len = dir.length();
    m.visible = len > 0.01;
    if (!m.visible) return;
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  }

  update(sim: Simulation): void {
    const L = this.layout;
    const zA = GEOM.zArm;

    const tp = trackPoint(L, sim.cartS);
    this.cart.position.set(tp.x, tp.y, 0);
    this.cart.rotation.z = tp.angle;
    for (const w of this.wheels) w.rotation.y = -sim.cartS / 0.05;

    const mx = this.xP + GEOM.rp;
    this.mass.position.set(mx, sim.m1Y, zA);
    this.placeSegment(
      this.ropeL,
      new THREE.Vector3(mx, this.cy, zA),
      new THREE.Vector3(mx, sim.m1Y + GEOM.m1H + 0.03, zA),
    );

    const top = new THREE.Vector3(this.xP, this.ropeY, zA);
    let right: number;
    if (sim.ropeAttached) {
      right = this.xP - (tp.x + GEOM.cartHalf);
    } else {
      right = Math.max(0, this.rightAtRelease - 2.5 * (sim.t - sim.releaseT));
    }
    this.placeSegment(this.ropeR, top, new THREE.Vector3(this.xP - right, this.ropeY, zA));

    this.sphere.position.set(sim.sphere.x, sim.sphere.y, sim.sphere.z);
    this.spin.rotation.y = sim.platformAngle;

    const yF = chuteFloorY(XB);
    this.gate.position.y = sim.gateLift * 0.4;
    this.plate.position.x = XB + 0.015 + sim.springX;
    this.spring.position.set(XB + 0.03 + sim.springX, yF + 0.11, 0);
    this.spring.scale.x = Math.max(0.2, (SPRING_L0 - sim.springX) / SPRING_L0);

    if (sim.mode === 'cart') this.focusPos.copy(this.cart.position);
    else this.focusPos.copy(this.sphere.position);
  }
}
