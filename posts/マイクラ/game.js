// ============================================
// VoxelCraft - マインクラフト風ゲーム
// ============================================

// グローバル変数
let scene, camera, renderer, canvas;
let world = {};
let player = {
    velocity: new THREE.Vector3(),
    position: new THREE.Vector3(0, 50, 0),
    rotation: { x: 0, y: 0 },
    onGround: false,
    selectedBlock: 1,
    inventory: []
};
let keys = {};
let mouseDown = { left: false, right: false };
let lastTime = performance.now();
let deltaTime = 0;
let chunks = new Map();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let debugMode = false;

// 定数
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;
const RENDER_DISTANCE = 4;
const BLOCK_SIZE = 1;
const GRAVITY = -32;
const JUMP_FORCE = 12;
const MOVE_SPEED = 8;
const SPRINT_SPEED = 12;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;

// ブロックタイプ定義
const BlockType = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    WOOD: 4,
    LEAVES: 5,
    SAND: 6,
    WATER: 7,
    GLASS: 8,
    PLANKS: 9
};

const BlockInfo = {
    [BlockType.AIR]: { name: 'Air', transparent: true },
    [BlockType.GRASS]: { name: '草ブロック', color: [0.4, 0.8, 0.3], topColor: [0.5, 0.9, 0.4], sideColor: [0.6, 0.5, 0.3] },
    [BlockType.DIRT]: { name: '土', color: [0.6, 0.4, 0.2] },
    [BlockType.STONE]: { name: '石', color: [0.5, 0.5, 0.5] },
    [BlockType.WOOD]: { name: '木材', color: [0.4, 0.3, 0.2], topColor: [0.5, 0.4, 0.25] },
    [BlockType.LEAVES]: { name: '葉', color: [0.2, 0.6, 0.2], transparent: true },
    [BlockType.SAND]: { name: '砂', color: [0.9, 0.85, 0.6] },
    [BlockType.WATER]: { name: '水', color: [0.2, 0.4, 0.8], transparent: true },
    [BlockType.GLASS]: { name: 'ガラス', color: [0.8, 0.9, 1.0], transparent: true },
    [BlockType.PLANKS]: { name: '板材', color: [0.7, 0.5, 0.3] }
};

// ============================================
// パーリンノイズ実装
// ============================================
class PerlinNoise {
    constructor(seed = 12345) {
        this.seed = seed;
        this.permutation = this.generatePermutation();
    }

    generatePermutation() {
        const p = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        
        // シャッフル
        let rand = this.seed;
        for (let i = 255; i > 0; i--) {
            rand = (rand * 9301 + 49297) % 233280;
            const j = Math.floor((rand / 233280) * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        
        // 配列を2倍に
        return [...p, ...p];
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);

        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);

        const p = this.permutation;
        const A = p[X] + Y;
        const AA = p[A] + Z;
        const AB = p[A + 1] + Z;
        const B = p[X + 1] + Y;
        const BA = p[B] + Z;
        const BB = p[B + 1] + Z;

        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad(p[AA], x, y, z), this.grad(p[BA], x - 1, y, z)),
                this.lerp(u, this.grad(p[AB], x, y - 1, z), this.grad(p[BB], x - 1, y - 1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad(p[AA + 1], x, y, z - 1), this.grad(p[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(p[AB + 1], x, y - 1, z - 1), this.grad(p[BB + 1], x - 1, y - 1, z - 1))
            )
        );
    }

    octaveNoise(x, y, z, octaves, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maxValue;
    }
}

const noise = new PerlinNoise(Math.random() * 10000);

