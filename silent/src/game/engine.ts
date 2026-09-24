import { Sfx } from './audio';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover';
export interface RunStats {
  score: number;
  time: number;
  kills: number;
  fragments: number;
  maxCombo: number;
}
interface Callbacks {
  onState: (s: GameState) => void;
  onGameOver: (s: RunStats) => void;
}

const WORLD = 2800;
const CELL = 400;
const STREET = 150;
const FG = 40;
const FN = WORLD / FG;
const TAU = Math.PI * 2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number; // 0 building, 1 car
  c: number;
  det: number[];
}
type EType = 'lurker' | 'nurse' | 'crawler' | 'executioner';
interface Enemy {
  type: EType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  score: number;
  flash: number;
  t: number;
  atkCd: number;
  state: number;
  timer: number;
  ang: number;
  seed: number;
  dead: boolean;
  fade: number;
}
interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: number; // 0 blood, 1 spark, 2 smoke, 3 casing, 4 glow
  drag: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Pickup {
  x: number;
  y: number;
  type: number; // 0 ammo 1 health
  t: number;
}
interface FText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}
interface Decal {
  x: number;
  y: number;
  r: number;
  c: string;
}
interface Crack {
  x: number;
  y: number;
  pts: number[];
}

const ETYPES: Record<EType, { r: number; hp: number; speed: number; dmg: number; score: number }> = {
  lurker: { r: 14, hp: 3, speed: 64, dmg: 12, score: 100 },
  nurse: { r: 13, hp: 4, speed: 96, dmg: 16, score: 150 },
  crawler: { r: 9, hp: 1, speed: 150, dmg: 7, score: 60 },
  executioner: { r: 26, hp: 30, speed: 50, dmg: 34, score: 2500 },
};

type RGB = [number, number, number];
const PAL: Record<string, [RGB, RGB]> = {
  ground: [
    [92, 90, 86],
    [40, 18, 14],
  ],
  walk: [
    [120, 117, 112],
    [58, 26, 18],
  ],
  bld: [
    [58, 56, 54],
    [22, 10, 8],
  ],
  roof: [
    [70, 68, 65],
    [34, 15, 11],
  ],
  edge: [
    [38, 37, 35],
    [96, 38, 20],
  ],
  line: [
    [150, 140, 98],
    [74, 26, 14],
  ],
  crack: [
    [60, 58, 55],
    [15, 5, 3],
  ],
};
const FOG: RGB = [186, 184, 178];

