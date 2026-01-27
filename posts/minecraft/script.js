import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- 変数定義 ---
let camera, scene, renderer, controls;
let raycaster;
const objects = [];
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let moveUp = false, moveDown = false; // 飛行用
let isFlying = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// ブロック定義 (色で簡易表現)
const BLOCKS = [
    { name: 'Grass', color: 0x55902b }, // 草
    { name: 'Dirt', color: 0x8B4513 },  // 土
    { name: 'Stone', color: 0x808080 }, // 石
    { name: 'Wood', color: 0xA0522D },  // 木
    { name: 'Leaf', color: 0x228B22 },  // 葉
    { name: 'Brick', color: 0xB22222 }, // レンガ
];
let selectedBlockIndex = 0;

// --- 初期化 ---
init();
animate();

function init() {
    // 1. シーンとカメラ
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 750);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 10;

    // 2. ライト
    const ambientLight = new THREE.AmbientLight(0xcccccc);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1, 1, 0.5).normalize();
    scene.add(directionalLight);

    // 3. レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 4. コントロール (PC用)
    controls = new PointerLockControls(camera, document.body);
    
    const instructions = document.getElementById('instructions');
    instructions.addEventListener('click', () => controls.lock());
    controls.addEventListener('lock', () => { instructions.style.display = 'none'; });
    controls.addEventListener('unlock', () => { instructions.style.display = 'block'; });

    // 5. キーボード入力
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // 6. マウス入力 (PCでのブロック操作)
    document.addEventListener('mousedown', onMouseClick);

    // 7. ワールド生成 (簡易版)
    generateWorld();

    // 8. UI初期化
    initUI();
    
    // 9. モバイルタッチ操作設定
    setupTouchControls();

    window.addEventListener('resize', onWindowResize);
}

// --- ワールド生成 ---
function generateWorld() {
    // 地面
    const geometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: 0x55902b });
    const floor = new THREE.Mesh(geometry, material);
    scene.add(floor);
    objects.push(floor);

    // ランダムな構造物 (初期配置)
    const boxGeo = new THREE.BoxGeometry(5, 5, 5);
    
    for (let i = 0; i < 50; i++) {
        const material = new THREE.MeshLambertMaterial({ color: BLOCKS[2].color }); // 石
        const mesh = new THREE.Mesh(boxGeo, material);
        mesh.position.x = Math.floor(Math.random() * 20 - 10) * 5;
        mesh.position.y = 2.5;
        mesh.position.z = Math.floor(Math.random() * 20 - 10) * 5;
        scene.add(mesh);
        objects.push(mesh);
    }
}

// --- UI初期化 ---
function initUI() {
    const hotbar = document.getElementById('hotbar');
    BLOCKS.forEach((block, index) => {
        const slot = document.createElement('div');
        slot.className = 'slot' + (index === 0 ? ' active' : '');
        slot.style.backgroundColor = '#' + block.color.toString(16).padStart(6, '0');
        slot.onclick = (e) => {
            e.stopPropagation(); // ゲーム画面クリック防止
            selectBlock(index);
        };
        hotbar.appendChild(slot);
    });
}

function selectBlock(index) {
    selectedBlockIndex = index;
    const slots = document.querySelectorAll('.slot');
    slots.forEach((s, i) => {
        if (i === index) s.classList.add('active');
        else s.classList.remove('active');
    });
}

// --- 操作イベントハンドラ ---
function onKeyDown(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (isFlying) { moveUp = true; }
            else if (velocity.y === 0) { velocity.y += 250; } // ジャンプ
            break;
        case 'ShiftLeft': case 'ShiftRight': 
            if (isFlying) moveDown = true; 
            break;
        case 'KeyF': 
            isFlying = !isFlying; 
            velocity.y = 0; 
            document.getElementById('mode-info').innerText = isFlying ? "Flight Mode ON" : "Creative Mode";
            break;
        case 'Digit1': selectBlock(0); break;
        case 'Digit2': selectBlock(1); break;
        case 'Digit3': selectBlock(2); break;
        case 'Digit4': selectBlock(3); break;
        case 'Digit5': selectBlock(4); break;
        case 'Digit6': selectBlock(5); break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
        case 'Space': moveUp = false; break;
        case 'ShiftLeft': case 'ShiftRight': moveDown = false; break;
    }
}

