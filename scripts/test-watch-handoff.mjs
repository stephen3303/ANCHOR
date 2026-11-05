// Isolated API/browser integration: creates and drops only its own test database.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const root=fileURLToPath(new URL('../',import.meta.url));
if(existsSync(`${root}.env`))process.loadEnvFile(`${root}.env`);
const testDb=`anchor_handoff_test_${Date.now()}`;
function adminURL(){
  if(process.env.TEST_DATABASE_URL)return new URL(process.env.TEST_DATABASE_URL);
  if(process.env.DATABASE_URL)return new URL(process.env.DATABASE_URL);
  const port=spawnSync('docker',['compose','port','postgres','5432'],{cwd:root,encoding:'utf8'});
  if(port.status!==0)throw Error('Start local PostgreSQL or set TEST_DATABASE_URL.');
  const url=new URL(`postgresql://127.0.0.1:${port.stdout.trim().split(':').at(-1)}/${process.env.POSTGRES_DB||'anchor'}`);url.username=process.env.POSTGRES_USER||'anchor';url.password=process.env.POSTGRES_PASSWORD||'anchor-local-dev';return url;
}
const admin=new pg.Client({connectionString:adminURL().toString()});const testURL=adminURL();testURL.pathname=`/${testDb}`;
const db=new pg.Client({connectionString:testURL.toString()});let created=false,app,browser;let logs='';
const seed=(script)=>{const r=spawnSync(process.execPath,['--import','tsx',script,'--sql'],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
let base='';
async function session(id){
  const response=await fetch(`${base}/api/session`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({userId:id})});assert.equal(response.status,200,await response.clone().text());const cookie=response.headers.get('set-cookie').split(';')[0];
  return async(path,method='GET',body,expected=200,origin=base)=>{
    const r=await fetch(`${base}${path}`,{method,headers:{Cookie:cookie,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();assert.equal(r.status,expected,`${method} ${path}: ${text}`);return JSON.parse(text);
  };
}
try{
  assert(existsSync(`${root}.next/BUILD_ID`),'Run npm run build first.');await admin.connect();await admin.query(`CREATE DATABASE ${testDb}`);created=true;await db.connect();
  const migrations=['database/init','database/migrations'].flatMap(dir=>readdirSync(`${root}${dir}`).filter(n=>n.endsWith('.sql')).map(n=>({name:n,path:`${root}${dir}/${n}`}))).sort((a,b)=>a.name.localeCompare(b.name));
  for(const m of migrations)await db.query(readFileSync(m.path,'utf8'));
  await db.query(seed('scripts/seed-users.ts'));await db.query(seed('scripts/seed-messages.ts'));
  const adminUser=(await db.query("SELECT id,name,command_id FROM users WHERE login='LTaylor'")).rows[0];assert(adminUser);
  const user=async(login,name,command=adminUser.command_id,roles=[])=> (await db.query("INSERT INTO users(login,name,command_id,profile) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,name",[login,name,command,JSON.stringify({roles:[{name:'Message Viewer',granted:true},...roles.map(name=>({name,granted:true}))]})])).rows[0];
  const outgoing=await user('WatchOut','Watch Outgoing');const incoming=await user('WatchIn','Watch Incoming');const reader=await user('WatchReader','Command Reader',adminUser.command_id,['Report Viewer']);const unassigned=await user('WatchNone','Unassigned Viewer');
  const otherCommand=(await db.query("INSERT INTO commands(name) VALUES ('HANDOFF TEST OTHER COMMAND') RETURNING id")).rows[0].id;
  const outsider=await user('WatchOther','Other Command Admin',otherCommand,['System Admin']);
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));base=`http://127.0.0.1:${port}`;
  app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:{...process.env,DATABASE_URL:testURL.toString(),ENABLE_DEMO_LOGIN:'true',SESSION_COOKIE_SECURE:'false',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});app.stdout.on('data',c=>logs=(logs+c).slice(-8000));app.stderr.on('data',c=>logs=(logs+c).slice(-8000));
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(`${base}/login`)).ok;}catch{}if(ready)break;if(app.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,150));}assert(ready,'Test app did not start.');
  assert.equal((await fetch(`${base}/api/watch-handoffs`)).status,401);
  const a=await session(adminUser.id),o=await session(outgoing.id),inc=await session(incoming.id),r=await session(reader.id),n=await session(unassigned.id),other=await session(outsider.id);
  const config={name:'Bridge',team:'Alpha',active:true,commandVisible:true,officerIds:[outgoing.id,incoming.id]};
  await o('/api/watch-stations','POST',config,403);
  await a('/api/watch-stations','POST',config,403,'https://different.example');
  await a('/api/watch-stations','POST',{...config,officerIds:[outgoing.id,outsider.id]},400);
  const {stationId}=await a('/api/watch-stations','POST',config,201);
  assert.equal((await n('/api/watch-handoffs')).stations.length,0);
  assert.equal((await r('/api/watch-handoffs')).stations[0].assigned,false);
  await other(`/api/watch-handoffs?stationId=${stationId}`,'GET',undefined,404);
  const create={stationId,incomingId:incoming.id,watchStart:'05 NOV 2026 1900Z',watchEnd:'06 NOV 2026 0300Z'};
  await a('/api/watch-handoffs','POST',create,403); // Admin is not automatically a watch officer.
  await r('/api/watch-handoffs','POST',create,403);
  await o('/api/watch-handoffs','POST',{...create,outgoingId:adminUser.id},400);
  await o('/api/watch-handoffs','POST',{...create,incomingId:outgoing.id},400);
  let handoff=await o('/api/watch-handoffs','POST',create,201);assert.equal(handoff.outgoingId,outgoing.id);assert.equal(handoff.status,'Draft');
  await o('/api/watch-handoffs','POST',create,409);
  await other(`/api/watch-handoffs/${handoff.id}`,'GET',undefined,404);
  await n(`/api/watch-handoffs/${handoff.id}`,'GET',undefined,404);
  const counts=async()=>(await db.query("SELECT (SELECT count(*) FROM message_acknowledgements)::int AS a,(SELECT count(*) FROM message_user_state)::int AS r,(SELECT count(*) FROM messages)::int AS m")).rows[0];const before=await counts();
  const issue=(title,status='Open',source=null)=>({id:null,title,status,owner:'Watch Incoming',actionsTaken:'Initial checks complete',awaiting:'Confirmation',nextStep:'Contact duty officer',upcoming:'Status report',escalation:'Follow standing orders',contacts:'Duty office',sourceMessageId:source});
  const body={action:'save',expectedRevision:handoff.revision,incomingId:incoming.id,watchStart:create.watchStart,watchEnd:create.watchEnd,content:{narrative:'Outgoing narrative',checklist:handoff.content.checklist,issues:[issue('Unresolved circuit','Monitoring','comsublant-078-26'),issue('Closed issue','Resolved')]}};
  await o(`/api/watch-handoffs/${handoff.id}`,'PATCH',{...body,content:{...body.content,issues:[issue('Invalid source','Open','not-a-published-message')]}},400);
  await a(`/api/watch-handoffs/${handoff.id}`,'PATCH',body,403);
  handoff=await o(`/api/watch-handoffs/${handoff.id}`,'PATCH',body);assert(handoff.content.issues[0].source.sha256);
  await o(`/api/watch-handoffs/${handoff.id}`,'PATCH',body,409);
  const path=`/api/watch-handoffs/${handoff.id}`;
  handoff=await o(path,'PATCH',{action:'ready',expectedRevision:handoff.revision});assert.equal(handoff.status,'Ready for review');
  const stale=handoff.revision;
  await inc(path,'PATCH',{action:'save',expectedRevision:handoff.revision},403);
  await o(path,'PATCH',{action:'accept',expectedRevision:handoff.revision,exceptions:'Wrong participant'},403);
  await inc(path,'PATCH',{action:'accept',expectedRevision:handoff.revision,exceptions:''},400);
  handoff=await o(path,'PATCH',{action:'return',expectedRevision:handoff.revision});
  await inc(path,'PATCH',{action:'accept',expectedRevision:stale,exceptions:'Stale acceptance'},409);
  handoff=await o(path,'PATCH',{action:'ready',expectedRevision:handoff.revision});
  await assert.rejects(db.query("UPDATE watch_handoffs SET status='Accepted',revision=revision+1,accepted_at=now(),accepted_by=incoming_id WHERE id=$1",[handoff.id]),/exceptions required/);
  handoff=await inc(path,'PATCH',{action:'accept',expectedRevision:handoff.revision,exceptions:'Communications verification and remaining checks will be completed by incoming watch.'});
  assert.equal(handoff.status,'Accepted');assert(handoff.acceptedAt);assert.equal(handoff.incomingId,incoming.id);
  const acceptedContent=JSON.stringify(handoff.content);
  await o(path,'PATCH',{action:'save',expectedRevision:handoff.revision},400);
  await assert.rejects(db.query("UPDATE watch_handoffs SET revision=revision+1 WHERE id=$1",[handoff.id]),/immutable/);
  await assert.rejects(db.query("DELETE FROM watch_handoffs WHERE id=$1",[handoff.id]),/cannot be deleted/);
  await r(`${path}/corrections`,'POST',{reason:'Viewer',text:'Not permitted'},403);
  const correction=await o(`${path}/corrections`,'POST',{reason:'Clarify contact',text:'Use the watch desk contact in the standing orders.'},201);
  await assert.rejects(db.query("UPDATE watch_handoff_corrections SET text='changed' WHERE id=$1",[correction.id]),/append-only/);
  const detail=await inc(path);assert.equal(JSON.stringify(detail.record.content),acceptedContent);assert.equal(detail.corrections.length,1);assert(detail.events.some(e=>e.kind==='Accepted'&&e.actorId===incoming.id));
  await assert.rejects(db.query("DELETE FROM watch_handoff_events WHERE handoff_id=$1",[handoff.id]),/append-only/);
  const next=await inc('/api/watch-handoffs','POST',{...create,incomingId:outgoing.id,watchStart:'06 NOV 2026 0300Z',watchEnd:'06 NOV 2026 1100Z'},201);
  assert.equal(next.previousId,handoff.id);assert.equal(next.content.issues.length,1);assert.equal(next.content.issues[0].lineageId,handoff.content.issues[0].lineageId);assert.notEqual(next.content.issues[0].id,handoff.content.issues[0].id);assert.equal(next.content.issues[0].owner,'Watch Incoming');assert.equal(next.content.issues[0].source.sha256,handoff.content.issues[0].source.sha256);assert.equal(next.content.issues[0].carriedFrom.handoffId,handoff.id);assert(Object.values(next.content.checklist).every(v=>v===false));
  await a(`/api/watch-stations/${stationId}`,'PATCH',{...config,expectedRevision:1,commandVisible:false});
  await r(path,'GET',undefined,404);await a(`/api/watch-stations/${stationId}`,'PATCH',{...config,expectedRevision:1},409);
  assert.deepEqual(await counts(),before,'Handoff acceptance must not read/acknowledge/close canonical message data.');
  console.log('API PASS: station duty/command isolation; participant transitions; exceptions; stale revisions; carryover lineage/source/history; immutable acceptance/corrections; no message side effects.');
  if(process.argv.includes('--browser')){
    const {chromium,expect}=await import('@playwright/test');browser=await chromium.launch({executablePath:process.env.E2E_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
    const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:1100}});
    assert.equal((await context.request.post('/api/session',{headers:{Origin:base},data:{userId:adminUser.id}})).status(),200);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/?view=watch&handoff=open#watch-handoff');const panel=page.getByRole('region',{name:'Watch Handoff',exact:true});await expect(panel.getByRole('button',{name:'Station setup',exact:true})).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Main',exact:true}).getByRole('link',{name:'Watch Turnover',exact:true})).toHaveCount(0);
    await panel.getByRole('button',{name:'Station setup',exact:true}).click();await panel.getByLabel('Station name',{exact:true}).fill('Browser station');await panel.getByLabel('Watch team',{exact:true}).fill('Bravo');await panel.getByRole('checkbox',{name:adminUser.name,exact:true}).check();await panel.getByRole('checkbox',{name:outgoing.name,exact:true}).check();
    const stationEvent=page.waitForResponse(r=>r.url().endsWith('/api/watch-stations')&&r.request().method()==='POST');await panel.getByRole('button',{name:'Save station assignments',exact:true}).click();const browserStation=(await(await stationEvent).json()).stationId;
    await panel.getByText('Start next handoff',{exact:true}).click();await panel.getByRole('combobox',{name:'Incoming officer',exact:true}).selectOption(outgoing.id);await panel.getByLabel('Incoming watch starts (UTC)',{exact:true}).fill('06 NOV 2026 1900Z');await panel.getByLabel('Incoming watch ends (UTC)',{exact:true}).fill('07 NOV 2026 0300Z');await panel.getByRole('button',{name:'Create handoff draft',exact:true}).click();
    await expect(panel.getByLabel('Outgoing-watch narrative',{exact:true})).toBeVisible();await panel.getByLabel('Outgoing-watch narrative',{exact:true}).fill('Persisted browser handoff');await panel.getByRole('button',{name:'Add handoff issue',exact:true}).click();await panel.getByLabel('Issue title',{exact:true}).fill('Confirm communications');await panel.getByLabel('Responsible owner',{exact:true}).fill('Watch Outgoing');await panel.getByLabel('Next required step',{exact:true}).fill('Call the watch desk');await panel.getByRole('combobox',{name:'Source message',exact:true}).selectOption('comsublant-078-26');await panel.getByRole('button',{name:'Save handoff',exact:true}).click();await expect(panel.getByRole('button',{name:'Mark ready for review',exact:true})).toBeEnabled();
    await page.reload();await expect(panel.getByRole('combobox',{name:'Watch station / team',exact:true})).toHaveValue(browserStation);await expect(panel.getByLabel('Outgoing-watch narrative',{exact:true})).toHaveValue('Persisted browser handoff');
    await panel.getByLabel('Outgoing-watch narrative',{exact:true}).fill('Unsaved local follow-up');await page.getByRole('combobox',{name:'Viewing as',exact:true}).selectOption('training');await expect(panel).toBeHidden();await page.getByRole('combobox',{name:'Viewing as',exact:true}).selectOption('watch');await expect(panel.getByLabel('Outgoing-watch narrative',{exact:true})).toHaveValue('Unsaved local follow-up');
    page.once('dialog',d=>d.dismiss());await panel.getByRole('button',{name:'Refresh handoff',exact:true}).click();await expect(panel.getByLabel('Outgoing-watch narrative',{exact:true})).toHaveValue('Unsaved local follow-up');await panel.getByText('Issue context & source',{exact:true}).click();await panel.getByRole('button',{name:'Open source · COMSUBLANT 078/26',exact:true}).click();await expect(page.getByRole('dialog',{name:'Personalized message reader',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close message',exact:true}).click();await expect(panel.getByLabel('Outgoing-watch narrative',{exact:true})).toHaveValue('Unsaved local follow-up');await panel.getByRole('button',{name:'Save handoff',exact:true}).click();await expect(panel.getByRole('button',{name:'Mark ready for review',exact:true})).toBeEnabled();await panel.getByRole('button',{name:'Mark ready for review',exact:true}).click();
    const incomingContext=await browser.newContext({baseURL:base,viewport:{width:1440,height:1100}});assert.equal((await incomingContext.request.post('/api/session',{headers:{Origin:base},data:{userId:outgoing.id}})).status(),200);const incomingPage=await incomingContext.newPage();await incomingPage.goto('/?view=watch&handoff=open');const incomingPanel=incomingPage.getByRole('region',{name:'Watch Handoff',exact:true});await incomingPanel.getByRole('combobox',{name:'Watch station / team',exact:true}).selectOption(browserStation);await incomingPanel.getByLabel('Acceptance exceptions',{exact:true}).fill('Remaining checks accepted for completion by this watch.');await incomingPanel.getByRole('button',{name:'Accept watch with exceptions',exact:true}).click();await expect(incomingPanel).toContainText(`Accepted by ${outgoing.name}`);await expect(incomingPanel.getByRole('checkbox',{name:'Review new and changed traffic',exact:true})).toBeDisabled();
    await incomingPanel.getByText('Append a correction',{exact:true}).click();await incomingPanel.getByLabel('Correction reason',{exact:true}).fill('Update contact guidance');await incomingPanel.getByLabel('Correction text',{exact:true}).fill('Confirm the station contact before calling.');await incomingPanel.getByRole('button',{name:'Save correction',exact:true}).click();await incomingPanel.getByText('Saved history & corrections',{exact:true}).click();await expect(incomingPanel).toContainText('Confirm the station contact before calling.');
    await incomingPage.screenshot({path:'/tmp/anchor-home-watch-handoff-desktop.png',animations:'disabled',caret:'initial'});await incomingPage.setViewportSize({width:390,height:844});assert(await incomingPage.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth),'Handoff must fit mobile width');await incomingPage.screenshot({path:'/tmp/anchor-home-watch-handoff-mobile.png',animations:'disabled',caret:'initial'});
    await page.getByRole('combobox',{name:'Viewing as',exact:true}).selectOption('safety');await page.getByRole('button',{name:'Set as default',exact:true}).click();await page.goto('/watch-turnover');await expect(page).toHaveURL(/\/\?view=watch&handoff=open#watch-handoff$/);await expect(page.getByRole('combobox',{name:'Viewing as',exact:true})).toHaveValue('watch');await expect(page.getByRole('region',{name:'View controls',exact:true})).toContainText('Default: Safety Officer');assert.deepEqual(errors,[]);
    await context.request.delete('/api/session',{headers:{Origin:base}});await incomingContext.request.delete('/api/session',{headers:{Origin:base}});await context.close();await incomingContext.close();
    console.log('BROWSER PASS: station setup, server persistence, Watch Officer-only visibility, unsaved edits, two-user acceptance/corrections, legacy redirect, and mobile width.');
  }
} catch(error){if(browser){for(const context of browser.contexts()){for(const page of context.pages()){await page.screenshot({path:'/tmp/anchor-handoff-failure.png',animations:'disabled',caret:'initial'}).catch(()=>{});}}}console.error(error);if(logs)console.error(logs);process.exitCode=1;}
finally{await browser?.close();if(app){app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);}await db.end().catch(()=>{});if(created)await admin.query(`DROP DATABASE ${testDb} WITH (FORCE)`).catch(e=>{console.error('Test database cleanup failed',e.message);process.exitCode=1;});await admin.end().catch(()=>{});}
