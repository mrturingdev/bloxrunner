const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=900,H=450,GY=370;
const ui=document.getElementById('ui'),title=document.getElementById('title'),msg=document.getElementById('msg');
let state='ready',score=0,best=0,speed=0,obs=[],t=0,nextSpawn=0,shake=0,parts=[];
let pups=[],boost=0,slow=0,nextPup=6;
let coinsList=[],runCoins=0,lives=0,inv=0,nextCoin=2;
const SKINS=[
 {id:'dune',name:'Desert Runner',cost:0,body:'#fff4e0',scarf:'#e0566b',perk:'No perks. The classic.',lives:0,boost:0,slow:0},
 {id:'ember',name:'Ember',cost:100,body:'#ff8a4c',scarf:'#ffd23f',perk:'+1 life',lives:1,boost:0,slow:0},
 {id:'comet',name:'Comet',cost:250,body:'#9ad7ff',scarf:'#4cc9f0',perk:'Starts with a 5s speed boost',lives:0,boost:5,slow:0},
 {id:'frost',name:'Frost',cost:400,body:'#d6f3ff',scarf:'#5aa9ff',perk:'+1 life and 6s of slow time',lives:1,boost:0,slow:6},
 {id:'aurora',name:'Aurora',cost:700,body:'#b69cff',scarf:'#7cf0c3',perk:'+2 lives and a 5s speed boost',lives:2,boost:5,slow:0}
];
let save={coins:0,owned:['dune'],skin:'dune'};
try{const s=JSON.parse(localStorage.getItem('dunedash-save'));if(s&&s.owned)save=s}catch(e){}
function persist(){try{localStorage.setItem('dunedash-save',JSON.stringify(save))}catch(e){}}
const SK=()=>SKINS.find(s=>s.id===save.skin)||SKINS[0];
try{best=+localStorage.getItem('dunedash-best')||0}catch(e){}
const P={x:120,y:GY,vy:0,w:34,h:54,ducking:false,onGround:true,holdJump:false};
const G=2600,JUMP=-900;
const stars=Array.from({length:40},()=>({x:Math.random()*W,y:Math.random()*200,s:Math.random()*2+1}));

