import * as THREE from "https://unpkg.com/three@0.160.1/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.1/examples/jsm/controls/PointerLockControls.js";
import { createNoise2D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js";

/* =========================================================
  Safety / Debug overlay (mobileでも黒画面で止まらないため)
========================================================= */
const errEl = document.getElementById("err");
function showErr(msg) { if (errEl) errEl.textContent = String(msg ?? ""); }
window.addEventListener("error", (e) => showErr("JS ERROR: " + (e?.message ?? e)));
window.addEventListener("unhandledrejection", (e) => showErr("PROMISE ERROR: " + (e?.reason?.message ?? e?.reason ?? e)));

/* =========================================================
  Utils
========================================================= */
function clampInt(v, lo, hi) {
  if (!Number.isFinite(v)) return null;
  v = Math.trunc(v);
  if (v < lo || v > hi) return null;
  return v;
}
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

const URLP = new URL(location.href).searchParams;
const isTouchDevice = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

const CONFIG = {
  // URL override: ?size=24&h=20&seed=abc
  WORLD_SIZE: clampInt(parseInt(URLP.get("size") ?? "", 10), 12, 64),
  WORLD_HEIGHT: clampInt(parseInt(URLP.get("h") ?? "", 10), 12, 48),

  NOISE_SCALE: 0.085,
  OCTAVES: 4,
  PERSISTENCE: 0.5,
  LACUNARITY: 2.0,
  BASE_HEIGHT: 5,
  HEIGHT_AMPLITUDE: 7,

  // water無し → 低地を砂っぽく
  SAND_LEVEL: 6,
  SAND_CHANCE: 0.55,

  TREE_DENSITY: 0.025,
  TREE_MIN_H: 3,
  TREE_MAX_H: 5,

  REACH: 6.0,
  FOG_NEAR: 10,
  FOG_FAR: 62,

  // physics
  PLAYER_HEIGHT: 1.78,
  PLAYER_RADIUS: 0.32,
  GRAVITY: 20.0,
  JUMP_VELOCITY: 7.0,
  MOVE_SPEED: 5.2,
  AIR_CONTROL: 0.55,
  SPRINT_MULT: 1.45,

  SAVE_KEY: "voxel_sandbox_save_v2",
};

const BLOCK = { GRASS:0, DIRT:1, STONE:2, SAND:3, LOG:4, LEAF:5 };
const BLOCK_NAMES = ["GRASS","DIRT","STONE","SAND","LOG","LEAF"];
const SOLID = new Set([0,1,2,3,4,5]);

/* =========================================================
  Save (S1)
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

document.getElementById("btnReset").addEventListener("click", () => {
  localStorage.removeItem(CONFIG.SAVE_KEY);
  location.reload();
});

/* seed決定：URL seedが最優先。なければ保存のseed。なければ日時 */
const urlSeed = URLP.get("seed");
let seedValue = urlSeed ? hashStringToInt(urlSeed) : (saveData?.seed ?? (Date.now() >>> 0));

/* =========================================================
  World size (mobile-friendly)
========================================================= */
function autoWorldSize() {
  if (isTouchDevice) return { size: 24, h: 20 };
  return { size: 32, h: 20 };
}
const autoWH = autoWorldSize();

const WORLD = {
  size: CONFIG.WORLD_SIZE ?? (urlSeed ? autoWH.size : (saveData?.size ?? autoWH.size)),
  height: CONFIG.WORLD_HEIGHT ?? (urlSeed ? autoWH.h : (saveData?.height ?? autoWH.h)),
};

document.getElementById("seedText").textContent = urlSeed ?? String(seedValue);
document.getElementById("sizeText").textContent = `${WORLD.size}x${WORLD.size}x${WORLD.height}`;

/* URLでワールド指定（seed/size/h）されてる場合は保存diffを混ぜない */
const hasExplicitWorld = URLP.has("seed") || URLP.has("size") || URLP.has("h");

/* =========================================================
  RNG + Noise
========================================================= */
const rng = mulberry32(seedValue >>> 0);
const noise2D = createNoise2D(rng);

/* =========================================================
  Three.js setup
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
  Controls (PC PointerLock / Mobile touch look)
========================================================= */
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const lockOverlay = document.getElementById("lockOverlay");
const lockButton = document.getElementById("lockButton");
if (!isTouchDevice) {
  lockButton.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => lockOverlay.classList.add("hidden"));
  controls.addEventListener("unlock", () => lockOverlay.classList.remove("hidden"));
  window.addEventListener("contextmenu", (e) => e.preventDefault());
} else {
  lockOverlay.classList.add("hidden");
  document.getElementById("mobileControls").style.display = "block";
}