function mix(p: [RGB, RGB], t: number, a = 1) {
  const [x, y] = p;
  const r = (x[0] + (y[0] - x[0]) * t) | 0;
  const g = (x[1] + (y[1] - x[1]) * t) | 0;
  const b = (x[2] + (y[2] - x[2]) * t) | 0;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: Callbacks;
  sfx = new Sfx();
  state: GameState = 'menu';

  private w = 0;
  private h = 0;
  private dpr = 1;
  private zoom = 1;
  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private vignette: HTMLCanvasElement;
  private glow: HTMLCanvasElement;
  private fogBlob: HTMLCanvasElement;
  private grain: CanvasPattern | null = null;

  private buildings: Rect[] = [];
  private cracks: Crack[] = [];
  private flow = new Int16Array(FN * FN);
  private blocked = new Uint8Array(FN * FN);
  private queue = new Int32Array(FN * FN);
  private flowT = 0;

  private p = {
    x: 1200,
    y: 1200,
    vx: 0,
    vy: 0,
    hp: 100,
    aim: 0,
    ammo: 30,
    fireCd: 0,
    dodgeT: 0,
    dodgeCd: 0,
    dx: 0,
    dy: 0,
    inv: 0,
    swingT: 0,
    swingDir: 1,
    walk: 0,
    moveAng: 0,
    recoil: 0,
  };
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private pcur = 0;
  private pickups: Pickup[] = [];
  private texts: FText[] = [];
  private decals: Decal[] = [];
  private ash: { x: number; y: number; s: number; v: number; ph: number }[] = [];
  private after: { x: number; y: number; a: number; life: number }[] = [];
  private frag = { x: 0, y: 0, active: false, t: 0 };

  private camX = 1200;
  private camY = 1200;
  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeR = 0;

  private time = 0;
  private score = 0;
  private kills = 0;
  private frags = 0;
  private combo = 0;
  private comboT = 0;
  private maxCombo = 0;
  private o = 0;
  private phase = 0;
  private phaseT = 0;
  private phaseLen = 42;
  private sirenPlayed = false;
  private phaseCount = 0;
  private execSpawned = false;
  private spawnT = 0;
  private hitStop = 0;
  private hurtFlash = 0;
  private deathT = 0;
  private banner = '';
  private bannerSub = '';
  private bannerT = 0;
  private flashT = 0;
  private staticLvl = 0;
  private globalT = 0;
  private scoreBump = 0;

  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, last: -100 };
  private kbFire = false;
  private isTouch = false;
  private tMove = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private tAim = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private lastT = 0;
  private raf = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    this.vignette = document.createElement('canvas');
    this.glow = this.makeGlow();
    this.fogBlob = this.makeFogBlob();
    this.makeGrain();
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    for (let i = 0; i < 700; i++)
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        size: 1,
        color: '#fff',
        kind: 0,
        drag: 0,
      });
    for (let i = 0; i < 70; i++)
      this.ash.push({ x: Math.random(), y: Math.random(), s: rand(1, 2.6), v: rand(0.6, 1.4), ph: Math.random() * TAU });
    this.generateMap();
    this.resize();
    this.bind();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.removeEventListener('pointerdown', this.onPDown);
    window.removeEventListener('pointermove', this.onPMove);
    window.removeEventListener('pointerup', this.onPUp);
    window.removeEventListener('pointercancel', this.onPUp);
    this.sfx.suspend();
  }

  // ---------- setup helpers ----------
  private makeGlow() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  private makeFogBlob() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      const x = rand(70, 186);
      const y = rand(70, 186);
      const r = rand(50, 90);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(200,198,192,0.35)');
      gr.addColorStop(1, 'rgba(200,198,192,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    return c;
  }
  private makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 40;
    }
    g.putImageData(img, 0, 0);
    this.grain = this.ctx.createPattern(c, 'repeat');
  }

  private resize = () => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.75 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.zoom = clamp(Math.min(this.w, this.h) / 720, 0.55, 1.35);
    this.light.width = Math.ceil(this.w / 2);
    this.light.height = Math.ceil(this.h / 2);
    // vignette
    const vw = Math.ceil(this.w / 2);
    const vh = Math.ceil(this.h / 2);
    this.vignette.width = vw;
    this.vignette.height = vh;
    const vg = this.vignette.getContext('2d')!;
    const gr = vg.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.75)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, vw, vh);
  };

  private generateMap() {
    this.buildings = [];
    this.cracks = [];
    const n = WORLD / CELL;
    const bs = CELL - STREET;
    for (let gx = 0; gx < n; gx++) {
      for (let gy = 0; gy < n; gy++) {
        const bx = gx * CELL + STREET / 2;
        const by = gy * CELL + STREET / 2;
        const roll = Math.random();
        const det = () => {
          const d: number[] = [];
          const k = 1 + ((Math.random() * 3) | 0);
          for (let i = 0; i < k; i++) d.push(Math.random(), Math.random(), rand(14, 34), rand(10, 26));
          return d;
        };
        if (roll < 0.14) {
          // parking lot with wrecked cars
          const k = 2 + ((Math.random() * 3) | 0);
          for (let i = 0; i < k; i++) {
            const horiz = Math.random() < 0.5;
            const w = horiz ? 58 : 30;
            const h = horiz ? 30 : 58;
            this.buildings.push({ x: bx + rand(10, bs - w - 10), y: by + rand(10, bs - h - 10), w, h, kind: 1, c: Math.random(), det: [] });
          }
        } else if (roll < 0.5) {
          const gap = 36;
          if (Math.random() < 0.5) {
            const s = rand(90, bs - 90 - gap);
            this.buildings.push({ x: bx, y: by, w: s, h: bs, kind: 0, c: Math.random(), det: det() });
            this.buildings.push({ x: bx + s + gap, y: by, w: bs - s - gap, h: bs, kind: 0, c: Math.random(), det: det() });
          } else {
            const s = rand(90, bs - 90 - gap);
            this.buildings.push({ x: bx, y: by, w: bs, h: s, kind: 0, c: Math.random(), det: det() });
            this.buildings.push({ x: bx, y: by + s + gap, w: bs, h: bs - s - gap, kind: 0, c: Math.random(), det: det() });
          }
        } else {
          const ins = rand(0, 20);
          this.buildings.push({ x: bx + ins, y: by + ins, w: bs - ins * 2, h: bs - ins * 2, kind: 0, c: Math.random(), det: det() });
        }
      }
    }
    // abandoned cars in streets
    for (let i = 0; i < 18; i++) {
      const vertical = Math.random() < 0.5;
      const lane = (1 + ((Math.random() * (n - 1)) | 0)) * CELL;
      const along = rand(100, WORLD - 100);
      const off = rand(-40, 40);
      const x = vertical ? lane + off - 15 : along;
      const y = vertical ? along : lane + off - 15;
      if (Math.hypot(x - 1200, y - 1200) < 260) continue;
      this.buildings.push({ x, y, w: vertical ? 30 : 58, h: vertical ? 58 : 30, kind: 1, c: Math.random(), det: [] });
    }
    for (let i = 0; i < 260; i++) {
      const x = rand(0, WORLD);
      const y = rand(0, WORLD);
      const pts: number[] = [0, 0];
      let a = Math.random() * TAU;
      let cx = 0;
      let cy = 0;
      const segs = 3 + ((Math.random() * 5) | 0);
      for (let s = 0; s < segs; s++) {
        a += rand(-0.8, 0.8);
        const l = rand(8, 24);
        cx += Math.cos(a) * l;
        cy += Math.sin(a) * l;
        pts.push(cx, cy);
      }
      this.cracks.push({ x, y, pts });
    }
    // blocked grid
    this.blocked.fill(0);
    for (let cy = 0; cy < FN; cy++)
      for (let cx = 0; cx < FN; cx++) {
        const px = cx * FG + FG / 2;
        const py = cy * FG + FG / 2;
        for (const b of this.buildings) {
          if (px > b.x - 12 && px < b.x + b.w + 12 && py > b.y - 12 && py < b.y + b.h + 12) {
            this.blocked[cy * FN + cx] = 1;
            break;
          }
        }
      }
  }

  // ---------- input ----------
  private bind() {
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVis);
    this.canvas.addEventListener('pointerdown', this.onPDown);
    window.addEventListener('pointermove', this.onPMove);
    window.addEventListener('pointerup', this.onPUp);
    window.addEventListener('pointercancel', this.onPUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private onBlur = () => {
    this.keys.clear();
    this.mouse.down = false;
    this.kbFire = false;
    if (this.state === 'playing') this.pause();
  };
  private onVis = () => {
    if (document.hidden && this.state === 'playing') this.pause();
  };
  private onKeyDown = (e: KeyboardEvent) => {
    const inInput = e.target instanceof HTMLInputElement;
    if (inInput && e.code !== 'Enter') return;
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    if (this.state === 'menu') {
      if (c === 'Enter' || (c === 'Space' && !inInput)) this.start();
      return;
    }
    if (this.state === 'gameover') {
      if ((c === 'KeyR' || c === 'Enter' || c === 'Space') && this.deathT <= 0) this.start();
      return;
    }
    if (c === 'Escape' || c === 'KeyP') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state === 'paused') {
      if (c === 'KeyR') this.start();
      if (c === 'Enter' || c === 'Space') this.resume();
      return;
    }
    if (e.repeat) return;
    this.keys.add(c);
    this.isTouch = false;
    if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') this.tryDodge();
    if (c === 'KeyJ' || c === 'KeyK' || c === 'Enter') this.kbFire = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'Enter') this.kbFire = false;
  };
  private onPDown = (e: PointerEvent) => {
    if (this.state !== 'playing') return;
    e.preventDefault();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.isTouch = true;
      const x = e.clientX;
      const y = e.clientY;
      // dodge button
      const db = this.dodgeBtn();
      if (Math.hypot(x - db.x, y - db.y) < db.r + 8) {
        this.tryDodge();
        return;
      }
      if (x < this.w / 2) {
        if (this.tMove.id === -1) this.tMove = { id: e.pointerId, ox: x, oy: y, x, y };
      } else if (this.tAim.id === -1) this.tAim = { id: e.pointerId, ox: x, oy: y, x, y };
    } else {
      this.isTouch = false;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.last = this.globalT;
      if (e.button === 2) this.tryDodge();
      else this.mouse.down = true;
    }
  };
  private onPMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.last = this.globalT;
      return;
    }
    if (e.pointerId === this.tMove.id) {
      this.tMove.x = e.clientX;
      this.tMove.y = e.clientY;
      const dx = this.tMove.x - this.tMove.ox;
      const dy = this.tMove.y - this.tMove.oy;
      const d = Math.hypot(dx, dy);
      const max = 70;
      if (d > max) {
        // drag the base along — floating joystick
        this.tMove.ox = this.tMove.x - (dx / d) * max;
        this.tMove.oy = this.tMove.y - (dy / d) * max;
      }
    } else if (e.pointerId === this.tAim.id) {
      this.tAim.x = e.clientX;
      this.tAim.y = e.clientY;
      const dx = this.tAim.x - this.tAim.ox;
      const dy = this.tAim.y - this.tAim.oy;
      const d = Math.hypot(dx, dy);
      if (d > 70) {
        this.tAim.ox = this.tAim.x - (dx / d) * 70;
        this.tAim.oy = this.tAim.y - (dy / d) * 70;
      }
    }
  };
  private onPUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 2) this.mouse.down = false;
      return;
    }
    if (e.pointerId === this.tMove.id) this.tMove.id = -1;
    if (e.pointerId === this.tAim.id) this.tAim.id = -1;
  };
  private dodgeBtn() {
    return { x: this.w - 70, y: this.h - 190, r: 34 };
  }

  // ---------- state control ----------
  start() {
    this.sfx.init();
    this.sfx.resume();
    this.generateMap();
    const p = this.p;
    Object.assign(p, {
      x: 1200,
      y: 1200,
      vx: 0,
      vy: 0,
      hp: 100,
      aim: -Math.PI / 2,
      ammo: 30,
      fireCd: 0,
      dodgeT: 0,
      dodgeCd: 0,
      inv: 1,
      swingT: 0,
      walk: 0,
      recoil: 0,
    });
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.texts = [];
    this.decals = [];
    this.after = [];
    for (const pt of this.particles) pt.active = false;
    this.camX = p.x;
    this.camY = p.y;
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.frags = 0;
    this.combo = 0;
    this.comboT = 0;
    this.maxCombo = 0;
    this.o = 0;
    this.phase = 0;
    this.phaseT = 0;
    this.phaseLen = 42;
    this.sirenPlayed = false;
    this.phaseCount = 0;
    this.execSpawned = false;
    this.spawnT = 2.5;
    this.hitStop = 0;
    this.hurtFlash = 0;
    this.deathT = 0;
    this.trauma = 0;
    this.flowT = 0;
    this.computeFlow();
    // immediate threat: first ten seconds matter
    for (let i = 0; i < 3; i++) {
      const s = this.findSpawn(330, 460);
      if (s) this.spawnEnemy('lurker', s.x, s.y);
    }
    this.frag.active = false;
    this.frag.t = 0;
    this.spawnFragment(260, 420);
    this.showBanner('SILENT HILL', 'find the memories. survive the fog.');
    this.keys.clear();
    this.mouse.down = false;
    this.tMove.id = -1;
    this.tAim.id = -1;
    this.setState('playing');
  }
  pause() {
    if (this.state !== 'playing') return;
    this.mouse.down = false;
    this.kbFire = false;
    this.keys.clear();
    this.tMove.id = -1;
    this.tAim.id = -1;
    this.sfx.suspend();
    this.setState('paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.sfx.resume();
    this.lastT = performance.now();
    this.setState('playing');
  }
  toMenu() {
    this.sfx.silence();
    this.setState('menu');
  }
  private setState(s: GameState) {
    this.state = s;
    this.cb.onState(s);
  }
  private showBanner(t: string, sub = '') {
    this.banner = t;
    this.bannerSub = sub;
    this.bannerT = 3;
  }

  // ---------- world helpers ----------
  private collideRects(obj: { x: number; y: number }, r: number) {
    for (const b of this.buildings) {
      if (obj.x + r < b.x || obj.x - r > b.x + b.w || obj.y + r < b.y || obj.y - r > b.y + b.h) continue;
      const cx = clamp(obj.x, b.x, b.x + b.w);
      const cy = clamp(obj.y, b.y, b.y + b.h);
      let dx = obj.x - cx;
      let dy = obj.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) {
        // center inside rect — push out along smallest axis
        const l = obj.x - b.x;
        const rr = b.x + b.w - obj.x;
        const t = obj.y - b.y;
        const bt = b.y + b.h - obj.y;
        const m = Math.min(l, rr, t, bt);
        if (m === l) obj.x = b.x - r;
        else if (m === rr) obj.x = b.x + b.w + r;
        else if (m === t) obj.y = b.y - r;
        else obj.y = b.y + b.h + r;
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      obj.x = cx + dx * r;
      obj.y = cy + dy * r;
    }
    obj.x = clamp(obj.x, r + 4, WORLD - r - 4);
    obj.y = clamp(obj.y, r + 4, WORLD - r - 4);
  }
  private pointInBuilding(x: number, y: number) {
    for (const b of this.buildings) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    return false;
  }
  private cellOf(x: number, y: number) {
    const cx = clamp((x / FG) | 0, 0, FN - 1);
    const cy = clamp((y / FG) | 0, 0, FN - 1);
    return cy * FN + cx;
  }
  private computeFlow() {
    const flow = this.flow;
    const bl = this.blocked;
    const q = this.queue;
    flow.fill(-1);
    const pc = this.cellOf(this.p.x, this.p.y);
    let head = 0;
    let tail = 0;
    q[tail++] = pc;
    flow[pc] = 0;
    while (head < tail) {
      const c = q[head++];
      const cx = c % FN;
      const cy = (c / FN) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= FN || ny >= FN) continue;
          const ni = ny * FN + nx;
          if (bl[ni] || flow[ni] >= 0) continue;
          if (dx && dy && (bl[cy * FN + nx] || bl[ny * FN + cx])) continue;
          flow[ni] = flow[c] + 1;
          q[tail++] = ni;
        }
    }
  }
  private findSpawn(minD: number, maxD: number) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU;
      const d = rand(minD, maxD);
      const x = this.p.x + Math.cos(a) * d;
      const y = this.p.y + Math.sin(a) * d;
      if (x < 40 || y < 40 || x > WORLD - 40 || y > WORLD - 40) continue;
      const c = this.cellOf(x, y);
      if (this.blocked[c] || this.flow[c] < 0) continue;
      return { x, y };
    }
    return null;
  }
  private spawnEnemy(type: EType, x: number, y: number) {
    const d = ETYPES[type];
    const hpScale = type === 'executioner' ? 1 + this.phaseCount * 0.25 : 1 + Math.min(1, this.time / 300);
    const hp = Math.round(d.hp * (type === 'crawler' ? 1 : hpScale));
    this.enemies.push({
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: d.r,
      hp,
      maxHp: hp,
      speed: d.speed * rand(0.9, 1.1) * (1 + Math.min(0.35, this.time / 600)),
      dmg: d.dmg,
      score: d.score,
      flash: 0,
      t: Math.random() * 10,
      atkCd: 0.5,
      state: 0,
      timer: 0,
      ang: Math.atan2(this.p.y - y, this.p.x - x),
      seed: Math.random() * 100,
      dead: false,
      fade: type === 'executioner' ? 0 : 1,
    });
  }
  private spawnFragment(minD: number, maxD: number) {
    const s = this.findSpawn(minD, maxD) || this.findSpawn(150, 900);
    if (!s) return;
    this.frag.x = s.x;
    this.frag.y = s.y;
    this.frag.active = true;
    this.frag.t = 0;
  }

  // ---------- particles ----------
  private part(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, kind: number, z = 0, vz = 0, drag = 3) {
    const pt = this.particles[this.pcur];
    this.pcur = (this.pcur + 1) % this.particles.length;
    pt.active = true;
    pt.x = x;
    pt.y = y;
    pt.z = z;
    pt.vx = vx;
    pt.vy = vy;
    pt.vz = vz;
    pt.life = life;
    pt.max = life;
    pt.size = size;
    pt.color = color;
    pt.kind = kind;
    pt.drag = drag;
  }
  private blood(x: number, y: number, ang: number, n: number, force = 1) {
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-0.7, 0.7);
      const s = rand(60, 260) * force;
      const c = Math.random() < 0.5 ? '#6b0f0c' : '#8e1a12';
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), rand(1.5, 3.5), c, 0, rand(4, 12), rand(40, 160), 2.5);
    }
  }
  private decal(x: number, y: number, r: number, c = 'rgba(80,8,6,0.55)') {
    if (this.decals.length > 240) this.decals.shift();
    this.decals.push({ x, y, r, c });
  }
  private addTrauma(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  // ---------- combat ----------
  private tryDodge() {
    const p = this.p;
    if (this.state !== 'playing' || p.dodgeCd > 0 || p.hp <= 0) return;
    let dx = 0;
    let dy = 0;
    const mv = this.moveInput();
    if (mv.x || mv.y) {
      dx = mv.x;
      dy = mv.y;
    } else {
      dx = -Math.cos(p.aim);
      dy = -Math.sin(p.aim);
    }
    const d = Math.hypot(dx, dy) || 1;
    p.dx = dx / d;
    p.dy = dy / d;
    p.dodgeT = 0.22;
    p.dodgeCd = 0.55;
    p.inv = Math.max(p.inv, 0.3);
    this.sfx.dodge();
    for (let i = 0; i < 8; i++) this.part(p.x, p.y, rand(-60, 60), rand(-60, 60), rand(0.3, 0.6), rand(6, 12), 'rgba(160,155,148,0.35)', 2);
  }
  private moveInput() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('KeyQ')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.tMove.id !== -1) {
      const dx = this.tMove.x - this.tMove.ox;
      const dy = this.tMove.y - this.tMove.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const m = Math.min(1, d / 60);
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }
  private assist(angle: number, maxDiff: number) {
    let best = angle;
    let bd = maxDiff;
    for (const e of this.enemies) {
      if (e.dead || e.fade < 0.5) continue;
      const dx = e.x - this.p.x;
      const dy = e.y - this.p.y;
      const d = Math.hypot(dx, dy);
      if (d > 520) continue;
      const a = Math.atan2(dy, dx);
      const df = Math.abs(angDiff(a, angle));
      if (df < bd) {
        bd = df;
        best = a;
      }
    }
    return best;
  }
  private shoot() {
    const p = this.p;
    const assistAmt = this.isTouch || this.mouse.last < this.globalT - 3 ? 0.35 : 0.1;
    const a = this.assist(p.aim, assistAmt) + rand(-0.035, 0.035);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const mx = p.x + c * 20;
    const my = p.y + s * 20;
    this.bullets.push({ x: mx, y: my, vx: c * 1150, vy: s * 1150, life: 0.6 });
    p.ammo--;
    p.fireCd = 0.2;
    p.recoil = 1;
    p.vx -= c * 60;
    p.vy -= s * 60;
    this.kickX -= c * 7;
    this.kickY -= s * 7;
    this.addTrauma(0.12);
    this.flashT = 0.06;
    this.sfx.shoot();
    for (let i = 0; i < 6; i++) {
      const aa = a + rand(-0.4, 0.4);
      const sp = rand(200, 500);
      this.part(mx, my, Math.cos(aa) * sp, Math.sin(aa) * sp, rand(0.05, 0.14), rand(1, 2), '#ffd98a', 1, 0, 0, 8);
    }
    this.part(mx, my, 0, 0, 0.06, 26, 'rgba(255,210,140,1)', 4);
    this.part(mx, my, c * 40, s * 40, 0.5, 8, 'rgba(180,175,168,0.25)', 2);
    const ca = a + Math.PI / 2 + rand(-0.3, 0.3);
    this.part(p.x, p.y, Math.cos(ca) * 110, Math.sin(ca) * 110, 0.7, 2, '#c9a24a', 3, 8, 90, 4);
    if (p.ammo === 0) {
      this.texts.push({ x: p.x, y: p.y - 30, text: 'OUT OF AMMO — PIPE', life: 1.4, color: '#e0d6c8', size: 13 });
      this.sfx.empty();
    }
  }
  private swing() {
    const p = this.p;
    p.fireCd = 0.4;
    p.swingT = 0.24;
    p.swingDir *= -1;
    const assistAmt = this.isTouch ? 0.5 : 0.25;
    const a = this.assist(p.aim, assistAmt);
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead || e.fade < 0.5) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 58 + e.r) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), a)) > 1.15) continue;
      hit = true;
      this.damageEnemy(e, 2, Math.atan2(dy, dx), 420);
    }
    this.sfx.swing();
    if (hit) {
      this.sfx.clang();
      this.addTrauma(0.25);
      this.hitStop = Math.max(this.hitStop, 0.06);
    }
  }
  private damageEnemy(e: Enemy, dmg: number, ang: number, knock: number) {
    e.hp -= dmg;
    e.flash = 0.1;
    const kb = e.type === 'executioner' ? knock * 0.15 : knock;
    e.kx += Math.cos(ang) * kb;
    e.ky += Math.sin(ang) * kb;
    this.blood(e.x, e.y, ang, 5);
    this.sfx.hit();
    if (e.hp <= 0) this.killEnemy(e, ang);
  }
  private killEnemy(e: Enemy, ang: number) {
    if (e.dead) return;
    e.dead = true;
    const big = e.type === 'executioner';
    this.kills++;
    this.combo++;
    this.comboT = 2.6;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = this.mult();
    const pts = Math.round(e.score * mult);
    this.score += pts;
    this.scoreBump = 1;
    this.texts.push({ x: e.x, y: e.y - 20, text: `+${pts}`, life: 1, color: this.o > 0.5 ? '#ff6a4a' : '#f4ecd8', size: big ? 26 : 16 });
    if (this.combo >= 3 && this.combo % 3 === 0)
      this.texts.push({ x: e.x, y: e.y - 40, text: `COMBO x${mult.toFixed(1)}`, life: 1.2, color: '#ffb347', size: 14 });
    this.blood(e.x, e.y, ang, big ? 60 : 22, big ? 1.6 : 1.1);
    for (let i = 0; i < (big ? 18 : 6); i++) {
      const a = Math.random() * TAU;
      const s = rand(40, 200);
      this.part(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1), rand(3, 5), '#3a0806', 0, rand(5, 15), rand(80, 200), 3);
    }
    for (let i = 0; i < 6; i++) this.part(e.x, e.y, rand(-40, 40), rand(-40, 40), rand(0.5, 1), rand(10, 20), 'rgba(30,10,8,0.3)', 2);
    this.decal(e.x, e.y, e.r * (big ? 2.4 : 1.6), 'rgba(70,6,4,0.6)');
    this.hitStop = Math.max(this.hitStop, big ? 0.25 : 0.045);
    this.addTrauma(big ? 0.9 : 0.22);
    this.sfx.kill(big);
    // drops
    const r = Math.random();
    const ammoChance = this.p.ammo < 10 ? 0.5 : 0.32;
    if (big) {
      this.pickups.push({ x: e.x - 12, y: e.y, type: 0, t: 0 }, { x: e.x + 12, y: e.y, type: 1, t: 0 }, { x: e.x, y: e.y + 14, type: 0, t: 0 });
      this.showBanner('THE EXECUTIONER FALLS', `+${pts}`);
    } else if (r < ammoChance) this.pickups.push({ x: e.x, y: e.y, type: 0, t: 0 });
    else if (r < ammoChance + 0.1) this.pickups.push({ x: e.x, y: e.y, type: 1, t: 0 });
  }
  private mult() {
    return Math.min(5, 1 + Math.floor(this.combo / 3) * 0.5) * (this.o > 0.5 ? 2 : 1);
  }
  private hurtPlayer(dmg: number, fx: number, fy: number) {
    const p = this.p;
    if (p.inv > 0 || p.hp <= 0) return;
    p.hp -= dmg;
    p.inv = 0.7;
    const a = Math.atan2(p.y - fy, p.x - fx);
    p.vx += Math.cos(a) * 320;
    p.vy += Math.sin(a) * 320;
    this.hurtFlash = 1;
    this.addTrauma(0.55);
    this.hitStop = Math.max(this.hitStop, 0.07);
    this.blood(p.x, p.y, a, 12);
    this.decal(p.x, p.y, 8);
    this.sfx.hurt();
    this.combo = 0;
    this.comboT = 0;
    if (p.hp <= 0) {
      p.hp = 0;
      this.deathT = 1.6;
      this.blood(p.x, p.y, a, 40, 1.4);
      this.sfx.growl(true);
      this.addTrauma(1);
    }
  }

  // ---------- main loop ----------
  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 1 / 20) dt = 1 / 20;
    if (dt < 0) dt = 0;
    if (this.state !== 'paused') this.globalT += dt;
    if (this.state === 'playing' || (this.state === 'gameover' && this.deathT > 0)) this.update(dt);
    else if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'gameover') this.updateAmbient(dt * 0.3);
    this.render();
  };

  private updateMenu(dt: number) {
    const t = this.globalT * 0.08;
    this.camX = 1400 + Math.cos(t) * 700;
    this.camY = 1400 + Math.sin(t * 1.3) * 600;
    this.p.x = this.camX;
    this.p.y = this.camY;
    this.o += ((Math.sin(this.globalT * 0.15) > 0.85 ? 1 : 0) - this.o) * dt * 0.5;
    this.updateAmbient(dt);
  }

  private updateAmbient(dt: number) {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) pt.active = false;
    }
    for (const a of this.ash) {
      a.y += a.v * dt * 0.06;
      a.x += (Math.sin(this.globalT * 0.7 + a.ph) * 0.02 - 0.015) * dt * a.v;
      if (a.y > 1.05) {
        a.y = -0.05;
        a.x = Math.random();
      }
      if (a.x < -0.05) a.x = 1.05;
      if (a.x > 1.05) a.x = -0.05;
    }
  }

  private update(rdt: number) {
    const p = this.p;
    // death slow-mo
    let scale = 1;
    if (this.deathT > 0) {
      this.deathT -= rdt;
      scale = 0.25;
      if (this.deathT <= 0) {
        this.sfx.silence();
        this.setState('gameover');
        this.cb.onGameOver({ score: Math.floor(this.score), time: this.time, kills: this.kills, fragments: this.frags, maxCombo: this.maxCombo });
        return;
      }
    }
    this.trauma = Math.max(0, this.trauma - rdt * 1.6);
    this.hurtFlash = Math.max(0, this.hurtFlash - rdt * 2.5);
    this.bannerT = Math.max(0, this.bannerT - rdt);
    this.scoreBump = Math.max(0, this.scoreBump - rdt * 4);
    this.kickX *= Math.exp(-rdt * 14);
    this.kickY *= Math.exp(-rdt * 14);
    if (this.hitStop > 0) {
      this.hitStop -= rdt;
      return;
    }
    const dt = rdt * scale;
    this.updateAmbient(dt);
    if (p.hp > 0) this.time += dt;

    // phase cycle
    this.phaseT += dt;
    if (this.phase === 0) {
      if (!this.sirenPlayed && this.phaseT > this.phaseLen - 5) {
        this.sirenPlayed = true;
        this.sfx.siren();
        this.showBanner('THE SIREN WAILS', 'the otherworld is coming');
      }
      if (this.phaseT > this.phaseLen) {
        this.phase = 1;
        this.phaseT = 0;
        this.phaseLen = 24;
        this.phaseCount++;
        this.execSpawned = false;
        this.showBanner('OTHERWORLD', 'score x2 — stay in the light');
      }
    } else {
      if (!this.execSpawned && this.phaseT > 3) {
        this.execSpawned = true;
        const s = this.findSpawn(380, 520);
        if (s) {
          this.spawnEnemy('executioner', s.x, s.y);
          this.sfx.growl(true);
        }
      }
      if (this.phaseT > this.phaseLen) {
        this.phase = 0;
        this.phaseT = 0;
        this.phaseLen = 38;
        this.sirenPlayed = false;
        this.showBanner('THE FOG RETURNS', 'survived the otherworld  +1000');
        this.score += 1000;
        this.scoreBump = 1;
      }
    }
    const oTarget = this.phase === 1 ? 1 : 0;
    this.o += (oTarget - this.o) * Math.min(1, dt * 1.2);
    this.sfx.setOtherworld(this.o);

    // combo decay
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (p.hp > 0) this.score += dt * 5 * (this.o > 0.5 ? 2 : 1);

    // ---- player ----
    if (p.hp > 0) {
      const mv = this.moveInput();
      p.dodgeCd -= dt;
      p.inv -= dt;
      p.fireCd -= dt;
      p.swingT = Math.max(0, p.swingT - dt);
      p.recoil = Math.max(0, p.recoil - dt * 8);
      if (p.dodgeT > 0) {
        p.dodgeT -= dt;
        p.vx = p.dx * 540;
        p.vy = p.dy * 540;
        this.after.push({ x: p.x, y: p.y, a: p.aim, life: 0.25 });
      } else {
        const sp = 175;
        const k = Math.min(1, dt * 16);
        p.vx += (mv.x * sp - p.vx) * k;
        p.vy += (mv.y * sp - p.vy) * k;
      }
      const spd = Math.hypot(p.vx, p.vy);
      p.walk += spd * dt * 0.08;
      if (mv.x || mv.y) p.moveAng = Math.atan2(mv.y, mv.x);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.collideRects(p, 12);

      // aim
      let firing = false;
      if (this.isTouch) {
        if (this.tAim.id !== -1) {
          const dx = this.tAim.x - this.tAim.ox;
          const dy = this.tAim.y - this.tAim.oy;
          if (Math.hypot(dx, dy) > 6) p.aim = Math.atan2(dy, dx);
          firing = true;
        } else if (mv.x || mv.y) {
          p.aim = p.moveAng;
        }
      } else {
        const mouseRecent = this.mouse.last > this.globalT - 3 || this.mouse.down;
        if (mouseRecent) {
          const wx = (this.mouse.x - this.w / 2) / this.zoom + this.camX;
          const wy = (this.mouse.y - this.h / 2) / this.zoom + this.camY;
          p.aim = Math.atan2(wy - p.y, wx - p.x);
        } else if (mv.x || mv.y) {
          p.aim += angDiff(p.moveAng, p.aim) * Math.min(1, dt * 14);
        }
        firing = this.mouse.down || this.kbFire;
      }
      if (firing && p.fireCd <= 0 && p.dodgeT <= 0) {
        if (p.ammo > 0) this.shoot();
        else this.swing();
      }
    }

    // afterimages
    for (let i = this.after.length - 1; i >= 0; i--) {
      this.after[i].life -= dt;
      if (this.after[i].life <= 0) this.after.splice(i, 1);
    }

    // flow field
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.3;
      this.computeFlow();
    }

    // ---- spawning ----
    this.spawnT -= dt;
    const maxE = Math.min(46, 9 + this.time * 0.12 + (this.o > 0.5 ? 8 : 0));
    if (this.spawnT <= 0 && p.hp > 0) {
      const interval = Math.max(0.5, 2.3 - this.time * 0.009) * (this.o > 0.5 ? 0.55 : 1);
      this.spawnT = interval;
      if (this.enemies.length < maxE) {
        const s = this.findSpawn(420, 680);
        if (s) {
          const r = Math.random();
          if (this.o > 0.5 && r < 0.4) {
            for (let i = 0; i < 3; i++) this.spawnEnemy('crawler', s.x + rand(-20, 20), s.y + rand(-20, 20));
          } else if (this.time > 18 && r < 0.4 + Math.min(0.2, this.time / 600)) this.spawnEnemy('nurse', s.x, s.y);
          else this.spawnEnemy('lurker', s.x, s.y);
          if (Math.random() < 0.3) this.sfx.growl();
        }
      }
    }

    // ---- enemies ----
    let nearest = 9999;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.atkCd -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      nearest = Math.min(nearest, dist - e.r);
      if (e.type === 'executioner') {
        if (this.phase === 0) {
          e.fade -= dt * 0.6;
          if (e.fade <= 0) {
            e.dead = true;
            continue;
          }
        } else e.fade = Math.min(1, e.fade + dt * 0.8);
      }
      // steering
      let tx = p.x;
      let ty = p.y;
      if (dist > 110) {
        const c = this.cellOf(e.x, e.y);
        const cx = c % FN;
        const cy = (c / FN) | 0;
        let best = this.flow[c] >= 0 ? this.flow[c] : 99999;
        let bi = -1;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= FN || ny >= FN) continue;
            const ni = ny * FN + nx;
            const f = this.flow[ni];
            if (f < 0) continue;
            if (ox && oy && (this.blocked[cy * FN + nx] || this.blocked[ny * FN + cx])) continue;
            if (f < best) {
              best = f;
              bi = ni;
            }
          }
        if (bi >= 0) {
          tx = (bi % FN) * FG + FG / 2;
          ty = ((bi / FN) | 0) * FG + FG / 2;
        }
      }
      let ddx = tx - e.x;
      let ddy = ty - e.y;
      const dl = Math.hypot(ddx, ddy) || 1;
      ddx /= dl;
      ddy /= dl;
      let sm = 1;
      if (e.type === 'lurker') sm = 0.65 + 0.35 * Math.sin(e.t * 3 + e.seed);
      else if (e.type === 'nurse') sm = 0.25 + 1.3 * Math.max(0, Math.sin(e.t * 5 + e.seed));
      else if (e.type === 'crawler') {
        const perp = Math.sin(e.t * 9 + e.seed) * 0.6;
        const px = -ddy * perp;
        const py = ddx * perp;
        ddx += px;
        ddy += py;
      } else if (e.type === 'executioner') {
        if (e.state === 1) {
          sm = 0;
          e.timer -= dt;
          if (e.timer <= 0) {
            // slam
            e.state = 2;
            e.timer = 1.0;
            const sx = e.x + Math.cos(e.ang) * 50;
            const sy = e.y + Math.sin(e.ang) * 50;
            this.addTrauma(0.7);
            this.sfx.slam();
            for (let i = 0; i < 24; i++) {
              const a = Math.random() * TAU;
              const s = rand(80, 300);
              this.part(sx, sy, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), rand(1, 2.5), '#ffcf7a', 1, 0, 0, 6);
            }
            for (let i = 0; i < 10; i++) this.part(sx, sy, rand(-80, 80), rand(-80, 80), rand(0.6, 1.2), rand(14, 26), 'rgba(90,70,60,0.35)', 2);
            this.decal(sx, sy, 22, 'rgba(20,10,8,0.5)');
            if (dist < 125 && Math.abs(angDiff(Math.atan2(dy, dx), e.ang)) < 0.95 && p.dodgeT <= 0) this.hurtPlayer(e.dmg, e.x, e.y);
          }
        } else if (e.state === 2) {
          sm = 0.1;
          e.timer -= dt;
          if (e.timer <= 0) e.state = 0;
        } else if (dist < 100 && e.fade > 0.8) {
          e.state = 1;
          e.timer = 0.75;
          e.ang = Math.atan2(dy, dx);
          this.sfx.growl(true);
        }
      }
      const spd = e.speed * sm;
      e.vx += (ddx * spd - e.vx) * Math.min(1, dt * 8);
      e.vy += (ddy * spd - e.vy) * Math.min(1, dt * 8);
      if (e.type !== 'executioner' || e.state === 0) {
        const ta = Math.atan2(dy, dx);
        e.ang += angDiff(ta, e.ang) * Math.min(1, dt * 6);
      }
      e.kx *= Math.exp(-dt * 9);
      e.ky *= Math.exp(-dt * 9);
      e.x += (e.vx + e.kx) * dt;
      e.y += (e.vy + e.ky) * dt;
      // contact damage
      if (e.type !== 'executioner' && dist < e.r + 12 + 2 && e.atkCd <= 0 && p.hp > 0) {
        if (p.inv <= 0) {
          this.hurtPlayer(e.dmg, e.x, e.y);
          e.atkCd = 1;
          e.kx -= (dx / dist) * 200;
          e.ky -= (dy / dist) * 200;
        }
      }
    }
    // separation
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.dead) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          const wa = a.type === 'executioner' ? 0.1 : 1;
          const wb = b.type === 'executioner' ? 0.1 : 1;
          a.x -= nx * push * wa;
          a.y -= ny * push * wa;
          b.x += nx * push * wb;
          b.y += ny * push * wb;
        }
      }
    }
    for (const e of es) if (!e.dead) this.collideRects(e, e.r);
    // cull
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (e.dead) {
        es.splice(i, 1);
        continue;
      }
      if (Math.hypot(e.x - p.x, e.y - p.y) > 1400 && e.type !== 'executioner') es.splice(i, 1);
    }

    // ---- bullets ----
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let dead = false;
      for (let s = 0; s < 3 && !dead; s++) {
        b.x += (b.vx * dt) / 3;
        b.y += (b.vy * dt) / 3;
        if (this.pointInBuilding(b.x, b.y)) {
          dead = true;
          this.sfx.ric();
          for (let k = 0; k < 6; k++) {
            const a = Math.atan2(-b.vy, -b.vx) + rand(-1, 1);
            const sp = rand(100, 300);
            this.part(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.3), 1.5, '#ffe2a0', 1, 0, 0, 6);
          }
          this.part(b.x, b.y, 0, 0, 0.4, 6, 'rgba(160,150,140,0.3)', 2);
          break;
        }
        for (const e of es) {
          if (e.dead || e.fade < 0.5) continue;
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.r + 4) * (e.r + 4)) {
            this.damageEnemy(e, 1, Math.atan2(b.vy, b.vx), 160);
            dead = true;
            break;
          }
        }
      }
      b.life -= dt;
      if (dead || b.life <= 0) this.bullets.splice(i, 1);
    }

    // ---- pickups ----
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && p.hp > 0) {
        k.x += (dx / d) * 260 * dt;
        k.y += (dy / d) * 260 * dt;
      }
      if (d < 18 && p.hp > 0) {
        if (k.type === 0) {
          const n = 6 + ((Math.random() * 4) | 0);
          p.ammo += n;
          this.texts.push({ x: k.x, y: k.y - 14, text: `+${n} BULLETS`, life: 1, color: '#e6c77a', size: 13 });
        } else {
          p.hp = Math.min(100, p.hp + 25);
          this.texts.push({ x: k.x, y: k.y - 14, text: '+HEALTH', life: 1, color: '#8fd18a', size: 13 });
        }
        this.sfx.pickup();
        for (let j = 0; j < 10; j++) {
          const a = Math.random() * TAU;
          this.part(k.x, k.y, Math.cos(a) * 90, Math.sin(a) * 90, 0.4, 3, k.type === 0 ? 'rgba(255,220,140,1)' : 'rgba(150,255,150,1)', 4);
        }
        this.pickups.splice(i, 1);
      } else if (k.t > 16) this.pickups.splice(i, 1);
    }

    // ---- fragment ----
    const f = this.frag;
    f.t += dt;
    if (f.active) {
      if (Math.random() < dt * 8) {
        const a = Math.random() * TAU;
        this.part(f.x + Math.cos(a) * 10, f.y + Math.sin(a) * 10, 0, -20, 0.8, 5, 'rgba(255,90,70,1)', 4);
      }
      if (Math.hypot(p.x - f.x, p.y - f.y) < 24 && p.hp > 0) {
        f.active = false;
        f.t = 0;
        this.frags++;
        const pts = Math.round(500 * this.mult());
        this.score += pts;
        this.scoreBump = 1;
        p.hp = Math.min(100, p.hp + 10);
        p.ammo += 5;
        this.texts.push({ x: f.x, y: f.y - 20, text: `MEMORY +${pts}`, life: 1.5, color: '#ff8a70', size: 18 });
        this.sfx.fragment();
        this.addTrauma(0.2);
        for (let j = 0; j < 30; j++) {
          const a = Math.random() * TAU;
          const s = rand(60, 220);
          this.part(f.x, f.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1), rand(3, 6), 'rgba(255,120,90,1)', 4);
        }
        const lines = ['"There was a hole here..."', '"In my restless dreams..."', '"Cheryl...?"', '"Mary, is that you?"', '"This town... is wrong."'];
        this.showBanner(`MEMORY ${this.frags}`, lines[(this.frags - 1) % lines.length]);
      }
    } else if (f.t > 1.5) this.spawnFragment(380, 800);

    // ---- particles ----
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        continue;
      }
      const dr = Math.exp(-pt.drag * dt);
      pt.vx *= dr;
      pt.vy *= dr;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 0 || pt.kind === 3) {
        pt.vz -= 520 * dt;
        pt.z += pt.vz * dt;
        if (pt.z <= 0) {
          pt.z = 0;
          if (pt.kind === 0) {
            if (Math.random() < 0.35) this.decal(pt.x, pt.y, pt.size * rand(0.8, 1.6));
            pt.active = false;
          } else {
            pt.vz = -pt.vz * 0.4;
            pt.vx *= 0.6;
            pt.vy *= 0.6;
          }
        }
      } else if (pt.kind === 2) pt.size += dt * 14;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= dt * 30;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    // ---- camera ----
    let lx = 0;
    let ly = 0;
    if (!this.isTouch && this.mouse.last > this.globalT - 3) {
      lx = clamp((this.mouse.x - this.w / 2) / this.zoom, -300, 300) * 0.22;
      ly = clamp((this.mouse.y - this.h / 2) / this.zoom, -300, 300) * 0.22;
    } else {
      lx = Math.cos(p.aim) * 40;
      ly = Math.sin(p.aim) * 40;
    }
    const k = Math.min(1, rdt * 7);
    this.camX += (p.x + lx - this.camX) * k;
    this.camY += (p.y + ly - this.camY) * k;

    // ---- radio ----
    const lvl = clamp(1 - (nearest - 60) / 420, 0, 1);
    this.staticLvl += (lvl - this.staticLvl) * Math.min(1, rdt * 6);
    if (p.hp > 0) this.sfx.setStatic(this.staticLvl);
    this.flashT = Math.max(0, this.flashT - rdt);
  }

  // ---------- rendering ----------
  private render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const o = this.o;
    const z = this.zoom;
    const tr = this.trauma * this.trauma;
    const gt = this.globalT;
    this.shakeX = (Math.sin(gt * 71.3) + Math.sin(gt * 43.1) * 0.5) * 18 * tr + this.kickX;
    this.shakeY = (Math.cos(gt * 67.7) + Math.sin(gt * 51.9) * 0.5) * 18 * tr + this.kickY;
    this.shakeR = Math.sin(gt * 37.3) * 0.03 * tr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = mix(PAL.ground, o);
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + this.shakeX, h / 2 + this.shakeY);
    ctx.rotate(this.shakeR);
    ctx.scale(z, z);
    ctx.translate(-this.camX, -this.camY);

    const hw = w / 2 / z + 80;
    const hh = h / 2 / z + 80;
    const x0 = this.camX - hw;
    const x1 = this.camX + hw;
    const y0 = this.camY - hh;
    const y1 = this.camY + hh;
    const vis = (x: number, y: number, ww: number, hh2: number) => x + ww > x0 && x < x1 && y + hh2 > y0 && y < y1;

    // out-of-world abyss
    ctx.fillStyle = o > 0.5 ? '#050101' : '#2a2826';
    if (x0 < 0) ctx.fillRect(x0, y0, -x0, y1 - y0);
    if (y0 < 0) ctx.fillRect(x0, y0, x1 - x0, -y0);
    if (x1 > WORLD) ctx.fillRect(WORLD, y0, x1 - WORLD, y1 - y0);
    if (y1 > WORLD) ctx.fillRect(x0, WORLD, x1 - x0, y1 - WORLD);

    // otherworld grating
    if (o > 0.02) {
      ctx.strokeStyle = `rgba(10,3,2,${0.55 * o})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const g = 28;
      const sx = Math.floor(Math.max(0, x0) / g) * g;
      const sy = Math.floor(Math.max(0, y0) / g) * g;
      for (let x = sx; x < Math.min(WORLD, x1); x += g) {
        ctx.moveTo(x, Math.max(0, y0));
        ctx.lineTo(x, Math.min(WORLD, y1));
      }
      for (let y = sy; y < Math.min(WORLD, y1); y += g) {
        ctx.moveTo(Math.max(0, x0), y);
        ctx.lineTo(Math.min(WORLD, x1), y);
      }
      ctx.stroke();
    }

    // sidewalks
    ctx.fillStyle = mix(PAL.walk, o);
    for (const b of this.buildings) {
      if (b.kind !== 0 || !vis(b.x - 16, b.y - 16, b.w + 32, b.h + 32)) continue;
      ctx.fillRect(b.x - 14, b.y - 14, b.w + 28, b.h + 28);
    }
    // road markings
    ctx.strokeStyle = mix(PAL.line, o, 0.7);
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 26]);
    ctx.beginPath();
    for (let i = 1; i < WORLD / CELL; i++) {
      const c = i * CELL;
      if (c > x0 && c < x1) {
        ctx.moveTo(c, Math.max(0, y0));
        ctx.lineTo(c, Math.min(WORLD, y1));
      }
      if (c > y0 && c < y1) {
        ctx.moveTo(Math.max(0, x0), c);
        ctx.lineTo(Math.min(WORLD, x1), c);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // cracks
    ctx.strokeStyle = mix(PAL.crack, o);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const c of this.cracks) {
      if (!vis(c.x - 60, c.y - 60, 120, 120)) continue;
      ctx.moveTo(c.x + c.pts[0], c.y + c.pts[1]);
      for (let i = 2; i < c.pts.length; i += 2) ctx.lineTo(c.x + c.pts[i], c.y + c.pts[i + 1]);
    }
    ctx.stroke();
    // decals
    for (const d of this.decals) {
      if (!vis(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2)) continue;
      ctx.fillStyle = d.c;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }

    // buildings
    const bc = mix(PAL.bld, o);
    const rc = mix(PAL.roof, o);
    const ec = mix(PAL.edge, o);
    for (const b of this.buildings) {
      if (!vis(b.x - 10, b.y - 10, b.w + 20, b.h + 20)) continue;
      if (b.kind === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
        ctx.fillStyle = bc;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = rc;
        ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
        ctx.strokeStyle = ec;
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
        for (let i = 0; i < b.det.length; i += 4) {
          const dw = b.det[i + 2];
          const dh = b.det[i + 3];
          const dx = b.x + 14 + b.det[i] * (b.w - 28 - dw);
          const dy = b.y + 14 + b.det[i + 1] * (b.h - 28 - dh);
          ctx.fillStyle = bc;
          ctx.fillRect(dx, dy, dw, dh);
          ctx.strokeStyle = ec;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(dx, dy, dw, dh);
        }
        if (o > 0.05) {
          // rust streaks
          ctx.fillStyle = `rgba(110,40,18,${0.35 * o})`;
          ctx.fillRect(b.x + b.w * (0.2 + b.c * 0.5), b.y, 6, b.h * 0.6);
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(b.x + 4, b.y + 6, b.w, b.h);
        const hue = b.c;
        ctx.fillStyle = o > 0.5 ? '#2a120c' : hue < 0.33 ? '#5a4a40' : hue < 0.66 ? '#4a5058' : '#6a6258';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(20,20,24,0.8)';
        if (b.w > b.h) {
          ctx.fillRect(b.x + b.w * 0.22, b.y + 4, b.w * 0.18, b.h - 8);
          ctx.fillRect(b.x + b.w * 0.62, b.y + 4, b.w * 0.14, b.h - 8);
        } else {
          ctx.fillRect(b.x + 4, b.y + b.h * 0.22, b.w - 8, b.h * 0.18);
          ctx.fillRect(b.x + 4, b.y + b.h * 0.62, b.w - 8, b.h * 0.14);
        }
        ctx.strokeStyle = ec;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
    }

    if (this.state !== 'menu') this.renderEntities(vis);

    ctx.restore();

    // ---- atmosphere overlays (screen space) ----
    const psx = (this.p.x - this.camX) * z + w / 2 + this.shakeX;
    const psy = (this.p.y - this.camY) * z + h / 2 + this.shakeY;
    // fog
    if (o < 0.98) {
      const fa = 1 - o;
      const inner = (this.state === 'menu' ? 160 : 90) * z;
      const outer = (this.state === 'menu' ? 520 : 360) * z;
      const gr = ctx.createRadialGradient(psx, psy, inner, psx, psy, outer);
      gr.addColorStop(0, `rgba(${FOG[0]},${FOG[1]},${FOG[2]},0)`);
      gr.addColorStop(0.55, `rgba(${FOG[0]},${FOG[1]},${FOG[2]},${0.75 * fa})`);
      gr.addColorStop(1, `rgba(${FOG[0]},${FOG[1]},${FOG[2]},${0.97 * fa})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      // drifting fog banks
      ctx.globalAlpha = 0.55 * fa;
      const bs = 520 * z;
      for (let i = 0; i < 7; i++) {
        const px = ((i * 397 + gt * (12 + i * 3) - this.camX * z * 0.9) % (w + bs * 2) + (w + bs * 2)) % (w + bs * 2) - bs;
        const py = ((i * 241 + Math.sin(gt * 0.1 + i) * 60 - this.camY * z * 0.9) % (h + bs * 2) + (h + bs * 2)) % (h + bs * 2) - bs;
        ctx.drawImage(this.fogBlob, px, py, bs * 1.3, bs);
      }
      ctx.globalAlpha = 1;
    }
    // darkness + flashlight
    if (o > 0.02) {
      const l = this.lctx;
      const lw = this.light.width;
      const lh = this.light.height;
      l.globalCompositeOperation = 'source-over';
      l.fillStyle = 'rgb(4,1,1)';
      l.fillRect(0, 0, lw, lh);
      l.globalCompositeOperation = 'destination-out';
      const cx = psx / 2;
      const cy = psy / 2;
      const flick = this.state === 'playing' && Math.random() < 0.02 ? 0.5 : 1;
      const rr = (this.state === 'menu' ? 200 : 70) * z * 0.5;
      let g = l.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      if (this.state !== 'menu') {
        const len = 460 * z * 0.5;
        const a = this.p.aim;
        const spread = 0.42;
        l.save();
        l.beginPath();
        l.moveTo(cx, cy);
        l.arc(cx, cy, len, a - spread, a + spread);
        l.closePath();
        g = l.createRadialGradient(cx, cy, 0, cx, cy, len);
        g.addColorStop(0, `rgba(0,0,0,${0.97 * flick})`);
        g.addColorStop(0.6, `rgba(0,0,0,${0.8 * flick})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = g;
        l.fill();
        l.restore();
        if (this.flashT > 0) {
          const fr = 260 * z * 0.5;
          g = l.createRadialGradient(cx, cy, 0, cx, cy, fr);
          g.addColorStop(0, 'rgba(0,0,0,0.9)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          l.fillStyle = g;
          l.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
        }
        if (this.frag.active) {
          const fx = ((this.frag.x - this.camX) * z + w / 2) / 2;
          const fy = ((this.frag.y - this.camY) * z + h / 2) / 2;
          const fr = 40 * z;
          g = l.createRadialGradient(fx, fy, 0, fx, fy, fr);
          g.addColorStop(0, 'rgba(0,0,0,0.8)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          l.fillStyle = g;
          l.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
        }
      }
      ctx.globalAlpha = Math.min(1, o * 1.02) * (this.state === 'menu' ? 0.85 : 0.97);
      ctx.drawImage(this.light, 0, 0, w, h);
      ctx.globalAlpha = 1;
      // red tint
      ctx.fillStyle = `rgba(90,10,5,${0.12 * o})`;
      ctx.fillRect(0, 0, w, h);
    }

    // post-overlay world elements: glows + fragment compass + texts
    ctx.save();
    ctx.translate(w / 2 + this.shakeX, h / 2 + this.shakeY);
    ctx.rotate(this.shakeR);
    ctx.scale(z, z);
    ctx.translate(-this.camX, -this.camY);
    this.renderPost(vis);
    ctx.restore();

    // ash / embers
    for (const a of this.ash) {
      const ax = a.x * w;
      const ay = a.y * h;
      if (o > 0.5) {
        ctx.fillStyle = `rgba(255,${90 + ((a.ph * 20) | 0)},40,${0.5 + 0.4 * Math.sin(gt * 4 + a.ph)})`;
        ctx.fillRect(ax, h - ay, a.s, a.s);
      } else {
        ctx.fillStyle = `rgba(230,228,222,${0.55 * (1 - o)})`;
        ctx.fillRect(ax, ay, a.s * 1.4, a.s);
      }
    }

    // low health pulse + hurt flash
    if (this.state !== 'menu') {
      const hp = this.p.hp;
      if (hp < 35 && hp > 0) {
        const pulse = 0.25 + 0.2 * Math.sin(gt * (6 + (35 - hp) * 0.2));
        ctx.fillStyle = `rgba(140,0,0,${pulse * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }
      if (this.hurtFlash > 0) {
        ctx.fillStyle = `rgba(160,10,5,${this.hurtFlash * 0.4})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.drawImage(this.vignette, 0, 0, w, h);
    // film grain
    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.5 + this.staticLvl * 0.5;
      ctx.translate((Math.random() * 128) | 0, (Math.random() * 128) | 0);
      ctx.fillStyle = this.grain;
      ctx.fillRect(-128, -128, w + 128, h + 128);
      ctx.restore();
    }
    // static distortion lines
    if (this.staticLvl > 0.3 && this.state === 'playing') {
      const n = Math.floor(this.staticLvl * 4);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06 * this.staticLvl})`;
        ctx.fillRect(0, Math.random() * h, w, rand(1, 4));
      }
    }

    if (this.state === 'playing' || this.state === 'paused' || (this.state === 'gameover' && this.deathT > 0)) this.renderHUD();
  }

  private renderEntities(vis: (x: number, y: number, w: number, h: number) => boolean) {
    const ctx = this.ctx;
    const p = this.p;
    const gt = this.globalT;

    // pickups
    for (const k of this.pickups) {
      if (!vis(k.x - 20, k.y - 20, 40, 40)) continue;
      if (k.t > 13 && Math.sin(k.t * 20) > 0) continue;
      const bob = Math.sin(k.t * 4) * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(k.x, k.y + 6, 8, 3, 0, 0, TAU);
      ctx.fill();
      if (k.type === 0) {
        ctx.fillStyle = '#6b5a2a';
        ctx.fillRect(k.x - 8, k.y - 6 + bob, 16, 11);
        ctx.fillStyle = '#d8b860';
        ctx.fillRect(k.x - 8, k.y - 6 + bob, 16, 3);
        ctx.fillStyle = '#2a2010';
        ctx.fillRect(k.x - 4, k.y - 1 + bob, 8, 2);
      } else {
        ctx.fillStyle = '#e8e2d4';
        ctx.fillRect(k.x - 5, k.y - 9 + bob, 10, 16);
        ctx.fillStyle = '#b3261e';
        ctx.fillRect(k.x - 1.5, k.y - 5 + bob, 3, 9);
        ctx.fillRect(k.x - 4.5, k.y - 2 + bob, 9, 3);
      }
    }

    // fragment
    const f = this.frag;
    if (f.active) {
      const pulse = 1 + Math.sin(f.t * 5) * 0.15;
      ctx.save();
      ctx.translate(f.x, f.y + Math.sin(f.t * 2.5) * 3);
      ctx.rotate(Math.sin(f.t * 1.5) * 0.2);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#e9e0cc';
      ctx.fillRect(-7, -9, 14, 18);
      ctx.strokeStyle = '#8a1a12';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.moveTo(-4, -5 + i * 4);
        ctx.lineTo(4, -5 + i * 4);
      }
      ctx.stroke();
      ctx.restore();
    }

    // enemy shadows + bodies
    for (const e of this.enemies) {
      if (!vis(e.x - 60, e.y - 60, 120, 120)) continue;
      this.drawEnemy(e, gt);
    }

    // bullets
    ctx.strokeStyle = '#ffe9b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const b of this.bullets) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
    }
    ctx.stroke();

    // afterimages
    for (const a of this.after) {
      ctx.globalAlpha = a.life * 1.6;
      ctx.fillStyle = this.o > 0.5 ? '#6a1a10' : '#9aa0a8';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 11, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // player
    if (p.hp > 0 || this.deathT > 0) this.drawPlayer(gt);

    // particles (non-additive)
    for (const pt of this.particles) {
      if (!pt.active || pt.kind === 1 || pt.kind === 4) continue;
      if (!vis(pt.x - 30, pt.y - 30, 60, 60)) continue;
      const t = pt.life / pt.max;
      if (pt.kind === 2) {
        ctx.globalAlpha = t;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = pt.color;
        const s = pt.size;
        ctx.fillRect(pt.x - s / 2, pt.y - pt.z - s / 2, s, s);
      }
    }
  }

  private renderPost(vis: (x: number, y: number, w: number, h: number) => boolean) {
    const ctx = this.ctx;
    const p = this.p;
    const gt = this.globalT;
    if (this.state === 'menu') return;
    // additive particles
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of this.particles) {
      if (!pt.active || (pt.kind !== 1 && pt.kind !== 4)) continue;
      if (!vis(pt.x - 30, pt.y - 30, 60, 60)) continue;
      const t = pt.life / pt.max;
      if (pt.kind === 1) {
        ctx.strokeStyle = pt.color;
        ctx.globalAlpha = t;
        ctx.lineWidth = pt.size;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - pt.vx * 0.03, pt.y - pt.vy * 0.03);
        ctx.stroke();
      } else {
        ctx.globalAlpha = t;
        const s = pt.size * 2;
        ctx.drawImage(this.glow, pt.x - s, pt.y - s, s * 2, s * 2);
      }
    }
    // fragment glow
    if (this.frag.active) {
      const s = 34 + Math.sin(this.frag.t * 5) * 6;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glow, this.frag.x - s, this.frag.y - s, s * 2, s * 2);
    }
    // enemy eyes in darkness
    if (this.o > 0.3) {
      ctx.globalAlpha = this.o * 0.8;
      for (const e of this.enemies) {
        if (e.type === 'lurker' || !vis(e.x - 20, e.y - 20, 40, 40)) continue;
        const ex = e.x + Math.cos(e.ang) * e.r * 0.6;
        const ey = e.y + Math.sin(e.ang) * e.r * 0.6;
        const s = e.type === 'executioner' ? 10 : 5;
        ctx.drawImage(this.glow, ex - s, ey - s, s * 2, s * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // executioner telegraph (visible through fog)
    for (const e of this.enemies) {
      if (e.type !== 'executioner' || e.state !== 1) continue;
      const prog = 1 - e.timer / 0.75;
      ctx.fillStyle = `rgba(200,20,10,${0.15 + prog * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, 125, e.ang - 0.95, e.ang + 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,60,40,${0.4 + prog * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 125 * prog, e.ang - 0.95, e.ang + 0.95);
      ctx.stroke();
    }

    // health bar for executioner
    for (const e of this.enemies) {
      if (e.type !== 'executioner') continue;
      ctx.globalAlpha = e.fade;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - 30, e.y - 46, 60, 6);
      ctx.fillStyle = '#c0281c';
      ctx.fillRect(e.x - 29, e.y - 45, 58 * (e.hp / e.maxHp), 4);
      ctx.globalAlpha = 1;
    }

    // fragment compass
    if (this.frag.active && p.hp > 0) {
      const dx = this.frag.x - p.x;
      const dy = this.frag.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 90) {
        const a = Math.atan2(dy, dx);
        const r = 44;
        const ax = p.x + Math.cos(a) * r;
        const ay = p.y + Math.sin(a) * r;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.globalAlpha = 0.55 + Math.sin(gt * 5) * 0.25;
        ctx.fillStyle = '#ff5a40';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // floating texts
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = Math.min(1, t.life * 2);
      const sc = 1 + Math.max(0, t.life - (t.life > 1 ? 1.2 : 0.8)) * 2;
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(t.size * sc)}px "Special Elite", monospace`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(t.text, t.x + 1.5, t.y + 1.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemy(e: Enemy, gt: number) {
    const ctx = this.ctx;
    const white = e.flash > 0;
    ctx.save();
    ctx.globalAlpha = e.fade;
    ctx.translate(e.x, e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(3, 5, e.r * 1.1, e.r * 0.7, 0, 0, TAU);
    ctx.fill();
    if (e.type === 'nurse' && Math.sin(e.t * 23 + e.seed) > 0.7) ctx.translate(rand(-1.5, 1.5), rand(-1.5, 1.5));
    ctx.rotate(e.ang);
    if (e.type === 'lurker') {
      const wob = Math.sin(e.t * 7 + e.seed) * 0.12;
      ctx.scale(1 + wob, 1 - wob);
      ctx.fillStyle = white ? '#fff' : '#a8927c';
      ctx.beginPath();
      ctx.ellipse(-2, 0, 16, 10, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = white ? '#fff' : '#5e4a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.lineTo(-10, 8);
      ctx.moveTo(-3, -9.5);
      ctx.lineTo(-3, 9.5);
      ctx.moveTo(4, -8.5);
      ctx.lineTo(4, 8.5);
      ctx.stroke();
      ctx.fillStyle = white ? '#fff' : '#8a3a2a';
      ctx.beginPath();
      ctx.ellipse(12, 0, 5, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a0806';
      ctx.fillRect(14, -2.5, 3, 5);
    } else if (e.type === 'nurse') {
      ctx.fillStyle = white ? '#fff' : '#c9c0ad';
      ctx.beginPath();
      ctx.ellipse(-2, 0, 11, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#7a1a14';
      ctx.beginPath();
      ctx.arc(-4, 4, 4, 0, TAU);
      ctx.arc(1, -6, 3, 0, TAU);
      ctx.fill();
      // arm with pipe
      ctx.strokeStyle = white ? '#fff' : '#b8a890';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 9);
      ctx.lineTo(14, 12 + Math.sin(e.t * 6) * 3);
      ctx.stroke();
      ctx.strokeStyle = '#3a3634';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(26, 8);
      ctx.stroke();
      // head
      const tw = Math.sin(e.t * 17 + e.seed) > 0.6 ? 0.5 : 0;
      ctx.rotate(tw);
      ctx.fillStyle = white ? '#fff' : '#d6ccb8';
      ctx.beginPath();
      ctx.arc(6, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8a7c68';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(2, -5);
      ctx.lineTo(10, 5);
      ctx.moveTo(4, -6);
      ctx.lineTo(12, 3);
      ctx.stroke();
    } else if (e.type === 'crawler') {
      ctx.strokeStyle = white ? '#fff' : '#2a0a06';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const lx = -4 + i * 4;
        const lw = Math.sin(e.t * 20 + i * 2) * 3;
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx + lw, -12);
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - lw, 12);
      }
      ctx.stroke();
      ctx.fillStyle = white ? '#fff' : '#5a1810';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c03020';
      ctx.fillRect(6, -2, 3, 4);
    } else {
      // executioner
      const raise = e.state === 1 ? 1 - e.timer / 0.75 : 0;
      const slamA = e.state === 2 ? Math.max(0, e.timer - 0.7) * 3 : 0;
      // great knife
      ctx.save();
      const knifeA = e.state === 1 ? -1.9 * raise : e.state === 2 ? -slamA * 2 : 0.9;
      ctx.rotate(knifeA);
      ctx.fillStyle = white ? '#fff' : '#5a5250';
      ctx.fillRect(10, 18, 70, 10);
      ctx.fillStyle = white ? '#fff' : '#6e2a1a';
      ctx.fillRect(40, 20, 30, 4);
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(0, 19, 14, 8);
      ctx.restore();
      // body
      ctx.fillStyle = white ? '#fff' : '#3c2c24';
      ctx.beginPath();
      ctx.ellipse(-4, 0, 18, 26, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = white ? '#fff' : '#6e5a4a';
      ctx.beginPath();
      ctx.arc(-4, -22, 6, 0, TAU);
      ctx.arc(-4, 22, 6, 0, TAU);
      ctx.fill();
      // pyramid helmet
      ctx.fillStyle = white ? '#fff' : '#7a4a2a';
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(-10, -16);
      ctx.lineTo(-10, 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = white ? '#fff' : '#4a2814';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();
      ctx.fillStyle = `rgba(160,70,30,${0.4 + Math.sin(gt * 3) * 0.1})`;
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.lineTo(-10, -16);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer(gt: number) {
    const ctx = this.ctx;
    const p = this.p;
    if (p.inv > 0 && p.dodgeT <= 0 && Math.sin(gt * 40) > 0.3 && p.hp > 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 13, 9, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(p.aim);
    const moving = Math.hypot(p.vx, p.vy) > 20;
    const step = moving ? Math.sin(p.walk) * 5 : 0;
    // legs
    ctx.fillStyle = '#2c2a30';
    ctx.fillRect(-4 + step, -7, 8, 5);
    ctx.fillRect(-4 - step, 2, 8, 5);
    const rk = -p.recoil * 4;
    const hasGun = p.ammo > 0;
    // arms + weapon
    if (p.swingT > 0) {
      const prog = 1 - p.swingT / 0.24;
      const sa = (-1.3 + prog * 2.6) * p.swingDir;
      // trail
      ctx.strokeStyle = `rgba(230,225,215,${0.45 * (1 - prog)})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 36, Math.min(-1.3 * p.swingDir, sa), Math.max(-1.3 * p.swingDir, sa));
      ctx.stroke();
      ctx.save();
      ctx.rotate(sa);
      ctx.fillStyle = '#4b5a44';
      ctx.fillRect(0, -3, 14, 6);
      ctx.strokeStyle = '#8a8580';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(44, 0);
      ctx.stroke();
      ctx.restore();
    } else if (hasGun) {
      ctx.fillStyle = '#4b5a44';
      ctx.fillRect(2 + rk, -7, 13, 5);
      ctx.fillRect(2 + rk, 2, 13, 5);
      ctx.fillStyle = '#1a1a1c';
      ctx.fillRect(13 + rk, -2.5, 11, 5);
      ctx.fillStyle = '#d8d0b8';
      ctx.fillRect(12 + rk, -3, 3, 6);
    } else {
      ctx.fillStyle = '#4b5a44';
      ctx.fillRect(2, 2, 13, 5);
      ctx.strokeStyle = '#8a8580';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(12, 5);
      ctx.lineTo(30, 16);
      ctx.stroke();
    }
    // torso (green jacket)
    ctx.fillStyle = '#56644c';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 8, 12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3e4a36';
    ctx.fillRect(-7, -1, 12, 2);
    // flashlight on chest
    ctx.fillStyle = '#f2e6b8';
    ctx.fillRect(4, -5, 3, 3);
    // head
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c9a888';
    ctx.beginPath();
    ctx.arc(2.5, 0, 3.5, -1.2, 1.2);
    ctx.fill();
    ctx.restore();
  }

  private renderHUD() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const p = this.p;
    const gt = this.globalT;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const m = 16;
    const small = w < 520;

    // status panel
    const hp = p.hp;
    const col = hp > 66 ? '#7fcf6a' : hp > 33 ? '#e3c04a' : '#e0402a';
    const label = hp > 66 ? 'FINE' : hp > 33 ? 'CAUTION' : 'DANGER';
    ctx.fillStyle = 'rgba(8,6,5,0.55)';
    ctx.fillRect(m, m, 170, 64);
    ctx.strokeStyle = 'rgba(200,190,170,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(m + 0.5, m + 0.5, 170, 64);
    // ecg
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const rate = 1.2 + (100 - hp) / 40;
    for (let i = 0; i <= 60; i++) {
      const x = m + 8 + i * 2.5;
      const ph = ((i / 60) * 2 - gt * rate) % 1;
      const f = ph < 0 ? ph + 1 : ph;
      let y = 0;
      if (f > 0.4 && f < 0.44) y = -4;
      else if (f >= 0.44 && f < 0.48) y = 14;
      else if (f >= 0.48 && f < 0.52) y = -16;
      else if (f >= 0.52 && f < 0.56) y = 5;
      if (i === 0) ctx.moveTo(x, m + 30 + y * 0.8);
      else ctx.lineTo(x, m + 30 + y * 0.8);
    }
    ctx.stroke();
    ctx.font = '13px "Special Elite", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = col;
    ctx.fillText(label, m + 8, m + 58);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(m + 80, m + 50, 82, 6);
    ctx.fillStyle = col;
    ctx.fillRect(m + 80, m + 50, 82 * (hp / 100), 6);

    // weapon
    ctx.fillStyle = 'rgba(8,6,5,0.55)';
    ctx.fillRect(m, m + 70, 170, 28);
    ctx.fillStyle = p.ammo > 0 ? '#e6dcc8' : '#c9b8a0';
    ctx.font = '14px "Special Elite", monospace';
    ctx.fillText(p.ammo > 0 ? `HANDGUN  ${p.ammo}` : 'STEEL PIPE  ∞', m + 8, m + 89);

    // radio
    const rl = this.staticLvl;
    const rx = m + 178;
    ctx.fillStyle = 'rgba(8,6,5,0.55)';
    ctx.fillRect(rx, m, 40, 64);
    for (let i = 0; i < 5; i++) {
      const on = rl * 5 > i + (Math.random() < rl ? -0.5 : 0.3);
      ctx.fillStyle = on ? (i > 2 ? '#e0402a' : '#e3c04a') : 'rgba(200,190,170,0.15)';
      ctx.fillRect(rx + 8, m + 50 - i * 9, 24, 6);
    }
    ctx.font = '9px "Special Elite", monospace';
    ctx.fillStyle = 'rgba(220,210,190,0.6)';
    ctx.fillText('RADIO', rx + 5, m + 61);

    // score
    ctx.textAlign = 'right';
    const bump = 1 + this.scoreBump * 0.18;
    ctx.save();
    ctx.translate(w - m, m + 30);
    ctx.scale(bump, bump);
    ctx.font = `${small ? 26 : 34}px "IM Fell English SC", Georgia, serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(Math.floor(this.score).toLocaleString(), 2, 2);
    ctx.fillStyle = this.o > 0.5 ? '#ff7a5a' : '#f0e8d8';
    ctx.fillText(Math.floor(this.score).toLocaleString(), 0, 0);
    ctx.restore();
    ctx.font = '13px "Special Elite", monospace';
    ctx.fillStyle = 'rgba(230,220,200,0.8)';
    const t = this.time;
    ctx.fillText(`${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}  ·  ${this.kills} KILLS  ·  ${this.frags} MEM`, w - m, m + 52);
    const mult = this.mult();
    if (mult > 1) {
      ctx.font = '18px "Special Elite", monospace';
      ctx.fillStyle = '#ffb347';
      ctx.fillText(`x${mult.toFixed(1)}`, w - m, m + 76);
      if (this.comboT > 0) {
        ctx.fillStyle = 'rgba(255,179,71,0.6)';
        ctx.fillRect(w - m - 60 * (this.comboT / 2.6), m + 82, 60 * (this.comboT / 2.6), 3);
      }
    }

    // phase indicator
    ctx.textAlign = 'center';
    if (this.phase === 1) {
      const rem = Math.max(0, this.phaseLen - this.phaseT);
      ctx.font = '12px "Special Elite", monospace';
      ctx.fillStyle = `rgba(255,90,60,${0.6 + Math.sin(gt * 4) * 0.3})`;
      ctx.fillText(`OTHERWORLD — ${Math.ceil(rem)}s`, w / 2, h - (this.isTouch ? 24 : 22));
    }

    // banner
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT * 1.5, (3 - this.bannerT) * 3);
      ctx.globalAlpha = a;
      const by = h * 0.3;
      ctx.font = `${small ? 30 : 46}px "IM Fell English SC", Georgia, serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(this.banner, w / 2 + 2, by + 2);
      ctx.fillStyle = this.o > 0.5 ? '#ff6a4a' : '#f4ecd8';
      ctx.fillText(this.banner, w / 2 + (Math.random() < 0.05 ? rand(-3, 3) : 0), by);
      if (this.bannerSub) {
        ctx.font = `${small ? 13 : 16}px "Special Elite", monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(this.bannerSub, w / 2 + 1, by + 31);
        ctx.fillStyle = 'rgba(235,225,205,0.9)';
        ctx.fillText(this.bannerSub, w / 2, by + 30);
      }
      ctx.globalAlpha = 1;
    }

    // touch controls
    if (this.isTouch && this.state === 'playing') {
      const drawStick = (s: { id: number; ox: number; oy: number; x: number; y: number }, gx: number, gy: number, c: string) => {
        const active = s.id !== -1;
        const ox = active ? s.ox : gx;
        const oy = active ? s.oy : gy;
        ctx.globalAlpha = active ? 0.55 : 0.2;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ox, oy, 60, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(active ? s.x : ox, active ? s.y : oy, 24, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      drawStick(this.tMove, 100, h - 110, '#e6dcc8');
      drawStick(this.tAim, w - 150, h - 90, '#e0502a');
      const db = this.dodgeBtn();
      const ready = p.dodgeCd <= 0;
      ctx.globalAlpha = ready ? 0.55 : 0.2;
      ctx.fillStyle = 'rgba(20,14,12,0.6)';
      ctx.beginPath();
      ctx.arc(db.x, db.y, db.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#e6dcc8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#e6dcc8';
      ctx.font = '11px "Special Elite", monospace';
      ctx.fillText('DODGE', db.x, db.y + 4);
      ctx.globalAlpha = 1;
    }
  }
}
