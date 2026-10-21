import { MODES, MODE_NAMES, ScoreEngine, ClickDetector, DOUBLE_WINDOW_MS, REPEAT_FILTER_MS } from './core.mjs';

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
  phase:'Non connesso' }));
const clicks = [new ClickDetector(),new ClickDetector()];
const timers = [null,null];
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
  $('connection-label-'+t).textContent = level==='good' ? 'BLE · in ascolto' : (level==='bad' ? 'BLE · errore' : 'BLE · scollegato');
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
  c.generation++;
  if(c.characteristic && c.onValue){try{c.characteristic.removeEventListener('characteristicvaluechanged',c.onValue);}catch{}}
  if(c.device && c.onDisconnect){try{c.device.removeEventListener('gattserverdisconnected',c.onDisconnect);}catch{}}
  if(disconnect && c.device?.gatt?.connected){try{c.device.gatt.disconnect();}catch{}}
  c.characteristic=null;c.onValue=null;c.onDisconnect=null;c.connected=false;c.subscribed=false;
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
  c.onDisconnect=()=>{
    if(c.generation!==generation)return;
    c.connected=false;c.subscribed=false;
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
      c.received++;
      const bytes=hexOf(value);
      log(`${teamName(t)} · NOTIFY FFE1 [${bytes||'vuoto'}] #${c.received}`);
      $('detail-'+t).textContent=`Notifiche ricevute: ${c.received} · ${(c.device?.name)||'iTAG'}`;
      press(t,'iTAG');
    };
    characteristic.addEventListener('characteristicvaluechanged',c.onValue);
    log(`${teamName(t)} · Listener 'characteristicvaluechanged' registrato`);
    status(t,'Avvio notifiche FFE1...');
    await characteristic.startNotifications();
    if(c.generation!==generation)return;
    c.subscribed=true;
    status(t,'Notifiche richieste; in attesa di pressioni','good');
    notice('Connessione riuscita. Premi l’iTAG: se arriva una riga NOTIFY FFE1 nel registro, il segnapunti dovrebbe funzionare.');
    log(`${teamName(t)} · startNotifications OK. Ora premi iTAG. Nessuna ricezione confermata finché non appare NOTIFY FFE1.`);
  } catch(e) {
    if(c.generation!==generation)return;
    status(t,`Errore BLE: ${errorText(e)}`,'bad');
    notice('Bluefy non ha completato la sottoscrizione BLE. Copia il registro: non possiamo forzare le notifiche locali come nell’app Android.');
  }
}
async function readValue(t) {
  const c=connections[t];
  if(!c.characteristic){log(`${teamName(t)} · Prima collega iTAG`);return;}
  try { const v=await c.characteristic.readValue();log(`${teamName(t)} · Lettura FFE1 [${hexOf(v)}] (diagnostica: NON è un evento di pressione)`);}
  catch(e){log(`${teamName(t)} · Lettura FFE1 fallita: ${errorText(e)}`);}
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
log('Padel BLE Web 0.1 pronto. Per BLE apri via HTTPS in Bluefy.');
log('Driver web: FFE0→FFE1, listener prima di startNotifications; nessun accesso Android a setCharacteristicNotification.');
if(!navigator.bluetooth?.requestDevice) notice('Qui Web Bluetooth non è disponibile. Su iPhone apri questo indirizzo HTTPS in Bluefy. Punteggio e test manuali funzionano comunque.');