// PC用マウス操作
function onMouseClick(event) {
    if (!controls.isLocked) return;
    performRaycast(event.button === 2 ? 'place' : 'break'); // 右クリで設置、左クリで破壊
}

// レイキャスト処理（設置・破壊共通）
function performRaycast(action) {
    raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        
        if (action === 'break') {
            // 地面(PlaneGeometry)は壊せないようにする
            if (intersect.object.geometry.type !== 'PlaneGeometry') {
                scene.remove(intersect.object);
                objects.splice(objects.indexOf(intersect.object), 1);
            }
        } else if (action === 'place') {
            const voxel = new THREE.Mesh(
                new THREE.BoxGeometry(5, 5, 5),
                new THREE.MeshLambertMaterial({ color: BLOCKS[selectedBlockIndex].color })
            );
            voxel.position.copy(intersect.point).add(intersect.face.normal);
            voxel.position.divideScalar(5).floor().multiplyScalar(5).addScalar(2.5);
            scene.add(voxel);
            objects.push(voxel);
        }
    }
}

// --- モバイル用タッチ操作 ---
function setupTouchControls() {
    const bindBtn = (id, startFn, endFn) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); startFn(); });
        el.addEventListener('touchend', (e) => { e.preventDefault(); endFn(); });
    };

    bindBtn('btn-up', () => moveForward = true, () => moveForward = false);
    bindBtn('btn-down', () => moveBackward = true, () => moveBackward = false);
    bindBtn('btn-left', () => moveLeft = true, () => moveLeft = false);
    bindBtn('btn-right', () => moveRight = true, () => moveRight = false);
    
    // ジャンプ / 上昇
    bindBtn('btn-jump', () => {
        if(isFlying) moveUp = true;
        else if(velocity.y === 0) velocity.y += 250;
    }, () => moveUp = false);

    // 飛行切り替え
    document.getElementById('btn-fly').addEventListener('touchstart', (e) => {
        e.preventDefault();
        isFlying = !isFlying;
        velocity.y = 0;
        document.getElementById('mode-info').innerText = isFlying ? "Flight Mode ON" : "Creative Mode";
    });

    // 設置・破壊
    document.getElementById('btn-place').addEventListener('touchstart', (e) => {
        e.preventDefault(); performRaycast('place');
    });
    document.getElementById('btn-break').addEventListener('touchstart', (e) => {
        e.preventDefault(); performRaycast('break');
    });

    // 視点操作（タッチ移動）
    let lastTouchX = 0;
    let lastTouchY = 0;
    document.addEventListener('touchmove', (e) => {
        // UI以外の場所をタッチしたときのみ視点移動
        if (e.target.tagName !== 'CANVAS') return;
        
        const touch = e.touches[0];
        if (lastTouchX && lastTouchY) {
            const movementX = touch.clientX - lastTouchX;
            const movementY = touch.clientY - lastTouchY;
            
            // PointerLockControlsの内部変数を直接いじる（ハックだが簡易的）
            controls.getObject().rotation.y -= movementX * 0.005;
            // 上下の制限を入れるとなお良い
        }
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    });
    
    document.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'CANVAS') {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // 減速
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    
    if (isFlying) {
        // 飛行モードの物理
        velocity.y -= velocity.y * 10.0 * delta;
        if (moveUp) velocity.y += 200.0 * delta; // 上昇加速
        if (moveDown) velocity.y -= 200.0 * delta; // 下降加速
    } else {
        // 通常モードの物理
        velocity.y -= 9.8 * 100.0 * delta; // 重力
    }

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    // 移動速度
    const speed = isFlying ? 800.0 : 400.0;
    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

    // 適用
    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    controls.getObject().position.y += (velocity.y * delta);

    // 地面判定 (Y < 10)
    if (controls.getObject().position.y < 10) {
        velocity.y = 0;
        controls.getObject().position.y = 10;
    }

    prevTime = time;
    renderer.render(scene, camera);
}
