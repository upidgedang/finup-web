const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const path = require('path');
const rootCandidate = path.join(__dirname, '..', 'realtime-v230.js');
const androidCandidate = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'realtime-v230.js');
const sourcePath = fs.existsSync(rootCandidate) ? rootCandidate : androidCandidate;
const source = fs.readFileSync(sourcePath, 'utf8');
const store = new Map();
let toastCalls = [];
let ridCounter = 0;
const localStorage = {
  getItem(k){ return store.has(k) ? store.get(k) : null; },
  setItem(k,v){ store.set(k,String(v)); },
  removeItem(k){ store.delete(k); }
};
const context = {
  console,
  config: { projectId:'test', apiKey:'x', storageBucket:'x', databaseURL:'https://example.invalid' },
  window: {},
  document: { hidden:false },
  navigator: { onLine:true },
  localStorage,
  sessionStorage: localStorage,
  setInterval(){ return 1; }, clearInterval(){}, setTimeout(){ return 1; }, clearTimeout(){},
  Promise, Date, JSON, Math, Object, Array, String, Number, RegExp,
  uidKey(k){ return 'u:'+k; },
  loadJson(k,fallback){ const v=localStorage.getItem(k); return v ? JSON.parse(v) : fallback; },
  saveJson(k,v){ localStorage.setItem(k, JSON.stringify(v)); },
  rid(){ ridCounter += 1; return 'r'+ridCounter; },
  nowIso(){ return new Date().toISOString(); },
  stripUndefined(v){ return JSON.parse(JSON.stringify(v || {})); },
  toast(...args){ toastCalls.push(args); },
  session:null,
  queue:[], data:{}, busy:false, page:'dashboard', lastSyncAt:'', lastSyncError:'',
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, {filename:'realtime-v230.js'});
const api = context.FinUpRealtimeV230;
assert(api && typeof api._archiveConflict === 'function');

const first = api._archiveConflict('accounts','a1',{name:'Tunai',balance:100},{name:'Tunai',balance:200},['balance']);
assert.strictEqual(first.archived, true);
assert.strictEqual(first.notification, 'silent');
assert.strictEqual(toastCalls.length, 0, 'conflict must not produce a toast');
let history = JSON.parse(localStorage.getItem('u:conflicts_v223'));
assert.strictEqual(history.length, 1);
assert.strictEqual(history[0].status, 'resolved');
assert.strictEqual(history[0].resolution, 'cloud_wins');
assert.strictEqual(history[0].repeatCount, 1);

const second = api._archiveConflict('accounts','a1',{name:'Tunai',balance:100},{name:'Tunai',balance:200},['balance']);
assert.strictEqual(second.duplicate, true);
assert.strictEqual(toastCalls.length, 0);
history = JSON.parse(localStorage.getItem('u:conflicts_v223'));
assert.strictEqual(history.length, 1, 'duplicate conflict must be merged');
assert.strictEqual(history[0].repeatCount, 2);

api._archiveConflict('accounts','a1',{name:'Tunai',balance:150},{name:'Tunai',balance:250},['balance']);
history = JSON.parse(localStorage.getItem('u:conflicts_v223'));
assert.strictEqual(history.length, 2, 'different payload remains a distinct conflict');
assert.strictEqual(toastCalls.length, 0);
console.log('PASS FinUp v2.3.9 silent conflict policy and deduplication');
