// ============================================================
// Voxel Sandbox - No External Dependencies Version
// ============================================================

import * as THREE from 'https://unpkg.com/three@0.150.0/build/three.module.js';

// ============================================================
// Custom PointerLockControls (自前実装)
// ============================================================
class JsonPointerLockControls extends THREE.EventDispatcher {
  constructor(camera, domElement) {
    super();
    this.camera = camera;
    this.domElement = domElement;
    this.isLocked = false;
    
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.PI_2 = Math.PI / 2;
    
    this.onMouseMove = (e) => {
      if (!this.isLocked) return;
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;
      
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= movementX * 0.002;
      this.euler.x -= movementY * 0.002;
      this.euler.x = Math.max(this.PI_2 - this.maxPolarAngle, Math.min(this.PI_2 - this.minPolarAngle, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    };
    
    this.onPointerlockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      this.dispatchEvent({ type: this.isLocked ? 'lock' : 'unlock' });
    };
    
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerlockChange);
  }
  
  lock() { this.domElement.requestPointerLock(); }
  unlock() { document.exitPointerLock(); }
  getObject() { return this.camera; }
  getDirection(v) {
    return v.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}

// ============================================================
// Error Handler
// ============================================================
const errorBox = document.getElementById('errorBox');
function showError(msg) {
  console.error(msg);
  if (errorBox) errorBox.textContent = 'ERROR: ' + msg;
}
window.onerror = (msg) => showError(msg);
window.onunhandledrejection = (e) => showError(e.reason?.message || e.reason);

// ============================================================
// Utilities
// ============================================================
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  return hash >>> 0;
}

function seededRandom(seed) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ============================================================
// Perlin Noise
// ============================================================
class Noise {
  constructor(rng) {
    this.p = [];
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }
    this.p = this.p.concat(this.p);
  }
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }
  grad(h, x, y) {
    const v = (h & 1) === 0 ? x : y;
    return (h & 2) === 0 ? v : -v;
  }
  noise2D(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = this.fade(x), v = this.fade(y);
    const A = this.p[X] + Y, B = this.p[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y), u),
      this.lerp(this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1), u), v
    );
  }
}

// ============================================================
// Config
// ============================================================
const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window;

const CFG = {
  SIZE: clamp(parseInt(params.get('size')) || (isMobile ? 24 : 32), 16, 64),
  HEIGHT: clamp(parseInt(params.get('h')) || 24, 16, 48),
  NOISE_SCALE: 0.07,
  BASE_H: 8,
  AMP: 10,
  TREE_RATE: 0.015,
  P_HEIGHT: 1.7,
  P_RADIUS: 0.3,
  SPEED: 5,
  JUMP: 8,
  GRAV: 20,
  REACH: 5,
  SAVE_KEY: 'voxel_v5'
};

// ============================================================
// Blocks
// ============================================================
const BLK = { AIR: -1, GRASS: 0, DIRT: 1, STONE: 2, SAND: 3, WOOD: 4, LEAF: 5 };
const COLORS = {
  [BLK.GRASS]: [74, 156, 45],
  [BLK.DIRT]: [139, 90, 43],
  [BLK.STONE]: [128, 128, 128],
  [BLK.SAND]: [194, 178, 128],
  [BLK.WOOD]: [139, 69, 19],
  [BLK.LEAF]: [34, 139, 34]
};

// ============================================================
// Save/Load
// ============================================================
function load() { try { return JSON.parse(localStorage.getItem(CFG.SAVE_KEY)); } catch { return null; } }
function save(d) { try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(d)); } catch {} }

let saved = load();
const urlSeed = params.get('seed');
let seed = urlSeed ? hashString(urlSeed) : (saved?.seed ?? Date.now() >>> 0);
const rng = seededRandom(seed);
const noise = new Noise(rng);

document.getElementById('seedDisplay').textContent = urlSeed || seed;
document.getElementById('sizeDisplay').textContent = `${CFG.SIZE}×${CFG.SIZE}`;

// ============================================================
// Three.js
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 70);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(50, 100, 50);
scene.add(sun);

// ============================================================
// Controls
// ============================================================
const controls = new JsonPointerLockControls(camera, document.body);
const overlay = document.getElementById('lockOverlay');

