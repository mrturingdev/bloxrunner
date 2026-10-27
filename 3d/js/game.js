const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=900,H=450,GY=370;
const SPAWN_X=1950; // ~46 units ahead of the runner, past the fog, so things emerge gradually instead of popping in
const ui=document.getElementById('ui'),title=document.getElementById('title'),msg=document.getElementById('msg');
let state='ready',score=0,best=0,speed=0,obs=[],t=0,nextSpawn=0,shake=0,parts=[];
let pups=[],boost=0,slow=0,nextPup=6;
let coinsList=[],runCoins=0,lives=0,inv=0,nextCoin=2;
let bend=0,bendT=0,bendNext=8,dayT=.4,spdMul=1;
let wx='normal',wxWant='normal',wxI=0,wxNext=20,wxLast='',sx=0,sv=0,ltnWarn=0,ltnDodged=false,ltnNext=6,ltnFlash=0,dodgeMsg=0,lastLv=1,wxForce='',wxNewMsg=0,wxNewName='',slipT=0,ltnWin=1.2,dodgePost=0,dodgeDir=1,pgx=0; // weather: current, wanted, intensity, countdown; sx = ice slide; ltn* = lightning // dayT: time of day, 0 sunrise, .25 noon, .5 sunset, .75 night // road curvature: current, target, countdown to next turn
const SKINS=[
 {id:'dune',name:'Desert Runner',cost:0,body:'#fff4e0',scarf:'#e0566b',perk:'No perks. The classic.',lives:0,boost:0,slow:0},
 {id:'ember',name:'Ember',cost:100,body:'#ff8a4c',scarf:'#ffd23f',perk:'+1 life',lives:1,boost:0,slow:0},
 {id:'comet',name:'Comet',cost:250,body:'#9ad7ff',scarf:'#4cc9f0',perk:'Power: 5s speed boost, recharges in 90s',lives:0,boost:5,slow:0},
 {id:'frost',name:'Frost',cost:400,body:'#d6f3ff',scarf:'#5aa9ff',perk:'+1 life. Power: 6s slow time, recharges in 90s',lives:1,boost:0,slow:6},
 {id:'aurora',name:'Aurora',cost:700,body:'#b69cff',scarf:'#7cf0c3',perk:'+2 lives. Power: 5s speed boost, recharges in 90s',lives:2,boost:5,slow:0}
];
let save={coins:0,owned:['dune'],skin:'dune'};
const API='../api/index.php'; // progress lives on the server (api/index.php); the token identifies this device's player
let token='',pname='',offline=false,runId=null,runGen=0;try{token=localStorage.getItem('bloxrunner-token')||''}catch(e){}
function api(action,body){ // Promise of parsed JSON; rejects with Error(server error code) or Error('network')
  const h=token?{'X-Player-Token':token}:{};if(body!==undefined)h['Content-Type']='application/json';
  return fetch(API+'?action='+action,{method:body===undefined?'GET':'POST',headers:h,body:body===undefined?undefined:JSON.stringify(body)})
    .then(r=>r.json().then(j=>{if(!r.ok)throw Error(j.error||'network');return j},()=>{throw Error('network')}),()=>{throw Error('network')});
}
function applyPlayer(p){save={coins:p.coins,owned:p.owned,skin:p.skin};best=p.best_score;pname=p.name;offline=false;refreshMenu()}
const SK=()=>SKINS.find(s=>s.id===save.skin)||SKINS[0];
const P={x:120,y:GY,vy:0,w:34,h:54,ducking:false,onGround:true,holdJump:false,air:0};
const G=2600,JUMP=-900;
const stars=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*200,s:Math.random()*2+1}));

function reset(){
  score=0;speed=380;obs=[];nextSpawn=.2;parts=[];t=0;pups=[];boost=0;slow=0;nextPup=6;
  coinsList=[];runCoins=0;nextCoin=2;inv=0;bendT=0;bendNext=7;dayT=.4;spdMul=1;wx='normal';wxWant='normal';wxI=0;wxNext=20;sx=0;sv=0;ltnWarn=0;ltnNext=6;ltnFlash=0;dodgeMsg=0;lastLv=1;wxForce='';wxNewMsg=0;slipT=0;dodgePost=0;pgx=0;
  {const k=SK();lives=k.lives;powerCd=0} // lives come with the skin; its power is activated by the player
  Object.assign(P,{y:GY,vy:0,ducking:false,onGround:true,holdJump:false});
  const br=document.getElementById('brand')||document.getElementById('logo');if(br&&state==='ready'){br.style.display='flex';title.style.display='none'}
}
function start(){reset();state='play';ui.classList.add('hide');musicOn();if(pname){runId=null;const g=++runGen;api('run_start',{}).then(r=>{if(g===runGen&&state==='play')runId=r.run_id},()=>{})}}
function die(){
  state='over';shake=0.3;sfx('die');musicOff();bendT=0;ltnWarn=0;wxWant='normal';wxNext=20;
  const s=Math.floor(score);
  if(s>best)best=s;
  const br=document.getElementById('brand')||document.getElementById('logo');if(br)br.style.display='none';title.style.display='block';
  title.textContent='Game over';playBtn.textContent='▶ Play again';refreshMenu();
  const m='Coins +'+runCoins+'  ·  Score '+s+'  ·  Best '+best+'. Tap to run again.';
  msg.textContent=m+(!pname?(token?' (not saved)':' Pick a name to save your score.'):runId?'':' (not saved)');
  const rid=runId,done=()=>{if(runId===rid)runId=null}; // HUD counts runCoins in the wallet until the server has settled the run
  if(pname&&rid)api('run_finish',{run_id:rid,score:s,coins:runCoins}).then(r=>{done();applyPlayer(r.player);msg.textContent=m+' Rank #'+r.rank},()=>{done();msg.textContent=m+' (not saved)'});
  ui.classList.remove('hide');
  for(let i=0;i<20;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*500,vy:-Math.random()*500,l:1});
}
function jump(){
  if(shopEl.classList.contains('open')||setEl.classList.contains('open')||boardEl.classList.contains('open'))return;
  audioInit();
  if(state!=='play'){ if(state==='ready'||state==='over'){ if(state==='over'&&t<0)return; start(); } return;}
  if(ltnWarn>0)ltnDodged=true; // any tap during a lightning warning dodges the bolt
  if(slipT>0&&P.onGround)return; // sliding on ice: can't jump for a moment
  const jm=1-.2*(wx==='muddy'?wxI:0); // mud: lower jumps
  if(P.onGround){P.vy=JUMP*jm;P.onGround=false;P.holdJump=true;P.air=1;sfx('jump');if(wx==='muddy'&&wxI>.2)mudSplash(10,.8)}
  else if(P.air<2){ // second tap in mid-air = double jump
    P.vy=JUMP*.93*jm;P.holdJump=true;P.air=2;sfx('jump2');
    for(let i=0;i<8;i++)parts.push({x:P.x,y:P.y-8,vx:(Math.random()-.5)*300,vy:Math.random()*120,l:.4,c:'#9ad7ff'});
  }
}
function release(){P.holdJump=false}

addEventListener('keydown',e=>{
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){e.preventDefault();if(!e.repeat)jump()}
  if(e.code==='ArrowDown'||e.code==='KeyS'){e.preventDefault();P.ducking=true}
});
addEventListener('keyup',e=>{
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW')release();
  if(e.code==='ArrowDown'||e.code==='KeyS')P.ducking=false;
});
// touch: tap right/left side to jump, swipe down to duck
let ty=0,tx=0;
cv.addEventListener('pointerdown',e=>{e.preventDefault();ty=e.clientY;tx=e.clientX;jump()});
addEventListener('pointerup',()=>{release();P.ducking=false});
cv.addEventListener('pointermove',e=>{if(e.buttons&&(isRot()?tx-e.clientX:e.clientY-ty)>40&&state==='play'){P.ducking=true}});
ui.style.pointerEvents='auto';