/* =========================================================
  Textures (Canvas) + Materials
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
    g.fillStyle = speck;
    g.fillRect(randInt(size), randInt(size), 1, 1);
  }
}
function texGrass() { return makeCanvasTexture((g,s)=>{ drawSpeckle(g,s,"#3bbf4a","rgba(0,0,0,0.10)",s*s*0.07); }); }
function texDirt()  { return makeCanvasTexture((g,s)=> drawSpeckle(g,s,"#7a5132","rgba(0,0,0,0.15)",s*s*0.12)); }
function texStone() { return makeCanvasTexture((g,s)=> drawSpeckle(g,s,"#9aa0a6","rgba(0,0,0,0.18)",s*s*0.10)); }
function texSand()  { return makeCanvasTexture((g,s)=> drawSpeckle(g,s,"#d9cf8b","rgba(0,0,0,0.10)",s*s*0.06)); }
function texLog()   { return makeCanvasTexture((g,s)=>{ g.fillStyle="#8b5a2b";g.fillRect(0,0,s,s); for(let x=0;x<s;x+=4){ g.fillStyle="rgba(0,0,0,0.12)"; g.fillRect(x,0,1,s);} }); }
function texLeaf()  { return makeCanvasTexture((g,s)=>{ g.fillStyle="rgba(47,168,79,0.95)"; g.fillRect(0,0,s,s); for(let i=0;i<s*s*0.20;i++){ g.fillStyle="rgba(0,0,0,0.10)"; g.fillRect(randInt(s),randInt(s),1,1);} for(let i=0;i<s*s*0.08;i++){ g.clearRect(randInt(s),randInt(s),1,1);} }); }

const TEX = {
  [BLOCK.GRASS]: texGrass(),
  [BLOCK.DIRT]: texDirt(),
  [BLOCK.STONE]: texStone(),
  [BLOCK.SAND]: texSand(),
  [BLOCK.LOG]: texLog(),
  [BLOCK.LEAF]: texLeaf(),
};

function matFor(type) {
  return new THREE.MeshStandardMaterial({
    map: TEX[type].tex,
    roughness: 1.0,
    metalness: 0.0,
    transparent: type === BLOCK.LEAF,
    opacity: type === BLOCK.LEAF ? 0.92 : 1.0,
    alphaTest: type === BLOCK.LEAF ? 0.15 : 0.0,
  });
}

/* =========================================================
  World data
========================================================= */
function keyOf(x,y,z){ return `${x},${y},${z}`; }
function parseKey(k){ const [x,y,z]=k.split(",").map(Number); return {x,y,z}; }
function inBounds(x,y,z){ return x>=0&&x<WORLD.size && z>=0&&z<WORLD.size && y>=0&&y<WORLD.height; }

const baseBlocks = new Map(); // key->type
const diffs = new Map();      // key->type or -1

function getBlock(x,y,z){
  const k=keyOf(x,y,z);
  if (diffs.has(k)) {
    const v = diffs.get(k);
    return v === -1 ? null : v;
  }
  return baseBlocks.get(k) ?? null;
}
function isSolidAt(x,y,z){
  const t=getBlock(x,y,z);
  return t != null && SOLID.has(t);
}
function isExposed(x,y,z){
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const [dx,dy,dz] of dirs){
    const nx=x+dx, ny=y+dy, nz=z+dz;
    if (!inBounds(nx,ny,nz)) return true;
    if (!isSolidAt(nx,ny,nz)) return true;
  }
  return false;
}

/* =========================================================
  Instanced rendering (P2)
========================================================= */
const cubeGeo = new THREE.BoxGeometry(1,1,1);