if (!isMobile) {
  document.getElementById('startBtn').onclick = () => controls.lock();
  controls.addEventListener('lock', () => overlay.classList.add('hidden'));
  controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));
  document.addEventListener('contextmenu', e => e.preventDefault());
} else {
  overlay.classList.add('hidden');
}

// ============================================================
// Textures
// ============================================================
function makeTex(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (rng() - 0.5) * 30;
      g.fillStyle = `rgb(${clamp(rgb[0]+v,0,255)|0},${clamp(rgb[1]+v,0,255)|0},${clamp(rgb[2]+v,0,255)|0})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return { tex: t, canvas: c };
}

const TEX = {}, CANVAS = {};
for (const k in BLK) {
  if (BLK[k] === BLK.AIR) continue;
  const { tex, canvas } = makeTex(COLORS[BLK[k]]);
  TEX[BLK[k]] = tex;
  CANVAS[BLK[k]] = canvas;
}

// ============================================================
// World
// ============================================================
const base = new Map(), mods = new Map();
const K = (x,y,z) => `${x},${y},${z}`;
const PK = k => { const [x,y,z] = k.split(',').map(Number); return {x,y,z}; };
const IN = (x,y,z) => x>=0 && x<CFG.SIZE && y>=0 && y<CFG.HEIGHT && z>=0 && z<CFG.SIZE;

function get(x,y,z) {
  if (!IN(x,y,z)) return BLK.AIR;
  const k = K(x,y,z);
  return mods.has(k) ? mods.get(k) : (base.get(k) ?? BLK.AIR);
}
function set(x,y,z,t) {
  if (!IN(x,y,z)) return;
  mods.set(K(x,y,z), t);
  upd(x,y,z);
  [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(([a,b,c]) => upd(x+a,y+b,z+c));
  scheduleSave();
}
const solid = (x,y,z) => get(x,y,z) !== BLK.AIR;

// Terrain
function height(x,z) {
  const n = noise.noise2D(x * CFG.NOISE_SCALE, z * CFG.NOISE_SCALE);
  return clamp(Math.floor(CFG.BASE_H + n * CFG.AMP), 1, CFG.HEIGHT - 3);
}

function genWorld() {
  base.clear();
  for (let x = 0; x < CFG.SIZE; x++) {
    for (let z = 0; z < CFG.SIZE; z++) {
      const h = height(x, z);
      for (let y = 0; y <= h; y++) {
        let t = y === h ? (h < 6 ? BLK.SAND : BLK.GRASS) : (y > h - 4 ? BLK.DIRT : BLK.STONE);
        base.set(K(x,y,z), t);
      }
    }
  }
}

function genTrees() {
  for (let x = 2; x < CFG.SIZE - 2; x++) {
    for (let z = 2; z < CFG.SIZE - 2; z++) {
      const h = height(x, z);
      if (h < 7 || get(x,h,z) !== BLK.GRASS || rng() > CFG.TREE_RATE) continue;
      const th = 4 + (rng() * 2 | 0);
      for (let i = 1; i <= th; i++) mods.set(K(x, h+i, z), BLK.WOOD);
      const lb = h + th - 1;
      for (let dy = 0; dy <= 2; dy++) {
        const r = dy === 2 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx===0 && dz===0 && dy<2) continue;
            if (Math.abs(dx)===2 && Math.abs(dz)===2) continue;
            const lk = K(x+dx, lb+dy, z+dz);
            if (IN(x+dx, lb+dy, z+dz) && !base.has(lk) && !mods.has(lk)) mods.set(lk, BLK.LEAF);
          }
        }
      }
    }
  }
}

// ============================================================
// Instanced Mesh
// ============================================================
const geo = new THREE.BoxGeometry(1,1,1);
const meshes = new Map(), bIdx = new Map(), iBlk = new Map();
const tmp = new THREE.Matrix4();

function getMesh(t) {
  if (!meshes.has(t)) {
    const mat = new THREE.MeshLambertMaterial({ map: TEX[t], transparent: t === BLK.LEAF, opacity: t === BLK.LEAF ? 0.9 : 1 });
    const m = new THREE.InstancedMesh(geo, mat, 60000);
    m.count = 0;
    m.userData.t = t;
    scene.add(m);
    meshes.set(t, m);
    iBlk.set(t, []);
  }
  return meshes.get(t);
}

function exposed(x,y,z) {
  return solid(x,y,z) && (!solid(x+1,y,z)||!solid(x-1,y,z)||!solid(x,y+1,z)||!solid(x,y-1,z)||!solid(x,y,z+1)||!solid(x,y,z-1));
}

function addInst(x,y,z,t) {
  const m = getMesh(t), arr = iBlk.get(t), k = K(x,y,z), i = m.count;
  tmp.setPosition(x+0.5, y+0.5, z+0.5);
  m.setMatrixAt(i, tmp);
  m.count++;
  m.instanceMatrix.needsUpdate = true;
  arr[i] = k;
  bIdx.set(k, { t, i });
}

function remInst(k) {
  const info = bIdx.get(k);
  if (!info) return;
  const { t, i } = info;
  const m = meshes.get(t), arr = iBlk.get(t);
  if (m.count > 1 && i < m.count - 1) {
    const lk = arr[m.count - 1];
    m.getMatrixAt(m.count - 1, tmp);
    m.setMatrixAt(i, tmp);
    arr[i] = lk;
    bIdx.set(lk, { t, i });
  }
  m.count--;
  m.instanceMatrix.needsUpdate = true;
  arr.pop();
  bIdx.delete(k);
}

function upd(x,y,z) {
  if (!IN(x,y,z)) return;
  const k = K(x,y,z);
  if (bIdx.has(k)) remInst(k);
  const t = get(x,y,z);
  if (t !== BLK.AIR && exposed(x,y,z)) addInst(x,y,z,t);
}

function buildAll() {
  for (const [t, m] of meshes) { m.count = 0; iBlk.set(t, []); }
  bIdx.clear();
  for (let x = 0; x < CFG.SIZE; x++)
    for (let z = 0; z < CFG.SIZE; z++)
      for (let y = 0; y < CFG.HEIGHT; y++) {
        const t = get(x,y,z);
        if (t !== BLK.AIR && exposed(x,y,z)) addInst(x,y,z,t);
      }
}

// ============================================================
// Hotbar
// ============================================================
const slots = [BLK.GRASS, BLK.DIRT, BLK.STONE, BLK.SAND, BLK.WOOD, BLK.LEAF];
let sel = 0;

function buildHotbar() {
  const hb = document.getElementById('hotbar');
  hb.innerHTML = '';
  slots.forEach((t, i) => {
    const s = document.createElement('div');
    s.className = 'hotbar-slot' + (i === sel ? ' selected' : '');
    s.innerHTML = `<span class="slot-number">${i+1}</span>`;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(CANVAS[t], 0, 0);
    s.appendChild(c);
    s.onclick = () => selSlot(i);
    hb.appendChild(s);
  });
}
function selSlot(i) {
  sel = (i + 6) % 6;
  document.querySelectorAll('.hotbar-slot').forEach((s, j) => s.classList.toggle('selected', j === sel));
}
buildHotbar();

document.addEventListener('keydown', e => { if (e.key >= '1' && e.key <= '6') selSlot(+e.key - 1); });
document.addEventListener('wheel', e => { if (controls.isLocked || isMobile) selSlot(sel + (e.deltaY > 0 ? 1 : -1)); });

// ============================================================
// Raycast & Actions
// ============================================================
const ray = new THREE.Raycaster();
ray.far = CFG.REACH;

const hl = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01,1.01,1.01)),
  new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
);
hl.visible = false;
scene.add(hl);

let tgt = null, tgtFace = null;

function updTgt() {
  ray.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = ray.intersectObjects([...meshes.values()], false);
  if (!hits.length) { tgt = null; hl.visible = false; return; }
  const h = hits[0], arr = iBlk.get(h.object.userData.t), k = arr[h.instanceId];
  if (!k) { tgt = null; hl.visible = false; return; }
  tgt = PK(k);
  tgtFace = h.face?.normal?.clone() || new THREE.Vector3(0,1,0);
  hl.position.set(tgt.x+0.5, tgt.y+0.5, tgt.z+0.5);
  hl.visible = true;
}

let mode = 'BREAK';
const modeDisp = document.getElementById('modeDisplay');
const modeBtn = document.getElementById('modeBtn');
function setMode(m) { mode = m; modeDisp.textContent = m; if (modeBtn) modeBtn.textContent = 'MODE: ' + m; }

function act(m = mode) {
  if (!tgt) return;
  if (m === 'BREAK') {
    set(tgt.x, tgt.y, tgt.z, BLK.AIR);
  } else {
    const nx = tgt.x + Math.round(tgtFace.x);
    const ny = tgt.y + Math.round(tgtFace.y);
    const nz = tgt.z + Math.round(tgtFace.z);
    if (!IN(nx,ny,nz) || get(nx,ny,nz) !== BLK.AIR) return;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const r = CFG.P_RADIUS, ph = CFG.P_HEIGHT;
    if (nx+1 > px-r && nx < px+r && ny+1 > py && ny < py+ph && nz+1 > pz-r && nz < pz+r) return;
    set(nx, ny, nz, slots[sel]);
  }
}

if (!isMobile) {
  document.addEventListener('mousedown', e => {
    if (!controls.isLocked) return;
    if (e.button === 0) { setMode('BREAK'); act('BREAK'); }
    if (e.button === 2) { setMode('PLACE'); act('PLACE'); }
  });
}

// ============================================================
// Save
// ============================================================
let saveT = null;
function scheduleSave() {
  if (saveT) return;
  saveT = setTimeout(() => {
    saveT = null;
    save({ seed, size: CFG.SIZE, mods: Object.fromEntries(mods), ts: Date.now() });
  }, 500);
}

function loadMods() {
  if (saved?.seed === seed && saved?.mods) {
    for (const [k, v] of Object.entries(saved.mods)) mods.set(k, v);
  }
}

document.getElementById('resetBtn').onclick = () => { localStorage.removeItem(CFG.SAVE_KEY); location.reload(); };

// ============================================================
// Player
// ============================================================
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), ground: false, jump: false };

function findSpawn() {
  const c = Math.floor(CFG.SIZE / 2);
  for (let r = 0; r <= 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = c + dx, z = c + dz;
        if (!IN(x, 0, z)) continue;
        for (let y = CFG.HEIGHT - 2; y >= 0; y--) {
          if (solid(x,y,z) && !solid(x,y+1,z) && !solid(x,y+2,z)) {
            return new THREE.Vector3(x + 0.5, y + 1.01, z + 0.5);
          }
        }
      }
    }
  }
  return new THREE.Vector3(c + 0.5, CFG.HEIGHT, c + 0.5);
}

function spawn() {
  player.pos.copy(findSpawn());
  player.vel.set(0,0,0);
  camera.position.copy(player.pos);
}

function col(x,y,z,r,h) {
  for (let bx = Math.floor(x-r); bx <= Math.floor(x+r); bx++)
    for (let by = Math.floor(y); by <= Math.floor(y+h); by++)
      for (let bz = Math.floor(z-r); bz <= Math.floor(z+r); bz++)
        if (solid(bx,by,bz)) return { hit: true, y: by };
  return { hit: false };
}

function physics(dt) {
  const r = CFG.P_RADIUS, h = CFG.P_HEIGHT;
  player.vel.y -= CFG.GRAV * dt;
  if (player.jump && player.ground) { player.vel.y = CFG.JUMP; player.ground = false; }
  player.jump = false;

  player.pos.x += player.vel.x * dt;
  if (col(player.pos.x, player.pos.y, player.pos.z, r, h).hit) { player.pos.x -= player.vel.x * dt; player.vel.x = 0; }

  player.pos.z += player.vel.z * dt;
  if (col(player.pos.x, player.pos.y, player.pos.z, r, h).hit) { player.pos.z -= player.vel.z * dt; player.vel.z = 0; }

  player.ground = false;
  player.pos.y += player.vel.y * dt;
  const c = col(player.pos.x, player.pos.y, player.pos.z, r, h);
  if (c.hit) {
    if (player.vel.y < 0) { player.pos.y = c.y + 1 + 0.001; player.ground = true; }
    else { player.pos.y = c.y - h - 0.001; }
    player.vel.y = 0;
  }

  if (player.pos.y < -20) spawn();
  camera.position.copy(player.pos);
}

// ============================================================
// Input
// ============================================================
const keys = { w:0, a:0, s:0, d:0, space:0, shift:0 };
document.addEventListener('keydown', e => {
  if (e.code === 'KeyW') keys.w = 1;
  if (e.code === 'KeyA') keys.a = 1;
  if (e.code === 'KeyS') keys.s = 1;
  if (e.code === 'KeyD') keys.d = 1;
  if (e.code === 'Space') { keys.space = 1; e.preventDefault(); }
  if (e.code === 'ShiftLeft') keys.shift = 1;
  if (e.code === 'KeyR') spawn();
});
document.addEventListener('keyup', e => {
  if (e.code === 'KeyW') keys.w = 0;
  if (e.code === 'KeyA') keys.a = 0;
  if (e.code === 'KeyS') keys.s = 0;
  if (e.code === 'KeyD') keys.d = 0;
  if (e.code === 'Space') keys.space = 0;
  if (e.code === 'ShiftLeft') keys.shift = 0;
});

let mIn = { x: 0, z: 0 }, mLook = { x: 0, y: 0 };

if (isMobile) {
  const jBase = document.getElementById('joystickBase');
  const jStick = document.getElementById('joystickStick');
  let jAct = false, jC = { x: 0, y: 0 };

  jBase.addEventListener('pointerdown', e => {
    jAct = true;
    jBase.setPointerCapture(e.pointerId);
    const r = jBase.getBoundingClientRect();
    jC = { x: r.left + r.width/2, y: r.top + r.height/2 };
  });
  jBase.addEventListener('pointermove', e => {
    if (!jAct) return;
    const dx = e.clientX - jC.x, dy = e.clientY - jC.y;
    const max = 40, d = Math.hypot(dx, dy), sc = d > max ? max/d : 1;
    jStick.style.transform = `translate(${dx*sc}px, ${dy*sc}px)`;
    mIn.x = dx * sc / max;
    mIn.z = dy * sc / max;
  });
  jBase.addEventListener('pointerup', () => {
    jAct = false;
    jStick.style.transform = 'translate(0,0)';
    mIn.x = mIn.z = 0;
  });

  let lAct = false, lP = { x: 0, y: 0 };
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) return;
    lAct = true;
    lP = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', e => {
    if (!lAct) return;
    mLook.x += e.clientX - lP.x;
    mLook.y += e.clientY - lP.y;
    lP = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointerup', () => { lAct = false; });

  let tap = null;
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) return;
    tap = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  document.addEventListener('pointerup', e => {
    if (!tap || e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) { tap = null; return; }
    if (Date.now() - tap.t < 200 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 15) act();
    tap = null;
  });

  modeBtn.onclick = () => setMode(mode === 'BREAK' ? 'PLACE' : 'BREAK');
  document.getElementById('jumpBtn').addEventListener('pointerdown', () => { player.jump = true; });
}

function moveDir() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  fwd.y = 0; fwd.normalize();
  const rt = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
  const dir = new THREE.Vector3();
  if (isMobile) {
    dir.addScaledVector(fwd, -mIn.z);
    dir.addScaledVector(rt, mIn.x);
  } else {
    if (keys.w) dir.add(fwd);
    if (keys.s) dir.sub(fwd);
    if (keys.d) dir.add(rt);
    if (keys.a) dir.sub(rt);
  }
  if (dir.lengthSq() > 0) dir.normalize();
  return dir;
}

function applyMobileLook() {
  if (!isMobile) return;
  const s = 0.003;
  camera.rotation.order = 'YXZ';
  camera.rotation.y -= mLook.x * s;
  camera.rotation.x = clamp(camera.rotation.x - mLook.y * s, -Math.PI/2 + 0.1, Math.PI/2 - 0.1);
  mLook.x = mLook.y = 0;
}

// ============================================================
// Loop
// ============================================================
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  applyMobileLook();
  if (!isMobile && keys.space) player.jump = true;

  const dir = moveDir();
  const spd = CFG.SPEED * (keys.shift ? 1.5 : 1);
  const acc = player.ground ? 30 : 15;
  player.vel.x += (dir.x * spd - player.vel.x) * Math.min(1, acc * dt);
  player.vel.z += (dir.z * spd - player.vel.z) * Math.min(1, acc * dt);

  physics(dt);
  updTgt();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// Init
// ============================================================
console.log('Starting...');
genWorld();
genTrees();
loadMods();
buildAll();
spawn();
loop();
console.log('Game ready!');
