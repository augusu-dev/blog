import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.1/examples/jsm/controls/PointerLockControls.js";
import { createNoise2D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";

/* =========================================================
  CONFIG + URL PARAMS
========================================================= */

const URLP = new URL(location.href).searchParams;

const CONFIG = {
  // World (URL override: ?size=24&h=20)
  WORLD_SIZE: clampInt(parseInt(URLP.get("size") ?? ""), 12, 64) ?? null, // nullなら自動
  WORLD_HEIGHT: clampInt(parseInt(URLP.get("h") ?? ""), 12, 48) ?? null,  // nullなら自動

  // Terrain
  NOISE_SCALE: 0.085,
  OCTAVES: 4,
  PERSISTENCE: 0.5,
  LACUNARITY: 2.0,
  BASE_HEIGHT: 5,
  HEIGHT_AMPLITUDE: 7,

  // Sand (water無しの代替の“低地っぽさ”)
  SAND_LEVEL: 6,           // この高さ以下で草→砂になりやすい
  SAND_CHANCE: 0.55,

  // Trees
  TREE_DENSITY: 0.025,
  TREE_MIN_H: 3,
  TREE_MAX_H: 5,

  // Rendering/Interaction
  REACH: 6.0,
  FOG_NEAR: 10,
  FOG_FAR: 62,

  // Player physics (F3)
  PLAYER_HEIGHT: 1.78,
  PLAYER_RADIUS: 0.32,     // AABB幅=2R
  GRAVITY: 20.0,
  JUMP_VELOCITY: 7.0,
  MOVE_SPEED: 5.2,
  AIR_CONTROL: 0.55,
  SPRINT_MULT: 1.45,

  // Save
  SAVE_KEY: "voxel_sandbox_save_v1",
};

const isTouchDevice = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

/* =========================================================
  BLOCK TYPES (6 slots, water無し)
========================================================= */

const BLOCK = {
  GRASS: 0,
  DIRT: 1,
  STONE: 2,
  SAND: 3,  // waterの代替
  LOG: 4,
  LEAF: 5,
};

const BLOCK_NAMES = ["GRASS", "DIRT", "STONE", "SAND", "LOG", "LEAF"];
const SOLID = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.LOG, BLOCK.LEAF]); // 全部固体扱い（簡略）

/* =========================================================
  RNG + SEED
========================================================= */

function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const urlSeed = URLP.get("seed");
let seedValue = urlSeed ? hashStringToInt(urlSeed) : (Date.now() >>> 0);

/* =========================================================
  SAVE LOAD (S1)
  - base: seed, size, height
  - diffs: key -> type (0..5), or -1 for removed
========================================================= */

function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch { return null; }
}
function writeSave(data) {
  try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data)); } catch {}
}

let saveData = loadSave();

// 「両方追加」解釈：URL seed/size/h があればそれ優先、なければ保存を続きから。
if (!urlSeed && saveData?.seed != null) {
  seedValue = saveData.seed >>> 0;
}

const rng = mulberry32(seedValue);
const noise2D = createNoise2D(rng);

/* =========================================================
  Auto world size (mobile-friendly)
========================================================= */

function autoWorldSize() {
  // モバイルは少し軽く
  if (isTouchDevice) return { size: 24, h: 20 };
  return { size: 32, h: 20 };
}
const autoWH = autoWorldSize();

const WORLD = {
  size: CONFIG.WORLD_SIZE ?? (saveData?.size ?? autoWH.size),
  height: CONFIG.WORLD_HEIGHT ?? (saveData?.height ?? autoWH.h),
};

document.getElementById("seedText").textContent = urlSeed ?? String(seedValue);
document.getElementById("sizeText").textContent = `${WORLD.size}x${WORLD.size}x${WORLD.height}`;

/* =========================================================
  THREE SETUP
========================================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c7ff);
scene.fog = new THREE.Fog(0x87c7ff, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 400);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(8, 12, 6);
scene.add(sun);

/* =========================================================
  Controls: Desktop (PointerLock) + Mobile (touch look + joystick)
========================================================= */

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const lockOverlay = document.getElementById("lockOverlay");
const lockButton = document.getElementById("lockButton");

