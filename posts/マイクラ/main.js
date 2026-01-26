// ============================================================
// Voxel Sandbox - Complete Edition
// Three.js r136 (CDN direct import compatible)
// ============================================================

import * as THREE from 'https://unpkg.com/three@0.136.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.136.0/examples/jsm/controls/PointerLockControls.js';

// ============================================================
// Error Handler
// ============================================================
const errorDisplay = document.getElementById('errorDisplay');
function showError(msg) {
  console.error(msg);
  if (errorDisplay) {
    errorDisplay.textContent = msg;
    errorDisplay.classList.add('show');
  }
}
window.onerror = (msg) => showError('Error: ' + msg);
window.onunhandledrejection = (e) => showError('Promise Error: ' + (e.reason?.message || e.reason));

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
// Simplex Noise (Self-contained implementation)
// ============================================================
class SimplexNoise {
  constructor(random = Math.random) {
    this.p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(x, y) {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const grad3 = [
      [1,1],[−1,1],[1,−1],[−1,−1],
      [1,0],[−1,0],[1,0],[−1,0],
      [0,1],[0,−1],[0,1],[0,−1]
    ];

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    const dot = (g, x, y) => g[0] * x + g[1] * y;

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * dot(grad3[gi0], x0, y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * dot(grad3[gi1], x1, y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * dot(grad3[gi2], x2, y2);
    }

    return 70 * (n0 + n1 + n2);
  }
}

// ============================================================
// Configuration
// ============================================================
const urlParams = new URLSearchParams(window.location.search);
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
  || ('ontouchstart' in window) 
  || (navigator.maxTouchPoints > 0);

const CONFIG = {
  WORLD_SIZE: parseInt(urlParams.get('size')) || (isMobile ? 24 : 32),
  WORLD_HEIGHT: parseInt(urlParams.get('h')) || 24,
  NOISE_SCALE: 0.08,
  BASE_HEIGHT: 8,
  HEIGHT_AMP: 10,
  TREE_CHANCE: 0.02,
  PLAYER_HEIGHT: 1.7,
  PLAYER_RADIUS: 0.3,
  MOVE_SPEED: 5,
  JUMP_VELOCITY: 8,
  GRAVITY: 20,
  REACH_DISTANCE: 5,
  SAVE_KEY: 'voxel_sandbox_v3'
};

// Validate config
CONFIG.WORLD_SIZE = clamp(CONFIG.WORLD_SIZE, 16, 64);
CONFIG.WORLD_HEIGHT = clamp(CONFIG.WORLD_HEIGHT, 16, 48);

// ============================================================
// Block Types
// ============================================================
const BLOCKS = {
  AIR: -1,
  GRASS: 0,
  DIRT: 1,
  STONE: 2,
  SAND: 3,
  WOOD: 4,
  LEAVES: 5
};

const BLOCK_COLORS = {
  [BLOCKS.GRASS]: '#4a9c2d',
  [BLOCKS.DIRT]: '#8b5a2b',
  [BLOCKS.STONE]: '#808080',
  [BLOCKS.SAND]: '#c2b280',
  [BLOCKS.WOOD]: '#8b4513',
  [BLOCKS.LEAVES]: '#228b22'
};

// ============================================================
// Save/Load System
// ============================================================
function loadSave() {
  try {
    const data = localStorage.getItem(CONFIG.SAVE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Save failed:', e);
  }
}

let saveData = loadSave();

// Seed determination
const urlSeed = urlParams.get('seed');
let worldSeed;
if (urlSeed) {
  worldSeed = hashString(urlSeed);
} else if (saveData?.seed) {
  worldSeed = saveData.seed;
} else {
  worldSeed = Date.now() >>> 0;
}

const rng = seededRandom(worldSeed);
const noise = new SimplexNoise(rng);

// Display info
document.getElementById('seedDisplay').textContent = urlSeed || worldSeed;
document.getElementById('sizeDisplay').textContent = `${CONFIG.WORLD_SIZE}×${CONFIG.WORLD_SIZE}×${CONFIG.WORLD_HEIGHT}`;

// ============================================================
// Three.js Setup
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(CONFIG.WORLD_SIZE / 2, CONFIG.WORLD_HEIGHT + 5, CONFIG.WORLD_SIZE / 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

// ============================================================
// Controls
// ============================================================
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const lockOverlay = document.getElementById('lockOverlay');
const startBtn = document.getElementById('startBtn');

if (!isMobile) {
  startBtn.addEventListener('click', () => {
    controls.lock();
  });

  controls.addEventListener('lock', () => {
    lockOverlay.classList.add('hidden');
  });

  controls.addEventListener('unlock', () => {
    lockOverlay.classList.remove('hidden');
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());
} else {
  lockOverlay.classList.add('hidden');
}

// ============================================================
// Texture Generation
// ============================================================
function createBlockTexture(baseColor, noiseAmount = 0.1) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');

  // Parse base color
  const tempDiv = document.createElement('div');
  tempDiv.style.color = baseColor;
  document.body.appendChild(tempDiv);
  const computedColor = getComputedStyle(tempDiv).color;
  document.body.removeChild(tempDiv);

  const rgb = computedColor.match(/\d+/g).map(Number);

  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const variation = (rng() - 0.5) * noiseAmount * 255;
      const r = clamp(rgb[0] + variation, 0, 255);
      const g = clamp(rgb[1] + variation, 0, 255);
      const b = clamp(rgb[2] + variation, 0, 255);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return { texture, canvas };
}

const blockTextures = {};
const blockCanvases = {};

for (const [name, type] of Object.entries(BLOCKS)) {
  if (type === BLOCKS.AIR) continue;
  const { texture, canvas } = createBlockTexture(BLOCK_COLORS[type], type === BLOCKS.LEAVES ? 0.15 : 0.1);
  blockTextures[type] = texture;
  blockCanvases[type] = canvas;
}

// ============================================================
// World Data
// ============================================================
function coordKey(x, y, z) {
  return `${x},${y},${z}`;
}

function parseKey(key) {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function inBounds(x, y, z) {
  return x >= 0 && x < CONFIG.WORLD_SIZE &&
         y >= 0 && y < CONFIG.WORLD_HEIGHT &&
         z >= 0 && z < CONFIG.WORLD_SIZE;
}

const baseWorld = new Map();  // Generated terrain
const modifications = new Map();  // Player changes

function getBlock(x, y, z) {
  if (!inBounds(x, y, z)) return BLOCKS.AIR;
  const key = coordKey(x, y, z);
  if (modifications.has(key)) {
    return modifications.get(key);
  }
  return baseWorld.get(key) ?? BLOCKS.AIR;
}

function setBlock(x, y, z, type) {
  if (!inBounds(x, y, z)) return;
  const key = coordKey(x, y, z);
  modifications.set(key, type);
  updateBlockMesh(x, y, z);
  updateNeighborMeshes(x, y, z);
  scheduleSave();
}

function isSolid(x, y, z) {
  const block = getBlock(x, y, z);
  return block !== BLOCKS.AIR;
}

// ============================================================
// Terrain Generation
// ============================================================
function getTerrainHeight(x, z) {
  const n1 = noise.noise2D(x * CONFIG.NOISE_SCALE, z * CONFIG.NOISE_SCALE);
  const n2 = noise.noise2D(x * CONFIG.NOISE_SCALE * 2, z * CONFIG.NOISE_SCALE * 2) * 0.5;
  const combined = (n1 + n2) / 1.5;
  return Math.floor(CONFIG.BASE_HEIGHT + combined * CONFIG.HEIGHT_AMP);
}

function generateTerrain() {
  baseWorld.clear();

  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      const height = clamp(getTerrainHeight(x, z), 1, CONFIG.WORLD_HEIGHT - 2);

      for (let y = 0; y <= height; y++) {
        let blockType;
        if (y === height) {
          blockType = height < 6 ? BLOCKS.SAND : BLOCKS.GRASS;
        } else if (y > height - 4) {
          blockType = BLOCKS.DIRT;
        } else {
          blockType = BLOCKS.STONE;
        }
        baseWorld.set(coordKey(x, y, z), blockType);
      }
    }
  }
}

function generateTrees() {
  for (let x = 2; x < CONFIG.WORLD_SIZE - 2; x++) {
    for (let z = 2; z < CONFIG.WORLD_SIZE - 2; z++) {
      const height = clamp(getTerrainHeight(x, z), 1, CONFIG.WORLD_HEIGHT - 2);
      
      if (height < 7) continue;
      if (getBlock(x, height, z) !== BLOCKS.GRASS) continue;
      if (rng() > CONFIG.TREE_CHANCE) continue;

      const trunkHeight = 4 + Math.floor(rng() * 2);

      // Trunk
      for (let y = 1; y <= trunkHeight; y++) {
        if (inBounds(x, height + y, z)) {
          modifications.set(coordKey(x, height + y, z), BLOCKS.WOOD);
        }
      }

      // Leaves
      const leafBase = height + trunkHeight - 1;
      for (let dy = 0; dy <= 2; dy++) {
        const radius = dy === 2 ? 1 : 2;
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx === 0 && dz === 0 && dy < 2) continue;
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            const lx = x + dx;
            const ly = leafBase + dy;
            const lz = z + dz;
            if (inBounds(lx, ly, lz) && getBlock(lx, ly, lz) === BLOCKS.AIR) {
              modifications.set(coordKey(lx, ly, lz), BLOCKS.LEAVES);
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
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const instancedMeshes = new Map();
const blockToInstance = new Map();  // coordKey -> { type, index }
const instanceToBlock = new Map();  // type -> [coordKey, ...]

function createMaterial(type) {
  return new THREE.MeshLambertMaterial({
    map: blockTextures[type],
    transparent: type === BLOCKS.LEAVES,
    opacity: type === BLOCKS.LEAVES ? 0.9 : 1,
    alphaTest: type === BLOCKS.LEAVES ? 0.1 : 0
  });
}

function ensureInstancedMesh(type) {
  if (!instancedMeshes.has(type)) {
    const mesh = new THREE.InstancedMesh(boxGeometry, createMaterial(type), 50000);
    mesh.count = 0;
    mesh.userData.blockType = type;
    scene.add(mesh);
    instancedMeshes.set(type, mesh);
    instanceToBlock.set(type, []);
  }
  return instancedMeshes.get(type);
}

function isExposed(x, y, z) {
  if (!isSolid(x, y, z)) return false;
  return !isSolid(x + 1, y, z) || !isSolid(x - 1, y, z) ||
         !isSolid(x, y + 1, z) || !isSolid(x, y - 1, z) ||
         !isSolid(x, y, z + 1) || !isSolid(x, y, z - 1);
}

const tempMatrix = new THREE.Matrix4();

function addBlockInstance(x, y, z, type) {
  const mesh = ensureInstancedMesh(type);
  const blocks = instanceToBlock.get(type);
  const key = coordKey(x, y, z);

  const index = mesh.count;
  tempMatrix.setPosition(x + 0.5, y + 0.5, z + 0.5);
  mesh.setMatrixAt(index, tempMatrix);
  mesh.count++;
  mesh.instanceMatrix.needsUpdate = true;

  blocks[index] = key;
  blockToInstance.set(key, { type, index });
}

function removeBlockInstance(key) {
  const info = blockToInstance.get(key);
  if (!info) return;

  const { type, index } = info;
  const mesh = instancedMeshes.get(type);
  const blocks = instanceToBlock.get(type);

  if (mesh.count > 1 && index < mesh.count - 1) {
    // Swap with last
    const lastKey = blocks[mesh.count - 1];
    mesh.getMatrixAt(mesh.count - 1, tempMatrix);
    mesh.setMatrixAt(index, tempMatrix);
    blocks[index] = lastKey;
    blockToInstance.set(lastKey, { type, index });
  }

  mesh.count--;
  mesh.instanceMatrix.needsUpdate = true;
  blocks.pop();
  blockToInstance.delete(key);
}

function updateBlockMesh(x, y, z) {
  const key = coordKey(x, y, z);
  const type = getBlock(x, y, z);

  // Remove existing instance
  if (blockToInstance.has(key)) {
    removeBlockInstance(key);
  }

  // Add new instance if visible
  if (type !== BLOCKS.AIR && isExposed(x, y, z)) {
    addBlockInstance(x, y, z, type);
  }
}

function updateNeighborMeshes(x, y, z) {
  const neighbors = [
    [x + 1, y, z], [x - 1, y, z],
    [x, y + 1, z], [x, y - 1, z],
    [x, y, z + 1], [x, y, z - 1]
  ];
  for (const [nx, ny, nz] of neighbors) {
    if (inBounds(nx, ny, nz)) {
      updateBlockMesh(nx, ny, nz);
    }
  }
}

function buildAllMeshes() {
  // Clear existing
  for (const [type, mesh] of instancedMeshes) {
    mesh.count = 0;
    instanceToBlock.set(type, []);
  }
  blockToInstance.clear();

  // Build visible blocks
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
        const type = getBlock(x, y, z);
        if (type !== BLOCKS.AIR && isExposed(x, y, z)) {
          addBlockInstance(x, y, z, type);
        }
      }
    }
  }
}

// ============================================================
// Hotbar
// ============================================================
const hotbarTypes = [BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.STONE, BLOCKS.SAND, BLOCKS.WOOD, BLOCKS.LEAVES];
let selectedSlot = 0;

function buildHotbar() {
  const hotbar = document.getElementById('hotbar');
  hotbar.innerHTML = '';

  hotbarTypes.forEach((type, index) => {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (index === selectedSlot ? ' selected' : '');

    const number = document.createElement('span');
    number.className = 'slot-number';
    number.textContent = index + 1;
    slot.appendChild(number);

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(blockCanvases[type], 0, 0);
    slot.appendChild(canvas);

    slot.addEventListener('click', () => selectSlot(index));
    hotbar.appendChild(slot);
  });
}

function selectSlot(index) {
  selectedSlot = (index + 6) % 6;
  document.querySelectorAll('.hotbar-slot').forEach((slot, i) => {
    slot.classList.toggle('selected', i === selectedSlot);
  });
}

buildHotbar();

// Keyboard slot selection
document.addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '6') {
    selectSlot(parseInt(e.key) - 1);
  }
});

// Mouse wheel slot selection
document.addEventListener('wheel', (e) => {
  if (!controls.isLocked && !isMobile) return;
  selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
});

// ============================================================
// Raycasting & Block Interaction
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.far = CONFIG.REACH_DISTANCE;

const highlightBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
);
highlightBox.visible = false;
scene.add(highlightBox);

