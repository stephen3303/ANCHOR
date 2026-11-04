const { chromium } = require('playwright');
const { anchor } = require('./anchor.js');
const W=1600,H=400;
const font=`font-family:'Inter Display','Inter',sans-serif`;

const grid = `<defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#5fd4ff" stroke-opacity=".07" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`;

// sonar rings centred on a point
const rings=(cx,cy,n,step,op)=>Array.from({length:n},(_,i)=>`<circle cx="${cx}" cy="${cy}" r="${(i+1)*step}" fill="none" stroke="#5fd4ff" stroke-opacity="${op*(1-i/n)}" stroke-width="1.5"/>`).join('');

// message "packets" flowing on horizontal lanes
const lanes=(x0,x1,ys)=>ys.map((y,i)=>{
  const dots=Array.from({length:6},(_,k)=>{const x=x0+((k*137+i*61)%(x1-x0));return `<rect x="${x}" y="${y-3}" width="${18+(k%3)*10}" height="6" rx="3" fill="#5fd4ff" fill-opacity="${.25+(k%3)*.15}"/>`}).join('');
  return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#5fd4ff" stroke-opacity=".12" stroke-width="1.5"/>${dots}`}).join('');

const tag=(x,y,t,c)=>`<g transform="translate(${x},${y})"><rect width="${t.length*13+28}" height="32" rx="6" fill="${c}" fill-opacity=".12" stroke="${c}" stroke-opacity=".7" stroke-width="1.5"/><text x="14" y="21.5" fill="${c}" style="${font};font-size:15px;font-weight:700;letter-spacing:2px">${t}</text></g>`;

const bg = (a,b)=>`<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#3fb8ff" stop-opacity=".35"/><stop offset="1" stop-color="#3fb8ff" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>`;

const V = {
// A: centred wordmark, sonar rings behind, message lanes on both sides
centered: `${bg('#071428','#0d2a4f')}<rect width="${W}" height="${H}" fill="url(#glow)"/>${grid}
${rings(800,170,7,62,.35)}
${lanes(40,340,[90,150,210,270])}${lanes(1260,1560,[90,150,210,270])}
`,

// B: left-aligned brand block, right side message status tags + lanes
split: `${bg('#06101f','#0b2a52')}${grid}
${rings(1330,175,6,55,.28)}
${lanes(860,1560,[300,340])}
<g transform="translate(120,62) scale(1.15)">${anchor('#5fd4ff',7)}</g>
<text x="270" y="158" fill="#ffffff" style="${font};font-size:96px;font-weight:800;letter-spacing:10px">ANCHOR</text>
<rect x="274" y="180" width="120" height="4" rx="2" fill="#c9a26b"/>
<text x="274" y="228" fill="#9fdcff" style="${font};font-size:25px;font-weight:700;letter-spacing:3.5px">MODERNIZING NAVY OFFICIAL MESSAGES</text>
<text x="274" y="268" fill="#8fb0d4" style="${font};font-size:21px;font-weight:500;letter-spacing:1.5px">Search · Subscriptions · Tailored Briefings · Offline-ready</text>
${tag(1130,92,'AMENDED','#5fd4ff')}${tag(1290,140,'SUPERSEDED','#c9a26b')}${tag(1150,188,'CANCELLED','#ff8a8a')}${tag(1330,236,'VALIDATED','#6ee7b7')}`,

// C: bright cyan gradient matching the platform's default block, navy type
bright: `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ed3ff"/><stop offset="1" stop-color="#3b8ef5"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<defs><pattern id="g2" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#06223f" stroke-opacity=".08"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g2)"/>
${Array.from({length:7},(_,i)=>`<circle cx="800" cy="170" r="${(i+1)*62}" fill="none" stroke="#ffffff" stroke-opacity="${.35*(1-i/7)}" stroke-width="1.5"/>`).join('')}
`,
};

const overlay=(ink,accent,sub,rule)=>`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:48px;font-family:'Inter Display',Inter,sans-serif">
 <div style="display:flex;align-items:center;gap:26px">
  <svg width="92" height="110" viewBox="-4 0 108 120">${anchor(ink==='#ffffff'?'#5fd4ff':ink,8)}</svg>
  <div style="font-size:108px;font-weight:800;letter-spacing:14px;color:${ink};line-height:1;margin-right:-14px">ANCHOR</div></div>
 <div style="width:420px;height:3px;border-radius:2px;background:${rule};margin:20px 0 22px"></div>
 <div style="font-size:25px;font-weight:700;letter-spacing:5px;color:${accent}">AUTHORITATIVE NAVAL COMMUNICATIONS HUB</div>
 <div style="font-size:22px;font-weight:500;letter-spacing:2px;color:${sub};margin-top:12px">Search · Subscriptions · Tailored Briefings</div></div>`;
const OV={centered:overlay('#ffffff','#9fdcff','#8fb0d4','#c9a26b'),bright:overlay('#0a1f3d','#0a1f3d','#0d3263','rgba(10,31,61,.6)')};

const S=1024,C=512;
const ringText=(t,r,size,color)=>`<defs><path id="rp${r}" d="M ${C-r} ${C} A ${r} ${r} 0 1 1 ${C+r} ${C} A ${r} ${r} 0 1 1 ${C-r} ${C}"/></defs>
<text fill="${color}" style="${font};font-size:${size}px;font-weight:800;letter-spacing:10px"><textPath href="#rp${r}" startOffset="25%" text-anchor="middle">${t}</textPath></text>`;
const badgeBase=`<defs><radialGradient id="bb" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="#14396b"/><stop offset="1" stop-color="#06122a"/></radialGradient>
<pattern id="bg3" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#5fd4ff" stroke-opacity=".06" stroke-width="2"/></pattern>
<clipPath id="cc"><circle cx="${C}" cy="${C}" r="${C}"/></clipPath></defs>
<g clip-path="url(#cc)"><rect width="${S}" height="${S}" fill="url(#bb)"/><rect width="${S}" height="${S}" fill="url(#bg3)"/>
${[1,2,3].map(i=>`<circle cx="${C}" cy="${C}" r="${i*150}" fill="none" stroke="#5fd4ff" stroke-opacity="${.16-i*.04}" stroke-width="3"/>`).join('')}</g>
<circle cx="${C}" cy="${C}" r="${C-14}" fill="none" stroke="#5fd4ff" stroke-width="20"/>`;
const BADGES={
 // simple: big anchor only, survives at 32-40px
 simple:`${badgeBase}<circle cx="${C}" cy="${C}" r="${C-44}" fill="none" stroke="#c9a26b" stroke-width="6"/>
 <g transform="translate(${C-250},${C-292}) scale(5)">${anchor('#ffffff',7.5)}</g>`,
 // seal: name on the ring + tagline, anchor in the middle; for larger displays
 seal:`${badgeBase}<circle cx="${C}" cy="${C}" r="${C-175}" fill="none" stroke="#c9a26b" stroke-width="6"/>
 ${ringText('ANCHOR',C-128,72,'#ffffff')}
 <text x="${C}" y="${C+412}" text-anchor="middle" fill="#9fdcff" style="${font};font-size:38px;font-weight:700;letter-spacing:8px">★ NAVY ★</text>
 <g transform="translate(${C-160},${C-196}) scale(3.2)">${anchor('#5fd4ff',8)}</g>`,
};
(async()=>{
  const b=await chromium.launch(); const p=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  for(const [k,svg] of Object.entries(V)){
    await p.setContent(`<html><body style="margin:0"><div style="position:relative;width:${W}px;height:${H}px"><svg style="display:block" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>${OV[k]||''}</div></body></html>`);
    await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:`anchor-banner-${k}.png`});
  }
  await p.setViewportSize({width:S,height:S});
  for(const [k,svg] of Object.entries(BADGES)){
    await p.setContent(`<html><body style="margin:0;background:transparent"><svg style="display:block" xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${svg}</svg></body></html>`);
    await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:`anchor-badge-${k}.png`,omitBackground:true});
  }
  // preview: mimic the card (590 wide, 145 tall banner, avatar overlapping bottom centre) at 2x
  const card=k=>`<div style="width:590px;background:#0b1a33;border:1px solid #1d3a63;border-radius:10px;overflow:hidden;margin:24px;display:inline-block;vertical-align:top;font-family:Inter">
   <div style="position:relative;height:145px;background:url(anchor-banner-${k}.png) center/cover">
    <div style="position:absolute;right:9px;top:9px;background:#071224;color:#fff;font-size:13px;padding:5px 9px;border-radius:5px">Add Banner</div></div>
   <div style="position:relative;height:150px;text-align:center">
    <div style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);width:84px;height:84px;border-radius:50%;border:3px solid #fff;background:url(anchor-badge-${k==='split'?'seal':'simple'}.png) center/cover"></div>
    <div style="padding-top:78px;color:#fff;font:700 22px Inter">ANCHOR</div>
    <div style="color:#8aa;font-size:13px;margin-top:6px">banner: ${k} · badge: ${k==='split'?'seal':'simple'}</div></div></div>`;
  await p.setViewportSize({width:1920,height:400});
  await p.goto('file://'+process.cwd()+'/x.html').catch(()=>{});
  require('fs').writeFileSync('preview.html',`<html><body style="margin:0;background:#050d1c">${Object.keys(V).map(card).join('')}<div style="margin:0 24px 24px;display:flex;gap:28px;align-items:center;color:#8aa;font:13px Inter">Small sizes:${['simple','seal'].map(b=>[128,64,40,24].map(z=>`<img src="anchor-badge-${b}.png" width="${z}" height="${z}">`).join('')).join('<span style="width:30px"></span>')}</div></body></html>`);
  const q=await b.newPage({viewport:{width:1920,height:300},deviceScaleFactor:2});
  await q.goto('file://'+process.cwd()+'/preview.html'); await q.evaluate(()=>document.fonts.ready);
  await q.screenshot({path:'anchor-banner-preview.png',fullPage:true});
  await b.close();
})();