function coinsOver(o){ // a small arc of coins floating above an obstacle: jump to collect them
  const n=o.w>60?4:3,cx=o.x+o.w/2,top=GY-o.h-48;
  for(let i=0;i<n;i++){const u=i/(n-1);coinsList.push({x:cx+(u-.5)*(o.w+60),y:top-Math.sin(u*Math.PI)*22})}
}
function spawn(){
  const r=Math.random(),s=score;
  const add=(o,dx=0)=>{o.x=SPAWN_X+dx;obs.push(o);if(o.type!=='bird'&&Math.random()<.25)coinsOver(o)};
  // giant cactus / crystal spire: too tall for one jump, so they need a double jump
  if(s>200&&wx!=='muddy'&&wxWant!=='muddy'&&Math.random()<Math.min(.10+s/15000,.15)){
    add(Math.random()<.5?{type:'giant',w:40,h:162}:{type:'spire',w:32,h:165});
  }else if(s>300&&r<0.25){
    // level 2+: birds. Low ones force a duck or jump; level 4+ adds high ones that catch mid-jumps
    if(s>900&&Math.random()<0.25)add({type:'bird',y:GY-95,w:44,h:24});
    else add({type:'bird',y:GY-34,w:44,h:24});
  }else if(r<0.6){
    // level 3+: triple cactus clusters
    const n=s>600&&Math.random()<0.25?3:1+(Math.random()<0.3?1:0);
    add({type:'cactus',w:24*n+8,h:44+Math.random()*30,n});
  }else if(r<0.85){
    add({type:'rock',w:50,h:30});
  }else{
    add({type:'cactus',w:56,h:84,n:2,tall:true});
  }
  // level 5+: combos, a second obstacle right behind the first
  if(s>1500&&Math.random()<Math.min(0.1+(s-1500)/9000,0.25)){
    const dx=300+Math.random()*100;
    if(Math.random()<0.5)add({type:'bird',y:GY-34,w:44,h:24},dx);
    else add({type:'rock',w:50,h:30},dx);
  }
  // gaps shrink as difficulty rises, but never below what a jump needs
  const d=Math.min(s/1500,1);
  nextSpawn=(0.8+speed/1200)*(1-0.12*d)+Math.random()*(1.0-0.3*d);
  const lo=obs[obs.length-1];if(lo&&lo.h>150)nextSpawn+=.7; // landing room after a giant
}
function hitbox(o){
  if(o.type==='bird')return{x:o.x,y:o.y-o.h,w:o.w,h:o.h};
  return{x:o.x,y:GY-o.h,w:o.w,h:o.h};
}
function playerBox(){
  const h=P.ducking&&P.onGround?30:P.h;
  return{x:P.x+sx-P.w/2+5,y:P.y-h+4,w:P.w-10,h:h-8};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

const curLevel=()=>1+Math.floor(score/300);
const wxPool=()=>['icy','muddy','storm','dusty'].slice(0,Math.max(0,curLevel()-1)); // level 2 icy, 3 muddy, 4 thunderstorm, 5 dust storm (hardest)
function mudSplash(n,s){ // brown blobs that fly up and fall back down
  for(let i=0;i<n;i++)parts.push({x:P.x+(Math.random()-.5)*30,y:P.y-2,vx:(Math.random()-.5)*420*s,vy:-(120+Math.random()*320)*s,l:.55+Math.random()*.25,c:i%3?'#5b3b1c':'#7a5230'});
}
function lightningHit(){
  if(inv>0)return;
  shake=.45;
  if(lives>0){lives--;inv=1.5;sfx('hit');for(let i=0;i<12;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*400,vy:-Math.random()*400,l:.6,c:'#ffd23f'})}
  else die();
}
function strike(dodged){
  ltnFlash=1;sfx('thunder');
  boltAt(0,-sx/U); // the bolt always comes down on the runner's spot (the red ring)
  for(let i=0;i<14;i++)parts.push({x:P.x,y:P.y-4,vx:(Math.random()-.5)*400,vy:-Math.random()*250,l:.5,c:'#ffd23f'});
  if(dodged){dodgeMsg=1.1;dodgePost=.55;sfx('dodge')}else lightningHit();
}
function update(dt){
  t+=dt;
  bend+=(bendT-bend)*Math.min(1,dt*.6);
  dayT+=dt/150*(state==='play'?1:.3);
  if(ltnFlash>0)ltnFlash-=dt*3;if(dodgeMsg>0)dodgeMsg-=dt;if(slipT>0)slipT-=dt;if(dodgePost>0)dodgePost-=dt;if(wxNewMsg>0)wxNewMsg-=dt;
  { // weather fades in/out (also in menus); a new type only starts once the old one has faded
    const tgt=(wx===wxWant&&wx!=='normal')?1:0;
    wxI+=(tgt-wxI)*Math.min(1,dt*.8);
    if(wx!==wxWant&&wxI<.03){wx=wxWant;wxI=0}
  }
  // icy road: the runner slides back and forth like a loose spring; otherwise it snaps back quickly
  const wtg=wx==='dusty'?-(48+30*Math.sin(t*1.7))*wxI:0; // dust: gusty wind pushes the runner back
  sv+=((wx==='icy'?-4:wx==='dusty'?-8:-14)*(sx-wtg)-(wx==='icy'?.9:wx==='dusty'?4:7)*sv)*dt;sx+=sv*dt;sx=Math.max(-90,Math.min(90,sx)); // a full day lasts about 2.5 minutes of play
  if(state==='play'){
    if(boost>0)boost-=dt;if(inv>0)inv-=dt;if(powerCd>0)powerCd-=dt;
    const L=curLevel();
    if(L>lastLv){ // a new level unlocks a new weather type, and it comes next
      if(L>=2&&L<=5){wxForce=['icy','muddy','storm','dusty'][L-2];wxNext=Math.min(wxNext,3);wxNewMsg=3.2;wxNewName=['ICY ROADS','MUDDY ROADS','THUNDERSTORMS','DUST STORMS'][L-2]}
      lastLv=L;
    }
    wxNext-=dt;
    if(wxNext<=0){
      if(!wxPool().length)wxNext=6; // no weather before level 2
      else if(wxWant!=='normal'){wxWant='normal';wxNext=Math.max(5,15-L)+Math.random()*8}
      else{
        const pool=wxPool(),opts=pool.length>1?pool.filter(k=>k!==wxLast):pool;
        wxWant=wxLast=(wxForce&&pool.includes(wxForce))?wxForce:opts[Math.floor(Math.random()*opts.length)];wxForce='';wxNext=22+Math.min(L,7)*2+Math.random()*8;
        if(wxWant==='muddy')obs=obs.filter(o=>!(o.h>150&&o.x>1300)); // no double-jump-only obstacles on mud
      }
    }
    if(wx==='storm'&&wxI>.6&&ltnWarn<=0){
      ltnNext-=dt;
      if(ltnNext<=0){ltnWin=ltnWarn=Math.max(.8,1.15-L*.04);ltnDodged=false;dodgeDir=Math.random()<.5?-1:1;ltnNext=Math.max(2.8,6-L*.35)+Math.random()*2.5;sfx('warn')}
    }
    if(ltnWarn>0){ltnWarn-=dt;if(ltnWarn<=0)strike(ltnDodged)}
    if(wx==='muddy'&&wxI>.3&&P.onGround&&Math.random()<dt*16)parts.push({x:P.x,y:P.y-3,vx:-80-Math.random()*160,vy:-60-Math.random()*120,l:.45,c:'#5b3b1c'}); // mud splashes
    bendNext-=dt;
    if(bendNext<=0){
      // from straight we always turn; from a curve we usually straighten out, sometimes swing the other way
      const m=Math.min(1,.55+.45*Math.random()+.1*Math.min(score/1200,1));
      bendT=(bendT===0||Math.random()<.35)?(Math.random()<.5?-m:m):0;
      bendNext=5+Math.random()*6;
    }
    if(slow>0)slow-=dt;
    const base=Math.min(380+score*0.6,900); // gentler speed ramp, lower top speed
    const tm=(boost>0?1.6:1)*(slow>0?0.55:1)*(wx==='icy'?1+.12*wxI:1);spdMul+=(tm-spdMul)*Math.min(1,dt*3);speed=base*spdMul;
    score+=dt*(300/45)*(boost>0?2:1); // 300 points per level = 45 seconds per level (boost doubles the points)
    const pdt=slow>0?dt*0.6:dt;
    // physics (variable jump height)
    const g=(P.vy<0&&!P.holdJump&&P.air<2)?G*2.2:G;
    P.vy+=g*pdt;P.y+=P.vy*pdt;
    if(P.y>=GY){if(!P.onGround&&wx==='muddy'&&wxI>.2)mudSplash(16,1.1);
    if(!P.onGround&&wx==='icy'){
      const passed=obs.some(o=>o.x+o.w<P.x+30&&o.x+o.w>P.x-320); // just cleared an obstacle
      if(passed&&wxI>.5&&slipT<=0&&Math.random()<.25){
        slipT=.8;sv+=300;sfx('slip');
        for(let i=0;i<8;i++)parts.push({x:P.x,y:P.y-4,vx:-Math.random()*200,vy:-Math.random()*150,l:.4,c:'#e8f6ff'});
      }else sv+=50*wxI;
    }P.y=GY;P.vy=0;P.onGround=true;P.air=0}
    if(P.ducking&&!P.onGround)P.vy+=G*dt; // fast-fall
    nextSpawn-=dt;
    if(nextSpawn<=0)spawn();
    nextPup-=dt;
    if(nextPup<=0){pups.push({k:Math.random()<.5?'boost':'slow',x:SPAWN_X,y:GY-70-Math.random()*60,r:16});nextPup=8+Math.random()*6}
    pups.forEach(p=>p.x-=speed*dt);
    coinsList.forEach(c=>c.x-=speed*dt);
    obs.forEach(o=>o.x-=speed*dt);
    obs=obs.filter(o=>o.x>-100);
    const pb=playerBox();
    coinsList=coinsList.filter(c=>{
      if(c.x<-30)return false;
      if(overlap(pb,{x:c.x-10,y:c.y-10,w:20,h:20})){runCoins++;sfx('coin');return false}
      return true;
    });
    pups=pups.filter(p=>{
      if(p.x<-50)return false;
      if(overlap(pb,{x:p.x-p.r,y:p.y-p.r,w:p.r*2,h:p.r*2})){
        const c=p.k==='boost'?'#ffd23f':'#4cc9f0';
        if(p.k==='boost')boost=5;else slow=6;
        sfx('power');
        for(let i=0;i<14;i++)parts.push({x:p.x,y:p.y,vx:(Math.random()-.5)*400,vy:(Math.random()-.5)*400,l:.6,c});
        return false;
      }
      return true;
    });
    if(boost>0){
      obs=obs.filter(o=>{
        if(overlap(pb,hitbox(o))){
          const hb=hitbox(o);score+=10;
          for(let i=0;i<12;i++)parts.push({x:hb.x+hb.w/2,y:hb.y+hb.h/2,vx:(Math.random()-.2)*500,vy:-Math.random()*400,l:.7,c:'#ffd1a0'});
          return false;
        }
        return true;
      });
    }else if(inv<=0){
      const hit=obs.find(o=>overlap(pb,hitbox(o)));
      if(!hit){}
      else if(lives>0){
        lives--;inv=1.5;shake=.25;sfx('hit');obs=obs.filter(o=>o!==hit);
        for(let i=0;i<12;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*400,vy:-Math.random()*400,l:.6,c:'#ff4d6d'});
      }else die();
    }
  }
  parts.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=1500*dt;p.l-=dt});
  parts=parts.filter(p=>p.l>0);
  if(shake>0)shake-=dt;
}