let targetBlock = null;
let targetFace = null;

function updateTargetBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const meshArray = Array.from(instancedMeshes.values());
  const intersects = raycaster.intersectObjects(meshArray, false);

  if (intersects.length === 0) {
    targetBlock = null;
    targetFace = null;
    highlightBox.visible = false;
    return;
  }

  const hit = intersects[0];
  const type = hit.object.userData.blockType;
  const blocks = instanceToBlock.get(type);
  const key = blocks[hit.instanceId];

  if (!key) {
    targetBlock = null;
    targetFace = null;
    highlightBox.visible = false;
    return;
  }

  targetBlock = parseKey(key);
  targetFace = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);

  highlightBox.position.set(
    targetBlock.x + 0.5,
    targetBlock.y + 0.5,
    targetBlock.z + 0.5
  );
  highlightBox.visible = true;
}

// ============================================================
// Mode & Actions
// ============================================================
let currentMode = 'BREAK';
const modeDisplay = document.getElementById('modeDisplay');
const modeBtn = document.getElementById('modeBtn');

function setMode(mode) {
  currentMode = mode;
  modeDisplay.textContent = mode;
  if (modeBtn) modeBtn.textContent = 'MODE: ' + mode;
}

function doAction(overrideMode = null) {
  if (!targetBlock) return;

  const mode = overrideMode || currentMode;

  if (mode === 'BREAK') {
    setBlock(targetBlock.x, targetBlock.y, targetBlock.z, BLOCKS.AIR);
  } else {
    const nx = targetBlock.x + Math.round(targetFace.x);
    const ny = targetBlock.y + Math.round(targetFace.y);
    const nz = targetBlock.z + Math.round(targetFace.z);

    if (!inBounds(nx, ny, nz)) return;
    if (getBlock(nx, ny, nz) !== BLOCKS.AIR) return;

    // Don't place inside player
    const playerBox = {
      minX: player.position.x - CONFIG.PLAYER_RADIUS,
      maxX: player.position.x + CONFIG.PLAYER_RADIUS,
      minY: player.position.y,
      maxY: player.position.y + CONFIG.PLAYER_HEIGHT,
      minZ: player.position.z - CONFIG.PLAYER_RADIUS,
      maxZ: player.position.z + CONFIG.PLAYER_RADIUS
    };

    if (nx + 1 > playerBox.minX && nx < playerBox.maxX &&
        ny + 1 > playerBox.minY && ny < playerBox.maxY &&
        nz + 1 > playerBox.minZ && nz < playerBox.maxZ) {
      return;
    }

    setBlock(nx, ny, nz, hotbarTypes[selectedSlot]);
  }
}

