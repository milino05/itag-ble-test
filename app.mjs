import { MODES, MODE_NAMES, ScoreEngine, ClickDetector, DOUBLE_WINDOW_MS, REPEAT_FILTER_MS } from './core.mjs';
import { PulseEdgeTracker } from './pulse.mjs';

const FFE0 = 0xffe0;
const FFE1 = 0xffe1;
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'padel-ble-bluefy-v01';
let initial = {};
try { initial = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { /* private browsing */ }
let score;
try {
  score = new ScoreEngine(MODES[initial.mode] ? initial.mode : MODES.ADVANTAGE,
    Array.isArray(initial.history) && initial.history.length < 20000 ? initial.history : []);
} catch { score = new ScoreEngine(); }

const connections = [0,1].map(() => ({ device:null, characteristic:null, onValue:null,
  onDisconnect:null, connected:false, subscribed:false, received:0, generation:0,
  phase:'Non connesso', polling:false, pollTimer:null, pollReads:0, pollPresses:0, pollFailures:0,
  lastReport:0, pollInFlight:false, pulse:new PulseEdgeTracker() }));
const clicks = [new ClickDetector(),new ClickDetector()];
const timers = [null,null];
// Diagnostics do not change the production point detector except during explicit read tests.
const readInProgress = [false,false];
const sampling = [false,false];
const observation = [null,null];
const debugEvents = [[],[]];
const debugSession = new Date().toISOString();
// 45 ms is the pause BETWEEN BLE reads (each actual GATT read also takes time).
// The measured iPhone sample took ~190 ms/read; a short pause maximises the chance of catching a ~200 ms pulse.
const POLL_PAUSE_MS = 45;
function debugSummary(s) { $('debug-summary').textContent = s; }
function diagnosticMark(t, message) {
  log(`${teamName(t)} · DEBUG ${message}`);
  debugSummary(`Ultima diagnostica ${teamName(t)}: ${message}`);
}

const logs = [];
let overlayOpen = false;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const teamName = t => t === 0 ? 'A' : 'B';

function log(message) {
  const stamp = new Date().toLocaleTimeString('it-IT',{hour12:false}) + '.' + String(new Date().getMilliseconds()).padStart(3, '0');
  logs.push(`${stamp} ${message}`);
  if (logs.length > 240) logs.splice(0, logs.length - 240);
  if (overlayOpen) renderLog();
}
function renderLog() { $('log').textContent = logs.length ? logs.join('\n') : 'Nessun evento.'; }
function saveScore() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({mode:score.mode,history:score.history})); }
  catch(e) { log(`Salvataggio locale non disponibile: ${e.message}`); }
}
function notice(message) { $('notices').textContent = message; }
function status(t,message,level='default') {
  const c = connections[t];
  c.phase = message;
  const root = $('connection-'+t);
  root.classList.toggle('connected',level === 'good');
  root.classList.toggle('bad',level === 'bad');
  $('connection-label-'+t).textContent = level==='good' ? (c.polling ? 'BLE · lettura attiva' : 'BLE · in ascolto') : (level==='bad' ? 'BLE · errore' : 'BLE · scollegato');
  $('detail-'+t).textContent = `${message}${c.device ? ' · '+ (c.device.name||'iTAG') : ''}${c.received ? ' · notifiche: '+c.received : ''}`;
  log(`${teamName(t)} · ${message}`);
}
function fitScore(t) {
  const elem = $('score-'+t);
  const panel = $('team-panel-'+t);
  if (!elem || !panel || !ctx) return;
  const word = elem.textContent || '0';
  const w = panel.clientWidth, h = panel.clientHeight;
  if (!w || !h) return;
  const fontFamily = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const probe = 100;
  ctx.font = `900 ${probe}px ${fontFamily}`;
  const measure = ctx.measureText(word);
  const height = (measure.actualBoundingBoxAscent||75) + (measure.actualBoundingBoxDescent||5);
  const candidate = Math.min(w * 0.90 / Math.max(1,measure.width) * probe, h * 0.85 / Math.max(1,height) * probe);
  elem.style.fontSize = `${Math.max(30,Math.floor(candidate))}px`;
}
function redraw() {
  const s=score.snapshot();
  [0,1].forEach(t=> { $('score-'+t).textContent=s.showGames ? String(s.games[t]) : s.displayedPoints[t]; });
  const text=s.showGames?'GAME VINTI':s.starPoint?'STAR POINT':s.goldenPoint?'PUNTO DE ORO':s.advantageTeam!==-1?'VANTAGGIO':'';
  $('center-rule').textContent=text;
  requestAnimationFrame(()=>{ fitScore(0);fitScore(1); });
}
function addPoint(t,origin='iTAG') {
  const before=score.snapshot();
  score.addPoint(t); saveScore(); redraw();
  const after=score.snapshot();
  if (after.showGames && !before.showGames) log(`${teamName(t)} · GAME vinto (${after.games[0]}–${after.games[1]})`);
  else log(`${teamName(t)} · Punto (${origin}) → ${after.displayedPoints.join('–')}`);
}
function undoPoint(t,origin='iTAG') {
  if(score.undoLastPointBy(t)){
    saveScore();redraw();log(`${teamName(t)} · Ultimo punto annullato (${origin})`);
  } else log(`${teamName(t)} · Non ci sono punti da annullare`);
}
function cancelTimer(t){ if(timers[t]){clearTimeout(timers[t]);timers[t]=null;} }
function resetClicks(){ for(let t=0;t<2;t++){cancelTimer(t);clicks[t].reset();} }
function commitClicks(){ for(let t=0;t<2;t++) if(clicks[t].isPending) {cancelTimer(t);clicks[t].reset();addPoint(t,'pressione in sospeso');} }
function press(t,kind='BLE') {
  const time=now();
  const decision=clicks[t].notifyAt(time);
  if(decision==='REPEAT'){log(`${teamName(t)} · Ripetizione ignorata (<${REPEAT_FILTER_MS} ms)`);return;}
  if(decision==='DOUBLE') {cancelTimer(t);undoPoint(t,`doppio clic ${kind}`);return;}
  if(decision==='NEXT_FIRST') {cancelTimer(t);addPoint(t,'punto precedente');}
  cancelTimer(t);
  timers[t]=setTimeout(()=>{
    timers[t]=null;
    if(clicks[t].expireAt(now())) addPoint(t,kind);
  },DOUBLE_WINDOW_MS+35);
  log(`${teamName(t)} · ${decision==='FIRST'?'Prima pressione':'Nuova pressione'}: attesa ${DOUBLE_WINDOW_MS} ms`);
}
function hexOf(value) {
  if(!value) return '';
  const bytes = value instanceof DataView ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength)
    : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer || value);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
}
function errorText(e) { return `${e?.name||'Errore'}: ${e?.message || String(e)}`; }
function detach(t,disconnect=true) {
  const c=connections[t];
  stopPolling(t, false);
  c.generation++;
  if(c.characteristic && c.onValue){try{c.characteristic.removeEventListener('characteristicvaluechanged',c.onValue);}catch{}}
  if(c.device && c.onDisconnect){try{c.device.removeEventListener('gattserverdisconnected',c.onDisconnect);}catch{}}
  if(disconnect && c.device?.gatt?.connected){try{c.device.gatt.disconnect();}catch{}}
  c.characteristic=null;c.onValue=null;c.onDisconnect=null;c.connected=false;c.subscribed=false;
  observation[t]=null;sampling[t]=false;readInProgress[t]=false;
  c.pulse.reset(); c.pollReads=0;c.pollPresses=0;c.pollFailures=0;
  resetClick(t);
}
function resetClick(t){cancelTimer(t);clicks[t].reset();}
async function connectTag(t) {
  if(!navigator.bluetooth?.requestDevice) {
    notice('Web Bluetooth non disponibile. Apri la pagina HTTPS direttamente in Bluefy su iPhone.');
    status(t,'navigator.bluetooth.requestDevice non disponibile','bad');return;
  }
  // Important: requestDevice is invoked immediately from the user's click.
  let selection;
  try {selection=navigator.bluetooth.requestDevice({filters:[{services:[FFE0]}]});}
  catch(e){status(t,`Scansione: ${errorText(e)}`,'bad');return;}
  status(t,'Seleziona un iTAG dalla lista');
  let device;
  try {device=await selection;}
  catch(e){status(t,`Selezione: ${errorText(e)}`,'bad');return;}
  if(connections[1-t].device?.id===device.id){
    notice('Hai già assegnato questo iTAG all’altra squadra. Scegli l’altro dispositivo.');
    log(`${teamName(t)} · iTAG già assegnato all'altra squadra`);return;
  }
  detach(t);
  const c=connections[t],generation=c.generation;
  c.device=device;c.received=0;
  debugEvents[t]=[];
  c.onDisconnect=()=>{
    if(c.generation!==generation)return;
    c.connected=false;c.subscribed=false;
    stopPolling(t,false);
    resetClick(t);
    status(t,'iTAG disconnesso: ricollega dal menu','bad');
    notice('Un iTAG si è disconnesso. Torna nel menu e selezionalo nuovamente.');
  };
  device.addEventListener('gattserverdisconnected',c.onDisconnect);
  log(`${teamName(t)} · Selezionato ${device.name||'iTAG'} (${device.id||'ID non disponibile'})`);
  try {
    status(t,'Connessione GATT...');
    const server=await device.gatt.connect();
    if(c.generation!==generation)return;
    c.connected=true;log(`${teamName(t)} · GATT OK`);
    const service=await server.getPrimaryService(FFE0);
    if(c.generation!==generation)return;
    log(`${teamName(t)} · Servizio FFE0 OK`);
    const characteristic=await service.getCharacteristic(FFE1);
    if(c.generation!==generation)return;
    c.characteristic=characteristic;
    const p=characteristic.properties||{};
    log(`${teamName(t)} · FFE1 OK: notify=${!!p.notify}, read=${!!p.read}, indicate=${!!p.indicate}`);
    c.onValue=(event)=>{
      if(c.generation!==generation)return;
      const value=event?.target?.value || characteristic.value;
      const bytes=hexOf(value);
      const time=now();
      const duringRead=readInProgress[t] || sampling[t] || c.pollInFlight;
      const prev=debugEvents[t].at(-1);
      debugEvents[t].push({time, bytes, duringRead});
      if(debugEvents[t].length>150)debugEvents[t].shift();
      const diff=prev ? ` Δ${Math.round(time-prev.time)}ms` : '';
      if(duringRead){
        log(`${teamName(t)} · EVENTO FFE1 DURANTE READ [${bytes||'vuoto'}]${diff} (possibile eco lettura; NON conteggiato)`);
      } else {
        c.received++;
        log(`${teamName(t)} · NOTIFY FFE1 [${bytes||'vuoto'}] #${c.received}${diff}`);
        handlePulse(t,bytes,'NOTIFY');
      }
    };
    characteristic.addEventListener('characteristicvaluechanged',c.onValue);
    log(`${teamName(t)} · Listener 'characteristicvaluechanged' registrato`);
    status(t,'Avvio notifiche FFE1...');
    try {
      await characteristic.startNotifications();
      if(c.generation!==generation)return;
      c.subscribed=true;
      log(`${teamName(t)} · startNotifications OK; eventi realmente ricevuti=${c.received}.`);
    } catch(notifyErr) {
      log(`${teamName(t)} · startNotifications FAIL (${errorText(notifyErr)}). Provo comunque lettura continua.`);
      c.subscribed=false;
    }
    if(c.generation!==generation)return;
    if(p.read) {
      startPolling(t);
      notice('Connessione riuscita: lettura continua FFE1 attiva. Premi lentamente l’iTAG e controlla se i punti aumentano.');
    } else {
      status(t,'FFE1 non supporta READ; sole notifiche','bad');
      notice('FFE1 non supporta la lettura periodica: impossibile attivare il metodo alternativo.');
    }
  } catch(e) {
    if(c.generation!==generation)return;
    status(t,`Errore BLE: ${errorText(e)}`,'bad');
    notice('Bluefy non ha completato la sottoscrizione BLE. Copia il registro: non possiamo forzare le notifiche locali come nell’app Android.');
  }
}
function bytesFirstByte(bytes) {
  const token=(bytes||'').trim().split(/\s+/)[0];
  return /^[0-9A-F]{2}$/i.test(token||'') ? parseInt(token,16) : null;
}
function handlePulse(t,bytes,source) {
  const c=connections[t];
  const raw=bytesFirstByte(bytes);
  const edge=c.pulse.accept(raw);
  if(edge.kind==='invalid'){
    log(`${teamName(t)} · ${source} valore inatteso [${bytes}], ignorato`);
    return;
  }
  if(edge.kind==='baseline'){
    log(`${teamName(t)} · ${source} livello iniziale FFE1=[${bytes}]; in attesa di 00→01`);
  } else if(edge.kind==='press'){
    if(source==='POLL')c.pollPresses++;
    log(`${teamName(t)} · ${source} TRANSIZIONE 00→01, pressione #${c.pulse.edges} riconosciuta`);
    press(t,`iTAG ${source}`);
  } else if(edge.kind==='release'){
    log(`${teamName(t)} · ${source} TRANSIZIONE 01→00, pronto per nuova pressione`);
  }
  if(c.polling)updatePollingUi(t);
}
function updatePollingUi(t) {
  const c=connections[t];
  const label=$('poll-status-'+t);
  if(label)label.textContent=c.polling ? `ATTIVA · letture ${c.pollReads} · pressioni ${c.pollPresses} · errori ${c.pollFailures}`
    : 'FERMA · usa Avvia lettura';
  const button=$('toggle-poll-'+t);
  if(button)button.textContent=c.polling ? `Ferma lettura ${teamName(t)}` : `Avvia lettura ${teamName(t)}`;
  if(c.polling && c.device?.gatt?.connected)
    $('connection-label-'+t).textContent='BLE · lettura attiva';
}
function stopPolling(t,announce=true) {
  const c=connections[t];
  c.polling=false;
  if(c.pollTimer!==null)clearTimeout(c.pollTimer);
  c.pollTimer=null;
  updatePollingUi(t);
  if(announce)log(`${teamName(t)} · Lettura continua FERMA (letture=${c.pollReads}, pressioni=${c.pollPresses}, errori=${c.pollFailures})`);
}
function startPolling(t) {
  const c=connections[t];
  if(!c.characteristic || !c.device?.gatt?.connected){log(`${teamName(t)} · Collega prima l'iTAG`);return;}
  if(c.polling) return;
  if(sampling[t] || readInProgress[t]){log(`${teamName(t)} · Completa prima la lettura diagnostica`);return;}
  c.polling=true;
  c.pollReads=0;c.pollPresses=0;c.pollFailures=0;
  c.lastReport=now();
  c.pulse.reset();
  const generation=c.generation;
  updatePollingUi(t);
  status(t,'Lettura continua FFE1 attiva (fallback Bluefy)','good');
  log(`${teamName(t)} · POLLING FFE1 START (pausa ${POLL_PAUSE_MS}ms fra letture; niente GATT sovrapposte per squadra)`);
  const tick=async()=>{
    if(!c.polling || c.generation!==generation || !c.device?.gatt?.connected)return;
    c.pollInFlight=true;
    const started=now();
    try {
      // One read at a time per device. Never launch a second request while a previous one is pending.
      const v=await c.characteristic.readValue();
      if(!c.polling || c.generation!==generation)return;
      c.pollReads++;
      const bytes=hexOf(v);
      handlePulse(t,bytes,'POLL');
      const elapsed=now()-started;
      if(now()-c.lastReport>12000){
        log(`${teamName(t)} · POLLING stato: letture=${c.pollReads}, impulsi=${c.pollPresses}, errori=${c.pollFailures}, ultima lettura=${Math.round(elapsed)}ms, valore=[${bytes}]`);
        c.lastReport=now();
      }
    } catch(e){
      if(!c.polling || c.generation!==generation)return;
      c.pollFailures++;
      log(`${teamName(t)} · POLLING READ errore #${c.pollFailures}: ${errorText(e)}`);
      if(c.pollFailures>=4){
        stopPolling(t);
        status(t,'POLLING sospeso dopo 4 errori: riprova dal menu','bad');
        return;
      }
    } finally {
      if(c.generation===generation){
        c.pollInFlight=false;
        updatePollingUi(t);
        if(c.polling)c.pollTimer=setTimeout(tick,POLL_PAUSE_MS);
      }
    }
  };
  tick();
}
async function readValue(t) {
  const c=connections[t];
  if(!c.characteristic){log(`${teamName(t)} · Prima collega iTAG`);return;}
  if(sampling[t] || c.polling || c.pollInFlight){log(`${teamName(t)} · Per la lettura manuale ferma prima il polling (per evitare operazioni GATT simultanee)`);return;}
  readInProgress[t]=true;
  const start=now();
  log(`${teamName(t)} · READ FFE1 inizio, valore cache=[${hexOf(c.characteristic.value)}]`);
  try {
    const v=await c.characteristic.readValue();
    log(`${teamName(t)} · READ FFE1 OK [${hexOf(v)}] (${Math.round(now()-start)}ms). La lettura NON prova una pressione.`);
  } catch(e){log(`${teamName(t)} · READ FFE1 errore dopo ${Math.round(now()-start)}ms: ${errorText(e)}`);}
  finally {setTimeout(()=>{readInProgress[t]=false;},250);}
}

