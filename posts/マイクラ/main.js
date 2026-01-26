// ============================================================
// Voxel Sandbox - Fixed Version
// ============================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ============================================================
// Error Handler
// ============================================================
const errorBox = document.getElementById('errorBox');
function showError(msg) {
  console.error(msg);
  if (errorBox) {
    errorBox.textContent = 'ERROR: ' + msg;
    errorBox.style.color = '#ff6b6b';
    errorBox.style.marginTop = '8px';
  }
}
window.onerror = (msg) => showError(msg);
window.onunhandledrejection = (e) => showError(e.reason?.message || e.reason);

// ============================================================
// Utilities
// ============================================================
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ============================================================
// Simple Noise (自前実装)
// ============================================================
class SimpleNoise {
  constructor(random) {
    this.rng = random;
    this.perm = [];
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    this.perm = this.perm.concat(this.perm);
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.perm[X] + Y;
    const B = this.perm[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y), u),
      this.lerp(this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1), u),
      v
    );
  }
}

// ============================================================
// Configuration
// ============================================================
const urlParams = new URLSearchParams(window.location.search);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);

const CONFIG = {
  WORLD_SIZE: clamp(parseInt(urlParams.get('size')) || (isMobile ? 24 : 32), 16, 64),
  WORLD_HEIGHT: clamp(parseInt(urlParams.get('h')) || 24, 16, 48),
  NOISE_SCALE: 0.06,
  BASE_HEIGHT: 8,
  HEIGHT_AMP: 10,
  TREE_CHANCE: 0.015,
  PLAYER_HEIGHT: 1.7,
  PLAYER_RADIUS: 0.3,
  MOVE_SPEED: 5,
  JUMP_VELOCITY: 8,
  GRAVITY: 20,
  REACH: 5,
  SAVE_KEY: 'voxel_v4'
};

// ============================================================
// Block Types
// ============================================================
const BLOCK = { AIR: -1, GRASS: 0, DIRT: 1, STONE: 2, SAND: 3, WOOD: 4, LEAVES: 5 };
const BLOCK_COLORS = {
  [BLOCK.GRASS]: [74, 156, 45],
  [BLOCK.DIRT]: [139, 90, 43],
  [BLOCK.STONE]: [128, 128, 128],
  [BLOCK.SAND]: [194, 178, 128],
  [BLOCK.WOOD]: [139, 69, 19],
  [BLOCK.LEAVES]: [34, 139, 34]
};

// ============================================================
// Save/Load
// ============================================================
function loadSave() {
  try { return JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)); } catch { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data)); } catch {}
}

let saveData = loadSave();
const urlSeed = urlParams.get('seed');
let worldSeed = urlSeed ? hashString(urlSeed) : (saveData?.seed ?? (Date.now() >>> 0));

const rng = seededRandom(worldSeed);
const noise = new SimpleNoise(rng);

document.getElementById('seedDisplay').textContent = urlSeed || worldSeed;
document.getElementById('sizeDisplay').textContent = `${CONFIG.WORLD_SIZE}×${CONFIG.WORLD_SIZE}`;

// ============================================================
// Three.js Setup
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
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const lockOverlay = document.getElementById('lockOverlay');

if (!isMobile) {
  document.getElementById('startBtn').onclick = () => controls.lock();
  controls.addEventListener('lock', () => lockOverlay.classList.add('hidden'));
  controls.addEventListener('unlock', () => lockOverlay.classList.remove('hidden'));
  document.addEventListener('contextmenu', e => e.preventDefault());
} else {
  lockOverlay.classList.add('hidden');
}