class TypeInstances {
  constructor(type){
    this.type = type;
    this.mesh = new THREE.InstancedMesh(cubeGeo, matFor(type), 1);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.userData.type = type;
    this.indexToKey = [];
    this.keyToIndex = new Map();
    this._m = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  ensureCapacity(minCap){
    if (this.mesh.instanceMatrix.count >= minCap) return;
    const newCap = Math.max(minCap, this.mesh.instanceMatrix.count + 512);
    const newMesh = new THREE.InstancedMesh(cubeGeo, this.mesh.material, newCap);
    newMesh.count = this.mesh.count;
    newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    newMesh.userData.type = this.type;
    const tmp = new THREE.Matrix4();
    for (let i=0;i<this.mesh.count;i++){ this.mesh.getMatrixAt(i,tmp); newMesh.setMatrixAt(i,tmp); }
    scene.remove(this.mesh);
    this.mesh = newMesh;
    scene.add(this.mesh);
  }
  has(key){ return this.keyToIndex.has(key); }
  add(key,x,y,z){
    const idx = this.mesh.count;
    this.ensureCapacity(idx+1);
    this._m.makeTranslation(x+0.5,y+0.5,z+0.5);
    this.mesh.setMatrixAt(idx,this._m);
    this.indexToKey[idx]=key;
    this.keyToIndex.set(key,idx);
    this.mesh.count++;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  remove(key){
    const idx = this.keyToIndex.get(key);
    if (idx == null) return;
    const last = this.mesh.count - 1;
    if (idx !== last){
      const tmp = new THREE.Matrix4();
      this.mesh.getMatrixAt(last,tmp);
      this.mesh.setMatrixAt(idx,tmp);
      const lastKey = this.indexToKey[last];
      this.indexToKey[idx]=lastKey;
      this.keyToIndex.set(lastKey,idx);
    }
    this.indexToKey.pop();
    this.keyToIndex.delete(key);
    this.mesh.count--;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const typeRenderers = new Map();
for (const t of Object.values(BLOCK)) {
  if (typeof t !== "number") continue;
  typeRenderers.set(t, new TypeInstances(t));
}

function updateVisualAt(x,y,z){
  if (!inBounds(x,y,z)) return;
  const k = keyOf(x,y,z);
  const t = getBlock(x,y,z);

  // まず全タイプから消す（あってもなくてもOK）
  for (const tr of typeRenderers.values()) if (tr.has(k)) tr.remove(k);

  if (t == null) return;
  if (!isExposed(x,y,z)) return;

  typeRenderers.get(t).add(k,x,y,z);
}
function updateVisualNeighbors(x,y,z){
  updateVisualAt(x,y,z);
  updateVisualAt(x+1,y,z); updateVisualAt(x-1,y,z);
  updateVisualAt(x,y+1,z); updateVisualAt(x,y-1,z);
  updateVisualAt(x,y,z+1); updateVisualAt(x,y,z-1);
}

function clearAllInstances(){
  for (const tr of typeRenderers.values()){
    tr.mesh.count = 0;
    tr.indexToKey.length = 0;
    tr.keyToIndex.clear();
    tr.mesh.instanceMatrix.needsUpdate = true;
  }
}
function rebuildAllVisible(){
  clearAllInstances();
  for (let x=0;x<WORLD.size;x++){
    for (let z=0;z<WORLD.size;z++){
      for (let y=0;y<WORLD.height;y++){
        const t = getBlock(x,y,z);
        if (t == null) continue;
        if (!isExposed(x,y,z)) continue;
        typeRenderers.get(t).add(keyOf(x,y,z),x,y,z);
      }
    }
  }
}

/* =========================================================
  Terrain generation
========================================================= */
function fractalNoise(x,z){
  let amp=1,freq=1,sum=0,norm=0;
  for (let o=0;o<CONFIG.OCTAVES;o++){
    sum += noise2D(x*CONFIG.NOISE_SCALE*freq, z*CONFIG.NOISE_SCALE*freq) * amp;
    norm += amp;
    amp *= CONFIG.PERSISTENCE;
    freq *= CONFIG.LACUNARITY;
  }
  return sum/(norm||1);
}
function heightAt(x,z){
  const n = fractalNoise(x,z);
  const h = Math.floor(CONFIG.BASE_HEIGHT + n*CONFIG.HEIGHT_AMPLITUDE);
  return Math.max(1, Math.min(WORLD.height-2, h));
}
function baseTypeAt(x,y,z){
  const h = heightAt(x,z);
  if (y>h) return null;
  const dirtDepth = 3;
  if (y===h){
    if (h <= CONFIG.SAND_LEVEL && rng() < CONFIG.SAND_CHANCE) return BLOCK.SAND;
    return BLOCK.GRASS;
  }
  if (y >= h - dirtDepth) return BLOCK.DIRT;
  return BLOCK.STONE;
}

function generateBaseWorld(){
  baseBlocks.clear();
  for (let x=0;x<WORLD.size;x++){
    for (let z=0;z<WORLD.size;z++){
      const h = heightAt(x,z);
      for (let y=0;y<=h;y++){
        const t = baseTypeAt(x,y,z);
        if (t != null) baseBlocks.set(keyOf(x,y,z), t);
      }
    }
  }
}

function addTree(x,z){
  const h = heightAt(x,z);
  if (h <= CONFIG.SAND_LEVEL + 1) return;
  if (getBlock(x,h,z) !== BLOCK.GRASS) return;
  if (x < 2 || z < 2 || x > WORLD.size-3 || z > WORLD.size-3) return;
  if (rng() >= CONFIG.TREE_DENSITY) return;

  const trunkH = CONFIG.TREE_MIN_H + ((rng()*(CONFIG.TREE_MAX_H-CONFIG.TREE_MIN_H+1))|0);
  for (let i=1;i<=trunkH;i++){
    const y = h+i;
    if (!inBounds(x,y,z)) break;
    diffs.set(keyOf(x,y,z), BLOCK.LOG);
  }
  const leafBase = h+trunkH;
  for (let dx=-2;dx<=2;dx++){
    for (let dz=-2;dz<=2;dz++){
      for (let dy=-1;dy<=1;dy++){
        const dist = Math.abs(dx)+Math.abs(dz)+Math.abs(dy);
        if (dist>5) continue;
        const xx=x+dx, yy=leafBase+dy, zz=z+dz;
        if (!inBounds(xx,yy,zz)) continue;
        if (getBlock(xx,yy,zz)==null) diffs.set(keyOf(xx,yy,zz), BLOCK.LEAF);
      }
    }
  }
  if (inBounds(x,leafBase+2,z) && getBlock(x,leafBase+2,z)==null) diffs.set(keyOf(x,leafBase+2,z), BLOCK.LEAF);
}

function resetDiffsForNewWorld(){
  diffs.clear();
  for (let x=0;x<WORLD.size;x++){
    for (let z=0;z<WORLD.size;z++) addTree(x,z);
  }
}

function applySavedDiffsIfAny(){
  if (hasExplicitWorld) return;
  if (saveData?.seed === (seedValue>>>0) && saveData?.diffs && typeof saveData.diffs === "object"){
    for (const [k,v] of Object.entries(saveData.diffs)){
      if (typeof v === "number") diffs.set(k,v);
    }
  }
}

generateBaseWorld();
resetDiffsForNewWorld();
applySavedDiffsIfAny();
rebuildAllVisible();

/* =========================================================
  Hotbar
========================================================= */
const hotbar = document.getElementById("hotbar");
const slotTypes = [BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.LOG,BLOCK.LEAF];
let selectedSlot = 0;

function buildHotbar(){
  hotbar.innerHTML = "";
  for (let i=0;i<6;i++){
    const type = slotTypes[i];
    const el = document.createElement("div");
    el.className = "slot" + (i===selectedSlot ? " selected" : "");
    const num = document.createElement("div");
    num.className = "num";
    num.textContent = String(i+1);
    el.appendChild(num);

    const icon = document.createElement("canvas");
    icon.width = icon.height = 32;
    const g = icon.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(TEX[type].canvas,0,0);
    el.appendChild(icon);

    el.addEventListener("click", () => selectSlot(i));
    hotbar.appendChild(el);
  }
}
function selectSlot(i){
  selectedSlot = (i+6)%6;
  [...hotbar.querySelectorAll(".slot")].forEach((s,idx)=>s.classList.toggle("selected", idx===selectedSlot));
}
buildHotbar();
selectSlot(0);

/* =========================================================
  Aim + Highlight + Place/Break
========================================================= */
const raycaster = new THREE.Raycaster();
raycaster.far = CONFIG.REACH;

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01,1.01,1.01)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
);
highlight.visible = false;
scene.add(highlight);

let aimed = null; // {x,y,z, faceNormal}

function updateAimed(){
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const meshes = [...typeRenderers.values()].map(tr=>tr.mesh);
  const hits = raycaster.intersectObjects(meshes,false);
  if (!hits.length){ aimed=null; highlight.visible=false; return; }

  const hit = hits[0];
  const type = hit.object.userData.type;
  const tr = typeRenderers.get(type);
  const key = tr.indexToKey[hit.instanceId];
  if (!key){ aimed=null; highlight.visible=false; return; }

  const {x,y,z} = parseKey(key);
  const fn = hit.face?.normal?.clone() ?? new THREE.Vector3(0,1,0);
  aimed = {x,y,z, faceNormal: fn};

  highlight.position.set(x+0.5,y+0.5,z+0.5);
  highlight.visible = true;
}

let saveTimer = null;
function scheduleSave(){
  if (hasExplicitWorld) return; // URL指定ワールドは保存しない（混乱防止）
  if (saveTimer) return;
  saveTimer = setTimeout(()=>{
    saveTimer = null;
    const out = {
      seed: seedValue>>>0,
      size: WORLD.size,
      height: WORLD.height,
      diffs: Object.fromEntries(diffs.entries()),
      ts: Date.now(),
    };
    writeSave(out);
    saveData = out;
  }, 400);
}

function setDiffBlock(x,y,z,typeOrNull){
  if (!inBounds(x,y,z)) return false;
  const k = keyOf(x,y,z);
  if (typeOrNull == null) diffs.set(k, -1);
  else diffs.set(k, typeOrNull);

  updateVisualNeighbors(x,y,z);
  scheduleSave();
  return true;
}

let mode = "BREAK";
const modeText = document.getElementById("modeText");
function setMode(m){
  mode = m;
  if (modeText) modeText.textContent = `MODE:${mode}`;
  const btn = document.getElementById("btnMode");
  if (btn) btn.textContent = `MODE: ${mode}`;
}
setMode("BREAK");

function doAction(actionMode){
  if (!aimed) return;
  const m = actionMode ?? mode;

  if (m === "BREAK"){
    setDiffBlock(aimed.x, aimed.y, aimed.z, null);
    highlight.material.opacity = 0.2;
    setTimeout(()=>highlight.material.opacity=0.9, 60);
  } else {
    const nx = aimed.x + Math.round(aimed.faceNormal.x);
    const ny = aimed.y + Math.round(aimed.faceNormal.y);
    const nz = aimed.z + Math.round(aimed.faceNormal.z);
    if (!inBounds(nx,ny,nz)) return;
    if (getBlock(nx,ny,nz) != null) return;
    setDiffBlock(nx,ny,nz, slotTypes[selectedSlot]);
  }
}

/* Desktop mouse */
if (!isTouchDevice){
  window.addEventListener("mousedown", (e)=>{
    if (!controls.isLocked) return;
    if (e.button===0){ setMode("BREAK"); doAction("BREAK"); }
    if (e.button===2){ setMode("PLACE"); doAction("PLACE"); }
  });
  window.addEventListener("wheel", (e)=>{
    if (!controls.isLocked) return;
    selectSlot(selectedSlot + (e.deltaY>0 ? 1 : -1));
  }, { passive:true });

  window.addEventListener("keydown", (e)=>{
    if (/Digit[1-6]/.test(e.code)) selectSlot(parseInt(e.code.slice(5),10)-1);
  });
}

/* =========================================================
  Player + Physics (F3)
========================================================= */
const player = {
  pos: new THREE.Vector3(0,0,0),
  vel: new THREE.Vector3(0,0,0),
  onGround: false,
  wantJump: false,
};

const EPS = 1e-4;

function findTopSolidY(x,z){
  for (let y=WORLD.height-1;y>=0;y--) if (isSolidAt(x,y,z)) return y;
  return null;
}
function findSpawn(){
  const cx = Math.floor(WORLD.size/2);
  const cz = Math.floor(WORLD.size/2);
  let best = null;

  for (let r=0;r<=10;r++){
    for (let dx=-r;dx<=r;dx++){
      for (let dz=-r;dz<=r;dz++){
        const x=cx+dx, z=cz+dz;
        if (x<0||x>=WORLD.size||z<0||z>=WORLD.size) continue;
        const y = findTopSolidY(x,z);
        if (y==null) continue;
        if (getBlock(x,y+1,z)==null && getBlock(x,y+2,z)==null) { best={x,y,z}; break; }
      }
      if (best) break;
    }
    if (best) break;
  }

  if (!best) player.pos.set(cx+0.5, WORLD.height-2, cz+0.5);
  else player.pos.set(best.x+0.5, best.y+1+0.02, best.z+0.5);
  player.vel.set(0,0,0);
}
findSpawn();
controls.getObject().position.copy(player.pos);

function collisionBounds(minX,minY,minZ,maxX,maxY,maxZ){
  const x0=Math.floor(minX), x1=Math.floor(maxX-EPS);
  const y0=Math.floor(minY), y1=Math.floor(maxY-EPS);
  const z0=Math.floor(minZ), z1=Math.floor(maxZ-EPS);

  let hit=false;
  let minBX=Infinity,maxBX=-Infinity,minBY=Infinity,maxBY=-Infinity,minBZ=Infinity,maxBZ=-Infinity;

  for (let x=x0;x<=x1;x++) for (let y=y0;y<=y1;y++) for (let z=z0;z<=z1;z++){
    if (!inBounds(x,y,z)) continue;
    if (!isSolidAt(x,y,z)) continue;
    hit=true;
    if (x<minBX) minBX=x; if (x>maxBX) maxBX=x;
    if (y<minBY) minBY=y; if (y>maxBY) maxBY=y;
    if (z<minBZ) minBZ=z; if (z>maxBZ) maxBZ=z;
  }
  return hit ? {hit,minBX,maxBX,minBY,maxBY,minBZ,maxBZ} : {hit:false};
}

function moveWithCollisions(dt, wishDir, wishSpeed){
  const accel = player.onGround ? 45 : 45 * CONFIG.AIR_CONTROL;
  const targetVx = wishDir.x * wishSpeed;
  const targetVz = wishDir.z * wishSpeed;

  player.vel.x += (targetVx - player.vel.x) * Math.min(1, accel*dt);
  player.vel.z += (targetVz - player.vel.z) * Math.min(1, accel*dt);

  player.vel.y -= CONFIG.GRAVITY * dt;

  if (player.wantJump && player.onGround){
    player.vel.y = CONFIG.JUMP_VELOCITY;
    player.onGround = false;
  }
  player.wantJump = false;

  const r = CONFIG.PLAYER_RADIUS;
  const hh = CONFIG.PLAYER_HEIGHT;

  const maxStep = 1/120;
  const steps = Math.max(1, Math.ceil(dt/maxStep));
  const sdt = dt/steps;

  for (let i=0;i<steps;i++){
    // X
    let dx = player.vel.x * sdt;
    if (dx){
      player.pos.x += dx;
      const b = collisionBounds(player.pos.x-r, player.pos.y, player.pos.z-r, player.pos.x+r, player.pos.y+hh, player.pos.z+r);
      if (b.hit){
        player.pos.x = dx>0 ? (b.minBX - r - EPS) : (b.maxBX + 1 + r + EPS);
        player.vel.x = 0;
      }
    }
    // Z
    let dz = player.vel.z * sdt;
    if (dz){
      player.pos.z += dz;
      const b = collisionBounds(player.pos.x-r, player.pos.y, player.pos.z-r, player.pos.x+r, player.pos.y+hh, player.pos.z+r);
      if (b.hit){
        player.pos.z = dz>0 ? (b.minBZ - r - EPS) : (b.maxBZ + 1 + r + EPS);
        player.vel.z = 0;
      }
    }
    // Y
    player.onGround = false;
    let dy = player.vel.y * sdt;
    if (dy){
      player.pos.y += dy;
      const b = collisionBounds(player.pos.x-r, player.pos.y, player.pos.z-r, player.pos.x+r, player.pos.y+hh, player.pos.z+r);
      if (b.hit){
        if (dy < 0){
          player.pos.y = b.maxBY + 1 + EPS;
          player.onGround = true;
        } else {
          player.pos.y = b.minBY - hh - EPS;
        }
        player.vel.y = 0;
      }
    }
  }

  if (player.pos.y < -30) findSpawn();
}

/* =========================================================
  Input: keyboard + mobile joystick/look + tap action
========================================================= */
const keys = { w:false,a:false,s:false,d:false,space:false,shift:false };
window.addEventListener("keydown",(e)=>{
  if (e.code==="KeyW") keys.w=true;
  if (e.code==="KeyA") keys.a=true;
  if (e.code==="KeyS") keys.s=true;
  if (e.code==="KeyD") keys.d=true;
  if (e.code==="Space") keys.space=true;
  if (e.code==="ShiftLeft"||e.code==="ShiftRight") keys.shift=true;
  if (e.code==="KeyR") findSpawn();
});
window.addEventListener("keyup",(e)=>{
  if (e.code==="KeyW") keys.w=false;
  if (e.code==="KeyA") keys.a=false;
  if (e.code==="KeyS") keys.s=false;
  if (e.code==="KeyD") keys.d=false;
  if (e.code==="Space") keys.space=false;
  if (e.code==="ShiftLeft"||e.code==="ShiftRight") keys.shift=false;
});

let mobileMove = { x:0, y:0 };
let mobileLook = { dx:0, dy:0 };

if (isTouchDevice){
  document.getElementById("btnMode").addEventListener("click", ()=>{
    setMode(mode==="BREAK" ? "PLACE" : "BREAK");
  });
  document.getElementById("btnJump").addEventListener("pointerdown", ()=>{
    player.wantJump = true;
  });

  // joystick
  const joy = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  let joyActive=false;
  let joyCenter={x:0,y:0};

  function setStick(dx,dy){
    const max=38;
    const len=Math.hypot(dx,dy);
    const k=len>max ? (max/len) : 1;
    const sx=dx*k, sy=dy*k;
    stick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;
    mobileMove.x = sx/max;
    mobileMove.y = sy/max;
  }

  joy.addEventListener("pointerdown",(e)=>{
    joyActive=true;
    joy.setPointerCapture(e.pointerId);
    const r=joy.getBoundingClientRect();
    joyCenter={x:r.left+r.width/2, y:r.top+r.height/2};
    setStick(e.clientX-joyCenter.x, e.clientY-joyCenter.y);
  });
  joy.addEventListener("pointermove",(e)=>{
    if (!joyActive) return;
    setStick(e.clientX-joyCenter.x, e.clientY-joyCenter.y);
  });
  joy.addEventListener("pointerup",()=>{
    joyActive=false;
    stick.style.transform="translate(-50%, -50%)";
    mobileMove.x=0; mobileMove.y=0;
  });

  // look drag (right side)
  let lookActive=false;
  let last={x:0,y:0};
  window.addEventListener("pointerdown",(e)=>{
    const t=e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) return;
    lookActive=true;
    last={x:e.clientX,y:e.clientY};
  });
  window.addEventListener("pointermove",(e)=>{
    if (!lookActive) return;
    const dx=e.clientX-last.x, dy=e.clientY-last.y;
    last={x:e.clientX,y:e.clientY};
    mobileLook.dx += dx;
    mobileLook.dy += dy;
  });
  window.addEventListener("pointerup",()=>{ lookActive=false; });

  // tap action (short tap only)
  let tap=null;
  window.addEventListener("pointerdown",(e)=>{
    const t=e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) return;
    tap={x:e.clientX,y:e.clientY,time:performance.now()};
  });
  window.addEventListener("pointerup",(e)=>{
    if (!tap) return;
    const t=e.target;
    if (t.closest?.("#joystick") || t.closest?.("#mobileButtons") || t.closest?.("#hotbar") || t.closest?.("#help")) { tap=null; return; }
    const dt=performance.now()-tap.time;
    const dx=e.clientX-tap.x, dy=e.clientY-tap.y;
    tap=null;
    if (dt<280 && (dx*dx+dy*dy)<(10*10)) doAction();
  });
}