// The following tests are intentionally read-only (except the start/stop notification toggle).
function fmtProperties(props) {
  if(!props)return 'proprieta non disponibili';
  return ['broadcast','read','write','writeWithoutResponse','notify','indicate',
    'authenticatedSignedWrites','reliableWrite','writableAuxiliaries']
    .map(k=>`${k}=${!!props[k]}`).join(', ');
}
async function inspectBle(t) {
  const c=connections[t];
  if(!c.device || !c.characteristic) {diagnosticMark(t,'collega prima il dispositivo');return;}
  diagnosticMark(t,'ispezione BLE iniziata');
  log(`${teamName(t)} · Browser: ${navigator.userAgent}`);
  log(`${teamName(t)} · GATT connected=${!!c.device.gatt?.connected}; notifiche richieste=${c.subscribed}; eventi ricevuti=${c.received}`);
  log(`${teamName(t)} · FFE1 UUID=${c.characteristic.uuid}, props: ${fmtProperties(c.characteristic.properties)}`);
  log(`${teamName(t)} · FFE1 cache=[${hexOf(c.characteristic.value)||'vuoto'}]`);
  if(typeof c.characteristic.getDescriptors==='function') {
    try {
      const descriptors=await c.characteristic.getDescriptors();
      log(`${teamName(t)} · DESCRITTORI: ${descriptors.length} -> ${descriptors.map(d=>d.uuid).join(', ')||'nessuno'}`);
      for(const d of descriptors) {
        if(typeof d.readValue==='function') {
          try {const val=await d.readValue();log(`${teamName(t)} · DESCRIPTOR ${d.uuid} READ=[${hexOf(val)}]`);}
          catch(e){log(`${teamName(t)} · DESCRIPTOR ${d.uuid} read FAIL ${errorText(e)}`);}
        }
      }
    } catch(e){log(`${teamName(t)} · getDescriptors() FAIL: ${errorText(e)}`);}
  } else log(`${teamName(t)} · API getDescriptors() non disponibile in Bluefy`);
  // Test availability, not write: CCCD is a restricted descriptor in some Web Bluetooth implementations.
  if(typeof c.characteristic.getDescriptor==='function') {
    for(const uuid of [0x2902,0x0229]){
      try {const d=await c.characteristic.getDescriptor(uuid);log(`${teamName(t)} · getDescriptor(0x${uuid.toString(16)}) OK UUID=${d.uuid}`);}
      catch(e){log(`${teamName(t)} · getDescriptor(0x${uuid.toString(16)}) FAIL ${errorText(e)}`);}
    }
  }
  diagnosticMark(t,'ispezione terminata; controlla DESCRITTORI / 2902 / 0229 nel registro');
}
function observeBle(t) {
  const c=connections[t];
  if(!c.device || !c.characteristic || !c.device.gatt?.connected) {diagnosticMark(t,'collega prima il dispositivo');return;}
  const start=now(), startAll=debugEvents[t].length, startNormal=c.received;
  observation[t]={start, startAll, startNormal};
  diagnosticMark(t,'ASCOLTO 15s iniziato: premi il pulsante 5 volte, ogni 1-2 secondi. Non usare i test READ nel frattempo.');
  setTimeout(()=>{
    if(!observation[t] || observation[t].start!==start)return;
    const total=debugEvents[t].filter(e=>e.time>=start).length;
    const readEvents=debugEvents[t].filter(e=>e.time>=start && e.duringRead).length;
    diagnosticMark(t,`ASCOLTO 15s finito. Eventi totali=${total}, eventi durante letture=${readEvents}, eventi validi=${c.received-startNormal}.`);
    observation[t]=null;
  },15000);
}
async function sampleValue(t) {
  const c=connections[t];
  if(!c.characteristic || !c.device?.gatt?.connected) {diagnosticMark(t,'collega prima il dispositivo');return;}
  if(sampling[t]){diagnosticMark(t,'campionamento gia attivo');return;}
  const resumePolling=!!c.polling;
  if(resumePolling)stopPolling(t);
  // Wait for an in-flight request to finish before initiating diagnostic sampling.
  while(c.pollInFlight)await new Promise(resolve=>setTimeout(resolve,30));
  sampling[t]=true;
  diagnosticMark(t,'campionamento FFE1 per 8s: premi il pulsante varie volte; le letture NON assegneranno punti');
  const started=now();let readCount=0,failures=0,changes=0,last=null;
  try {
    while(now()-started<8000 && sampling[t] && c.device?.gatt?.connected){
      try{
        const v=await Promise.race([c.characteristic.readValue(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout read (1200ms)')),1200))]);
        const current=hexOf(v);
        readCount++;
        if(last===null)log(`${teamName(t)} · CAMPIONE iniziale FFE1=[${current}]`);
        else if(last!==current){changes++;log(`${teamName(t)} · CAMPIONE CAMBIATO #${readCount} [${last}] → [${current}]`);}
        last=current;
      }catch(e){failures++;log(`${teamName(t)} · CAMPIONAMENTO errore: ${errorText(e)}. Interrompo per evitare operazioni GATT sovrapposte.`);break;}
      await new Promise(res=>setTimeout(res,190));
    }
  }finally{
    sampling[t]=false;
    setTimeout(()=>{readInProgress[t]=false;},300);
    diagnosticMark(t,`CAMPIONAMENTO concluso: letture=${readCount}, variazioni=${changes}, errori=${failures}, ultimo=[${last??'nessuno'}].`);
    if(resumePolling && c.device?.gatt?.connected)startPolling(t);
  }
}
async function restartNotifications(t) {
  const c=connections[t];
  if(!c.characteristic){diagnosticMark(t,'collega prima il dispositivo');return;}
  if(sampling[t] || c.polling){diagnosticMark(t,'ferma prima la lettura continua o aspetta fine campionamento');return;}
  diagnosticMark(t,'STOP notifiche → START notifiche');
  try {
    if(typeof c.characteristic.stopNotifications==='function'){
      await c.characteristic.stopNotifications();
      log(`${teamName(t)} · stopNotifications OK`);
    } else log(`${teamName(t)} · stopNotifications non disponibile`);
  }catch(e){log(`${teamName(t)} · stopNotifications ERROR ${errorText(e)}`);}
  try{
    await c.characteristic.startNotifications();
    c.subscribed=true;
    diagnosticMark(t,'startNotifications ripetuto OK (ora verifica se arriva NOTIFY alla pressione)');
  }catch(e){c.subscribed=false;diagnosticMark(t,`startNotifications ripetuto FALLITO: ${errorText(e)}`);}
}

function disconnectTag(t) {
  detach(t);connections[t].device=null;
  status(t,'Disconnesso manualmente');
}
function showSettings() {
  overlayOpen=true;
  $('overlay').classList.remove('hidden');
  $('overlay').setAttribute('aria-hidden','false');
  $('mode').value=score.mode;
  renderLog();
}
function hideSettings() {
  overlayOpen=false;
  $('overlay').classList.add('hidden');
  $('overlay').setAttribute('aria-hidden','true');
}
function changeMode(newMode){
  if(newMode===score.mode)return;
  if(score.history.length && !confirm('Cambiare regola azzera tutti i punti e i game. Continuare?')){
    $('mode').value=score.mode;return;
  }
  resetClicks();score.clear();score.setMode(newMode);saveScore();redraw();log(`Nuova partita · ${MODE_NAMES[newMode]}`);
}
function resetMatch(){
  if(!confirm('Azzerare punti, game e cronologia di questa partita?'))return;
  resetClicks();score.clear();saveScore();redraw();log('Nuova partita: punti e game azzerati');
}
async function copyLog(){
  const txt=logs.join('\n')||'Nessun evento';
  try {
    if(!navigator.clipboard?.writeText) throw Error('Clipboard API assente');
    await navigator.clipboard.writeText(txt);
    notice('Registro copiato.');
  } catch {
    const el=document.createElement('textarea');el.value=txt;document.body.appendChild(el);el.select();
    try{if(document.execCommand('copy'))notice('Registro copiato.');else notice('Copia non disponibile: seleziona il registro manualmente.');}
    catch{notice('Copia non disponibile: seleziona il registro manualmente.');}
    el.remove();
  }
}
async function fullscreen(){
  try {
    if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else throw new Error('Fullscreen API non disponibile nel browser');
    try {if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(e){log(`Blocco orientamento non disponibile: ${errorText(e)}`);}
    notice('Schermo intero richiesto. Mantieni comunque Bluefy aperto e lo schermo attivo.');
  } catch(e){notice('Il browser non consente lo schermo intero: usa il telefono in orizzontale.');log(errorText(e));}
}
for(let t=0;t<2;t++){
  $('connect-'+t).addEventListener('click',()=>connectTag(t));
  $('disconnect-'+t).addEventListener('click',()=>disconnectTag(t));
  $('plus-'+t).addEventListener('click',()=>{commitClicks();addPoint(t,'test manuale');});
  $('undo-'+t).addEventListener('click',()=>{resetClicks();undoPoint(t,'menu');});
  $('fake-'+t).addEventListener('click',()=>{log(`${teamName(t)} · NOTIFICA SIMULATA [01] — NON prova il Bluetooth`);press(t,'simulazione');});
  $('read-'+t).addEventListener('click',()=>readValue(t));
  $('inspect-'+t).addEventListener('click',()=>inspectBle(t));
  $('observe-'+t).addEventListener('click',()=>observeBle(t));
  $('poll-'+t).addEventListener('click',()=>sampleValue(t));
  $('retry-'+t).addEventListener('click',()=>restartNotifications(t));
  $('toggle-poll-'+t).addEventListener('click',()=>{if(connections[t].polling)stopPolling(t);else startPolling(t);});
  $('team-panel-'+t).addEventListener('click',showSettings);
}
$('open-settings').addEventListener('click',e=>{e.stopPropagation();showSettings();});
$('close-settings').addEventListener('click',hideSettings);
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))hideSettings();});
$('mode').addEventListener('change',e=>changeMode(e.target.value));
$('reset').addEventListener('click',resetMatch);
$('fullscreen').addEventListener('click',fullscreen);
$('copy-log').addEventListener('click',copyLog);
$('clear-log').addEventListener('click',()=>{logs.length=0;renderLog();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && overlayOpen)hideSettings();
  if(overlayOpen || e.repeat || ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(e.key.toLowerCase()==='a')addPoint(0,'tastiera test');
  if(e.key.toLowerCase()==='b')addPoint(1,'tastiera test');
});
const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{fitScore(0);fitScore(1);}):null;
if(observer)observer.observe($('scoreboard'));
window.addEventListener('resize',redraw);
window.addEventListener('orientationchange',()=>setTimeout(redraw,300));
window.addEventListener('pagehide',()=>log('Pagina in uscita / sospesa: Bluefy potrebbe interrompere BLE'));
$('mode').value=score.mode;
redraw();
log('Padel BLE Web 0.3 POLLING pronto. Lettura continua FFE1 si avvia alla connessione.');
log(`Ambiente: ${navigator.userAgent}`);
log(`Feature: secureContext=${!!window.isSecureContext}, requestDevice=${typeof navigator.bluetooth?.requestDevice}, getAvailability=${typeof navigator.bluetooth?.getAvailability}`);
log(`Sessione diagnostica ${debugSession}`);
window.addEventListener('error',e=>log(`ERRORE JS: ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection',e=>log(`PROMISE non gestita: ${errorText(e.reason)}`));
log('Driver web: FFE0→FFE1; letture FFE1 in ciclo (00→01 = pressione), NOTIFY mantenuto come canale secondario.');
if(!navigator.bluetooth?.requestDevice) notice('Qui Web Bluetooth non è disponibile. Su iPhone apri questo indirizzo HTTPS in Bluefy. Punteggio e test manuali funzionano comunque.');
