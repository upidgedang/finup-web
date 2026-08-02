'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const reportSource = fs.readFileSync(path.resolve(__dirname, '../report-v233.js'), 'utf8');
const source = fs.readFileSync(path.resolve(__dirname, '../report-period-v234.js'), 'utf8');
const settingsSource = fs.readFileSync(path.resolve(__dirname, '../settings-sync-v230.js'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../report-period-v234.css'), 'utf8');
const timers = [];
const context = {
  console, Intl, Date, String, Number, Array, Object, Math, JSON,
  window: null,
  setTimeout: () => 1,
  setInterval: (fn, ms) => { timers.push([fn, ms]); return 1; },
  document: { querySelector: () => null, querySelectorAll: () => [] },
};
context.window = context;
vm.createContext(context);
vm.runInContext(`
var txFilters = {type:'all', search:'', from:'2025-01-01', to:'2025-01-02'};
var reportFilters = {dateMode:'previousMonth',from:'2026-07-01',to:'2026-07-31'};
var page = 'reports';
function saveJson(){}
function uidKey(v){return v;}
function shortDate(v){return v;}
function rupiah(v){return 'Rp'+v;}
function totalsBetween(){return {income:0,expense:0};}
function reportTransactions(){return [];}
function renderTrendCard(){return '';}
function renderCategoryCardForRange(){return '';}
function render(){}
function loadV2Settings(){}
function updateTxFilter(key,value){txFilters[key]=value;}
function renderTransactions(){return '<div class="filter-box"><div class="row-between"><b>Filter transaksi</b><div><button class="text-btn" onclick="useCurrentMonthTxFilter()">Bulan ini</button><button class="text-btn" onclick="clearTxFilters()">Reset</button></div></div><input id="txFilterFrom" class="input" type="date"><input id="txFilterTo" class="input" type="date">Otomatis: tanggal 1 bulan berjalan sampai hari ini. Mengubah tanggal akan memakai periode khusus.</div>';}
function $(id){return null;}
`, context);
vm.runInContext(reportSource, context);
vm.runInContext(source, context);
assert(context.FinUpReportPeriodV234, 'module must load');
const range = context.FinUpReportPeriodV234.periodRange('monthToDate', new Date('2026-08-01T12:00:00Z'));
assert.strictEqual(range.from, '2026-08-01');
assert.strictEqual(range.to, '2026-08-01');
const previousMonth = context.FinUpReportPeriodV234.periodRange('previousMonth', new Date('2026-08-01T12:00:00Z'));
assert.deepStrictEqual(JSON.parse(JSON.stringify(previousMonth)), {from:'2026-07-01',to:'2026-07-31'});
const legacy = {from:'2026-07-01',to:'2026-07-31'};
context.FinUpReportPeriodV234.normalizeFilter(legacy,'monthToDate');
assert.strictEqual(legacy.dateMode,'previousMonth','legacy range must infer previousMonth instead of resetting to current month');
const selected = context.FinUpReportPeriodV234.selectedReportFilter();
assert.deepStrictEqual(JSON.parse(JSON.stringify(selected)),{dateMode:'previousMonth',from:'2026-07-01',to:'2026-07-31'});
const custom = {dateMode:'custom',from:'2026-08-20',to:'2026-08-01'};
context.FinUpReportPeriodV234.normalizeFilter(custom,'monthToDate');
assert.strictEqual(custom.from,'2026-08-01');
assert.strictEqual(custom.to,'2026-08-20');
const report = {
 period:{from:'2026-07-01',to:'2026-07-31',fromFormatted:'01 Jul 2026',toFormatted:'31 Jul 2026'},
 generatedAtFormatted:'01 Agustus 2026 18.18',owner:'user@example.com',
 totals:{incomeFormatted:'Rp1.000.000',expenseFormatted:'Rp500.000',netFormatted:'Rp500.000',balanceFormatted:'Rp2.000.000'},
 accounts:Array.from({length:10},(_,i)=>({name:'Akun '+(i+1),type:'Bank/Tabungan',balanceFormatted:'Rp2.000.000'})),
 categories:Array.from({length:12},(_,i)=>({name:'Kategori '+(i+1),amountFormatted:'Rp500.000',percentage:8.3})),
 transactions:Array.from({length:33},(_,i)=>({number:i+1,dateFormatted:'01 Jul 2026',type:i%2?'expense':'income',typeLabel:i%2?'Pengeluaran':'Pemasukan',category:'Kategori panjang untuk pengujian',sourceAccount:'Rekening Bank Panjang',destinationAccount:'',note:'Catatan transaksi cukup panjang untuk menguji pembungkusan baris dan batas footer halaman.',amountFormatted:'Rp10.000'}))
};
const pages = context.FinUpReportPeriodV234.buildPreviewPages(report);
const pageCount = (pages.match(/finup-a4-page/g)||[]).length;
const pkg = context.FinUpReportV233.buildPdfPreviewPackage(report);
assert.strictEqual(pageCount, pkg.pages.length, 'preview page count must equal exported PDF page count');
assert(pageCount >= 2, 'large report must paginate');
assert(pages.includes('aria-label="Pratinjau PDF halaman 1 dari '+pageCount+'"'));
assert.strictEqual((pages.match(/class="finup-pdf-svg"/g)||[]).length,pageCount,'every preview page renders the exact PDF drawing operations');
assert(pages.includes('01 Jul 2026 - 31 Jul 2026'),'selected period must appear in preview SVG');
const print = context.FinUpReportPeriodV234.buildPrintableHtml(report);
assert(print.includes('@page{size:A4 portrait'));
assert(print.includes('finup-pdf-svg'));
assert(print.includes('viewBox="0 0 595 842"'));
assert(css.includes('width:595px;height:842px'), 'screen preview must use the exact PDF coordinate canvas');
assert(css.includes('.finup-pdf-svg'), 'preview must render PDF drawing operations');
assert(settingsSource.includes("dateMode: allowedStringV230(source.dateMode"),'settings synchronization must preserve dateMode');
assert(timers.some(x=>x[1]===60000));
console.log('PASS: selected period preservation, legacy inference, sync-safe dateMode, A4 pagination, and footer isolation');