// ============================================
// テクスチャ生成
// ============================================
function createBlockTexture(blockType) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const info = BlockInfo[blockType];
    if (!info) return null;

    // ベースカラー
    const baseColor = info.color || [0.5, 0.5, 0.5];
    ctx.fillStyle = `rgb(${baseColor[0] * 255}, ${baseColor[1] * 255}, ${baseColor[2] * 255})`;
    ctx.fillRect(0, 0, 64, 64);

    // ノイズとディテール追加
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 64;
        const brightness = 0.9 + Math.random() * 0.2;
        ctx.fillStyle = `rgba(${baseColor[0] * 255 * brightness}, ${baseColor[1] * 255 * brightness}, ${baseColor[2] * 255 * brightness}, 0.3)`;
        ctx.fillRect(x, y, 2, 2);
    }

    // ブロックタイプ別の特殊処理
    if (blockType === BlockType.GRASS) {
        // 草の模様
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 64;
            const y = Math.random() * 64;
            ctx.fillStyle = `rgba(100, 200, 80, 0.4)`;
            ctx.fillRect(x, y, 3, 1);
        }
    } else if (blockType === BlockType.STONE) {
        // 石の模様
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 64;
            const y = Math.random() * 64;
            const size = Math.random() * 8 + 4;
            ctx.fillStyle = `rgba(100, 100, 100, 0.3)`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (blockType === BlockType.WOOD) {
        // 木の年輪
        ctx.strokeStyle = 'rgba(80, 60, 40, 0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.arc(32, 32, 8 + i * 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    } else if (blockType === BlockType.LEAVES) {
        // 葉の模様
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * 64;
            const y = Math.random() * 64;
            ctx.fillStyle = `rgba(50, 150, 50, ${Math.random() * 0.5 + 0.3})`;
            ctx.beginPath();
            ctx.arc(x, y, Math.random() * 3 + 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    return new THREE.CanvasTexture(canvas);
}

// ============================================
// ブロックマテリアル作成
// ============================================
function createBlockMaterials(blockType) {
    const info = BlockInfo[blockType];
    if (!info) return null;

    const texture = createBlockTexture(blockType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    const materials = [];
    
    // 草ブロックの場合、上面と側面で異なるマテリアル
    if (blockType === BlockType.GRASS) {
        // 側面（右、左、上、下、前、後）
        for (let i = 0; i < 6; i++) {
            if (i === 2) { // 上面
                const topTexture = createBlockTexture(blockType);
                materials.push(new THREE.MeshLambertMaterial({ 
                    map: topTexture,
                    transparent: info.transparent || false
                }));
            } else if (i === 3) { // 下面
                const dirtTexture = createBlockTexture(BlockType.DIRT);
                materials.push(new THREE.MeshLambertMaterial({ 
                    map: dirtTexture
                }));
            } else { // 側面
                const sideCanvas = document.createElement('canvas');
                sideCanvas.width = 64;
                sideCanvas.height = 64;
                const ctx = sideCanvas.getContext('2d');
                
                // 上部に草
                ctx.fillStyle = 'rgb(100, 180, 80)';
                ctx.fillRect(0, 0, 64, 12);
                
                // 下部に土
                const dirtColor = BlockInfo[BlockType.DIRT].color;
                ctx.fillStyle = `rgb(${dirtColor[0] * 255}, ${dirtColor[1] * 255}, ${dirtColor[2] * 255})`;
                ctx.fillRect(0, 12, 64, 52);
                
                // ノイズ追加
                for (let j = 0; j < 200; j++) {
                    const x = Math.random() * 64;
                    const y = Math.random() * 64;
                    const brightness = 0.9 + Math.random() * 0.2;
                    ctx.fillStyle = `rgba(${dirtColor[0] * 255 * brightness}, ${dirtColor[1] * 255 * brightness}, ${dirtColor[2] * 255 * brightness}, 0.3)`;
                    ctx.fillRect(x, y, 2, 2);
                }
                
                const sideTexture = new THREE.CanvasTexture(sideCanvas);
                sideTexture.magFilter = THREE.NearestFilter;
                sideTexture.minFilter = THREE.NearestFilter;
                
                materials.push(new THREE.MeshLambertMaterial({ map: sideTexture }));
            }
        }
    } else {
        // 通常のブロック
        const material = new THREE.MeshLambertMaterial({ 
            map: texture,
            transparent: info.transparent || false,
            opacity: blockType === BlockType.WATER ? 0.6 : 1.0
        });
        for (let i = 0; i < 6; i++) {
            materials.push(material);
        }
    }

    return materials;
}

// ============================================
// 地形生成
// ============================================
function generateTerrain(chunkX, chunkZ) {
    const heightMap = [];
    
    for (let x = 0; x < CHUNK_SIZE; x++) {
        heightMap[x] = [];
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            
            // 複数オクターブのノイズで地形生成
            const scale = 0.01;
            const height = noise.octaveNoise(worldX * scale, 0, worldZ * scale, 4, 0.5);
            const normalizedHeight = (height + 1) / 2; // 0-1に正規化
            
            heightMap[x][z] = Math.floor(30 + normalizedHeight * 30);
        }
    }
    
    return heightMap;
}

function generateChunk(chunkX, chunkZ) {
    const chunkKey = `${chunkX},${chunkZ}`;
    if (chunks.has(chunkKey)) return chunks.get(chunkKey);

    const chunk = {
        x: chunkX,
        z: chunkZ,
        blocks: new Array(CHUNK_SIZE).fill(null).map(() => 
            new Array(CHUNK_HEIGHT).fill(null).map(() => 
                new Array(CHUNK_SIZE).fill(BlockType.AIR)
            )
        ),
        mesh: null,
        dirty: true
    };

    const heightMap = generateTerrain(chunkX, chunkZ);

    // ブロック配置
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const height = heightMap[x][z];
            
            for (let y = 0; y < height; y++) {
                if (y === height - 1) {
                    // 表面
                    if (height > 45) {
                        chunk.blocks[x][y][z] = BlockType.GRASS;
                    } else if (height > 38) {
                        chunk.blocks[x][y][z] = BlockType.SAND;
                    } else {
                        chunk.blocks[x][y][z] = BlockType.SAND;
                    }
                } else if (y > height - 5) {
                    // 表層
                    chunk.blocks[x][y][z] = height > 38 ? BlockType.DIRT : BlockType.SAND;
                } else {
                    // 深層
                    chunk.blocks[x][y][z] = BlockType.STONE;
                }
            }
            
            // 水の追加
            if (height < 40) {
                for (let y = height; y < 40; y++) {
                    chunk.blocks[x][y][z] = BlockType.WATER;
                }
            }
        }
    }

    // 木の生成
    for (let i = 0; i < 3; i++) {
        const x = Math.floor(Math.random() * CHUNK_SIZE);
        const z = Math.floor(Math.random() * CHUNK_SIZE);
        const height = heightMap[x][z];
        
        if (height > 45 && chunk.blocks[x][height][z] === BlockType.GRASS) {
            generateTree(chunk, x, height, z);
        }
    }

    chunks.set(chunkKey, chunk);
    return chunk;
}