// ---------- three.js renderer (replaces the 2D scene drawing; the 2D canvas is now only the HUD overlay) ----------
const stage=document.getElementById('stage');
let SW=stage.clientWidth||900,SH=stage.clientHeight||450;
new ResizeObserver(()=>{SW=stage.clientWidth;SH=stage.clientHeight}).observe(stage);
const R=new THREE.WebGLRenderer({canvas:document.getElementById('gl'),antialias:true,alpha:true});
R.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x8a3a64,14,50);
const skyU={top:{value:new THREE.Color(0x2b1b4d)},hor:{value:new THREE.Color(0x8a3a64)}};
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(150,16,12),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:'varying float vy;void main(){vy=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top;uniform vec3 hor;varying float vy;void main(){gl_FragColor=vec4(mix(hor,top,smoothstep(0.,.45,vy)),1.);}'}));
skyMesh.renderOrder=-1;skyMesh.frustumCulled=false;scene.add(skyMesh);
const cam=new THREE.PerspectiveCamera(50,2,0.1,200);
const ambL=new THREE.AmbientLight(0xffd9c0,.65);scene.add(ambL);
const sunL=new THREE.DirectionalLight(0xffb080,.9);sunL.position.set(-5,10,6);scene.add(sunL);
const U=40,zOf=x=>-(x-P.x)/U,yOf=y=>(GY-y)/U;
const lam=(c,e)=>new THREE.MeshLambertMaterial({color:c,emissive:e||0x000000});
const bas=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c},o||{}));
const gBox=new THREE.BoxGeometry(1,1,1),gCyl=new THREE.CylinderGeometry(.5,.5,1,10),gCone=new THREE.ConeGeometry(.5,1,5),gSph=new THREE.SphereGeometry(.5,16,12);
const gOct=new THREE.OctahedronGeometry(.5),gIco=new THREE.IcosahedronGeometry(.5);
const mesh=(g,m,sx,sy,sz)=>{const o=new THREE.Mesh(g,m);o.scale.set(sx,sy,sz);return o};

// world: ground, lane dashes, dunes, sun, stars
const groundM=lam(0x3b2250),ground=mesh(new THREE.PlaneGeometry(1,1),groundM,120,130,1);ground.rotation.x=-Math.PI/2;ground.position.set(0,0,-45);scene.add(ground);
// the road is a ribbon of segments that bends with `bend`; everything on it is shifted by off(z)
const K=.008,off=z=>bend*K*z*z,yawAt=z=>Math.atan(2*bend*K*z);
const roadM=lam(0x150b26),edgeM=bas(0xffb347),roadSegs=[];
for(let i=0;i<32;i++){
  const g=new THREE.Group();
  g.add(mesh(gBox,roadM,5.6,.02,2.5));
  const e1=mesh(gBox,edgeM,.12,.03,2.5),e2=mesh(gBox,edgeM,.12,.03,2.5);e1.position.x=-2.8;e2.position.x=2.8;
  g.add(e1,e2);g.position.set(0,.005,-50+i*2);scene.add(g);roadSegs.push(g);
}
const dashM=bas(0xffb347),dashes=[];
for(let i=0;i<40;i++){const d=mesh(gBox,dashM,.12,.02,1.1);d.position.set(i%2?2.2:-2.2,.01,0);scene.add(d);dashes.push(d)}
const duneM=[lam(0x8a2f5c),lam(0x4a1d54)],dunes=[];
for(let i=0;i<16;i++){const s=3+(i*7%5);const d=mesh(gCone,duneM[i%2],s*2,s,s*2);d.position.set((i%2?1:-1)*(14+(i*5%6)),s/2-.2,0);scene.add(d);dunes.push(d)}
const sun=mesh(gSph,bas(0xffb347,{fog:false}),14,14,14);sun.position.set(10,7,-70);scene.add(sun);
const moon=mesh(gSph,bas(0xdfe8ff,{fog:false}),8,8,8);scene.add(moon);let starMat;
{const p=new Float32Array(180);for(let i=0;i<60;i++){p[i*3]=(Math.random()-.5)*120;p[i*3+1]=12+Math.random()*30;p[i*3+2]=-90}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 starMat=new THREE.PointsMaterial({color:0xffffff,size:1.2,fog:false,transparent:true,opacity:0});scene.add(new THREE.Points(g,starMat))}

