'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.resolve(__dirname, '../hardening-v232.js'), 'utf8');

const elements = { modalRoot: { innerHTML: '' } };
const context = {
  console, JSON, String, Number, Boolean, Array, Object, Date, Math, Map, Set, Promise,
  Blob: class { constructor(parts){ this.size=Buffer.byteLength(parts.join('')); } },
  window: null, VERSION_CODE: 31, APP_VERSION: '2.3.3',
  data: {accounts:[],categories:[],transactions:[],budgets:[],recurring:[],goals:[],debts:[],activities:[]},
  pendingImport: null,
  backupJsonText: () => '{"app":"FinUp","data":{"accounts":[],"transactions":[]}}',
  localDate: () => '2026-07-31', nowIso: () => '2026-07-31T00:00:00.000Z', uidKey: k => k,
  localStorage: { map:new Map(), setItem(k,v){this.map.set(k,v);}, getItem(k){return this.map.get(k)||null;} },
  processImportedJson: () => {}, applyImportedData: mode => { context.applied=mode; },
  infoContent: () => '<p>base</p>',
  esc: v => String(v).replace(/[&<>"']/g,''), shortDate: v => v,
  $: id => elements[id] || (elements[id]={innerHTML:''}), pushModalHistory:()=>{}, toast:(...a)=>{context.toast=a;},
  confirm:()=>true, finupDownloadTextV232:(name,mime,text)=>{context.download={name,mime,text};}
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context);

const malicious = JSON.stringify({
  app:'FinUp', version:'2.3.1', versionCode:29, exportedAt:'2026-07-30T00:00:00Z',
  settings:{theme:'dark',textZoom:999,unknown:'drop'},
  data:{
    accounts:[{id:'cash',name:'Tunai',icon:'💵',type:'cash',initialBalance:1000,active:true,evil:'drop',__proto__:{polluted:true}}],
    categories:[{id:'food',name:'Makan',type:'expense',icon:'🍜'}],
    transactions:[
      {id:'tx1',type:'expense',amount:25000,date:'2026-07-31',accountId:'cash',categoryId:'food',debtId:'debt-1',note:'<img src=x onerror=alert(1)>',unknown:'drop'},
      {id:'bad id!',type:'expense',amount:1,date:'2026-07-31'},
      {id:'bad-date',type:'expense',amount:1,date:'2026-99-99'}
    ], budgets:[{id:'budget-1',period:'weekly',startDate:'2026-07-28',categoryId:'food',amount:100000,carryOver:true,thresholds:[50,80,100]}],recurring:[],goals:[],debts:[{id:'debt-1',kind:'debt',person:'Budi',amount:50000,paid:10000,history:[{id:'pay-1',amount:10000,date:'2026-07-31'}]}],activities:[{id:'act-1',action:'test',description:'Aktivitas',date:'2026-07-31'}]
  }
});
const result=context.FinUpImportValidatorV232.validateBackup(malicious);
assert.strictEqual(result.data.transactions.length,1);
assert.strictEqual(result.data.accounts[0].evil,undefined);
assert.strictEqual(result.data.accounts[0].icon,'💵');
assert.strictEqual(result.data.transactions[0].debtId,'debt-1');
assert.strictEqual(result.data.budgets[0].startDate,'2026-07-28');
assert.deepStrictEqual(Array.from(result.data.budgets[0].thresholds),[50,80,100]);
assert.strictEqual(result.data.debts[0].history[0].id,'pay-1');
assert.strictEqual(result.data.activities[0].date,'2026-07-31');
assert.strictEqual(result.settings.textZoom,140);
assert.strictEqual({}.polluted,undefined);
assert(result.report.dropped>=2);
assert(result.report.droppedFields>=2);
context.processImportedJson(malicious);
assert(context.pendingImport);
assert(elements.modalRoot.innerHTML.includes('Data valid'));
context.applyImportedData('replace');
assert.strictEqual(context.applied,'replace');
assert(context.download && context.download.name.includes('sebelum-impor'));
assert(context.infoContent('about').includes('Yang baru di v2.3.3'));
console.log('PASS: backup validation, limits, field filtering, pre-import backup, about release notes');
