import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
let raycaster;
const objects = []; // ブロックのリスト
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

init();
animate();

function init() {
    // シーン設定
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 空の色
    scene.fog = new THREE.Fog(0x87CEEB, 0, 750);

    // カメラ
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.y = 10;

    // ライト
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 2);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // コントロール
    controls = new PointerLockControls(camera, document.body);
    const instructions = document.getElementById('instructions');

    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        instructions.style.display = 'block';
    });

    scene.add(controls.getObject());

    // キー操作イベント
    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp': case 'KeyW': moveForward = true; break;
            case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
            case 'ArrowDown': case 'KeyS': moveBackward = true; break;
            case 'ArrowRight': case 'KeyD': moveRight = true; break;
            case 'Space': if (canJump === true) velocity.y += 350; canJump = false; break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp': case 'KeyW': moveForward = false; break;
            case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
            case 'ArrowDown': case 'KeyS': moveBackward = false; break;
            case 'ArrowRight': case 'KeyD': moveRight = false; break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // レイキャスター（ブロック設置・破壊用）
    raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

    // 地面生成（とりあえず草ブロック）
    const floorGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    floorGeometry.rotateX(-Math.PI / 2);
    const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 }); // 緑
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);
    objects.push(floor);

    // ブロック設置ロジックの追加（クリックイベント）
    document.addEventListener('mousedown', onDocumentMouseDown);

    // レンダラー
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDocumentMouseDown(event) {
    if (!controls.isLocked) return;
    
    // 画面中央からレイを飛ばす
    const raycasterClick = new THREE.Raycaster();
    raycasterClick.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycasterClick.intersectObjects(objects, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        
        // 左クリック(0): 破壊
        if (event.button === 0) {
            if (intersect.object !== scene.children.find(o => o.geometry.type === 'PlaneGeometry')) {
                scene.remove(intersect.object);
                objects.splice(objects.indexOf(intersect.object), 1);
            }
        }
        // 右クリック(2): 設置
        else if (event.button === 2) {
            const voxel = new THREE.Mesh(
                new THREE.BoxGeometry(5, 5, 5),
                new THREE.MeshLambertMaterial({ color: 0x8B4513 }) // 茶色ブロック
            );
            voxel.position.copy(intersect.point).add(intersect.face.normal);
            voxel.position.divideScalar(5).floor().multiplyScalar(5).addScalar(2.5);
            scene.add(voxel);
            objects.push(voxel);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    if (controls.isLocked === true) {
        const delta = (time - prevTime) / 1000;

        // 減速処理
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta; // 重力

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        controls.getObject().position.y += (velocity.y * delta);

        if (controls.getObject().position.y < 10) {
            velocity.y = 0;
            controls.getObject().position.y = 10;
            canJump = true;
        }
    }
    prevTime = time;
    renderer.render(scene, camera);
}