if (!isTouchDevice) {
  lockButton.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => lockOverlay.classList.add("hidden"));
  controls.addEventListener("unlock", () => lockOverlay.classList.remove("hidden"));
} else {
  // mobile: overlay邪魔なので隠す
  lockOverlay.classList.add("hidden");
}

const mobileControls = document.getElementById("mobileControls");
if (isTouchDevice) mobileControls.style.display = "block";

/* =========================================================
  Texture generation (Canvas) (2)
========================================================= */

function makeCanvasTexture(drawFn, size = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  drawFn(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return { tex, canvas: c };
}
function randInt(n) { return (rng() * n) | 0; }

function drawSpeckle(g, size, base, speck, count) {
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const x = randInt(size), y = randInt(size);
    g.fillStyle = speck;
    g.fillRect(x, y, 1, 1);
  }
}

function texGrass() {
  // top grass-ish (green with noise), side-ish handled via same texture for simplicity
  return makeCanvasTexture((g, s) => {
    drawSpeckle(g, s, "#3bbf4a", "rgba(0,0,0,0.10)", s*s*0.07);
    for (let i = 0; i < s; i += 4) {
      g.fillStyle = "rgba(255,255,255,0.04)";
      g.fillRect(i, 0, 1, s);
    }
  });
}
function texDirt() {
  return makeCanvasTexture((g, s) => drawSpeckle(g, s, "#7a5132", "rgba(0,0,0,0.15)", s*s*0.12));
}
function texStone() {
  return makeCanvasTexture((g, s) => drawSpeckle(g, s, "#9aa0a6", "rgba(0,0,0,0.18)", s*s*0.10));
}
function texSand() {
  return makeCanvasTexture((g, s) => drawSpeckle(g, s, "#d9cf8b", "rgba(0,0,0,0.10)", s*s*0.06));
}
function texLog() {
  return makeCanvasTexture((g, s) => {
    g.fillStyle = "#8b5a2b"; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 4) {
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, 0, 1, s);
    }
    for (let i = 0; i < s*s*0.05; i++) {
      g.fillStyle = "rgba(255,255,255,0.04)";
      g.fillRect(randInt(s), randInt(s), 1, 1);
    }
  });
}
function texLeaf() {
  return makeCanvasTexture((g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = "rgba(47,168,79,0.95)";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s*s*0.18; i++) {
      const x = randInt(s), y = randInt(s);
      g.fillStyle = "rgba(0,0,0,0.10)";
      g.fillRect(x, y, 1, 1);
    }
    // 少し透明ムラ
    for (let i = 0; i < s*s*0.08; i++) {
      const x = randInt(s), y = randInt(s);
      g.clearRect(x, y, 1, 1);
    }
  });
}

const TEX = {
  [BLOCK.GRASS]: texGrass(),
  [BLOCK.DIRT]: texDirt(),
  [BLOCK.STONE]: texStone(),
  [BLOCK.SAND]: texSand(),
  [BLOCK.LOG]: texLog(),
  [BLOCK.LEAF]: texLeaf(),
};

function matFor(type) {
  const m = new THREE.MeshStandardMaterial({
    map: TEX[type].tex,
    roughness: 1.0,
    metalness: 0.0,
    transparent: type === BLOCK.LEAF,
    opacity: type === BLOCK.LEAF ? 0.92 : 1.0,
    alphaTest: type === BLOCK.LEAF ? 0.15 : 0.0,
  });
  return m;
}

/* =========================================================
  World data + Instanced rendering (P2)
========================================================= */

function clampInt(v, lo, hi) {
  if (!Number.isFinite(v)) return null;
  v = Math.trunc(v);
  if (v < lo || v > hi) return null;
  return v;
}

function keyOf(x, y, z) { return `${x},${y},${z}`; }
function parseKey(k) { const [x,y,z] = k.split(",").map(Number); return {x,y,z}; }

function inBounds(x, y, z) {
  return x >= 0 && x < WORLD.size && z >= 0 && z < WORLD.size && y >= 0 && y < WORLD.height;
}

const blocks = new Map();         // key -> type
const diffs = new Map();          // key -> type or -1

