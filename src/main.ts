import './style.css';
import { DEFAULTS, type Params } from './config';
import { DT, Simulation, predict } from './physics/simulation';
import { Model } from './scene/model';
import { World } from './scene/world';
import { Panel } from './ui/panel';

const params: Params = { ...DEFAULTS };
let sim = new Simulation(params);
let running = false;
let speed = 1;
let acc = 0;
let follow = false;

const world = new World(document.getElementById('viewport')!);
const model = new Model(world.scene);

const panel = new Panel(
  document.getElementById('left')!,
  document.getElementById('right')!,
  document.getElementById('toolbar')!,
  {
    onParam(key, value) {
      params[key] = value;
      reset();
    },
    onStart() {
      if (sim.outcome !== 'idle') reset();
      sim.start();
      running = sim.outcome === 'running';
      syncButtons();
    },
    onPause() {
      if (sim.outcome !== 'running') return;
      running = !running;
      syncButtons();
    },
    onReset: () => reset(),
    onSpeed: (v) => (speed = v),
    onView: (v) => {
      follow = false;
      world.followTarget = null;
      world.setView(v);
    },
    onLabels: (on) => model.setLabelsVisible(on),
    onFollow: (on) => (follow = on),
  },
);

function syncButtons(): void {
  panel.setRunning(running, sim.outcome === 'running');
}

function reset(): void {
  sim = new Simulation(params);
  running = false;
  acc = 0;
  model.build(params);
  const rep = predict(params);
  model.setPrediction(rep, params);
  panel.setPrediction(rep, params);
  model.update(sim);
  syncButtons();
}

reset();

let last = performance.now();
let panelTimer = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (running) {
    acc += dt * speed;
    let n = 0;
    while (acc >= DT && n < 2000) {
      sim.step(DT);
      acc -= DT;
      n++;
    }
    if (sim.outcome !== 'running') {
      running = false;
      syncButtons();
    }
  }

  model.update(sim);
  world.followTarget = follow ? model.focusPos : null;
  world.render(dt);

  panelTimer += dt;
  if (panelTimer > 0.08) {
    panelTimer = 0;
    panel.update(sim);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