function generateTree(chunk, x, baseY, z) {
    const trunkHeight = 5 + Math.floor(Math.random() * 3);
    
    // 幹
    for (let y = 0; y < trunkHeight; y++) {
        if (baseY + y < CHUNK_HEIGHT) {
            chunk.blocks[x][baseY + y][z] = BlockType.WOOD;
        }
    }
    
    // 葉
    const leafY = baseY + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
                if (x + dx >= 0 && x + dx < CHUNK_SIZE &&
                    z + dz >= 0 && z + dz < CHUNK_SIZE &&
                    leafY + dy >= 0 && leafY + dy < CHUNK_HEIGHT) {
                    
                    const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                    if (dist <= 3 && Math.random() > 0.2) {
                        if (chunk.blocks[x + dx][leafY + dy][z + dz] === BlockType.AIR) {
                            chunk.blocks[x + dx][leafY + dy][z + dz] = BlockType.LEAVES;
                        }
                    }
                }
            }
        }
    }
}

// ============================================
// チャンクメッシュ生成
// ============================================
function buildChunkMesh(chunk) {
    if (chunk.mesh) {
        scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh.material.forEach(m => m.dispose());
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const groups = [];

    let vertexOffset = 0;
    const materialIndices = new Map();

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const blockType = chunk.blocks[x][y][z];
                if (blockType === BlockType.AIR) continue;

                const worldX = chunk.x * CHUNK_SIZE + x;
                const worldZ = chunk.z * CHUNK_SIZE + z;

                // 各面をチェック
                const faces = [
                    { dir: [1, 0, 0], check: [x + 1, y, z] },   // 右
                    { dir: [-1, 0, 0], check: [x - 1, y, z] },  // 左
                    { dir: [0, 1, 0], check: [x, y + 1, z] },   // 上
                    { dir: [0, -1, 0], check: [x, y - 1, z] },  // 下
                    { dir: [0, 0, 1], check: [x, y, z + 1] },   // 前
                    { dir: [0, 0, -1], check: [x, y, z - 1] }   // 後
                ];

                faces.forEach((face, faceIndex) => {
                    const [cx, cy, cz] = face.check;
                    const shouldRender = cy < 0 || cy >= CHUNK_HEIGHT || 
                                       cx < 0 || cx >= CHUNK_SIZE ||
                                       cz < 0 || cz >= CHUNK_SIZE ||
                                       BlockInfo[chunk.blocks[cx][cy][cz]]?.transparent;

                    if (!shouldRender) return;

                    const materialKey = `${blockType}_${faceIndex}`;
                    if (!materialIndices.has(materialKey)) {
                        materialIndices.set(materialKey, materialIndices.size);
                    }
                    const matIndex = materialIndices.get(materialKey);

                    const [nx, ny, nz] = face.dir;
                    const vertices = getFaceVertices(worldX, y, worldZ, nx, ny, nz);

                    const startVertex = vertexOffset;
                    vertices.forEach(v => {
                        positions.push(v[0], v[1], v[2]);
                        normals.push(nx, ny, nz);
                    });

                    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);

                    indices.push(
                        startVertex, startVertex + 1, startVertex + 2,
                        startVertex, startVertex + 2, startVertex + 3
                    );

                    if (groups.length === 0 || groups[groups.length - 1].materialIndex !== matIndex) {
                        groups.push({
                            start: indices.length - 6,
                            count: 6,
                            materialIndex: matIndex
                        });
                    } else {
                        groups[groups.length - 1].count += 6;
                    }

                    vertexOffset += 4;
                });
            }
        }
    }

    if (positions.length === 0) {
        chunk.dirty = false;
        return;
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    groups.forEach(g => {
        geometry.addGroup(g.start, g.count, g.materialIndex);
    });

    // マテリアル配列作成
    const materials = [];
    const sortedMaterials = Array.from(materialIndices.keys()).sort((a, b) => 
        materialIndices.get(a) - materialIndices.get(b)
    );

    sortedMaterials.forEach(key => {
        const [blockType, faceIndex] = key.split('_').map(Number);
        const blockMaterials = createBlockMaterials(blockType);
        materials.push(blockMaterials[faceIndex]);
    });

    chunk.mesh = new THREE.Mesh(geometry, materials);
    chunk.mesh.castShadow = true;
    chunk.mesh.receiveShadow = true;
    scene.add(chunk.mesh);
    chunk.dirty = false;
}