// player
const pg=new THREE.Group(),bodyM=lam(0xffffff),scarfM=lam(0xffffff);
const pBody=mesh(gBox,bodyM,.85,1,.85),pScarf=mesh(gBox,scarfM,.5,.15,.9),pEye=mesh(gBox,lam(0x1c1233),.15,.15,.1);
const legA=mesh(gBox,bodyM,.25,.35,.25),legB=mesh(gBox,bodyM,.25,.35,.25);
const glow=mesh(gSph,bas(0xffd23f,{transparent:true,opacity:.3}),2.4,2.4,2.4);
pg.add(pBody,pScarf,pEye,legA,legB,glow);scene.add(pg);

// obstacles, coins, power-ups (meshes are created on demand and removed when the 2D game logic drops them)
const spireM=lam(0xb36bff,0x3a1a66),owned=new Set(),cactM=lam(0x7bc47f),rockM=lam(0xc9a27e),birdM=lam(0xffd1a0),coinM=lam(0xffd23f,0x664400);
const puM={boost:lam(0xffd23f,0x806000),slow:lam(0x4cc9f0,0x104060)};
function track(g){scene.add(g);owned.add(g);return g}
function mkObs(o){
  const g=new THREE.Group(),w=o.w/U,h=o.h/U;
  if(o.type==='cactus'){
    const cw=w/o.n;
    for(let i=0;i<o.n;i++){
      const hi=(o.h-(i%2)*10)/U,c=new THREE.Group();c.position.z=(i+.5-o.n/2)*cw;
      const tr=mesh(gCyl,cactM,cw*.7,hi,cw*.7);tr.position.y=hi/2;
      const a1=mesh(gBox,cactM,.5,.18,.18);a1.position.set(.3,hi*.6,0);
      const a2=mesh(gBox,cactM,.18,.5,.18);a2.position.set(.5,hi*.6+.2,0);
      c.add(tr,a1,a2);g.add(c);
    }
  }else if(o.type==='rock'){
    const r=mesh(gCone,rockM,w,h,w);r.position.y=h/2;g.add(r);
  }else if(o.type==='giant'){
    const tr=mesh(gCyl,cactM,w,h,w);tr.position.y=h/2;
    const a1=mesh(gBox,cactM,.9,.3,.3);a1.position.set(.55,h*.55,0);
    const a2=mesh(gBox,cactM,.3,1.1,.3);a2.position.set(.95,h*.55+.5,0);
    const a3=mesh(gBox,cactM,.8,.3,.3);a3.position.set(-.5,h*.4,0);
    const a4=mesh(gBox,cactM,.3,.9,.3);a4.position.set(-.85,h*.4+.4,0);
    g.add(tr,a1,a2,a3,a4);
  }else if(o.type==='spire'){
    const s1=mesh(gCone,spireM,w*1.3,h,w*1.3);s1.position.y=h/2;
    const s2=mesh(gCone,spireM,w*.8,h*.6,w*.8);s2.position.set(.7,h*.3,.5);
    g.add(s1,s2);
  }else{
    const b=mesh(gBox,birdM,.6,.35,1.1),wa=mesh(gBox,birdM,.9,.08,.5),wb=mesh(gBox,birdM,.9,.08,.5);
    wa.position.x=-.7;wb.position.x=.7;g.add(b,wa,wb);
  }
  return track(g);
}
function mkCoin(){const g=new THREE.Group(),d=mesh(gCyl,coinM,.6,.12,.6);d.rotation.x=Math.PI/2;g.add(d);return track(g)}
function mkPup(p){
  const g=new THREE.Group();
  g.add(new THREE.Mesh(p.k==='boost'?gOct:gIco,puM[p.k]));
  g.add(mesh(gSph,bas(p.k==='boost'?0xffd23f:0x4cc9f0,{transparent:true,opacity:.25}),1.3,1.3,1.3));
  g.scale.setScalar(1.4);return track(g);
}
const pm=[];for(let i=0;i<80;i++){const m=mesh(gBox,bas(0xffffff),.12,.12,.12);m.visible=false;scene.add(m);pm.push(m)}