/* =========================================================
  Per-frame helpers
========================================================= */
function getWishDir(){
  const forward = new THREE.Vector3();
  controls.getDirection(forward);
  forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

  let mx=0, mz=0;
  if (isTouchDevice){
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
  if (dir.lengthSq()>0) dir.normalize();
  return dir;
}

function applyMobileLook(){
  const sens = 0.0024;
  const yaw = -mobileLook.dx * sens;
  const pitch = -mobileLook.dy * sens;
  mobileLook.dx = 0; mobileLook.dy = 0;

  const obj = controls.getObject();
  obj.rotation.y += yaw;
  camera.rotation.x += pitch;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x, -Math.PI/2+0.01, Math.PI/2-0.01);
}

/* =========================================================
  Loop
========================================================= */
const clock = new THREE.Clock();
renderer.setAnimationLoop(()=>{
  const dt = Math.min(clock.getDelta(), 0.05);

  if (isTouchDevice) applyMobileLook();

  if (!isTouchDevice && keys.space) player.wantJump = true;

  const wishDir = getWishDir();
  const sprint = (!isTouchDevice && keys.shift);
  const wishSpeed = CONFIG.MOVE_SPEED * (sprint ? CONFIG.SPRINT_MULT : 1.0);

  moveWithCollisions(dt, wishDir, wishSpeed);
  controls.getObject().position.copy(player.pos);

  updateAimed();
  renderer.render(scene, camera);
});

addEventListener("resize", ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
