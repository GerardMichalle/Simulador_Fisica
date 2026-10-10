import { CONTROLS, DEFAULTS, EXPERIMENTAL_A, G, REPORT, type Params } from '../config';
import type { Report, Simulation } from '../physics/simulation';
import type { ViewName } from '../scene/world';

export interface PanelHandlers {
  onParam(key: keyof Params, value: number): void;
  onStart(): void;
  onPause(): void;
  onReset(): void;
  onSpeed(value: number): void;
  onView(view: ViewName): void;
  onLabels(on: boolean): void;
  onFollow(on: boolean): void;
}

const STAGES = [
  'La masa colgante genera la fuerza que mueve el carro mediante la cuerda y la polea.',
  'El carro se desplaza por el riel inclinado.',
  'El carro continúa por la rampa inclinada, en sentido descendente.',
  'La esfera se lanza horizontalmente y cae en caída libre hacia la plataforma rotatoria.',
  'La esfera se desliza por la plataforma y comienza a girar con ella.',
  'La esfera sale por el canal de salida para su clasificación.',
  'El resorte reduce el impacto y la barra controla la descarga final.',
];

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

export class Panel {
  private stageEls: HTMLElement[] = [];
  private out: Record<string, HTMLElement> = {};
  private statusEl!: HTMLElement;
  private warnEl!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;
  private valueEls = new Map<string, HTMLElement>();
  private sliders = new Map<string, HTMLInputElement>();

  constructor(
    private left: HTMLElement,
    private right: HTMLElement,
    private toolbar: HTMLElement,
    private h: PanelHandlers,
  ) {
    this.buildLeft();
    this.buildRight();
    this.buildToolbar();
  }

  private buildLeft(): void {
    this.left.innerHTML = '<h2>Parámetros</h2>';
    for (const c of CONTROLS) {
      const wrap = document.createElement('label');
      wrap.className = 'ctl';
      const head = document.createElement('div');
      head.className = 'ctl-head';
      const name = document.createElement('span');
      name.textContent = c.label;
      const val = document.createElement('b');
      head.append(name, val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step);
      input.value = String(DEFAULTS[c.key]);
      const show = () => (val.textContent = `${Number(input.value).toFixed(c.decimals)} ${c.unit}`.trim());
      show();
      input.addEventListener('input', () => {
        show();
        this.h.onParam(c.key, Number(input.value));
      });
      wrap.append(head, input);
      this.left.append(wrap);
      this.valueEls.set(c.key, val);
      this.sliders.set(c.key, input);
    }
    const reset = document.createElement('button');
    reset.className = 'ghost';
    reset.textContent = 'Valores por defecto';
    reset.addEventListener('click', () => {
      for (const c of CONTROLS) {
        const input = this.sliders.get(c.key)!;
        input.value = String(DEFAULTS[c.key]);
        input.dispatchEvent(new Event('input'));
      }
    });
    this.left.append(reset);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      'Arrastra para rotar la cámara, rueda del mouse para acercar. Cambiar un parámetro reinicia el experimento.';
    this.left.append(hint);
  }

  private row(label: string, id: string, parent: HTMLElement): void {
    const r = document.createElement('div');
    r.className = 'row';
    const k = document.createElement('span');
    k.textContent = label;
    const v = document.createElement('b');
    v.textContent = '–';
    r.append(k, v);
    parent.append(r);
    this.out[id] = v;
  }