function getBlock(x, y, z) {
  const k = keyOf(x,y,z);
  if (diffs.has(k)) {
    const v = diffs.get(k);
    return v === -1 ? null : v;
  }
  return blocks.get(k) ?? null;
}
function isSolidAt(x, y, z) {
  const t = getBlock(x,y,z);
  return t != null && SOLID.has(t);
}
function isExposed(x, y, z) {
  // 6近傍に空気があるなら表示
  const dirs = [
    [ 1, 0, 0], [-1, 0, 0],
    [ 0, 1, 0], [ 0,-1, 0],
    [ 0, 0, 1], [ 0, 0,-1],
  ];
  for (const [dx,dy,dz] of dirs) {
    const nx = x+dx, ny = y+dy, nz = z+dz;
    if (!inBounds(nx,ny,nz)) return true; // 外は空気扱い
    if (!isSolidAt(nx,ny,nz)) return true;
  }
  return false;
}

const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

class TypeInstances {
  constructor(type, material) {
    this.type = type;
    this.mesh = new THREE.InstancedMesh(cubeGeo, material, 1);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // index -> key, key -> index
    this.indexToKey = [];
    this.keyToIndex = new Map();

    // scratch
    this._m = new THREE.Matrix4();
  }

  ensureCapacity(n) {
    if (this.mesh.instanceMatrix.count >= n) return;

    const newMesh = new THREE.InstancedMesh(cubeGeo, this.mesh.material, n);
    newMesh.count = this.mesh.count;
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // copy matrices
    const tmp = new THREE.Matrix4();
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.getMatrixAt(i, tmp);
      newMesh.setMatrixAt(i, tmp);
    }

    // preserve raycast results
    newMesh.userData.type = this.mesh.userData.type;