// weather visuals: rain, lightning warning ring and bolt, road/ground tints
const RB=[.082,.043,.149],GB=[.23,.13,.31];
const WXC={icy:[.56,.78,.91],muddy:[.36,.22,.1],dusty:[.42,.32,.2],storm:[.04,.03,.09]};
const GC={icy:[.75,.88,.96],muddy:[.34,.23,.13],dusty:[.55,.42,.28],storm:[.1,.09,.18]};
const WXSKY={icy:[[120,170,210],[200,225,240],.5,1],muddy:[[90,80,70],[120,100,80],.35,.85],dusty:[[150,115,80],[190,155,105],.7,.9],storm:[[30,34,52],[80,86,106],.8,.7]};
const RN=300,rainPos=new Float32Array(RN*6);
for(let i=0;i<RN;i++){const x=(Math.random()-.5)*28,y=Math.random()*18,z=-32+Math.random()*42;rainPos.set([x,y,z,x+.06,y-.9,z],i*6)}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rainMat=new THREE.LineBasicMaterial({color:0xaac8ff,transparent:true,opacity:0,fog:false});
const rain=new THREE.LineSegments(rainGeo,rainMat);rain.frustumCulled=false;rain.visible=false;scene.add(rain);
const ring=mesh(new THREE.RingGeometry(.8,1.1,24),bas(0xff4d6d,{side:THREE.DoubleSide,transparent:true,opacity:.8,fog:false}),1,1,1);
ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
const boltM=bas(0xeaf4ff,{fog:false}),bolts=[];let boltT=0;
for(let i=0;i<10;i++){const m=mesh(gBox,boltM,.2,.2,1);m.visible=false;scene.add(m);bolts.push(m)}
function boltAt(x,z){ // jagged bolt from the clouds down to (x,0,z)
  let px=x+(Math.random()-.5)*3,py=18;boltT=.25;
  bolts.forEach((m,i)=>{
    const k=(i+1)/10,nx=i===9?x:x+(px-x)*(1-k)*.6+(Math.random()-.5)*1.4,ny=18*(1-k);
    const len=Math.hypot(nx-px,ny-py,0)||.1;
    m.position.set((px+nx)/2,(py+ny)/2,z);m.lookAt(nx,ny,z);m.scale.set(.2,.2,len);m.visible=true;
    px=nx;py=ny;
  });
}
// icy: snowy peaks, snow banks beside the road, falling snow.  muddy: mud patches and puddles on the road.
const snowM=lam(0xf4fbff);snowM.transparent=true;snowM.opacity=0;
dunes.forEach(d=>{const c=mesh(gCone,snowM,.46,.46,.46);c.position.y=.27;c.visible=false;d.add(c);d.userData.cap=c});
const bankM=lam(0xeef8ff);bankM.transparent=true;bankM.opacity=0;
const banks=[];for(let i=0;i<28;i++){const m=mesh(gSph,bankM,1,1,1);m.visible=false;scene.add(m);banks.push(m)}
const SNN=220,snowPos=new Float32Array(SNN*3);
for(let i=0;i<SNN;i++)snowPos.set([(Math.random()-.5)*26,Math.random()*14,-30+Math.random()*40],i*3);
const snowGeo=new THREE.BufferGeometry();snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snowMat=new THREE.PointsMaterial({color:0xffffff,size:.14,transparent:true,opacity:0,fog:false});
const snowFall=new THREE.Points(snowGeo,snowMat);snowFall.frustumCulled=false;snowFall.visible=false;scene.add(snowFall);
const mudM=lam(0x2a190b),puddleM=lam(0x5b3b1c,0x1a0f06);
const patches=[];for(let i=0;i<22;i++){const m=mesh(gCyl,i%3?mudM:puddleM,1,.02,1);m.visible=false;scene.add(m);patches.push(m)}
// sky keyframes: [phase, top colour, horizon colour, ambient light, sun/moon light]
const SKY=[[0,[58,42,107],[224,120,138],.6,.7],[.25,[74,144,217],[191,227,242],.85,1],[.5,[58,42,107],[255,122,77],.6,.7],[.75,[7,8,22],[26,22,64],.5,.35],[1,[58,42,107],[224,120,138],.6,.7]];
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const wl=(c,u)=>c.map(v=>(v+(255-v)*u)/255);
function skyAt(ph){
  let i=0;while(i<3&&ph>SKY[i+1][0])i++;
  const a=SKY[i],b=SKY[i+1];let u=(ph-a[0])/(b[0]-a[0]);u=u*u*(3-2*u);
  return{top:mix(a[1],b[1],u),hor:mix(a[2],b[2],u),amb:a[3]+(b[3]-a[3])*u,dir:a[4]+(b[4]-a[4])*u};
}
let lastSky=0,fovCur=50,lastSkin='',warmed=false;const SEEN=new Set();
let sc=0,bg=0,lt=performance.now(),rw=0,rh=0;
function render3D(){
  const now=performance.now(),dt=Math.min((now-lt)/1000,.05);lt=now;
  const v=state==='play'?speed:60;sc+=v*dt/U;bg+=v*dt/U*.12;
  // sun and moon travel across the sky; colours and lighting follow the time of day
  const dph=((dayT%1)+1)%1,th=dph*Math.PI*2,hs=Math.sin(th),hl=Math.max(0,hs);
  sun.position.set(40*Math.cos(th),22*hs-2,-70);moon.position.set(-40*Math.cos(th),-22*hs-2,-70);
  if(now-lastSky>120){ // colour work is throttled: it changes slowly and allocates
    lastSky=now;const sky=skyAt(dph);
    const wk=WXSKY[wx];
    if(wk&&wxI>.01){const u=wxI*wk[2],l=1-(1-wk[3])*wxI;sky.top=mix(sky.top,wk[0],u);sky.hor=mix(sky.hor,wk[1],u);sky.amb=Math.max(.42,sky.amb*l);sky.dir*=l}
    sun.material.color.setRGB(1,.55+.4*hl,.25+.6*hl);
    const sunVis=1-((wx==='storm'||wx==='dusty')?wxI:0)*.92;
    sun.material.transparent=moon.material.transparent=true;sun.material.opacity=moon.material.opacity=sunVis;
    starMat.opacity=Math.min(1,Math.max(0,-hs*2.2));
    scene.fog.color.setRGB(sky.hor[0]/255,sky.hor[1]/255,sky.hor[2]/255);
    ambL.intensity=sky.amb;ambL.color.setRGB(...wl(sky.hor,.55));
    sunL.intensity=sky.dir;sunL.color.setRGB(...wl(sky.hor,.5));
    skyU.top.value.setRGB(sky.top[0]/255,sky.top[1]/255,sky.top[2]/255);
    skyU.hor.value.setRGB(sky.hor[0]/255,sky.hor[1]/255,sky.hor[2]/255);
  }
  const w=SW,h=SH;
  if(w&&h&&(w!==rw||h!==rh)){R.setPixelRatio(Math.min(devicePixelRatio||1,1.5));R.setSize(w,h,false);cam.aspect=w/h;rw=w;rh=h}
  dashes.forEach((d,i)=>{const z=-56+(((i>>1)*3+sc)%60);d.position.set(off(z)+(i%2?1.4:-1.4),.03,z);d.rotation.y=yawAt(z)});
  roadSegs.forEach((g,i)=>{const z=-50+i*2;g.position.x=off(z);g.rotation.y=yawAt(z)});
  dunes.forEach((d,i)=>{const z=-64+((i*4+bg)%64);d.position.z=z;d.position.x=(i%2?1:-1)*(14+(i*5%6))+off(z)});
  // player
  const duck=P.ducking&&P.onGround,ph=duck?30:P.h,fy=yOf(P.y),bh=(ph-14)/U;
  if(lastSkin!==save.skin){lastSkin=save.skin;bodyM.color.set(SK().body);scarfM.color.set(SK().scarf)}
  pBody.scale.y=bh;pBody.position.set(0,fy+.35+bh/2,0);
  pEye.position.set(.2,fy+.35+bh-.25,-.45);
  pScarf.position.set(0,fy+.35+bh-.45,.6+Math.sin(t*14)*.08);
  const st=P.onGround&&state==='play'?Math.sin(t*22)*8/U:0;
  legA.position.set(0,fy+.175,.2+st);legB.position.set(0,fy+.175,-.2-st);
  pg.visible=!(inv>0&&Math.floor(t*20)%2);
  glow.visible=boost>0;glow.position.set(0,fy+1,0);glow.scale.setScalar(2.4+Math.sin(t*10)*.2);
  // world objects
  const seen=SEEN;seen.clear();
  obs.forEach(o=>{
    if(!o._m)o._m=mkObs(o);
    const m=o._m,hb=hitbox(o);seen.add(m);
    const oz=zOf(hb.x+hb.w/2);m.position.set(off(oz),o.type==='bird'?yOf(o.y-12):0,oz);m.rotation.y=yawAt(oz);
    if(o.type==='bird'){const f=Math.sin(t*20)*.6;m.children[1].rotation.z=f;m.children[2].rotation.z=-f}
  });
  coinsList.forEach(c=>{
    if(!c._m)c._m=mkCoin();
    seen.add(c._m);{const cz=zOf(c.x);c._m.position.set(off(cz),yOf(c.y),cz)}c._m.rotation.y=t*5+c.x*.01;
  });
  pups.forEach(p=>{
    if(!p._m)p._m=mkPup(p);
    seen.add(p._m);{const pz=zOf(p.x);p._m.position.set(off(pz),yOf(p.y),pz)}p._m.rotation.y=t*3;p._m.rotation.x=t*2;
  });
  owned.forEach(m=>{if(!seen.has(m)){scene.remove(m);owned.delete(m)}});
  for(let i=0;i<80;i++){
    const p=parts[i],m=pm[i];
    if(p){m.visible=true;if(m.userData.c!==p.c){m.userData.c=p.c;m.material.color.set(p.c||'#ff4d6d')}m.position.set(((i*37)%7-3)*.12+off(zOf(p.x)),yOf(p.y),zOf(p.x))}
    else m.visible=false;
  }
  // camera (shakes on hit, widens on boost, adapts smoothly to narrow/portrait screens)
  const sk=shake>0?.25:0;
  const nar=Math.max(0,Math.min(1,(1.35-cam.aspect)/.75));
  cam.position.set((3.4-1.1*nar)+(Math.random()-.5)*sk,(3.5+1.2*nar)+(Math.random()-.5)*sk,7+2.8*nar);
  cam.lookAt(-1+off(-14)*.7+.4*nar,1.3,-6-2*nar);fovCur+=((50+22*nar)+(boost>0?8:0)-fovCur)*Math.min(1,dt*4);cam.fov=fovCur;cam.updateProjectionMatrix();
  { // weather visuals
    const dI=wx==='dusty'?wxI:0,sI=wx==='storm'?wxI:0,rc=WXC[wx],gc=GC[wx],k=wxI;
    scene.fog.near=14-8*dI-4*sI;scene.fog.far=50-22*dI-20*sI;
    if(rc){roadM.color.setRGB(RB[0]+(rc[0]-RB[0])*k,RB[1]+(rc[1]-RB[1])*k,RB[2]+(rc[2]-RB[2])*k);groundM.color.setRGB(GB[0]+(gc[0]-GB[0])*k,GB[1]+(gc[1]-GB[1])*k,GB[2]+(gc[2]-GB[2])*k)}
    else{roadM.color.setRGB(RB[0],RB[1],RB[2]);groundM.color.setRGB(GB[0],GB[1],GB[2])}
    rain.visible=wx==='storm'&&wxI>.03;
    if(rain.visible){
      rainMat.opacity=.55*wxI;
      for(let i=0;i<RN;i++){const j=i*6;rainPos[j+1]-=26*dt;rainPos[j+4]-=26*dt;if(rainPos[j+1]<0){rainPos[j+1]=18;rainPos[j+4]=17.1}}
      rainGeo.attributes.position.needsUpdate=true;
    }
    ring.visible=ltnWarn>0;
    if(ring.visible){const s=1+.25*Math.sin(t*25);ring.scale.set(s,s,s);ring.position.set(0,.04,-sx/U);ring.material.opacity=.5+.4*Math.sin(t*25)}
    if(boltT>0){boltT-=dt;if(boltT<=0)bolts.forEach(m=>{m.visible=false})}
    pg.position.z=-sx/U; // the runner skids on ice and gets pushed by wind
    // dodge: the runner sidesteps while the bolt lands on the ring; slip: wobble
    const dxT=(ltnDodged&&(ltnWarn>0||dodgePost>0))?1.8*dodgeDir:0;
    pgx+=(dxT-pgx)*Math.min(1,dt*12);
    pg.position.x=pgx;
    pg.rotation.z=(slipT>0?Math.sin(t*30)*.35*Math.min(1,slipT*3):0)+(dxT-pgx)*.35;
    const ic=wx==='icy'?wxI:0,mu=wx==='muddy'?wxI:0;
    duneM[0].color.setRGB(.54+.08*ic,.18+.52*ic,.36+.46*ic);duneM[1].color.setRGB(.29+.21*ic,.11+.49*ic,.33+.41*ic); // snowy mountains
    snowM.opacity=ic;bankM.opacity=ic;
    dunes.forEach(d=>{d.userData.cap.visible=ic>.03});
    banks.forEach((m,i)=>{
      m.visible=ic>.03;
      if(m.visible){const z=-52+((i*2.2+sc)%62),sz=.9+((i*37)%7)*.18;
        m.position.set((i%2?1:-1)*(3.5+((i*13)%5)*.35)+off(z),sz*.25*ic,z);m.scale.set(sz*1.5*ic,sz*.6*ic,sz*1.3*ic)}
    });
    snowFall.visible=ic>.03;
    if(snowFall.visible){
      snowMat.opacity=.85*ic;
      for(let i=0;i<SNN;i++){const j=i*3;snowPos[j+1]-=2.6*dt;snowPos[j]+=Math.sin(t*1.5+i)*.4*dt;if(snowPos[j+1]<0)snowPos[j+1]=14}
      snowGeo.attributes.position.needsUpdate=true;
    }
    patches.forEach((m,i)=>{
      m.visible=mu>.03;
      if(m.visible){const z=-48+((i*2.9+sc)%58),w=.7+((i*29)%6)*.25;
        m.position.set(((i*47)%9-4)*.5+off(z),.03,z);m.scale.set(w*mu,.02,w*.8*mu);m.rotation.y=yawAt(z)}
    });
  }
  skyMesh.position.copy(cam.position);
  if(!warmed){
    warmed=true;
    const ws=[mkObs({type:'cactus',w:56,h:60,n:2}),mkObs({type:'rock',w:50,h:30}),mkObs({type:'bird',w:44,h:24}),mkObs({type:'giant',w:40,h:162}),mkObs({type:'spire',w:32,h:165}),mkCoin(),mkPup({k:'boost'}),mkPup({k:'slow'})];
    ws.forEach((g,i)=>g.position.set(-1+(i-3.5)*.5,1,-8));
    pg.visible=true;glow.visible=true;pm.forEach(m=>m.visible=true);rain.visible=ring.visible=true;bolts.forEach(m=>m.visible=true);banks.forEach(m=>m.visible=true);patches.forEach(m=>m.visible=true);snowFall.visible=true;dunes.forEach(d=>{d.userData.cap.visible=true});
    R.render(scene,cam);
    ws.forEach(g=>{scene.remove(g);owned.delete(g)});
    pg.visible=!(inv>0&&Math.floor(t*20)%2);glow.visible=boost>0;pm.forEach((m,i)=>m.visible=!!parts[i]);rain.visible=wx==='storm'&&wxI>.03;ring.visible=ltnWarn>0;bolts.forEach(m=>m.visible=boltT>0);banks.forEach(m=>m.visible=wx==='icy'&&wxI>.03);patches.forEach(m=>m.visible=wx==='muddy'&&wxI>.03);snowFall.visible=wx==='icy'&&wxI>.03;dunes.forEach(d=>{d.userData.cap.visible=wx==='icy'&&wxI>.03});
  }
  R.render(scene,cam);
}