// Desktop mouse controls
if (!isMobile) {
  document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked) return;
    if (e.button === 0) {
      setMode('BREAK');
      doAction('BREAK');
    } else if (e.button === 2) {
      setMode('PLACE');
      doAction('PLACE');
    }
  });
}

// ============================================================
// Save System
// ============================================================
let saveTimeout = null;

function scheduleSave() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    writeSave({
      seed: worldSeed,
      size: CONFIG.WORLD_SIZE,
      height: CONFIG.WORLD_HEIGHT,
      modifications: Object.fromEntries(modifications),
      timestamp: Date.now()
    });
  }, 500);
}

// Load saved modifications
function loadModifications() {
  if (!saveData) return;
  if (saveData.seed !== worldSeed) return;
  if (saveData.size !== CONFIG.WORLD_SIZE) return;

  if (saveData.modifications) {
    for (const [key, type] of Object.entries(saveData.modifications)) {
      modifications.set(key, type);
    }
  }
}

// Reset button
document.getElementById('resetBtn').addEventListener('click', () => {
  localStorage.removeItem(CONFIG.SAVE_KEY);
  location.reload();
});

// ============================================================
// Player Physics
// ============================================================
const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  onGround: false,
  wantJump: false
};

function findSpawnPoint() {
  const cx = Math.floor(CONFIG.WORLD_SIZE / 2);
  const cz = Math.floor(CONFIG.WORLD_SIZE / 2);

  for (let r = 0; r <= 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const x = cx + dx;
        const z = cz + dz;
        if (!inBounds(x, 0, z)) continue;

        for (let y = CONFIG.WORLD_HEIGHT - 2; y >= 0; y--) {
          if (isSolid(x, y, z) && !isSolid(x, y + 1, z) && !isSolid(x, y + 2, z)) {
            return new THREE.Vector3(x + 0.5, y + 1.01, z + 0.5);
          }
        }
      }
    }
  }

  return new THREE.Vector3(cx + 0.5, CONFIG.WORLD_HEIGHT, cz + 0.5);
}