    scene.remove(this.mesh);
    this.mesh.dispose?.();
    this.mesh = newMesh;
    this.mesh.userData.type = this.type;
    scene.add(this.mesh);
  }

  has(key) { return this.keyToIndex.has(key); }

  addInstanceFor(key, x, y, z) {
    const idx = this.mesh.count;
    this.ensureCapacity(idx + 256); // ちょい余裕を持って増やす

    this._m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    this.mesh.setMatrixAt(idx, this._m);

    this.indexToKey[idx] = key;
    this.keyToIndex.set(key, idx);
    this.mesh.count++;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  removeInstanceFor(key) {
    const idx = this.keyToIndex.get(key);
    if (idx == null) return;

    const last = this.mesh.count - 1;
    if (idx !== last) {
      // swap last -> idx
      const tmp = new THREE.Matrix4();
      this.mesh.getMatrixAt(last, tmp);
      this.mesh.setMatrixAt(idx, tmp);

      const lastKey = this.indexToKey[last];
      this.indexToKey[idx] = lastKey;
      this.keyToIndex.set(lastKey, idx);
    }

    this.indexToKey.pop();
    this.keyToIndex.delete(key);
    this.mesh.count--;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  updateVisibilityFor(key, x, y, z, shouldBeVisible) {
    const visible = this.has(key);
    if (shouldBeVisible && !visible) this.addInstanceFor(key, x, y, z);
    if (!shouldBeVisible && visible) this.removeInstanceFor(key);
  }
}

const typeRenderers = new Map();
for (const t of Object.values(BLOCK)) {
  if (typeof t !== "number") continue;
  const tr = new TypeInstances(t, matFor(t));
  tr.mesh.userData.type = t;
  tr.ensureCapacity(256);
  scene.add(tr.mesh);
  typeRenderers.set(t, tr);
}

function updateBlockVisualAt(x, y, z) {
  if (!inBounds(x,y,z)) return;
  const k = keyOf(x,y,z);
  const t = getBlock(x,y,z);

  // いったん全タイプから削除（存在するかもなので）
  for (const tr of typeRenderers.values()) {
    if (tr.has(k)) tr.removeInstanceFor(k);
  }

  if (t == null) return;

  const visible = isExposed(x,y,z);
  if (!visible) return;

  typeRenderers.get(t).updateVisibilityFor(k, x, y, z, true);
}

function updateNeighborsVisual(x, y, z) {
  updateBlockVisualAt(x,y,z);
  updateBlockVisualAt(x+1,y,z);
  updateBlockVisualAt(x-1,y,z);
  updateBlockVisualAt(x,y+1,z);
  updateBlockVisualAt(x,y-1,z);
  updateBlockVisualAt(x,y,z+1);
  updateBlockVisualAt(x,y,z-1);
}

/* =========================================================
  World generation (Phase2) + apply diffs
========================================================= */

function fractalNoise(x, z) {
  let amp = 1.0, freq = 1.0, sum = 0.0, norm = 0.0;
  for (let o = 0; o < CONFIG.OCTAVES; o++) {
    const nx = x * CONFIG.NOISE_SCALE * freq;
    const nz = z * CONFIG.NOISE_SCALE * freq;
    const n = noise2D(nx, nz); // -1..1
    sum += n * amp;
    norm += amp;
    amp *= CONFIG.PERSISTENCE;
    freq *= CONFIG.LACUNARITY;
  }
  return sum / (norm || 1);
}
function heightAt(x, z) {
  const n = fractalNoise(x, z);
  const h = Math.floor(CONFIG.BASE_HEIGHT + n * CONFIG.HEIGHT_AMPLITUDE);
  return Math.max(1, Math.min(WORLD.height - 2, h));
}

function baseBlockTypeAt(x, y, z) {
  const h = heightAt(x,z);
  if (y > h) return null;

  const dirtDepth = 3;
  if (y === h) {
    // 低地は砂率を上げる（“水なし”のそれっぽさ）
    if (h <= CONFIG.SAND_LEVEL && rng() < CONFIG.SAND_CHANCE) return BLOCK.SAND;
    return BLOCK.GRASS;
  }
  if (y >= h - dirtDepth) return BLOCK.DIRT;
  return BLOCK.STONE;
}

function tryPlaceTreeBase(x, z) {
  const h = heightAt(x,z);
  if (h <= CONFIG.SAND_LEVEL + 1) return; // 低地には木を減らす
  const top = getBlock(x,h,z);
  if (top !== BLOCK.GRASS) return;

  if (x < 2 || z < 2 || x > WORLD.size - 3 || z > WORLD.size - 3) return;
  if (rng() >= CONFIG.TREE_DENSITY) return;

  const trunkH = CONFIG.TREE_MIN_H + ((rng() * (CONFIG.TREE_MAX_H - CONFIG.TREE_MIN_H + 1)) | 0);

  // trunk
  for (let i = 1; i <= trunkH; i++) {
    const y = h + i;
    if (!inBounds(x,y,z)) break;
    diffs.set(keyOf(x,y,z), BLOCK.LOG);
  }

  // leaves blob
  const leafBaseY = h + trunkH;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
        if (dist > 5) continue;
        const xx = x+dx, yy = leafBaseY+dy, zz = z+dz;
        if (!inBounds(xx,yy,zz)) continue;
        // 空気だけ葉に（幹は潰さない）
        if (getBlock(xx,yy,zz) == null) diffs.set(keyOf(xx,yy,zz), BLOCK.LEAF);
      }
    }
  }
  if (inBounds(x, leafBaseY+2, z) && getBlock(x, leafBaseY+2, z) == null) {
    diffs.set(keyOf(x, leafBaseY+2, z), BLOCK.LEAF);
  }
}

function generateBaseWorld() {
  blocks.clear();

  for (let x = 0; x < WORLD.size; x++) {
    for (let z = 0; z < WORLD.size; z++) {
      const h = heightAt(x,z);
      for (let y = 0; y <= h; y++) {
        const t = baseBlockTypeAt(x,y,z);
        if (t != null) blocks.set(keyOf(x,y,z), t);
      }
    }
  }
}

function clearAllInstances() {
  for (const tr of typeRenderers.values()) {
    tr.mesh.count = 0;
    tr.indexToKey.length = 0;
    tr.keyToIndex.clear();
    tr.mesh.instanceMatrix.needsUpdate = true;
  }
}

function rebuildAllVisibleInstances() {
  clearAllInstances();

  // visible only
  for (let x = 0; x < WORLD.size; x++) {
    for (let z = 0; z < WORLD.size; z++) {
      const h = heightAt(x,z);
      // ここは地形高さ+木の分を雑に上まで見て更新する
      for (let y = 0; y < WORLD.height; y++) {
        const t = getBlock(x,y,z);
        if (t == null) continue;
        if (!isExposed(x,y,z)) continue;
        typeRenderers.get(t).addInstanceFor(keyOf(x,y,z), x,y,z);
      }
    }
  }
}