// ============================================================
// Texture Generation
// ============================================================
function createTexture(rgb) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = (rng() - 0.5) * 30;
      ctx.fillStyle = `rgb(${clamp(rgb[0]+v,0,255)},${clamp(rgb[1]+v,0,255)},${clamp(rgb[2]+v,0,255)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  return { tex, canvas };
}

const textures = {}, canvases = {};
for (const [name, type] of Object.entries(BLOCK)) {
  if (type === BLOCK.AIR) continue;
  const { tex, canvas } = createTexture(BLOCK_COLORS[type]);
  textures[type] = tex;
  canvases[type] = canvas;
}

// ============================================================
// World Data
// ============================================================
const baseWorld = new Map();
const mods = new Map();

const key = (x,y,z) => `${x},${y},${z}`;
const parseKey = k => { const [x,y,z] = k.split(',').map(Number); return {x,y,z}; };
const inBounds = (x,y,z) => x>=0 && x<CONFIG.WORLD_SIZE && y>=0 && y<CONFIG.WORLD_HEIGHT && z>=0 && z<CONFIG.WORLD_SIZE;

function getBlock(x,y,z) {
  if (!inBounds(x,y,z)) return BLOCK.AIR;
  const k = key(x,y,z);
  return mods.has(k) ? mods.get(k) : (baseWorld.get(k) ?? BLOCK.AIR);
}
function setBlock(x,y,z,type) {
  if (!inBounds(x,y,z)) return;
  mods.set(key(x,y,z), type);
  updateMesh(x,y,z);
  [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(([dx,dy,dz]) => updateMesh(x+dx,y+dy,z+dz));
  scheduleSave();
}
const isSolid = (x,y,z) => getBlock(x,y,z) !== BLOCK.AIR;

// ============================================================
// Terrain Generation
// ============================================================
function getHeight(x,z) {
  const n = noise.noise2D(x * CONFIG.NOISE_SCALE, z * CONFIG.NOISE_SCALE);
  return clamp(Math.floor(CONFIG.BASE_HEIGHT + n * CONFIG.HEIGHT_AMP), 1, CONFIG.WORLD_HEIGHT - 3);
}

function generateWorld() {
  baseWorld.clear();
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      const h = getHeight(x, z);
      for (let y = 0; y <= h; y++) {
        let type;
        if (y === h) type = h < 6 ? BLOCK.SAND : BLOCK.GRASS;
        else if (y > h - 4) type = BLOCK.DIRT;
        else type = BLOCK.STONE;
        baseWorld.set(key(x,y,z), type);
      }
    }
  }
}

function generateTrees() {
  for (let x = 2; x < CONFIG.WORLD_SIZE - 2; x++) {
    for (let z = 2; z < CONFIG.WORLD_SIZE - 2; z++) {
      const h = getHeight(x, z);
      if (h < 7 || getBlock(x,h,z) !== BLOCK.GRASS || rng() > CONFIG.TREE_CHANCE) continue;
      
      const th = 4 + Math.floor(rng() * 2);
      for (let i = 1; i <= th; i++) mods.set(key(x, h+i, z), BLOCK.WOOD);
      
      const lb = h + th - 1;
      for (let dy = 0; dy <= 2; dy++) {
        const r = dy === 2 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx===0 && dz===0 && dy<2) continue;
            if (Math.abs(dx)===2 && Math.abs(dz)===2) continue;
            const lk = key(x+dx, lb+dy, z+dz);
            if (inBounds(x+dx, lb+dy, z+dz) && !baseWorld.has(lk) && !mods.has(lk)) {
              mods.set(lk, BLOCK.LEAVES);
            }
          }
        }
      }
    }
  }
}

// ============================================================
// Instanced Mesh Rendering
// ============================================================
const boxGeo = new THREE.BoxGeometry(1,1,1);
const meshes = new Map();
const blockIndex = new Map();
const indexBlock = new Map();
const tmpMat = new THREE.Matrix4();

function getMesh(type) {
  if (!meshes.has(type)) {
    const mat = new THREE.MeshLambertMaterial({
      map: textures[type],
      transparent: type === BLOCK.LEAVES,
      opacity: type === BLOCK.LEAVES ? 0.9 : 1
    });
    const mesh = new THREE.InstancedMesh(boxGeo, mat, 60000);
    mesh.count = 0;
    mesh.userData.type = type;
    scene.add(mesh);
    meshes.set(type, mesh);
    indexBlock.set(type, []);
  }
  return meshes.get(type);
}

function isExposed(x,y,z) {
  return isSolid(x,y,z) && (!isSolid(x+1,y,z) || !isSolid(x-1,y,z) || !isSolid(x,y+1,z) || !isSolid(x,y-1,z) || !isSolid(x,y,z+1) || !isSolid(x,y,z-1));
}

function addInstance(x,y,z,type) {
  const mesh = getMesh(type);
  const arr = indexBlock.get(type);
  const k = key(x,y,z);
  const idx = mesh.count;
  tmpMat.setPosition(x+0.5, y+0.5, z+0.5);
  mesh.setMatrixAt(idx, tmpMat);
  mesh.count++;
  mesh.instanceMatrix.needsUpdate = true;
  arr[idx] = k;
  blockIndex.set(k, { type, idx });
}

function removeInstance(k) {
  const info = blockIndex.get(k);
  if (!info) return;
  const { type, idx } = info;
  const mesh = meshes.get(type);
  const arr = indexBlock.get(type);
  
  if (mesh.count > 1 && idx < mesh.count - 1) {
    const lastK = arr[mesh.count - 1];
    mesh.getMatrixAt(mesh.count - 1, tmpMat);
    mesh.setMatrixAt(idx, tmpMat);
    arr[idx] = lastK;
    blockIndex.set(lastK, { type, idx });
  }
  mesh.count--;
  mesh.instanceMatrix.needsUpdate = true;
  arr.pop();
  blockIndex.delete(k);
}

function updateMesh(x,y,z) {
  if (!inBounds(x,y,z)) return;
  const k = key(x,y,z);
  if (blockIndex.has(k)) removeInstance(k);
  const type = getBlock(x,y,z);
  if (type !== BLOCK.AIR && isExposed(x,y,z)) addInstance(x,y,z,type);
}

function buildAllMeshes() {
  for (const [type, mesh] of meshes) { mesh.count = 0; indexBlock.set(type, []); }
  blockIndex.clear();
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
        const type = getBlock(x,y,z);
        if (type !== BLOCK.AIR && isExposed(x,y,z)) addInstance(x,y,z,type);
      }
    }
  }
}

// ============================================================
// Hotbar
// ============================================================
const hotbarTypes = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.WOOD, BLOCK.LEAVES];
let selectedSlot = 0;

function buildHotbar() {
  const hotbar = document.getElementById('hotbar');
  hotbar.innerHTML = '';
  hotbarTypes.forEach((type, i) => {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (i === selectedSlot ? ' selected' : '');
    slot.innerHTML = `<span class="slot-number">${i+1}</span>`;
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(canvases[type], 0, 0);
    slot.appendChild(c);
    slot.onclick = () => selectSlot(i);
    hotbar.appendChild(slot);
  });
}
function selectSlot(i) {
  selectedSlot = (i + 6) % 6;
  document.querySelectorAll('.hotbar-slot').forEach((s, idx) => s.classList.toggle('selected', idx === selectedSlot));
}
buildHotbar();

document.addEventListener('keydown', e => { if (e.key >= '1' && e.key <= '6') selectSlot(+e.key - 1); });
document.addEventListener('wheel', e => { if (controls.isLocked || isMobile) selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1)); });

// ============================================================
// Raycasting & Actions
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.far = CONFIG.REACH;

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01,1.01,1.01)),
  new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
);
highlight.visible = false;
scene.add(highlight);

let target = null, targetFace = null;

function updateTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects([...meshes.values()], false);
  if (!hits.length) { target = null; highlight.visible = false; return; }
  
  const hit = hits[0];
  const arr = indexBlock.get(hit.object.userData.type);
  const k = arr[hit.instanceId];
  if (!k) { target = null; highlight.visible = false; return; }
  
  target = parseKey(k);
  targetFace = hit.face?.normal?.clone() || new THREE.Vector3(0,1,0);
  highlight.position.set(target.x+0.5, target.y+0.5, target.z+0.5);
  highlight.visible = true;
}

let mode = 'BREAK';
const modeDisplay = document.getElementById('modeDisplay');
const modeBtn = document.getElementById('modeBtn');

function setMode(m) {
  mode = m;
  modeDisplay.textContent = m;
  if (modeBtn) modeBtn.textContent = 'MODE: ' + m;
}

function doAction(m = mode) {
  if (!target) return;
  if (m === 'BREAK') {
    setBlock(target.x, target.y, target.z, BLOCK.AIR);
  } else {
    const nx = target.x + Math.round(targetFace.x);
    const ny = target.y + Math.round(targetFace.y);
    const nz = target.z + Math.round(targetFace.z);
    if (!inBounds(nx,ny,nz) || getBlock(nx,ny,nz) !== BLOCK.AIR) return;
    
    // プレイヤーと重ならないかチェック
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const r = CONFIG.PLAYER_RADIUS, h = CONFIG.PLAYER_HEIGHT;
    if (nx+1 > px-r && nx < px+r && ny+1 > py && ny < py+h && nz+1 > pz-r && nz < pz+r) return;
    
    setBlock(nx, ny, nz, hotbarTypes[selectedSlot]);
  }
}

if (!isMobile) {
  document.addEventListener('mousedown', e => {
    if (!controls.isLocked) return;
    if (e.button === 0) { setMode('BREAK'); doAction('BREAK'); }
    if (e.button === 2) { setMode('PLACE'); doAction('PLACE'); }
  });
}

// ============================================================
// Save
// ============================================================
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeSave({ seed: worldSeed, size: CONFIG.WORLD_SIZE, mods: Object.fromEntries(mods), ts: Date.now() });
  }, 500);
}

function loadMods() {
  if (saveData?.seed === worldSeed && saveData?.mods) {
    for (const [k, v] of Object.entries(saveData.mods)) mods.set(k, v);
  }
}

document.getElementById('resetBtn').onclick = () => { localStorage.removeItem(CONFIG.SAVE_KEY); location.reload(); };

// ============================================================
// Player Physics
// ============================================================
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), onGround: false, wantJump: false };

function findSpawn() {
  const cx = Math.floor(CONFIG.WORLD_SIZE / 2);
  for (let r = 0; r <= 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = cx + dx, z = cx + dz;
        if (!inBounds(x, 0, z)) continue;
        for (let y = CONFIG.WORLD_HEIGHT - 2; y >= 0; y--) {
          if (isSolid(x,y,z) && !isSolid(x,y+1,z) && !isSolid(x,y+2,z)) {
            return new THREE.Vector3(x + 0.5, y + 1.01, z + 0.5);
          }
        }
      }
    }
  }
  return new THREE.Vector3(cx + 0.5, CONFIG.WORLD_HEIGHT, cx + 0.5);
}

function respawn() {
  player.pos.copy(findSpawn());
  player.vel.set(0,0,0);
  controls.getObject().position.copy(player.pos);
}

function checkCol(x,y,z,r,h) {
  for (let bx = Math.floor(x-r); bx <= Math.floor(x+r); bx++) {
    for (let by = Math.floor(y); by <= Math.floor(y+h); by++) {
      for (let bz = Math.floor(z-r); bz <= Math.floor(z+r); bz++) {
        if (isSolid(bx,by,bz)) return { hit: true, y: by };
      }
    }
  }
  return { hit: false };
}

function updatePhysics(dt) {
  const r = CONFIG.PLAYER_RADIUS, h = CONFIG.PLAYER_HEIGHT;
  
  player.vel.y -= CONFIG.GRAVITY * dt;
  if (player.wantJump && player.onGround) { player.vel.y = CONFIG.JUMP_VELOCITY; player.onGround = false; }
  player.wantJump = false;

  player.pos.x += player.vel.x * dt;
  if (checkCol(player.pos.x, player.pos.y, player.pos.z, r, h).hit) {
    player.pos.x -= player.vel.x * dt;
    player.vel.x = 0;
  }

  player.pos.z += player.vel.z * dt;
  if (checkCol(player.pos.x, player.pos.y, player.pos.z, r, h).hit) {
    player.pos.z -= player.vel.z * dt;
    player.vel.z = 0;
  }

  player.onGround = false;
  player.pos.y += player.vel.y * dt;
  const col = checkCol(player.pos.x, player.pos.y, player.pos.z, r, h);
  if (col.hit) {
    if (player.vel.y < 0) { player.pos.y = col.y + 1 + 0.001; player.onGround = true; }
    else { player.pos.y = col.y - h - 0.001; }
    player.vel.y = 0;
  }

  if (player.pos.y < -20) respawn();
  controls.getObject().position.copy(player.pos);
}

// ============================================================
// Input
// ============================================================
const keys = { w:false, a:false, s:false, d:false, space:false, shift:false };
document.addEventListener('keydown', e => {
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space') { keys.space = true; e.preventDefault(); }
  if (e.code === 'ShiftLeft') keys.shift = true;
  if (e.code === 'KeyR') respawn();
});
document.addEventListener('keyup', e => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
  if (e.code === 'Space') keys.space = false;
  if (e.code === 'ShiftLeft') keys.shift = false;
});

let mobileInput = { x: 0, z: 0 };
let mobileLook = { x: 0, y: 0 };

if (isMobile) {
  const joyBase = document.getElementById('joystickBase');
  const joyStick = document.getElementById('joystickStick');
  let joyActive = false, joyCenter = { x: 0, y: 0 };

  joyBase.addEventListener('pointerdown', e => {
    joyActive = true;
    joyBase.setPointerCapture(e.pointerId);
    const rect = joyBase.getBoundingClientRect();
    joyCenter = { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
  });
  joyBase.addEventListener('pointermove', e => {
    if (!joyActive) return;
    const dx = e.clientX - joyCenter.x, dy = e.clientY - joyCenter.y;
    const max = 40, dist = Math.hypot(dx, dy), scale = dist > max ? max/dist : 1;
    joyStick.style.transform = `translate(${dx*scale}px, ${dy*scale}px)`;
    mobileInput.x = dx * scale / max;
    mobileInput.z = dy * scale / max;
  });
  joyBase.addEventListener('pointerup', () => {
    joyActive = false;
    joyStick.style.transform = 'translate(0,0)';
    mobileInput.x = mobileInput.z = 0;
  });

  let lookActive = false, lastP = { x: 0, y: 0 };
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) return;
    lookActive = true;
    lastP = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointermove', e => {
    if (!lookActive) return;
    mobileLook.x += e.clientX - lastP.x;
    mobileLook.y += e.clientY - lastP.y;
    lastP = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointerup', () => { lookActive = false; });

  let tap = null;
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) return;
    tap = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  document.addEventListener('pointerup', e => {
    if (!tap || e.target.closest('#joystickArea,#mobileButtons,#hotbar,#info-panel')) { tap = null; return; }
    if (Date.now() - tap.t < 200 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 15) doAction();
    tap = null;
  });

  modeBtn.onclick = () => setMode(mode === 'BREAK' ? 'PLACE' : 'BREAK');
  document.getElementById('jumpBtn').addEventListener('pointerdown', () => { player.wantJump = true; });
}

function getMoveDir() {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
  const dir = new THREE.Vector3();
  
  if (isMobile) {
    dir.addScaledVector(fwd, -mobileInput.z);
    dir.addScaledVector(right, mobileInput.x);
  } else {
    if (keys.w) dir.add(fwd);
    if (keys.s) dir.sub(fwd);
    if (keys.d) dir.add(right);
    if (keys.a) dir.sub(right);
  }
  if (dir.lengthSq() > 0) dir.normalize();
  return dir;
}

function applyMobileLook() {
  if (!isMobile) return;
  const sens = 0.003;
  controls.getObject().rotation.y -= mobileLook.x * sens;
  camera.rotation.x = clamp(camera.rotation.x - mobileLook.y * sens, -Math.PI/2 + 0.1, Math.PI/2 - 0.1);
  mobileLook.x = mobileLook.y = 0;
}

// ============================================================
// Game Loop
// ============================================================
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  applyMobileLook();
  if (!isMobile && keys.space) player.wantJump = true;

  const moveDir = getMoveDir();
  const speed = CONFIG.MOVE_SPEED * (keys.shift ? 1.5 : 1);
  const accel = player.onGround ? 30 : 15;
  player.vel.x += (moveDir.x * speed - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (moveDir.z * speed - player.vel.z) * Math.min(1, accel * dt);

  updatePhysics(dt);
  updateTarget();
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
console.log('Generating world...');
generateWorld();
generateTrees();
loadMods();
buildAllMeshes();
respawn();
loop();
console.log('Voxel Sandbox started!');