  private buildRight(): void {
    this.right.innerHTML = '<h2>Etapas de funcionamiento</h2>';
    const ol = document.createElement('ol');
    ol.className = 'stages';
    STAGES.forEach((t, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<i>${i + 1}</i><span>${t}</span>`;
      ol.append(li);
      this.stageEls.push(li);
    });
    this.right.append(ol);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'status';
    this.right.append(this.statusEl);

    this.warnEl = document.createElement('div');
    this.warnEl.className = 'warn';
    this.right.append(this.warnEl);

    const live = document.createElement('div');
    live.className = 'card';
    live.innerHTML = '<h3>En vivo</h3>';
    this.row('Tiempo', 't', live);
    this.row('Velocidad del carro', 'v', live);
    this.row('Aceleración del carro', 'a', live);
    this.row('Velocidad de la esfera', 'vs', live);
    this.right.append(live);

    const pred = document.createElement('div');
    pred.className = 'card';
    pred.innerHTML = '<h3>Resultados del modelo</h3>';
    this.row('a ideal  m_h·g/(m_c+m_h)', 'pAi', pred);
    this.row('a del modelo (con fricción)', 'pAm', pred);
    this.row('a experimental (informe)', 'pAe', pred);
    this.row('Velocidad del carro al chocar', 'pVc', pred);
    this.row('Velocidad de salida vₛ', 'pVox', pred);
    this.row('Tiempo de vuelo t_c', 'pTf', pred);
    this.row('Alcance horizontal R', 'pX', pred);
    this.row('Radio de giro r', 'pRho', pred);
    this.row('Fuerza centrípeta F_c = mₑω²r', 'pFc', pred);
    this.row('μₛ mínimo = ω²r/g', 'pMu', pred);
    this.row('Velocidad en el canal', 'pVb', pred);
    this.row('Compresión máx. del resorte', 'pXs', pred);
    this.row('Duración del ciclo', 'pT', pred);
    const ref = document.createElement('p');
    ref.className = 'hint';
    ref.textContent =
      `Informe: vₛ = ${REPORT.vs.toFixed(4)} m/s · t_c = ${REPORT.tc.toFixed(4)} s · R teórico = ${REPORT.rTeo.toFixed(4)} m · ` +
      `R experimental = ${REPORT.rExp.toFixed(4)} m · F_c = ${REPORT.fcModel.toFixed(3)} N · μₛ mín. = ${REPORT.muSMin.toFixed(3)}`;
    pred.append(ref);
    this.right.append(pred);
  }

  private buildToolbar(): void {
    const btn = (text: string, cls: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.className = cls;
      b.addEventListener('click', fn);
      this.toolbar.append(b);
      return b;
    };
    btn('▶ Iniciar', 'primary', () => this.h.onStart());
    this.pauseBtn = btn('⏸ Pausar', '', () => this.h.onPause());
    btn('↺ Reiniciar', '', () => this.h.onReset());

    const sep = () => {
      const s = document.createElement('span');
      s.className = 'sep';
      this.toolbar.append(s);
    };
    sep();

    const speed = document.createElement('select');
    for (const v of [0.25, 0.5, 1, 2]) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = `${v}×`;
      if (v === 1) o.selected = true;
      speed.append(o);
    }
    speed.addEventListener('change', () => this.h.onSpeed(Number(speed.value)));
    const sl = document.createElement('label');
    sl.className = 'inline';
    sl.append('Velocidad ', speed);
    this.toolbar.append(sl);
    sep();

    btn('Vista general', '', () => this.h.onView('general'));
    btn('Lateral', '', () => this.h.onView('lateral'));
    btn('Superior', '', () => this.h.onView('superior'));
    sep();

    const check = (text: string, checked: boolean, fn: (v: boolean) => void) => {
      const l = document.createElement('label');
      l.className = 'inline';
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = checked;
      c.addEventListener('change', () => fn(c.checked));
      l.append(c, ` ${text}`);
      this.toolbar.append(l);
    };
    check('Seguir', false, (v) => this.h.onFollow(v));
    check('Etiquetas', true, (v) => this.h.onLabels(v));
  }

  setRunning(running: boolean, started: boolean): void {
    this.pauseBtn.textContent = running || !started ? '⏸ Pausar' : '▶ Reanudar';
  }

  setPrediction(rep: Report, p: Params): void {
    const o = this.out;
    const aIdeal = (p.mh * G) / (p.mc + p.mh);
    const aExp = EXPERIMENTAL_A[Math.round(p.mh * 1000) / 1000];
    o.pAi!.textContent = `${fmt(aIdeal, 4)} m/s²`;
    o.pAm!.textContent = rep.aRope > 0 ? `${fmt(rep.aRope, 4)} m/s²` : '–';
    o.pAe!.textContent = aExp !== undefined ? `${fmt(aExp, 4)} m/s²` : '–';
    o.pVc!.textContent = rep.vCartImpact > 0 ? `${fmt(rep.vCartImpact)} m/s` : '–';
    o.pVox!.textContent = rep.vox > 0 ? `${fmt(rep.vox, 4)} m/s` : '–';
    o.pTf!.textContent = rep.tFlight > 0 ? `${fmt(Math.sqrt((2 * p.h) / G), 4)} s` : '–';
    o.pX!.textContent = rep.tFlight > 0 ? `${fmt(rep.vox * Math.sqrt((2 * p.h) / G), 4)} m` : '–';
    o.pRho!.textContent = rep.rhoStuck > 0 ? `${fmt(rep.rhoStuck)} m` : rep.tFlight > 0 ? `${fmt(rep.rhoLand)} m (impacto)` : '–';
    o.pFc!.textContent = rep.rhoStuck > 0 ? `${fmt(p.me * p.omega * p.omega * rep.rhoStuck, 3)} N` : '–';
    o.pMu!.textContent = rep.rhoStuck > 0 ? fmt((p.omega * p.omega * rep.rhoStuck) / G, 3) : '–';
    o.pVb!.textContent = rep.vBar > 0 ? `${fmt(rep.vBar)} m/s` : '–';
    o.pXs!.textContent = rep.xSpringMax > 0 ? `${fmt(rep.xSpringMax * 100, 1)} cm` : '–';
    o.pT!.textContent = rep.outcome === 'done' ? `${fmt(rep.tTotal, 1)} s` : '–';
    this.warnEl.textContent = rep.outcome === 'failed' ? `Con estos valores: ${rep.message}` : '';
    this.warnEl.style.display = rep.outcome === 'failed' ? 'block' : 'none';
  }

  update(sim: Simulation): void {
    this.stageEls.forEach((el, i) => {
      const n = i + 1;
      el.classList.toggle('active', sim.stage === n && sim.outcome === 'running');
      el.classList.toggle('done', sim.stage > n);
    });
    const o = this.out;
    o.t!.textContent = `${fmt(sim.t, 2)} s`;
    o.v!.textContent = `${fmt(sim.cartV)} m/s`;
    o.a!.textContent = `${fmt(sim.cartA)} m/s²`;
    o.vs!.textContent = `${fmt(sim.sphereSpeed)} m/s`;

    this.statusEl.className = 'status';
    if (sim.outcome === 'idle') {
      this.statusEl.textContent = 'Listo. Ajusta los parámetros y presiona Iniciar.';
    } else if (sim.outcome === 'running') {
      this.statusEl.textContent = `Etapa ${sim.stage} de 7`;
    } else {
      this.statusEl.textContent = sim.message;
      this.statusEl.classList.add(sim.outcome);
    }
  }
}