function resetDiffsForNewWorld() {
  diffs.clear();
  // 木はdiffsで描く（生成直後に葉/幹を積む）
  for (let x = 0; x < WORLD.size; x++) {
    for (let z = 0; z < WORLD.size; z++) tryPlaceTreeBase(x,z);
  }
}

function applySavedDiffsIfAny() {
  // URL seed/size/h が入ってるときは基本 “新規” 扱い（保存のdiffは混ぜない）
  const hasExplicitWorld = URLP.has("seed") || URLP.has("size") || URLP.has("h");
  if (hasExplicitWorld) return;

  if (saveData?.seed === (seedValue >>> 0) && saveData?.diffs && typeof saveData.diffs === "object") {
    for (const [k, v] of Object.entries(saveData.diffs)) {
      if (typeof v === "number") diffs.set(k, v);
    }
  }
}

generateBaseWorld();
resetDiffsForNewWorld();
applySavedDiffsIfAny();
rebuildAllVisibleInstances();

/* =========================================================
  Player + Physics (F3): gravity + ground + wall collision
========================================================= */

const player = {
  pos: new THREE.Vector3(Math.floor(WORLD.size/2)+0.5, WORLD.height-2, Math.floor(WORLD.size/2)+0.5),
  vel: new THREE.Vector3(0,0,0),
  onGround: false,
  wantJump: false,
  sprint: false,
};

function findTopSolidY(x, z) {
  // 上から見て最初に見つかった solid のYを返す。なければ null。
  for (let y = WORLD.height - 1; y >= 0; y--) {
    if (isSolidAt(x, y, z)) return y;
  }
  return null;
}

function findSpawn() {
  // 中央から近い順に、ちゃんと地面がある地点を探す
  const cx = Math.floor(WORLD.size / 2);
  const cz = Math.floor(WORLD.size / 2);

  let best = null;

  for (let r = 0; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || x >= WORLD.size || z < 0 || z >= WORLD.size) continue;

        const y = findTopSolidY(x, z);
        if (y == null) continue;

        // 足元が地面で、頭上2ブロック分くらい空いてる場所が望ましい
        if (getBlock(x, y + 1, z) == null && getBlock(x, y + 2, z) == null) {
          best = { x, y, z };
          break;
        }
      }
      if (best) break;
    }
    if (best) break;
  }

  if (!best) {
    // 最悪、中央上空（ただし無限ループ回避のため高め）
    player.pos.set(cx + 0.5, WORLD.height - 2, cz + 0.5);
  } else {
    player.pos.set(best.x + 0.5, best.y + 1 + 0.01, best.z + 0.5);
  }

  player.vel.set(0, 0, 0);
}

findSpawn();
controls.getObject().position.copy(player.pos);

const EPS = 1e-4;

function collisionBounds(minX, minY, minZ, maxX, maxY, maxZ) {
  // max側は「ぴったり境界」を含めない（床に触れただけで衝突扱いになるのを防ぐ）
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ - EPS);

  let hit = false;
  let minBX = Infinity, maxBX = -Infinity;
  let minBY = Infinity, maxBY = -Infinity;
  let minBZ = Infinity, maxBZ = -Infinity;

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        if (!inBounds(x,y,z)) continue;
        if (!isSolidAt(x,y,z)) continue;

        hit = true;
        if (x < minBX) minBX = x;
        if (x > maxBX) maxBX = x;
        if (y < minBY) minBY = y;
        if (y > maxBY) maxBY = y;
        if (z < minBZ) minBZ = z;
        if (z > maxBZ) maxBZ = z;
      }
    }
  }

  return hit ? { hit, minBX, maxBX, minBY, maxBY, minBZ, maxBZ } : { hit:false };
}


