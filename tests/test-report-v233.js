'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync(path.resolve(__dirname, '../report-v233.js'), 'utf8');
const context = { console, Intl, Date, String, Number, Array, Object, Math, JSON, window: null };
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
assert(context.FinUpReportV233, 'report engine must load');
const report = {
  period: {from:'2026-07-01',to:'2026-07-31',fromFormatted:'1 Jul 2026',toFormatted:'31 Jul 2026'},
  generatedAtFormatted:'1 Agustus 2026 03.26', owner:'user@example.com',
  totals:{income:5000000,expense:3200000,net:1800000,balance:4500000,incomeFormatted:'Rp5.000.000',expenseFormatted:'Rp3.200.000',netFormatted:'Rp1.800.000',balanceFormatted:'Rp4.500.000'},
  accounts:[{name:'Tunai',type:'Tunai',balance:1000000,balanceFormatted:'Rp1.000.000'},{name:'Bank',type:'Bank/Tabungan',balance:3500000,balanceFormatted:'Rp3.500.000'}],
  categories:[{name:'Makanan',amount:1200000,amountFormatted:'Rp1.200.000',percentage:37.5}], transactions:[]
};
for (let i=1;i<=75;i++) report.transactions.push({number:i,date:'2026-07-01',dateFormatted:'1 Jul 2026',type:i%2?'expense':'income',typeLabel:i%2?'Pengeluaran':'Pemasukan',category:'Kategori '+i,sourceAccount:'Tunai',destinationAccount:'',note:'Catatan transaksi '+i+' untuk memeriksa pembungkusan tabel profesional.',reference:'',income:i%2?0:i*10000,expense:i%2?i*10000:0,transfer:0,amount:i*10000,amountFormatted:'Rp'+(i*10000).toLocaleString('id-ID')});
const csv = context.FinUpReportV233.buildCsv(report);
assert(csv.startsWith('\ufeffsep=,'));
assert(csv.includes('RINGKASAN'));
assert(csv.includes('RINCIAN TRANSAKSI'));
assert(csv.includes('Pemasukan,Pengeluaran,Transfer'));
const pdf = context.FinUpReportV233.buildAndroidPdf(report);
assert(pdf.startsWith('%PDF-1.4'));
assert(pdf.endsWith('%%EOF\n'));
assert(!/[^\x00-\x7f]/.test(pdf), 'Android PDF must stay ASCII for byte-safe export bridge');
assert((pdf.match(/\/Type \/Page\b/g)||[]).length >= 4, 'long report must paginate');
const startxref = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)[1]);
assert.strictEqual(pdf.slice(startxref,startxref+4),'xref');
const index = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
assert(index.includes('lastDashboardBackAt'));
assert(index.includes('Tekan sekali lagi untuk keluar'));
assert(index.includes('currentTime - lastDashboardBackAt <= 2000'));
console.log('PASS: professional CSV, paginated A4 PDF, valid xref, and double-back protection');
