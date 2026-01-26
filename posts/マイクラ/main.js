(async()=>{
// Three.js をdynamic importで読み込み
const THREE = await import('https://unpkg.com/three@0.150.0/build/three.module.js');

// エラー表示
const errEl=document.getElementById('err');
const showErr=m=>{console.error(m);if(errEl)errEl.textContent='Error: '+m};
window.onerror=m=>showErr(m);
window.onunhandledrejection=e=>showErr(e.reason?.message||e.reason);

// ユーティリティ
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return h>>>0};
const srand=s=>()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// ノイズ
class Noise{
  constructor(r){this.p=[];for(let i=0;i<256;i++)this.p[i]=i;for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[this.p[i],this.p[j]]=[this.p[j],this.p[i]]}this.p=this.p.concat(this.p)}
  f(t){return t*t*t*(t*(t*6-15)+10)}
  l(a,b,t){return a+t*(b-a)}
  g(h,x,y){const v=(h&1)?y:x;return(h&2)?-v:v}
  n(x,y){const X=Math.floor(x)&255,Y=Math.floor(y)&255;x-=Math.floor(x);y-=Math.floor(y);const u=this.f(x),v=this.f(y),A=this.p[X]+Y,B=this.p[X+1]+Y;return this.l(this.l(this.g(this.p[A],x,y),this.g(this.p[B],x-1,y),u),this.l(this.g(this.p[A+1],x,y-1),this.g(this.p[B+1],x-1,y-1),u),v)}
}

// 設定
const params=new URLSearchParams(location.search);
const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||'ontouchstart'in window;
const C={SZ:clamp(parseInt(params.get('size'))||(mobile?24:32),16,64),H:clamp(parseInt(params.get('h'))||24,16,48),NS:.07,BH:8,AMP:10,TR:.015,PH:1.7,PR:.3,SPD:5,JMP:8,GRV:20,RCH:5,KEY:'vox6'};

// ブロック
const B={AIR:-1,GRASS:0,DIRT:1,STONE:2,SAND:3,WOOD:4,LEAF:5};
const COL={[B.GRASS]:[74,156,45],[B.DIRT]:[139,90,43],[B.STONE]:[128,128,128],[B.SAND]:[194,178,128],[B.WOOD]:[139,69,19],[B.LEAF]:[34,139,34]};

// セーブ
const load=()=>{try{return JSON.parse(localStorage.getItem(C.KEY))}catch{return null}};
const save=d=>{try{localStorage.setItem(C.KEY,JSON.stringify(d))}catch{}};
let saved=load();
const urlSeed=params.get('seed');
let seed=urlSeed?hash(urlSeed):(saved?.seed??Date.now()>>>0);
const rng=srand(seed);
const noise=new Noise(rng);

document.getElementById('sd').textContent=urlSeed||seed;
document.getElementById('sz').textContent=C.SZ+'×'+C.SZ;

// Three.js
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x87ceeb);
scene.fog=new THREE.Fog(0x87ceeb,20,70);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,500);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff,.6));
const sun=new THREE.DirectionalLight(0xffffff,.8);
sun.position.set(50,100,50);
scene.add(sun);

// カメラ操作
let locked=false;
const euler=new THREE.Euler(0,0,0,'YXZ');
const onMM=e=>{if(!locked)return;euler.setFromQuaternion(camera.quaternion);euler.y-=e.movementX*.002;euler.x-=e.movementY*.002;euler.x=clamp(euler.x,-Math.PI/2+.1,Math.PI/2-.1);camera.quaternion.setFromEuler(euler)};
const onPLC=()=>{locked=document.pointerLockElement===document.body;document.getElementById('overlay').classList.toggle('hidden',locked)};
document.addEventListener('mousemove',onMM);
document.addEventListener('pointerlockchange',onPLC);

if(!mobile){
  document.getElementById('start').onclick=()=>document.body.requestPointerLock();
  document.addEventListener('contextmenu',e=>e.preventDefault());
}else{
  document.getElementById('overlay').classList.add('hidden');
}

// テクスチャ
const mkTex=rgb=>{const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=(rng()-.5)*30;g.fillStyle=`rgb(${clamp(rgb[0]+v,0,255)|0},${clamp(rgb[1]+v,0,255)|0},${clamp(rgb[2]+v,0,255)|0})`;g.fillRect(x,y,1,1)}const t=new THREE.CanvasTexture(c);t.magFilter=t.minFilter=THREE.NearestFilter;return{t,c}};
const TEX={},CNV={};
for(const k in B){if(B[k]===B.AIR)continue;const{t,c}=mkTex(COL[B[k]]);TEX[B[k]]=t;CNV[B[k]]=c}