function moveWithCollisions(dt, wishDir, wishSpeed) {
  // 横移動（地上/空中）
  const accel = player.onGround ? 45 : 45 * CONFIG.AIR_CONTROL;

  const targetVx = wishDir.x * wishSpeed;
  const targetVz = wishDir.z * wishSpeed;

  player.vel.x += (targetVx - player.vel.x) * Math.min(1, accel * dt);
  player.vel.z += (targetVz - player.vel.z) * Math.min(1, accel * dt);

  // 重力
  player.vel.y -= CONFIG.GRAVITY * dt;

  // ジャンプ
  if (player.wantJump && player.onGround) {
    player.vel.y = CONFIG.JUMP_VELOCITY;
    player.onGround = false;
  }
  player.wantJump = false;

  const r = CONFIG.PLAYER_RADIUS;
  const hh = CONFIG.PLAYER_HEIGHT;

  // サブステップ（高速落下でのすり抜け対策）
  const maxStep = 1 / 120;
  const steps = Math.max(1, Math.ceil(dt / maxStep));
  const stepDt = dt / steps;

  for (let i = 0; i < steps; i++) {
    // ---- X ----
    let dx = player.vel.x * stepDt;
    if (dx !== 0) {
      player.pos.x += dx;
      const b = collisionBounds(
        player.pos.x - r, player.pos.y,      player.pos.z - r,
        player.pos.x + r, player.pos.y + hh, player.pos.z + r
      );
      if (b.hit) {
        if (dx > 0) player.pos.x = b.minBX - r - EPS;
        else        player.pos.x = b.maxBX + 1 + r + EPS;
        player.vel.x = 0;
      }
    }

    // ---- Z ----
    let dz = player.vel.z * stepDt;
    if (dz !== 0) {
      player.pos.z += dz;
      const b = collisionBounds(
        player.pos.x - r, player.pos.y,      player.pos.z - r,
        player.pos.x + r, player.pos.y + hh, player.pos.z + r
      );
      if (b.hit) {
        if (dz > 0) player.pos.z = b.minBZ - r - EPS;
        else        player.pos.z = b.maxBZ + 1 + r + EPS;
        player.vel.z = 0;
      }
    }

    // ---- Y ----
    player.onGround = false;
    let dy = player.vel.y * stepDt;
    if (dy !== 0) {
      player.pos.y += dy;
      const b = collisionBounds(
        player.pos.x - r, player.pos.y,      player.pos.z - r,
        player.pos.x + r, player.pos.y + hh, player.pos.z + r
      );
      if (b.hit) {
        if (dy < 0) {
          // 着地：衝突したブロックの上面にスナップ
          player.pos.y = b.maxBY + 1 + EPS;
          player.onGround = true;
        } else {
          // 頭ぶつけ：衝突したブロックの下面にスナップ
          player.pos.y = b.minBY - hh - EPS;
        }
        player.vel.y = 0;
      }
    }
  }

  // 落下救済
  if (player.pos.y < -20) findSpawn();
}


/* =========================================================
  Input: Desktop keys + Mobile joystick/look + Mode toggle
========================================================= */

const keys = { w:false, a:false, s:false, d:false, space:false, shift:false };
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
  if (e.code === "Space") keys.space = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;

  // hotbar 1-6
  if (/Digit[1-6]/.test(e.code)) {
    selectSlot(parseInt(e.code.slice(5), 10) - 1);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
  if (e.code === "Space") keys.space = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
});

let mobileMove = { x:0, y:0 }; // joystick (-1..1)
let mobileLook = { dx:0, dy:0 }; // per-frame delta
let mode = "BREAK"; // or "PLACE"

const modeText = document.getElementById("modeText");
function setMode(m) {
  mode = m;
  modeText.textContent = `MODE:${mode}`;
  const btn = document.getElementById("btnMode");
  if (btn) btn.textContent = `MODE: ${mode}`;
}
setMode("BREAK");