function respawn() {
  const spawn = findSpawnPoint();
  player.position.copy(spawn);
  player.velocity.set(0, 0, 0);
  controls.getObject().position.copy(player.position);
}

function checkCollision(x, y, z, width, height) {
  const minX = Math.floor(x - width);
  const maxX = Math.floor(x + width);
  const minY = Math.floor(y);
  const maxY = Math.floor(y + height);
  const minZ = Math.floor(z - width);
  const maxZ = Math.floor(z + width);

  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (isSolid(bx, by, bz)) {
          return { hit: true, x: bx, y: by, z: bz };
        }
      }
    }
  }
  return { hit: false };
}

function updatePhysics(dt) {
  const r = CONFIG.PLAYER_RADIUS;
  const h = CONFIG.PLAYER_HEIGHT;

  // Apply gravity
  player.velocity.y -= CONFIG.GRAVITY * dt;

  // Jump
  if (player.wantJump && player.onGround) {
    player.velocity.y = CONFIG.JUMP_VELOCITY;
    player.onGround = false;
  }
  player.wantJump = false;

  // Move X
  player.position.x += player.velocity.x * dt;
  if (checkCollision(player.position.x, player.position.y, player.position.z, r, h).hit) {
    player.position.x -= player.velocity.x * dt;
    player.velocity.x = 0;
  }

  // Move Z
  player.position.z += player.velocity.z * dt;
  if (checkCollision(player.position.x, player.position.y, player.position.z, r, h).hit) {
    player.position.z -= player.velocity.z * dt;
    player.velocity.z = 0;
  }

  // Move Y
  player.onGround = false;
  player.position.y += player.velocity.y * dt;
  const collision = checkCollision(player.position.x, player.position.y, player.position.z, r, h);
  if (collision.hit) {
    if (player.velocity.y < 0) {
      player.position.y = collision.y + 1 + 0.001;
      player.onGround = true;
    } else {
      player.position.y = collision.y - h - 0.001;
    }
    player.velocity.y = 0;
  }

  // Fall respawn
  if (player.position.y < -20) {
    respawn();
  }

  // Update camera
  controls.getObject().position.copy(player.position);
}

