import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GEOM } from '../config';

export type ViewName = 'general' | 'lateral' | 'superior';

const VIEWS: Record<ViewName, { pos: [number, number, number]; target: [number, number, number] }> = {
  general: { pos: [0.5, 2.5, 7.8], target: [0.2, 0.95, 0] },
  lateral: { pos: [0.2, 1.0, 9.6], target: [0.2, 1.0, 0] },
  superior: { pos: [GEOM.xp + 0.4, 3.6, 0.6], target: [GEOM.xp + 0.4, GEOM.Ytop, 0.2] },
};

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly controls: OrbitControls;
  followTarget: THREE.Vector3 | null = null;

  private tween: {
    t: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;

  constructor(private container: HTMLElement) {
    this.scene.background = new THREE.Color(0xe6f0fa);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(...VIEWS.general.pos);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    const ld = this.labelRenderer.domElement;
    ld.style.position = 'absolute';
    ld.style.inset = '0';
    ld.style.pointerEvents = 'none';
    container.appendChild(ld);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...VIEWS.general.target);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 30;

    this.buildLights();
    this.buildFloor();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfdceb, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(5, 9, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -9;
    c.right = 9;
    c.top = 7;
    c.bottom = -4;
    c.near = 1;
    c.far = 30;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
  }

  private buildFloor(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0xf3f8fd, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(40, 40, 0xb9cfe4, 0xd3e2f0);
    grid.position.y = 0.002;
    this.scene.add(grid);
  }

  setView(name: ViewName): void {
    const v = VIEWS[name];
    this.tween = {
      t: 0,
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(...v.pos),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(...v.target),
    };
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  render(dt: number): void {
    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.7);
      const k = 1 - Math.pow(1 - this.tween.t, 3);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k);
      if (this.tween.t >= 1) this.tween = null;
    } else if (this.followTarget) {
      const delta = this.followTarget.clone().sub(this.controls.target).multiplyScalar(0.08);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