if (isTouchDevice) {
  // Mode toggle
  document.getElementById("btnMode").addEventListener("click", () => {
    setMode(mode === "BREAK" ? "PLACE" : "BREAK");
  });
  document.getElementById("btnJump").addEventListener("pointerdown", () => {
    player.wantJump = true;
  });

  // Joystick
  const joy = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  let joyActive = false;
  let joyCenter = { x:0, y:0 };

  function setStick(dx, dy) {
    const max = 38;
    const len = Math.hypot(dx, dy);
    const k = len > max ? (max/len) : 1;
    const sx = dx*k, sy = dy*k;

    stick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    mobileMove.x = sx / max;
    mobileMove.y = sy / max;
  }

  joy.addEventListener("pointerdown", (e) => {
    joyActive = true;
    joy.setPointerCapture(e.pointerId);
    const r = joy.getBoundingClientRect();
    joyCenter.x = r.left + r.width/2;
    joyCenter.y = r.top + r.height/2;
    setStick(e.clientX - joyCenter.x, e.clientY - joyCenter.y);
  });
  joy.addEventListener("pointermove", (e) => {
    if (!joyActive) return;
    setStick(e.clientX - joyCenter.x, e.clientY - joyCenter.y);
  });
  joy.addEventListener("pointerup", () => {
    joyActive = false;
    stick.style.transform = "translate(-50%, -50%)";
    mobileMove.x = 0; mobileMove.y = 0;
  });

  // Look: right side drag (exclude joystick + buttons + hotbar)
  let lookActive = false;
  let last = { x:0, y:0 };

  window.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) return;
    lookActive = true;
    last.x = e.clientX; last.y = e.clientY;
  });
  window.addEventListener("pointermove", (e) => {
    if (!lookActive) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last.x = e.clientX; last.y = e.clientY;

    mobileLook.dx += dx;
    mobileLook.dy += dy;
  });
  window.addEventListener("pointerup", () => { lookActive = false; });

    // Tap to interact: 「短いタップ」だけ doAction
  let tap = null;

  window.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) return;
    tap = { x: e.clientX, y: e.clientY, time: performance.now() };
  });

  window.addEventListener("pointerup", (e) => {
    if (!tap) return;

    const t = e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) {
      tap = null;
      return;
    }

    const dt = performance.now() - tap.time;
    const dx = e.clientX - tap.x;
    const dy = e.clientY - tap.y;
    tap = null;

    // ほぼ動いてなくて短時間なら「タップ」
    if (dt < 280 && (dx*dx + dy*dy) < (10*10)) {
      doAction();
    }
  });
}



/* =========================================================
  Hotbar UI (Phase4)
========================================================= */

const hotbar = document.getElementById("hotbar");
let selectedSlot = 0;
const slotTypes = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.LOG, BLOCK.LEAF];

function buildHotbar() {
  hotbar.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const type = slotTypes[i];
    const el = document.createElement("div");
    el.className = "slot" + (i === selectedSlot ? " selected" : "");
    el.dataset.slot = String(i);

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = String(i+1);
    el.appendChild(num);

    // icon canvas (use texture canvas)
    const icon = document.createElement("canvas");
    icon.width = icon.height = 32;
    const g = icon.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(TEX[type].canvas, 0, 0);
    el.appendChild(icon);

    el.addEventListener("click", () => selectSlot(i));
    hotbar.appendChild(el);
  }
}
function selectSlot(i) {
  selectedSlot = (i + 6) % 6;
  [...hotbar.querySelectorAll(".slot")].forEach((s, idx) => {
    s.classList.toggle("selected", idx === selectedSlot);
  });
}
buildHotbar();
selectSlot(0);

/* =========================================================
  Raycast + Highlight + Break/Place (Phase3)
========================================================= */

const raycaster = new THREE.Raycaster();
raycaster.far = CONFIG.REACH;

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
);
highlight.visible = false;
scene.add(highlight);

let aimed = null; // {x,y,z, faceNormal}

function updateAimed() {
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);

  const meshes = [...typeRenderers.values()].map(tr => tr.mesh);
  const hits = raycaster.intersectObjects(meshes, false);

  if (!hits.length) {
    aimed = null;
    highlight.visible = false;
    return;
  }

  const hit = hits[0];
  const inst = hit.object;
  const type = inst.userData.type;

  const tr = typeRenderers.get(type);
  const key = tr.indexToKey[hit.instanceId];
  if (!key) {
    aimed = null;
    highlight.visible = false;
    return;
  }
  const {x,y,z} = parseKey(key);

  // face normal (local) -> world (no rotation in instances, so ok)
  const fn = hit.face?.normal?.clone() ?? new THREE.Vector3(0,1,0);

  aimed = { x,y,z, faceNormal: fn };

  highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
  highlight.visible = true;
}

function setDiffBlock(x, y, z, typeOrNull) {
  if (!inBounds(x,y,z)) return false;

  const k = keyOf(x,y,z);
  const base = blocks.get(k) ?? null;

  if (typeOrNull == null) {
    // remove
    if (base == null && !diffs.has(k)) return false;
    diffs.set(k, -1);
  } else {
    // place/replace
    diffs.set(k, typeOrNull);
  }

  updateNeighborsVisual(x,y,z);
  scheduleSave();
  return true;
}