// ワールド
const base=new Map(),mods=new Map();
const K=(x,y,z)=>x+','+y+','+z;
const PK=k=>{const[x,y,z]=k.split(',').map(Number);return{x,y,z}};
const IN=(x,y,z)=>x>=0&&x<C.SZ&&y>=0&&y<C.H&&z>=0&&z<C.SZ;
const get=(x,y,z)=>{if(!IN(x,y,z))return B.AIR;const k=K(x,y,z);return mods.has(k)?mods.get(k):(base.get(k)??B.AIR)};
const solid=(x,y,z)=>get(x,y,z)!==B.AIR;

const setBlk=(x,y,z,t)=>{if(!IN(x,y,z))return;mods.set(K(x,y,z),t);upd(x,y,z);[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].forEach(([a,b,c])=>upd(x+a,y+b,z+c));schSave()};

const height=(x,z)=>clamp(Math.floor(C.BH+noise.n(x*C.NS,z*C.NS)*C.AMP),1,C.H-3);

const genWorld=()=>{base.clear();for(let x=0;x<C.SZ;x++)for(let z=0;z<C.SZ;z++){const h=height(x,z);for(let y=0;y<=h;y++){let t=y===h?(h<6?B.SAND:B.GRASS):(y>h-4?B.DIRT:B.STONE);base.set(K(x,y,z),t)}}};

const genTrees=()=>{for(let x=2;x<C.SZ-2;x++)for(let z=2;z<C.SZ-2;z++){const h=height(x,z);if(h<7||get(x,h,z)!==B.GRASS||rng()>C.TR)continue;const th=4+(rng()*2|0);for(let i=1;i<=th;i++)mods.set(K(x,h+i,z),B.WOOD);const lb=h+th-1;for(let dy=0;dy<=2;dy++){const r=dy===2?1:2;for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(dx===0&&dz===0&&dy<2)continue;if(Math.abs(dx)===2&&Math.abs(dz)===2)continue;const lk=K(x+dx,lb+dy,z+dz);if(IN(x+dx,lb+dy,z+dz)&&!base.has(lk)&&!mods.has(lk))mods.set(lk,B.LEAF)}}}};

// インスタンスメッシュ
const geo=new THREE.BoxGeometry(1,1,1);
const meshes=new Map(),bIdx=new Map(),iBlk=new Map();
const tmp=new THREE.Matrix4();

const getM=t=>{if(!meshes.has(t)){const mat=new THREE.MeshLambertMaterial({map:TEX[t],transparent:t===B.LEAF,opacity:t===B.LEAF?.9:1});const m=new THREE.InstancedMesh(geo,mat,60000);m.count=0;m.userData.t=t;scene.add(m);meshes.set(t,m);iBlk.set(t,[])}return meshes.get(t)};

const exposed=(x,y,z)=>solid(x,y,z)&&(!solid(x+1,y,z)||!solid(x-1,y,z)||!solid(x,y+1,z)||!solid(x,y-1,z)||!solid(x,y,z+1)||!solid(x,y,z-1));

const addI=(x,y,z,t)=>{const m=getM(t),arr=iBlk.get(t),k=K(x,y,z),i=m.count;tmp.setPosition(x+.5,y+.5,z+.5);m.setMatrixAt(i,tmp);m.count++;m.instanceMatrix.needsUpdate=true;arr[i]=k;bIdx.set(k,{t,i})};

const remI=k=>{const info=bIdx.get(k);if(!info)return;const{t,i}=info;const m=meshes.get(t),arr=iBlk.get(t);if(m.count>1&&i<m.count-1){const lk=arr[m.count-1];m.getMatrixAt(m.count-1,tmp);m.setMatrixAt(i,tmp);arr[i]=lk;bIdx.set(lk,{t,i})}m.count--;m.instanceMatrix.needsUpdate=true;arr.pop();bIdx.delete(k)};

const upd=(x,y,z)=>{if(!IN(x,y,z))return;const k=K(x,y,z);if(bIdx.has(k))remI(k);const t=get(x,y,z);if(t!==B.AIR&&exposed(x,y,z))addI(x,y,z,t)};

const buildAll=()=>{for(const[t,m]of meshes){m.count=0;iBlk.set(t,[])}bIdx.clear();for(let x=0;x<C.SZ;x++)for(let z=0;z<C.SZ;z++)for(let y=0;y<C.H;y++){const t=get(x,y,z);if(t!==B.AIR&&exposed(x,y,z))addI(x,y,z,t)}};

// ホットバー
const slots=[B.GRASS,B.DIRT,B.STONE,B.SAND,B.WOOD,B.LEAF];
let sel=0;