// The 2D canvas is a transparent overlay that only draws the HUD.
function draw(){
  syncPower();
  const dpr=Math.min(devicePixelRatio||1,2),W=SW,H=SH;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.save();
  render3D();
  const narHud=W<560,topY=narHud?92:34;
  if(wx!=='normal'&&wxI>.02){
    const col={icy:'180,220,255',muddy:'80,50,20',dusty:'200,160,100',storm:'20,25,45'}[wx];
    ctx.fillStyle='rgba('+col+','+((wx==='dusty'?.14:wx==='storm'?.16:.1)*wxI)+')';ctx.fillRect(0,0,W,H);
    if(wx==='dusty'){ctx.fillStyle='rgba(235,205,150,'+(.18*wxI)+')';for(let i=0;i<24;i++)ctx.fillRect(((i*137-t*(500+i*40))%W+W)%W,(i*53)%H,60+i*6,2)}
    ctx.fillStyle='rgba(255,244,224,'+(.9*wxI)+')';ctx.font='bold '+(narHud?14:16)+'px Trebuchet MS, sans-serif';ctx.textAlign='center';
    ctx.fillText({icy:'ICY ROAD - slippery and fast',muddy:'MUDDY ROAD - lower jumps',dusty:'DUST STORM - wind and low visibility',storm:'THUNDERSTORM'}[wx],W/2,(state==='play'&&Math.abs(bendT)>.3)?topY+22:topY);
  }
  if(ltnWarn>0){
    ctx.textAlign='center';ctx.font='bold '+(narHud?20:26)+'px Trebuchet MS, sans-serif';
    ctx.fillStyle='rgba(255,77,109,'+(.65+.35*Math.sin(t*25))+')';
    ctx.fillText(ltnDodged?'DODGING...':'LIGHTNING! TAP NOW!',W/2,H*.3);
    ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(W/2-80,H*.3+12,160,8);
    ctx.fillStyle='#ffd23f';ctx.fillRect(W/2-80,H*.3+12,160*Math.min(1,Math.max(0,ltnWarn/ltnWin)),8);
  }
  if(dodgeMsg>0){ctx.textAlign='center';ctx.font='bold '+(narHud?24:30)+'px Trebuchet MS, sans-serif';ctx.fillStyle='rgba(124,240,195,'+Math.min(1,dodgeMsg)+')';ctx.fillText('DODGED!',W/2,H*.3)}
  if(slipT>0){ctx.textAlign='center';ctx.font='bold '+(narHud?20:24)+'px Trebuchet MS, sans-serif';ctx.fillStyle='rgba(200,235,255,'+Math.min(1,slipT*2)+')';ctx.fillText('SLIPPING!',W/2,H*.3)}
  if(wxNewMsg>0){ctx.textAlign='center';ctx.font='bold '+(narHud?18:22)+'px Trebuchet MS, sans-serif';ctx.fillStyle='rgba(255,210,63,'+Math.min(1,wxNewMsg)+')';ctx.fillText('NEW WEATHER: '+wxNewName,W/2,Math.max(topY+44,H*.18))}
  if(ltnFlash>0){ctx.fillStyle='rgba(255,255,255,'+(ltnFlash*.55)+')';ctx.fillRect(0,0,W,H)}
  if(state==='play'&&Math.abs(bendT)>.3){ctx.fillStyle='rgba(255,244,224,.85)';ctx.font='bold '+(narHud?17:20)+'px Trebuchet MS, sans-serif';ctx.textAlign='center';ctx.fillText(bendT<0?'\u25c0 CURVE':'CURVE \u25b6',W/2,topY)}
  if(slow>0){ctx.fillStyle='rgba(76,201,240,.14)';ctx.fillRect(0,0,W,H)}
  if(boost>0){ctx.fillStyle='rgba(255,210,63,.5)';for(let i=0;i<6;i++)ctx.fillRect(((i*170-t*1500)%W+W)%W,60+i*45,80,2)}
  let by=narHud?118:80;
  [['SPEED BOOST',boost,5,'#ffd23f'],['SLOW TIME',slow,6,'#4cc9f0']].forEach(([l,v,d,c])=>{
    if(v>0){const bw=narHud?110:150,bx=W-bw-(narHud?14:20);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(bx,by,bw,10);ctx.fillStyle=c;ctx.fillRect(bx,by,bw*v/d,10);
      ctx.font='12px Trebuchet MS, sans-serif';ctx.textAlign='right';ctx.fillText(l,bx-6,by+9);by+=20}
  });
  // HUD
  const pad=narHud?14:20;
  ctx.fillStyle='#fff4e0';ctx.font='bold '+(narHud?19:22)+'px Trebuchet MS, sans-serif';ctx.textAlign='right';
  ctx.fillText(String(Math.floor(score)).padStart(5,'0'),W-pad,34);
  ctx.globalAlpha=.7;ctx.font=(narHud?14:16)+'px Trebuchet MS, sans-serif';ctx.fillText('Best '+best,W-pad,56);ctx.globalAlpha=1;
  ctx.font='bold '+(narHud?16:18)+'px Trebuchet MS, sans-serif';ctx.textAlign='left';ctx.fillText('LEVEL '+(1+Math.floor(score/300)),pad,34);
  ctx.fillStyle='#ffd23f';ctx.font='bold '+(narHud?14:16)+'px Trebuchet MS, sans-serif';ctx.fillText('● '+runCoins+'   (wallet '+(save.coins+(state==='play'||runId?runCoins:0))+')',pad,56);
  ctx.fillStyle='#ff4d6d';ctx.font=(narHud?18:20)+'px sans-serif';ctx.fillText('♥'.repeat(lives),pad,80);ctx.fillStyle='#fff4e0';
  ctx.restore();
}
// ---------- settings, display modes, start menu ----------
const detectMode=()=>{
  const mob=matchMedia('(pointer:coarse)').matches||Math.min(innerWidth,innerHeight)<768;
  return !mob?'win':innerHeight>innerWidth?'port':'land';
};
let cfg={music:true,mv:.5,sfx:true,mode:detectMode(),userMode:''};
try{Object.assign(cfg,JSON.parse(localStorage.getItem('dunedash-cfg')||'{}'))}catch(e){}
if(!cfg.userMode)cfg.mode=detectMode();
const saveCfg=()=>{try{localStorage.setItem('dunedash-cfg',JSON.stringify(cfg))}catch(e){}};
const wrapEl=document.getElementById('wrap'),setEl=document.getElementById('settings'),setBody=document.getElementById('setBody');
const playBtn=document.getElementById('playBtn');
const isRot=()=>wrapEl.classList.contains('m-land')&&innerHeight>innerWidth;
function applyMode(){wrapEl.classList.remove('m-win','m-port','m-land');wrapEl.classList.add('m-'+cfg.mode)}
function setMode(m){
  cfg.userMode=m;cfg.mode=m;applyMode();saveCfg();
  try{
    const de=document.documentElement,o=screen.orientation;
    if(m==='win'){
      if(o&&o.unlock)o.unlock();
      if(document.fullscreenElement)document.exitFullscreen();
    }else{
      const p=de.requestFullscreen&&!document.fullscreenElement?de.requestFullscreen():null;
      Promise.resolve(p).then(()=>o&&o.lock&&o.lock(m==='land'?'landscape':'portrait')).catch(()=>{});
    }
  }catch(e){}
  renderSettings();
}
function applyAudio(){
  if(musicGain)musicGain.gain.value=cfg.mv*.36;
  if(!cfg.music)musicOff();else if(state==='play')musicOn();
}
function renderSettings(){
  setBody.innerHTML='';
  const row=(label,...els)=>{const d=document.createElement('div'),l=document.createElement('span');d.className='srow';l.textContent=label;d.append(l,...els);setBody.appendChild(d)};
  const tb=(txt,on,fn)=>{const b=document.createElement('button');b.textContent=txt;if(on)b.className='on';b.onclick=()=>{fn();b.blur()};return b};
  const vol=document.createElement('input');vol.type='range';vol.min=0;vol.max=1;vol.step=.05;vol.value=cfg.mv;
  vol.oninput=()=>{cfg.mv=+vol.value;saveCfg();applyAudio()};vol.onchange=()=>vol.blur();
  row('Music',tb(cfg.music?'On':'Off',cfg.music,()=>{cfg.music=!cfg.music;saveCfg();applyAudio();renderSettings()}),vol);
  row('Sound effects',tb(cfg.sfx?'On':'Off',cfg.sfx,()=>{cfg.sfx=!cfg.sfx;saveCfg();renderSettings()}));
  row('Display',tb('Window',cfg.mode==='win',()=>setMode('win')),tb('Portrait fullscreen',cfg.mode==='port',()=>setMode('port')),tb('Landscape fullscreen',cfg.mode==='land',()=>setMode('land')));
}
function refreshMenu(){document.getElementById('wal').textContent=pname?'\u25cf '+save.coins+' coins  \u00b7  skin: '+SK().name+'  \u00b7  '+pname:offline?"Offline - progress won't be saved.":token?'':'Pick a name to save coins, skins and scores.'}
const nameRow=document.getElementById('nameRow'),nameIn=document.getElementById('nameIn'),nameBtn=document.getElementById('nameBtn'),nameErr=document.getElementById('nameErr');
function showName(on){nameRow.style.display=on?'':'none';if(!on)nameErr.textContent=''}
function saveName(){
  if(nameBtn.disabled)return; // one register request at a time (Enter can repeat)
  nameErr.textContent='';nameBtn.disabled=true;
  api('register',{name:nameIn.value}).then(r=>{token=r.token;try{localStorage.setItem('bloxrunner-token',token)}catch(e){}nameIn.blur();showName(false);applyPlayer(r.player)},
    e=>{nameErr.textContent={name_taken:'That name is taken.',invalid_name:'Use 3-16 letters, numbers or _.'}[e.message]||"Can't reach the server. Try again."}).finally(()=>{nameBtn.disabled=false});
}
['keydown','keyup'].forEach(k=>nameIn.addEventListener(k,e=>{e.stopPropagation();if(k==='keydown'&&e.key==='Enter')saveName()})); // typing a name must not jump, mute or fire powers
nameBtn.onclick=()=>{nameBtn.blur();saveName()};
showName(!token);
if(token)api('me').then(r=>applyPlayer(r.player),e=>{if(e.message==='unauthorized'){token='';try{localStorage.removeItem('bloxrunner-token')}catch(x){}showName(true)}else offline=true;refreshMenu()});
function fit(){
  if(!cfg.userMode){
    const dm=detectMode();
    if(cfg.mode!==dm){cfg.mode=dm;applyMode();if(setEl.classList.contains('open'))renderSettings()}
  }
  const h=wrapEl.clientHeight||innerHeight,w=wrapEl.clientWidth||innerWidth;
  wrapEl.classList.toggle('short',h<520);wrapEl.classList.toggle('mid',h>=520&&h<960);
  wrapEl.classList.toggle('narrow',w<480);
}
playBtn.onclick=()=>{audioInit();start()};
document.getElementById('ownedBtn').onclick=()=>{shopMode='owned';renderShop();shopEl.classList.add('open')};
document.getElementById('setBtn').onclick=()=>{renderSettings();setEl.classList.add('open')};
document.getElementById('setBack').onclick=e=>{e.currentTarget.blur();setEl.classList.remove('open')};
addEventListener('resize',fit);addEventListener('orientationchange',fit);
applyMode();refreshMenu();fit();setInterval(fit,300);
// ---------- skin power: the player activates it (button or E); recharges every 90 s ----------
let powerCd=0,pwKey='';
const POWER_CD=90,pwEl=document.getElementById('power');
function usePower(){
  const k=SK();
  if(state!=='play'||powerCd>0||!(k.boost||k.slow))return;
  if(k.boost)boost=k.boost;else slow=k.slow;
  powerCd=POWER_CD;sfx('power');
  const c=k.boost?'#ffd23f':'#4cc9f0';
  for(let i=0;i<16;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*500,vy:-Math.random()*400,l:.6,c});
}
pwEl.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();usePower()});
addEventListener('keydown',e=>{if(e.code==='KeyE'||e.code==='ShiftLeft'||e.code==='ShiftRight')usePower()});
function syncPower(){ // only touches the DOM when something visible changes
  const k=SK(),has=state==='play'&&!!(k.boost||k.slow);
  const key=has?(k.boost?'b':'s')+Math.ceil(Math.max(0,powerCd)):'';
  if(key===pwKey)return;pwKey=key;
  if(!has){pwEl.style.display='none';return}
  const rdy=powerCd<=0;
  pwEl.style.display='block';pwEl.className=rdy?'rdy':'';
  pwEl.style.setProperty('--p',rdy?1:1-powerCd/POWER_CD);
  pwEl.innerHTML='<span>'+(k.boost?'\u26a1':'\u23f3')+'<br><small>'+(rdy?'E':Math.ceil(powerCd))+'</small></span>';
}
// ---------- audio (all synthesized with WebAudio, no files) ----------
let AC=null,master=null,musicGain=null,muted=false,musicTimer=null,mStep=0,nextT=0;
try{muted=localStorage.getItem('dunedash-muted')==='1'}catch(e){}
function audioInit(){
  if(AC){if(AC.state==='suspended')AC.resume();return}
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    master=AC.createGain();master.gain.value=muted?0:.8;master.connect(AC.destination);
    musicGain=AC.createGain();musicGain.gain.value=cfg.mv*.36;musicGain.connect(master);
  }catch(e){AC=null}
}
function tone(f,d,type,vol,when,f2,dest){
  const t0=when||AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
  o.type=type||'square';o.frequency.setValueAtTime(f,t0);
  if(f2)o.frequency.exponentialRampToValueAtTime(f2,t0+d);
  g.gain.setValueAtTime(vol,t0);g.gain.exponentialRampToValueAtTime(.001,t0+d);
  o.connect(g);g.connect(dest||master);o.start(t0);o.stop(t0+d+.02);
}
function sfx(n){
  if(!AC||muted||!cfg.sfx)return;
  const c=AC.currentTime;
  if(n==='jump')tone(260,.16,'square',.12,c,620);
  else if(n==='jump2')tone(440,.14,'square',.12,c,1000);
  else if(n==='warn'){tone(880,.1,'square',.12,c);tone(880,.1,'square',.12,c+.22)}
  else if(n==='thunder'){tone(80,.9,'sawtooth',.35,c,26);tone(160,.4,'square',.12,c,40)}
  else if(n==='dodge'){tone(660,.1,'triangle',.18,c);tone(990,.2,'triangle',.18,c+.1)}
  else if(n==='slip')tone(520,.3,'sawtooth',.1,c,140);
  else if(n==='coin'){tone(988,.08,'square',.1,c);tone(1319,.18,'square',.1,c+.07)}
  else if(n==='power'){[523,659,784,1047].forEach((f,i)=>tone(f,.14,'triangle',.18,c+i*.07))}
  else if(n==='hit')tone(200,.25,'sawtooth',.2,c,60);
  else if(n==='die')[330,262,196].forEach((f,i)=>tone(f,.3,'sawtooth',.18,c+i*.15));
}
// background music: a looping Am - F - C - G groove
const CH=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
const mf=m=>440*Math.pow(2,(m-69)/12);
function sched(){
  if(!AC)return;
  while(nextT<AC.currentTime+.3){
    const ch=CH[Math.floor(mStep/8)%4],i=mStep%8;
    if([0,3,4,6].includes(i))tone(mf(ch[0]-24),.22,'triangle',.5,nextT,0,musicGain);
    tone(mf(ch[[0,1,2,1,2,1,2,1][i]]+12),.16,'square',.1,nextT,0,musicGain);
    if(i===0)tone(mf(ch[2]+24),.5,'sine',.08,nextT,0,musicGain);
    mStep++;nextT+=.27;
  }
}
function musicOn(){if(!AC||musicTimer||!cfg.music)return;nextT=AC.currentTime+.05;mStep=0;musicTimer=setInterval(sched,60)}
function musicOff(){if(musicTimer){clearInterval(musicTimer);musicTimer=null}}
const muteBtn=document.getElementById('mute');
function setMute(m){muted=m;muteBtn.textContent=m?'🔇':'🔊';if(master)master.gain.value=m?0:.8;try{localStorage.setItem('dunedash-muted',m?'1':'0')}catch(e){}}
muteBtn.onclick=()=>{audioInit();setMute(!muted);muteBtn.blur()};
setMute(muted);
addEventListener('keydown',e=>{if(e.code==='KeyM')setMute(!muted)});
document.addEventListener('visibilitychange',()=>{if(AC){document.hidden?AC.suspend():AC.resume()}});
const shopEl=document.getElementById('shop'),cardsEl=document.getElementById('cards'),shopMsg=document.getElementById('shopMsg');
let shopMode='shop';
function renderShop(){
  document.getElementById('shopTitle').textContent=shopMode==='shop'?'Skin shop':'My skins';
  document.getElementById('bal').textContent='● '+save.coins;
  cardsEl.innerHTML='';shopMsg.textContent='';refreshMenu();
  SKINS.filter(s=>shopMode==='shop'||save.owned.includes(s.id)).forEach(s=>{
    const own=save.owned.includes(s.id),on=save.skin===s.id;
    const d=document.createElement('div');d.className='card'+(on?' on':'');
    d.innerHTML='<div class="sw" style="background:'+s.body+'"><i style="background:'+s.scarf+'"></i></div><div class="t"><b>'+s.name+'</b><small>'+s.perk+'</small></div>';
    const b=document.createElement('button');
    if(on){b.textContent='Equipped';b.disabled=true}
    else if(own){b.textContent='Equip';b.disabled=!pname;b.onclick=()=>shopCall(b,'equip',s.id)}
    else{b.textContent='● '+s.cost;b.disabled=!pname||save.coins<s.cost;b.onclick=()=>shopCall(b,'buy',s.id)}
    d.appendChild(b);cardsEl.appendChild(d);
  });
}
function shopCall(b,action,skin){
  b.disabled=true;shopMsg.textContent='';
  api(action,{skin}).then(r=>{applyPlayer(r.player);renderShop()},e=>{b.disabled=false;shopMsg.textContent=e.message==='not_enough_coins'?'Not enough coins.':"Can't reach the server. Try again."});
}
const shopBtn=document.getElementById('shopBtn');
shopBtn.addEventListener('pointerdown',e=>e.stopPropagation());
shopBtn.onclick=()=>{shopBtn.blur();shopMode='shop';renderShop();shopEl.classList.add('open')};
const boardEl=document.getElementById('board'),rowsEl=document.getElementById('rows'),boardBtn=document.getElementById('boardBtn');
function boardRow(r,me){const d=document.createElement('div');d.className='card'+(me?' on':'');
  [['rk','#'+r.rank],['nm',r.name],['',r.best_score],['','L'+r.best_level]].forEach(([c,t],i)=>{const e=document.createElement(i==2?'b':i==3?'small':'span');e.className=c;e.textContent=t;d.appendChild(e)});rowsEl.appendChild(d)}