function doAction() {
  if (!aimed) return;

  if (mode === "BREAK") {
    setDiffBlock(aimed.x, aimed.y, aimed.z, null);
    // 簡易“気持ちよさ”：軽いフェード
    highlight.material.opacity = 0.2;
    setTimeout(() => highlight.material.opacity = 0.9, 60);
  } else {
    const nx = aimed.x + Math.round(aimed.faceNormal.x);
    const ny = aimed.y + Math.round(aimed.faceNormal.y);
    const nz = aimed.z + Math.round(aimed.faceNormal.z);
    if (!inBounds(nx,ny,nz)) return;
    if (getBlock(nx,ny,nz) != null) return;

    const t = slotTypes[selectedSlot];
    setDiffBlock(nx,ny,nz,t);
  }
}

if (!isTouchDevice) {
  window.addEventListener("mousedown", (e) => {
    if (!controls.isLocked) return;
    if (e.button === 0) { // left
      mode = "BREAK";
      doAction();
    } else if (e.button === 2) { // right
      mode = "PLACE";
      doAction();
    }
    // UI表示は固定したいのでここではmodeTextだけ更新
    setMode(mode);
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("wheel", (e) => {
    if (!controls.isLocked) return;
    if (e.deltaY > 0) selectSlot(selectedSlot + 1);
    else selectSlot(selectedSlot - 1);
  }, { passive: true });
}

/* =========================================================
  Save (throttled)
========================================================= */

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const out = {
      seed: seedValue >>> 0,
      size: WORLD.size,
      height: WORLD.height,
      diffs: Object.fromEntries(diffs.entries()),
      ts: Date.now(),
    };
    writeSave(out);
    saveData = out;
  }, 500);
}

/* =========================================================
  Animation loop
========================================================= */

const clock = new THREE.Clock();

function getWishDir() {
  // forward/right from camera yaw
  const forward = new THREE.Vector3();
  controls.getDirection(forward);
  forward.y = 0; forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

  let mx = 0, mz = 0;

  if (isTouchDevice) {
    // joystick: y is down positive in screen, so invert for forward
    mz += (-mobileMove.y);
    mx += ( mobileMove.x);
  } else {
    if (keys.w) mz += 1;
    if (keys.s) mz -= 1;
    if (keys.d) mx += 1;
    if (keys.a) mx -= 1;
  }

  const dir = new THREE.Vector3();
  dir.addScaledVector(forward, mz);
  dir.addScaledVector(right, mx);
  if (dir.lengthSq() > 0) dir.normalize();

  return dir;
}

function applyMobileLook(dt) {
  // touch look sensitivity
  const sens = 0.0024;
  const yaw = -mobileLook.dx * sens;
  const pitch = -mobileLook.dy * sens;

  mobileLook.dx = 0;
  mobileLook.dy = 0;

  // PointerLockControlsは内部objectのrotationを扱うので、同じオブジェクトに回転を適用
  // controls.getObject() is yaw object, camera is pitch object in PointerLockControls implementation.
  // ここは実装依存なので、安全にDOM event無しで自前回転を当てる：
  const obj = controls.getObject();
  obj.rotation.y += yaw;
  camera.rotation.x += pitch;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI/2 + 0.01, Math.PI/2 - 0.01);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (isTouchDevice) {
    applyMobileLook(dt);
  }

  // jump
  if (!isTouchDevice && keys.space) player.wantJump = true;

  const wishDir = getWishDir();
  const sprint = (!isTouchDevice && keys.shift);
  const wishSpeed = CONFIG.MOVE_SPEED * (sprint ? CONFIG.SPRINT_MULT : 1.0);

  moveWithCollisions(dt, wishDir, wishSpeed);

  controls.getObject().position.copy(player.pos);

  // aim + highlight
  updateAimed();

  renderer.render(scene, camera);
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* =========================================================
  Small UX tweaks
========================================================= */

// 初回ロード時にモード表示を合わせる
setMode(mode);

// デバッグ用：Rでリスポーン
addEventListener("keydown", (e) => {
  if (e.code === "KeyR") findSpawn();
});
  // セーブ消去：Deleteキー
addEventListener("keydown", (e) => {
  if (e.code === "Delete") {
    localStorage.removeItem(CONFIG.SAVE_KEY);
    location.reload();
  }
});