function getFaceVertices(x, y, z, nx, ny, nz) {
    const s = BLOCK_SIZE / 2;
    
    if (ny === 1) { // 上
        return [
            [x - s, y + s, z - s], [x + s, y + s, z - s],
            [x + s, y + s, z + s], [x - s, y + s, z + s]
        ];
    } else if (ny === -1) { // 下
        return [
            [x - s, y - s, z - s], [x - s, y - s, z + s],
            [x + s, y - s, z + s], [x + s, y - s, z - s]
        ];
    } else if (nx === 1) { // 右
        return [
            [x + s, y - s, z - s], [x + s, y - s, z + s],
            [x + s, y + s, z + s], [x + s, y + s, z - s]
        ];
    } else if (nx === -1) { // 左
        return [
            [x - s, y - s, z - s], [x - s, y + s, z - s],
            [x - s, y + s, z + s], [x - s, y - s, z + s]
        ];
    } else if (nz === 1) { // 前
        return [
            [x - s, y - s, z + s], [x - s, y + s, z + s],
            [x + s, y + s, z + s], [x + s, y - s, z + s]
        ];
    } else { // 後
        return [
            [x - s, y - s, z - s], [x + s, y - s, z - s],
            [x + s, y + s, z - s], [x - s, y + s, z - s]
        ];
    }
}

// ============================================
// ワールド管理
// ============================================
function updateChunks() {
    const playerChunkX = Math.floor(player.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.position.z / CHUNK_SIZE);

    // 新しいチャンクを生成
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
            const chunkX = playerChunkX + dx;
            const chunkZ = playerChunkZ + dz;
            const chunk = generateChunk(chunkX, chunkZ);
            
            if (chunk.dirty) {
                buildChunkMesh(chunk);
            }
        }
    }

    // 遠いチャンクを削除
    chunks.forEach((chunk, key) => {
        const dx = Math.abs(chunk.x - playerChunkX);
        const dz = Math.abs(chunk.z - playerChunkZ);
        
        if (dx > RENDER_DISTANCE + 1 || dz > RENDER_DISTANCE + 1) {
            if (chunk.mesh) {
                scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
                if (Array.isArray(chunk.mesh.material)) {
                    chunk.mesh.material.forEach(m => m.dispose());
                } else {
                    chunk.mesh.material.dispose();
                }
            }
            chunks.delete(key);
        }
    });
}

function getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BlockType.AIR;
    
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const chunk = chunks.get(`${chunkX},${chunkZ}`);
    if (!chunk) return BlockType.AIR;
    
    return chunk.blocks[localX][y][localZ];
}

function setBlock(x, y, z, blockType) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    
    const chunk = chunks.get(`${chunkX},${chunkZ}`);
    if (!chunk) return false;
    
    chunk.blocks[localX][y][localZ] = blockType;
    chunk.dirty = true;
    
    return true;
}