function renderBoard(){
  const note=t=>{rowsEl.innerHTML='';const p=document.createElement('p');p.textContent=t;rowsEl.appendChild(p)};
  note('Loading...');
  api('leaderboard').then(r=>{
    if(!boardEl.classList.contains('open'))return;
    if(!r.top.length)return note('No scores yet. Be the first!');
    rowsEl.innerHTML='';r.top.forEach(x=>boardRow(x,pname&&x.name.toLowerCase()===pname.toLowerCase()));
    if(r.me&&!r.top.some(x=>x.rank===r.me.rank)){const p=document.createElement('p');p.textContent='...';rowsEl.appendChild(p);boardRow(r.me,true)}
  },()=>boardEl.classList.contains('open')&&note("Can't load the leaderboard."));
}
boardBtn.addEventListener('pointerdown',e=>e.stopPropagation());
boardBtn.onclick=()=>{boardBtn.blur();boardEl.classList.add('open');renderBoard()};
document.getElementById('boardBack').onclick=e=>{e.currentTarget.blur();boardEl.classList.remove('open')};
document.getElementById('back').onclick=e=>{e.currentTarget.blur();shopEl.classList.remove('open')};
let last=performance.now();
function loop(now){
  const dt=Math.min((now-last)/1000,0.033);last=now;
  update(dt);draw();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