// ============================================================
// Input Handling
// ============================================================
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': keys.w = true; break;
    case 'KeyA': keys.a = true; break;
    case 'KeyS': keys.s = true; break;
    case 'KeyD': keys.d = true; break;
    case 'Space': keys.space = true; e.preventDefault(); break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = true; break;
    case 'KeyR': respawn(); break;
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': keys.w = false; break;
    case 'KeyA': keys.a = false; break;
    case 'KeyS': keys.s = false; break;
    case 'KeyD': keys.d = false; break;
    case 'Space': keys.space = false; break;
    case 'ShiftLeft': case 'ShiftRight': keys.shift = false; break;
  }
});

// Mobile controls
let mobileInput = { x: 0, z: 0 };
let mobileLookDelta = { x: 0, y: 0 };

if (isMobile) {
  const joystickBase = document.getElementById('joystickBase');
  const joystickStick = document.getElementById('joystickStick');
  let joystickActive = false;
  let joystickCenter = { x: 0, y: 0 };

  joystickBase.addEventListener('pointerdown', (e) => {
    joystickActive = true;
    joystickBase.setPointerCapture(e.pointerId);
    const rect = joystickBase.getBoundingClientRect();
    joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });

  joystickBase.addEventListener('pointermove', (e) => {
    if (!joystickActive) return;
    const dx = e.clientX - joystickCenter.x;
    const dy = e.clientY - joystickCenter.y;
    const maxDist = 40;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist > maxDist ? maxDist / dist : 1;
    const sx = dx * scale;
    const sy = dy * scale;

    joystickStick.style.transform = `translate(${sx}px, ${sy}px)`;
    mobileInput.x = sx / maxDist;
    mobileInput.z = sy / maxDist;
  });

  joystickBase.addEventListener('pointerup', () => {
    joystickActive = false;
    joystickStick.style.transform = 'translate(0, 0)';
    mobileInput.x = 0;
    mobileInput.z = 0;
  });

  // Look controls
  let lookActive = false;
  let lastPointer = { x: 0, y: 0 };

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#joystickArea, #mobileButtons, #hotbar, #info-panel')) return;
    lookActive = true;
    lastPointer = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('pointermove', (e) => {
    if (!lookActive) return;
    mobileLookDelta.x += e.clientX - lastPointer.x;
    mobileLookDelta.y += e.clientY - lastPointer.y;
    lastPointer = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener('pointerup', () => {
    lookActive = false;
  });

  // Tap to action
  let tapStart = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#joystickArea, #mobileButtons, #hotbar, #info-panel')) return;
    tapStart = { x: e.clientX, y: e.clientY, time: Date.now() };
  });

  document.addEventListener('pointerup', (e) => {
    if (!tapStart) return;
    if (e.target.closest('#joystickArea, #mobileButtons, #hotbar, #info-panel')) {
      tapStart = null;
      return;
    }
    const dx = e.clientX - tapStart.x;
    const dy = e.clientY - tapStart.y;
    const dt = Date.now() - tapStart.time;
    tapStart = null;

    if (dt < 200 && dx * dx + dy * dy < 100) {
      doAction();
    }
  });

  // Mode button
  modeBtn.addEventListener('click', () => {
    setMode(currentMode === 'BREAK' ? 'PLACE' : 'BREAK');
  });

  // Jump button
  document.getElementById('jumpBtn').addEventListener('pointerdown', () => {
    player.wantJump = true;
  });
}