// ============================================
// プレイヤー物理
// ============================================
function checkCollision(pos, radius, height) {
    const minX = Math.floor(pos.x - radius);
    const maxX = Math.ceil(pos.x + radius);
    const minY = Math.floor(pos.y);
    const maxY = Math.ceil(pos.y + height);
    const minZ = Math.floor(pos.z - radius);
    const maxZ = Math.ceil(pos.z + radius);

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const block = getBlock(x, y, z);
                if (block !== BlockType.AIR && !BlockInfo[block]?.transparent) {
                    return { x, y, z };
                }
            }
        }
    }
    return null;
}

function updatePlayer(dt) {
    // 入力処理
    const moveDir = new THREE.Vector3();
    const forward = new THREE.Vector3(
        -Math.sin(player.rotation.y),
        0,
        -Math.cos(player.rotation.y)
    );
    const right = new THREE.Vector3(
        Math.cos(player.rotation.y),
        0,
        -Math.sin(player.rotation.y)
    );

    if (keys['w'] || keys['W']) moveDir.add(forward);
    if (keys['s'] || keys['S']) moveDir.sub(forward);
    if (keys['d'] || keys['D']) moveDir.add(right);
    if (keys['a'] || keys['A']) moveDir.sub(right);

    if (moveDir.length() > 0) {
        moveDir.normalize();
        const speed = keys['Shift'] ? SPRINT_SPEED : MOVE_SPEED;
        player.velocity.x = moveDir.x * speed;
        player.velocity.z = moveDir.z * speed;
    } else {
        player.velocity.x *= 0.8;
        player.velocity.z *= 0.8;
    }

    // ジャンプ
    if (keys[' '] && player.onGround) {
        player.velocity.y = JUMP_FORCE;
        player.onGround = false;
    }

    // 重力
    player.velocity.y += GRAVITY * dt;

    // 位置更新
    const newPos = player.position.clone();
    newPos.add(player.velocity.clone().multiplyScalar(dt));

    // コリジョン検出（X軸）
    const testPosX = newPos.clone();
    testPosX.y = player.position.y;
    if (!checkCollision(testPosX, PLAYER_RADIUS, PLAYER_HEIGHT)) {
        player.position.x = testPosX.x;
    } else {
        player.velocity.x = 0;
    }

    // コリジョン検出（Z軸）
    const testPosZ = newPos.clone();
    testPosZ.x = player.position.x;
    testPosZ.y = player.position.y;
    if (!checkCollision(testPosZ, PLAYER_RADIUS, PLAYER_HEIGHT)) {
        player.position.z = testPosZ.z;
    } else {
        player.velocity.z = 0;
    }

    // コリジョン検出（Y軸）
    const testPosY = player.position.clone();
    testPosY.y = newPos.y;
    const collision = checkCollision(testPosY, PLAYER_RADIUS, PLAYER_HEIGHT);
    
    if (!collision) {
        player.position.y = testPosY.y;
        player.onGround = false;
    } else {
        if (player.velocity.y < 0) {
            player.onGround = true;
            player.position.y = collision.y + 1;
        } else {
            player.position.y = collision.y - PLAYER_HEIGHT;
        }
        player.velocity.y = 0;
    }

    // カメラ更新
    camera.position.copy(player.position);
    camera.position.y += PLAYER_HEIGHT - 0.2;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.rotation.y;
    camera.rotation.x = player.rotation.x;
}

// ============================================
// レイキャスト（ブロック選択）
// ============================================
function raycastBlocks() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    
    const start = camera.position.clone();
    const maxDistance = 10;
    const step = 0.1;
    
    let lastAir = null;
    
    for (let d = 0; d < maxDistance; d += step) {
        const pos = start.clone().add(dir.clone().multiplyScalar(d));
        const x = Math.floor(pos.x);
        const y = Math.floor(pos.y);
        const z = Math.floor(pos.z);
        
        const block = getBlock(x, y, z);
        
        if (block !== BlockType.AIR && !BlockInfo[block]?.transparent) {
            return { hit: { x, y, z }, place: lastAir };
        }
        
        lastAir = { x, y, z };
    }
    
    return null;
}