const buildHB=()=>{const hb=document.getElementById('hotbar');hb.innerHTML='';slots.forEach((t,i)=>{const s=document.createElement('div');s.className='slot'+(i===sel?' sel':'');s.innerHTML=`<span>${i+1}</span>`;const cv=document.createElement('canvas');cv.width=cv.height=16;cv.getContext('2d').drawImage(CNV[t],0,0);s.appendChild(cv);s.onclick=()=>selS(i);hb.appendChild(s)})};
const selS=i=>{sel=(i+6)%6;document.querySelectorAll('.slot').forEach((s,j)=>s.classList.toggle('sel',j===sel))};
buildHB();

document.addEventListener('keydown',e=>{if(e.key>='1'&&e.key<='6')selS(+e.key-1)});
document.addEventListener('wheel',e=>{if(locked||mobile)selS(sel+(e.deltaY>0?1:-1))});

// レイキャスト
const ray=new THREE.Raycaster();
ray.far=C.RCH;
const hl=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01,1.01,1.01)),new THREE.LineBasicMaterial({color:0xffffff,opacity:.8,transparent:true}));
hl.visible=false;
scene.add(hl);

let tgt=null,tgtF=null;

const updTgt=()=>{ray.setFromCamera(new THREE.Vector2(0,0),camera);const hits=ray.intersectObjects([...meshes.values()],false);if(!hits.length){tgt=null;hl.visible=false;return}const h=hits[0],arr=iBlk.get(h.object.userData.t),k=arr?.[h.instanceId];if(!k){tgt=null;hl.visible=false;return}tgt=PK(k);tgtF=h.face?.normal?.clone()||new THREE.Vector3(0,1,0);hl.position.set(tgt.x+.5,tgt.y+.5,tgt.z+.5);hl.visible=true};

let mode='BREAK';
const mdEl=document.getElementById('md');
const mdBtn=document.getElementById('modeBtn');
const setM=m=>{mode=m;mdEl.textContent=m;if(mdBtn)mdBtn.textContent=m};

const act=(m=mode)=>{if(!tgt)return;if(m==='BREAK'){setBlk(tgt.x,tgt.y,tgt.z,B.AIR)}else{const nx=tgt.x+Math.round(tgtF.x),ny=tgt.y+Math.round(tgtF.y),nz=tgt.z+Math.round(tgtF.z);if(!IN(nx,ny,nz)||get(nx,ny,nz)!==B.AIR)return;const px=P.pos.x,py=P.pos.y,pz=P.pos.z,r=C.PR,ph=C.PH;if(nx+1>px-r&&nx<px+r&&ny+1>py&&ny<py+ph&&nz+1>pz-r&&nz<pz+r)return;setBlk(nx,ny,nz,slots[sel])}};

if(!mobile){document.addEventListener('mousedown',e=>{if(!locked)return;if(e.button===0){setM('BREAK');act('BREAK')}if(e.button===2){setM('PLACE');act('PLACE')}})}

// セーブ
let svT=null;
const schSave=()=>{if(svT)return;svT=setTimeout(()=>{svT=null;save({seed,sz:C.SZ,mods:Object.fromEntries(mods),ts:Date.now()})},500)};
const loadMods=()=>{if(saved?.seed===seed&&saved?.mods)for(const[k,v]of Object.entries(saved.mods))mods.set(k,v)};
document.getElementById('rst').onclick=()=>{localStorage.removeItem(C.KEY);location.reload()};

// プレイヤー
const P={pos:new THREE.Vector3(),vel:new THREE.Vector3(),gnd:false,jmp:false};

const findSpawn=()=>{const c=Math.floor(C.SZ/2);for(let r=0;r<=10;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){const x=c+dx,z=c+dz;if(!IN(x,0,z))continue;for(let y=C.H-2;y>=0;y--)if(solid(x,y,z)&&!solid(x,y+1,z)&&!solid(x,y+2,z))return new THREE.Vector3(x+.5,y+1.01,z+.5)}return new THREE.Vector3(c+.5,C.H,c+.5)};

const spawn=()=>{P.pos.copy(findSpawn());P.vel.set(0,0,0);camera.position.copy(P.pos)};

const col=(x,y,z,r,h)=>{for(let bx=Math.floor(x-r);bx<=Math.floor(x+r);bx++)for(let by=Math.floor(y);by<=Math.floor(y+h);by++)for(let bz=Math.floor(z-r);bz<=Math.floor(z+r);bz++)if(solid(bx,by,bz))return{hit:true,y:by};return{hit:false}};

const physics=dt=>{const r=C.PR,h=C.PH;P.vel.y-=C.GRV*dt;if(P.jmp&&P.gnd){P.vel.y=C.JMP;P.gnd=false}P.jmp=false;P.pos.x+=P.vel.x*dt;if(col(P.pos.x,P.pos.y,P.pos.z,r,h).hit){P.pos.x-=P.vel.x*dt;P.vel.x=0}P.pos.z+=P.vel.z*dt;if(col(P.pos.x,P.pos.y,P.pos.z,r,h).hit){P.pos.z-=P.vel.z*dt;P.vel.z=0}P.gnd=false;P.pos.y+=P.vel.y*dt;const c=col(P.pos.x,P.pos.y,P.pos.z,r,h);if(c.hit){if(P.vel.y<0){P.pos.y=c.y+1+.001;P.gnd=true}else{P.pos.y=c.y-h-.001}P.vel.y=0}if(P.pos.y<-20)spawn();camera.position.copy(P.pos)};