function getMovementDirection() {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const direction = new THREE.Vector3();

  if (isMobile) {
    direction.addScaledVector(forward, -mobileInput.z);
    direction.addScaledVector(right, mobileInput.x);
  } else {
    if (keys.w) direction.add(forward);
    if (keys.s) direction.sub(forward);
    if (keys.d) direction.add(right);
    if (keys.a) direction.sub(right);
  }

  if (direction.lengthSq() > 0) direction.normalize();
  return direction;
}

function applyMobileLook() {
  if (!isMobile) return;

  const sensitivity = 0.003;
  const obj = controls.getObject();

  obj.rotation.y -= mobileLookDelta.x * sensitivity;
  camera.rotation.x -= mobileLookDelta.y * sensitivity;
  camera.rotation.x = clamp(camera.rotation.x, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);

  mobileLookDelta.x = 0;
  mobileLookDelta.y = 0;
}

// ============================================================
// Game Loop
// ============================================================
const clock = new THREE.Clock();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.05);

  // Mobile look
  applyMobileLook();

  // Movement
  if (!isMobile && keys.space) player.wantJump = true;

  const moveDir = getMovementDirection();
  const speed = CONFIG.MOVE_SPEED * (keys.shift ? 1.5 : 1);
  const accel = player.onGround ? 30 : 15;

  player.velocity.x += (moveDir.x * speed - player.velocity.x) * Math.min(1, accel * dt);
  player.velocity.z += (moveDir.z * speed - player.velocity.z) * Math.min(1, accel * dt);

  // Physics
  updatePhysics(dt);

  // Raycasting
  updateTargetBlock();

  // Render
  renderer.render(scene, camera);
}

// ============================================================
// Window Resize
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// Initialization
// ============================================================
console.log('Generating terrain...');
generateTerrain();
console.log('Generating trees...');
generateTrees();
console.log('Loading modifications...');
loadModifications();
console.log('Building meshes...');
buildAllMeshes();
console.log('Finding spawn...');
respawn();
console.log('Starting game loop...');
gameLoop();

console.log('Voxel Sandbox initialized!');
console.log(`World: ${CONFIG.WORLD_SIZE}x${CONFIG.WORLD_SIZE}x${CONFIG.WORLD_HEIGHT}`);
console.log(`Seed: ${worldSeed}`);