function reset(){
  score=0;speed=380;obs=[];nextSpawn=1;parts=[];t=0;pups=[];boost=0;slow=0;nextPup=6;
  coinsList=[];runCoins=0;nextCoin=2;inv=0;
  {const k=SK();lives=k.lives;boost=k.boost;slow=k.slow}
  Object.assign(P,{y:GY,vy:0,ducking:false,onGround:true,holdJump:false});
  const br=document.getElementById('brand')||document.getElementById('logo');if(br&&state==='ready'){br.style.display='flex';title.style.display='none'}
}
function start(){reset();state='play';ui.classList.add('hide')}
function die(){
  state='over';shake=0.3;
  const s=Math.floor(score);
  if(s>best){best=s;try{localStorage.setItem('dunedash-best',best)}catch(e){}}
  const br=document.getElementById('brand')||document.getElementById('logo');if(br)br.style.display='none';title.style.display='block';
  title.textContent='Game over';
  persist();msg.textContent='Coins +'+runCoins+'  ·  Score '+s+'  ·  Best '+best+'. Tap to run again.';
  ui.classList.remove('hide');
  for(let i=0;i<20;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*500,vy:-Math.random()*500,l:1});
}
function jump(){
  if(shopEl.classList.contains('open'))return;
  if(state!=='play'){ if(state==='ready'||state==='over'){ if(state==='over'&&t<0)return; start(); } return;}
  if(P.onGround){P.vy=JUMP;P.onGround=false;P.holdJump=true}
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
let ty=0;
cv.addEventListener('pointerdown',e=>{e.preventDefault();ty=e.clientY;jump()});
addEventListener('pointerup',()=>{release();P.ducking=false});
cv.addEventListener('pointermove',e=>{if(e.buttons&&e.clientY-ty>40&&state==='play'){P.ducking=true}});
ui.style.pointerEvents='auto';
ui.addEventListener('pointerdown',e=>{e.preventDefault();jump()});

function spawn(){
  const r=Math.random(),s=score;
  const add=(o,dx=0)=>{o.x=W+40+dx;obs.push(o)};
  if(s>300&&r<0.25){
    // level 2+: birds. Low ones force a duck or jump; level 4+ adds high ones that catch mid-jumps
    if(s>900&&Math.random()<0.4)add({type:'bird',y:GY-95,w:44,h:24});
    else add({type:'bird',y:GY-34,w:44,h:24});
  }else if(r<0.6){
    // level 3+: triple cactus clusters
    const n=s>600&&Math.random()<0.4?3:1+(Math.random()<0.3?1:0);
    add({type:'cactus',w:24*n+8,h:44+Math.random()*30,n});
  }else if(r<0.85){
    add({type:'rock',w:50,h:30});
  }else{
    add({type:'cactus',w:56,h:84,n:2,tall:true});
  }
  // level 5+: combos, a second obstacle right behind the first
  if(s>1200&&Math.random()<Math.min(0.15+(s-1200)/6000,0.5)){
    const dx=230+Math.random()*80;
    if(Math.random()<0.5)add({type:'bird',y:GY-34,w:44,h:24},dx);
    else add({type:'rock',w:50,h:30},dx);
  }
  // gaps shrink as difficulty rises, but never below what a jump needs
  const d=Math.min(s/1500,1);
  nextSpawn=(0.7+speed/1400)*(1-0.25*d)+Math.random()*(0.9-0.5*d);
}
function hitbox(o){
  if(o.type==='bird')return{x:o.x,y:o.y-o.h,w:o.w,h:o.h};
  return{x:o.x,y:GY-o.h,w:o.w,h:o.h};
}
function playerBox(){
  const h=P.ducking&&P.onGround?30:P.h;
  return{x:P.x-P.w/2+5,y:P.y-h+4,w:P.w-10,h:h-8};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

function update(dt){
  t+=dt;
  if(state==='play'){
    if(boost>0)boost-=dt;if(inv>0)inv-=dt;
    if(slow>0)slow-=dt;
    const base=Math.min(380+score*0.9,1200);
    speed=base*(boost>0?1.6:1)*(slow>0?0.55:1);
    score+=dt*speed/30*(boost>0?2:1);
    const pdt=slow>0?dt*0.6:dt;
    // physics (variable jump height)
    const g=(P.vy<0&&!P.holdJump)?G*2.2:G;
    P.vy+=g*pdt;P.y+=P.vy*pdt;
    if(P.y>=GY){P.y=GY;P.vy=0;P.onGround=true}
    if(P.ducking&&!P.onGround)P.vy+=G*dt; // fast-fall
    nextSpawn-=dt;
    if(nextSpawn<=0)spawn();
    nextPup-=dt;
    if(nextPup<=0){pups.push({k:Math.random()<.5?'boost':'slow',x:W+40,y:GY-70-Math.random()*60,r:16});nextPup=8+Math.random()*6}
    pups.forEach(p=>p.x-=speed*dt);
    nextCoin-=dt;
    if(nextCoin<=0){
      const cy=GY-40-Math.random()*90,n=3+Math.floor(Math.random()*3);
      for(let i=0;i<n;i++)coinsList.push({x:W+40+i*38,y:cy-Math.sin(i/(n-1)*Math.PI)*30});
      nextCoin=2.5+Math.random()*2.5;
    }
    coinsList.forEach(c=>c.x-=speed*dt);
    obs.forEach(o=>o.x-=speed*dt);
    obs=obs.filter(o=>o.x>-100);
    const pb=playerBox();
    coinsList=coinsList.filter(c=>{
      if(c.x<-30)return false;
      if(overlap(pb,{x:c.x-10,y:c.y-10,w:20,h:20})){runCoins++;save.coins++;return false}
      return true;
    });
    pups=pups.filter(p=>{
      if(p.x<-50)return false;
      if(overlap(pb,{x:p.x-p.r,y:p.y-p.r,w:p.r*2,h:p.r*2})){
        const c=p.k==='boost'?'#ffd23f':'#4cc9f0';
        if(p.k==='boost')boost=5;else slow=6;
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
        lives--;inv=1.5;shake=.25;obs=obs.filter(o=>o!==hit);
        for(let i=0;i<12;i++)parts.push({x:P.x,y:P.y-27,vx:(Math.random()-.5)*400,vy:-Math.random()*400,l:.6,c:'#ff4d6d'});
      }else die();
    }
  }
  parts.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=1500*dt;p.l-=dt});
  parts=parts.filter(p=>p.l>0);
  if(shake>0)shake-=dt;
}

let bgX=0;
function draw(){
  ctx.save();
  if(shake>0)ctx.translate((Math.random()-.5)*10,(Math.random()-.5)*10);
  // sky
  const g=ctx.createLinearGradient(0,0,0,GY);g.addColorStop(0,'#2b1b4d');g.addColorStop(1,'#e0566b');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#fff';stars.forEach(s=>{ctx.globalAlpha=.4+.3*Math.sin(t*2+s.x);ctx.fillRect(s.x,s.y,s.s,s.s)});ctx.globalAlpha=1;
  // sun
  ctx.fillStyle='#ffb347';ctx.beginPath();ctx.arc(680,GY-40,70,0,7);ctx.fill();
  // dunes (parallax)
  const off=state==='play'?speed:60;
  bgX+=off*0.016*0.12;
  ctx.fillStyle='#8a2f5c';dunes(0.25,GY-10,70,0.006);
  ctx.fillStyle='#4a1d54';dunes(0.5,GY,45,0.01);
  // ground
  ctx.fillStyle='#1c1233';ctx.fillRect(0,GY,W,H-GY);
  ctx.fillStyle='#ffb347';
  const gx=(state==='play'?t*speed:t*60);
  for(let x=-(gx%60);x<W;x+=60)ctx.fillRect(x,GY+14,24,3);
  ctx.fillRect(0,GY,W,3);
  // obstacles
  obs.forEach(o=>{
    ctx.fillStyle='#ffd1a0';
    if(o.type==='cactus'){
      const cw=o.w/o.n;
      for(let i=0;i<o.n;i++){
        const x=o.x+i*cw,h=o.h-(i%2)*10;
        ctx.fillRect(x+cw*.3,GY-h,cw*.4,h);
        ctx.fillRect(x,GY-h*.6,cw*.3,8);ctx.fillRect(x,GY-h*.6-14,8,22);
      }
    }else if(o.type==='rock'){
      ctx.beginPath();ctx.moveTo(o.x,GY);ctx.lineTo(o.x+12,GY-o.h);ctx.lineTo(o.x+34,GY-o.h+6);ctx.lineTo(o.x+o.w,GY);ctx.fill();
    }else{
      const f=Math.sin(t*20)>0?-10:8;
      ctx.beginPath();ctx.moveTo(o.x,o.y-12);ctx.lineTo(o.x+o.w,o.y-12);ctx.lineTo(o.x+o.w/2,o.y+f-12);ctx.closePath();ctx.fill();
      ctx.fillRect(o.x+10,o.y-18,26,12);
    }
  });
  ctx.fillStyle='#ffd23f';
  coinsList.forEach(c=>{const w=Math.abs(Math.cos(t*6+c.x*.02))*9+2;ctx.beginPath();ctx.ellipse(c.x,c.y,w,10,0,0,7);ctx.fill()});
  pups.forEach(p=>{
    const c=p.k==='boost'?'#ffd23f':'#4cc9f0';
    ctx.fillStyle=c;ctx.globalAlpha=.3;ctx.beginPath();ctx.arc(p.x,p.y,p.r+6+Math.sin(t*6)*3,0,7);ctx.fill();
    ctx.globalAlpha=1;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();
    ctx.fillStyle='#1c1233';ctx.font='bold 18px Trebuchet MS, sans-serif';ctx.textAlign='center';
    ctx.fillText(p.k==='boost'?'⚡':'⏳',p.x,p.y+6);
  });
  // player
  const duck=P.ducking&&P.onGround,ph=duck?30:P.h;
  if(boost>0){ctx.fillStyle='rgba(255,210,63,.35)';ctx.beginPath();ctx.arc(P.x,P.y-ph/2,44,0,7);ctx.fill()}
  if(inv>0&&Math.floor(t*20)%2)ctx.globalAlpha=.35;
  ctx.fillStyle=SK().body;
  ctx.fillRect(P.x-P.w/2,P.y-ph,P.w,ph-14);
  ctx.fillStyle=SK().scarf;ctx.fillRect(P.x-P.w/2-10,P.y-ph+8,12,6); // scarf
  ctx.fillStyle='#1c1233';ctx.fillRect(P.x+4,P.y-ph+8,6,6); // eye
  ctx.fillStyle='#fff4e0';
  ctx.fillStyle=SK().body;const step=P.onGround&&state==='play'?Math.sin(t*22)*8:0;
  ctx.fillRect(P.x-10+step,P.y-14,8,14);ctx.fillRect(P.x+4-step,P.y-14,8,14);
  ctx.globalAlpha=1;
  // particles
  parts.forEach(p=>{ctx.fillStyle=p.c||'#ff4d6d';ctx.fillRect(p.x,p.y,5,5)});
  if(slow>0){ctx.fillStyle='rgba(76,201,240,.14)';ctx.fillRect(0,0,W,H)}
  if(boost>0){ctx.fillStyle='rgba(255,210,63,.5)';for(let i=0;i<6;i++)ctx.fillRect(((i*170-t*1500)%W+W)%W,60+i*45,80,2)}
  let by=80;
  [['SPEED BOOST',boost,5,'#ffd23f'],['SLOW TIME',slow,6,'#4cc9f0']].forEach(([l,v,d,c])=>{
    if(v>0){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(W-170,by,150,10);ctx.fillStyle=c;ctx.fillRect(W-170,by,150*v/d,10);
      ctx.font='12px Trebuchet MS, sans-serif';ctx.textAlign='right';ctx.fillText(l,W-176,by+9);by+=20}
  });
  // HUD
  ctx.fillStyle='#fff4e0';ctx.font='bold 22px Trebuchet MS, sans-serif';ctx.textAlign='right';
  ctx.fillText(String(Math.floor(score)).padStart(5,'0'),W-20,36);
  ctx.globalAlpha=.7;ctx.font='16px Trebuchet MS, sans-serif';ctx.fillText('Best '+best,W-20,60);ctx.globalAlpha=1;
  ctx.font='bold 18px Trebuchet MS, sans-serif';ctx.textAlign='left';ctx.fillText('LEVEL '+(1+Math.floor(score/300)),20,34);
  ctx.fillStyle='#ffd23f';ctx.font='bold 16px Trebuchet MS, sans-serif';ctx.fillText('● '+runCoins+'   (wallet '+save.coins+')',20,58);
  ctx.fillStyle='#ff4d6d';ctx.font='20px sans-serif';ctx.fillText('♥'.repeat(lives),20,84);ctx.fillStyle='#fff4e0';
  ctx.restore();
}
function dunes(par,base,amp,freq){
  ctx.beginPath();ctx.moveTo(0,H);
  for(let x=0;x<=W;x+=10)ctx.lineTo(x,base-amp-Math.sin((x+bgX*par*60)*freq*3)*amp*.5-Math.sin((x+bgX*par*60)*freq)*amp*.5);
  ctx.lineTo(W,H);ctx.fill();
}
const shopEl=document.getElementById('shop'),cardsEl=document.getElementById('cards');
function renderShop(){
  document.getElementById('bal').textContent='● '+save.coins;
  cardsEl.innerHTML='';
  SKINS.forEach(s=>{
    const own=save.owned.includes(s.id),on=save.skin===s.id;
    const d=document.createElement('div');d.className='card'+(on?' on':'');
    d.innerHTML='<div class="sw" style="background:'+s.body+'"><i style="background:'+s.scarf+'"></i></div><div class="t"><b>'+s.name+'</b><small>'+s.perk+'</small></div>';
    const b=document.createElement('button');
    if(on){b.textContent='Equipped';b.disabled=true}
    else if(own){b.textContent='Equip';b.onclick=()=>{save.skin=s.id;persist();renderShop()}}
    else{b.textContent='● '+s.cost;b.disabled=save.coins<s.cost;b.onclick=()=>{if(save.coins>=s.cost){save.coins-=s.cost;save.owned.push(s.id);save.skin=s.id;persist();renderShop()}}}
    d.appendChild(b);cardsEl.appendChild(d);
  });
}
const shopBtn=document.getElementById('shopBtn');
shopBtn.addEventListener('pointerdown',e=>e.stopPropagation());
shopBtn.onclick=()=>{shopBtn.blur();renderShop();shopEl.classList.add('open')};
document.getElementById('back').onclick=e=>{e.currentTarget.blur();shopEl.classList.remove('open')};
let last=performance.now();
function loop(now){
  const dt=Math.min((now-last)/1000,0.033);last=now;
  update(dt);draw();requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