// 入力
const keys={w:0,a:0,s:0,d:0,sp:0,sh:0};
document.addEventListener('keydown',e=>{if(e.code==='KeyW')keys.w=1;if(e.code==='KeyA')keys.a=1;if(e.code==='KeyS')keys.s=1;if(e.code==='KeyD')keys.d=1;if(e.code==='Space'){keys.sp=1;e.preventDefault()}if(e.code==='ShiftLeft')keys.sh=1;if(e.code==='KeyR')spawn()});
document.addEventListener('keyup',e=>{if(e.code==='KeyW')keys.w=0;if(e.code==='KeyA')keys.a=0;if(e.code==='KeyS')keys.s=0;if(e.code==='KeyD')keys.d=0;if(e.code==='Space')keys.sp=0;if(e.code==='ShiftLeft')keys.sh=0});

let mIn={x:0,z:0},mLk={x:0,y:0};

if(mobile){
  const jB=document.getElementById('joyBase'),jS=document.getElementById('joyStick');
  let jA=false,jC={x:0,y:0};
  jB.addEventListener('pointerdown',e=>{jA=true;jB.setPointerCapture(e.pointerId);const r=jB.getBoundingClientRect();jC={x:r.left+r.width/2,y:r.top+r.height/2}});
  jB.addEventListener('pointermove',e=>{if(!jA)return;const dx=e.clientX-jC.x,dy=e.clientY-jC.y,max=40,d=Math.hypot(dx,dy),sc=d>max?max/d:1;jS.style.transform=`translate(${dx*sc}px,${dy*sc}px)`;mIn.x=dx*sc/max;mIn.z=dy*sc/max});
  jB.addEventListener('pointerup',()=>{jA=false;jS.style.transform='translate(0,0)';mIn.x=mIn.z=0});

  let lA=false,lP={x:0,y:0};
  document.addEventListener('pointerdown',e=>{if(e.target.closest('#joyArea,#btns,#hotbar,#info'))return;lA=true;lP={x:e.clientX,y:e.clientY}});
  document.addEventListener('pointermove',e=>{if(!lA)return;mLk.x+=e.clientX-lP.x;mLk.y+=e.clientY-lP.y;lP={x:e.clientX,y:e.clientY}});
  document.addEventListener('pointerup',()=>{lA=false});

  let tap=null;
  document.addEventListener('pointerdown',e=>{if(e.target.closest('#joyArea,#btns,#hotbar,#info'))return;tap={x:e.clientX,y:e.clientY,t:Date.now()}});
  document.addEventListener('pointerup',e=>{if(!tap||e.target.closest('#joyArea,#btns,#hotbar,#info')){tap=null;return}if(Date.now()-tap.t<200&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<15)act();tap=null});

  mdBtn.onclick=()=>setM(mode==='BREAK'?'PLACE':'BREAK');
  document.getElementById('jumpBtn').addEventListener('pointerdown',()=>{P.jmp=true});
}

const moveDir=()=>{const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);fwd.y=0;fwd.normalize();const rt=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize();const dir=new THREE.Vector3();if(mobile){dir.addScaledVector(fwd,-mIn.z);dir.addScaledVector(rt,mIn.x)}else{if(keys.w)dir.add(fwd);if(keys.s)dir.sub(fwd);if(keys.d)dir.add(rt);if(keys.a)dir.sub(rt)}if(dir.lengthSq()>0)dir.normalize();return dir};

const applyML=()=>{if(!mobile)return;camera.rotation.order='YXZ';camera.rotation.y-=mLk.x*.003;camera.rotation.x=clamp(camera.rotation.x-mLk.y*.003,-Math.PI/2+.1,Math.PI/2-.1);mLk.x=mLk.y=0};

// ループ
const clock=new THREE.Clock();
const loop=()=>{requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05);applyML();if(!mobile&&keys.sp)P.jmp=true;const dir=moveDir();const spd=C.SPD*(keys.sh?1.5:1);const acc=P.gnd?30:15;P.vel.x+=(dir.x*spd-P.vel.x)*Math.min(1,acc*dt);P.vel.z+=(dir.z*spd-P.vel.z)*Math.min(1,acc*dt);physics(dt);updTgt();renderer.render(scene,camera)};

window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

// 初期化
console.log('Init...');
genWorld();
genTrees();
loadMods();
buildAll();
spawn();
loop();
console.log('Ready!');

})();