// ============================================
// UI
// ============================================
function initInventory() {
    const hotbar = document.getElementById('hotbar');
    const blockTypes = [
        BlockType.GRASS,
        BlockType.DIRT,
        BlockType.STONE,
        BlockType.WOOD,
        BlockType.LEAVES,
        BlockType.SAND,
        BlockType.GLASS,
        BlockType.PLANKS
    ];

    blockTypes.forEach((blockType, index) => {
        const slot = document.createElement('div');
        slot.className = 'hotbar-slot';
        slot.dataset.slot = index + 1;
        
        if (index === 0) slot.classList.add('active');
        
        // ブロックアイコン作成
        const iconCanvas = document.createElement('canvas');
        iconCanvas.width = 40;
        iconCanvas.height = 40;
        const ctx = iconCanvas.getContext('2d');
        
        const color = BlockInfo[blockType].color;
        ctx.fillStyle = `rgb(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255})`;
        ctx.fillRect(0, 0, 40, 40);
        
        // 3D効果
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(0, 0, 40, 2);
        ctx.fillRect(0, 0, 2, 40);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 38, 40, 2);
        ctx.fillRect(38, 0, 2, 40);
        
        slot.appendChild(iconCanvas);
        
        slot.addEventListener('click', () => {
            selectSlot(index + 1);
        });
        
        hotbar.appendChild(slot);
        player.inventory.push(blockType);
    });
}

function selectSlot(slot) {
    const slots = document.querySelectorAll('.hotbar-slot');
    slots.forEach((s, i) => {
        s.classList.toggle('active', i === slot - 1);
    });
    player.selectedBlock = slot - 1;
}

function updateDebugInfo() {
    if (!debugMode) return;
    
    document.getElementById('fps').textContent = Math.round(1 / deltaTime);
    document.getElementById('position').textContent = 
        `${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}`;
    document.getElementById('chunks').textContent = chunks.size;
    
    let totalBlocks = 0;
    chunks.forEach(chunk => {
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    if (chunk.blocks[x][y][z] !== BlockType.AIR) totalBlocks++;
                }
            }
        }
    });
    document.getElementById('blocks').textContent = totalBlocks;
}

// ============================================
// イベントリスナー
// ============================================
function setupEventListeners() {
    // キーボード
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        
        // ホットバー選択
        if (e.key >= '1' && e.key <= '9') {
            selectSlot(parseInt(e.key));
        }
        
        // デバッグ
        if (e.key === 'F3') {
            e.preventDefault();
            debugMode = !debugMode;
            document.getElementById('debug-info').style.display = debugMode ? 'block' : 'none';
        }
        
        // ポーズ
        if (e.key === 'Escape') {
            document.exitPointerLock();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });

    // マウス
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            console.log('Pointer locked');
        } else {
            console.log('Pointer unlocked');
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
            const sensitivity = 0.002;
            player.rotation.y -= e.movementX * sensitivity;
            player.rotation.x -= e.movementY * sensitivity;
            player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (document.pointerLockElement !== canvas) return;
        
        if (e.button === 0) { // 左クリック：破壊
            const result = raycastBlocks();
            if (result && result.hit) {
                setBlock(result.hit.x, result.hit.y, result.hit.z, BlockType.AIR);
            }
        } else if (e.button === 2) { // 右クリック：設置
            e.preventDefault();
            const result = raycastBlocks();
            if (result && result.place) {
                const selectedBlockType = player.inventory[player.selectedBlock];
                setBlock(result.place.x, result.place.y, result.place.z, selectedBlockType);
            }
        }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // スタートボタン
    document.getElementById('start-button').addEventListener('click', startGame);
}

// ============================================
// 初期化
// ============================================
function init() {
    // レンダラー
    canvas = document.getElementById('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // シーン
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, RENDER_DISTANCE * CHUNK_SIZE * 1.2);

    // カメラ
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.copy(player.position);

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // イベントリスナー
    setupEventListeners();

    // インベントリ
    initInventory();

    // リサイズ
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ============================================
// ゲームループ
// ============================================
function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    updatePlayer(deltaTime);
    updateChunks();
    updateDebugInfo();

    renderer.render(scene, camera);
}

// ============================================
// ゲーム開始
// ============================================
function startGame() {
    const startScreen = document.getElementById('start-screen');
    const loadingScreen = document.getElementById('loading-screen');
    
    startScreen.style.display = 'none';
    loadingScreen.classList.add('show');

    // 初期チャンク生成
    setTimeout(() => {
        console.log('Generating initial chunks...');
        updateChunks();
        
        loadingScreen.classList.remove('show');
        canvas.requestPointerLock();
        
        console.log('Game started!');
    }, 100);
}

// ============================================
// エントリーポイント
// ============================================
init();
animate();

console.log('VoxelCraft initialized!');
