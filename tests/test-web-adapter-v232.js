'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const adapter = fs.readFileSync(path.resolve(__dirname, '../web-adapter-v232.js'), 'utf8');

function storage() {
  return { map: new Map(), setItem(k,v){this.map.set(k,String(v));}, getItem(k){return this.map.has(k)?this.map.get(k):null;}, removeItem(k){this.map.delete(k);} };
}

function makeContext(android = false) {
  const elements = {};
  const downloads = [];
  const messages = [];
  const activities = [];
  const fetchCalls = [];
  const body = { appendChild() {}, removeChild() {} };
  const authParent = { insertBefore(node) { if (node.id) elements[node.id] = node; body.appendChild(node); } };
  elements.authMsg = { id: 'authMsg', parentNode: authParent, innerHTML: '' };
  const document = {
    documentElement: { dataset: {} }, body,
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const node = {
        tagName: tag.toUpperCase(), id: '', type: '', accept: '', style: {}, files: [], value: '', checked: false,
        parentNode: null, innerHTML: '', className: '',
        addEventListener(type, cb) { this['on' + type] = cb; },
        click() { if (tag === 'a') downloads.push({ filename: this.download, href: this.href }); },
        remove() {}
      };
      Object.defineProperty(node, 'innerHTML', {
        get(){ return this._html || ''; },
        set(value){ this._html = String(value); const match = this._html.match(/id="([^"]+)"/); if (match) { const child={ id: match[1], checked:false, addEventListener(type,cb){this['on'+type]=cb;} }; elements[match[1]]=child; } }
      });
      return node;
    }
  };
  const local = storage();
  const sessionStore = storage();
  const context = {
    console, JSON, String, Number, Boolean, Array, Object, Date, Math, Promise, Map, Set,
    Blob: class BlobMock { constructor(parts, options) { this.parts = parts; this.options = options; this.size = String(parts.join('')).length; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    navigator: { userAgent: 'TestBrowser/1.0' },
    localStorage: local, sessionStorage: sessionStore,
    document, window: null, KSES: 'finup_session_v1',
    FinUpAndroid: android ? { exportJson() {} } : null,
    APP_VERSION: '2.3.2', VERSION_CODE: 30,
    FINUP_DEVELOPER_V213: 'Upid', FINUP_SUPPORT_EMAIL_V213: 'support@example.com',
    reportFilters: { from: '2026-07-01', to: '2026-07-31' },
    v2Settings: { autoLockMinutes: 1, notificationDays: 3 }, privacy: false,
    session: { email: 'user@example.com' },
    nowIso: () => '2026-07-31T12:00:00.000Z', localDate: () => '2026-07-31',
    uidKey: k => 'uid:' + k,
    backupJsonText: () => '{"app":"FinUp"}', reportCsv: () => 'a,b\n1,2', reportText: () => 'FinUp report',
    processImportedJson: raw => { context.imported = raw; },
    recordActivity: (...args) => activities.push(args), toast: (...args) => messages.push(args),
    esc: value => String(value ?? '').replace(/[&<>"']/g, ''), reminders: () => [{ title: 'Jatuh tempo', text: 'Besok', level: 'warning' }],
    pinEnabled: () => true, saveV2Settings: () => {}, togglePrivacy: () => {},
    openPinSetup: () => {}, openAppearanceSettings: () => {}, openAccountSecurity: () => {},
    openActivityPage: () => {}, restoreDefaults: () => {},
    logout: () => { context.session = null; }, deleteAccountAndData: async () => { context.session = null; },
    closeModal: () => {}, pushModalHistory: () => {},
    runIntegrityAuditV230: () => ({ errors: [], warnings: [] }), FinUpRealtimeV230: {},
    FinUpSettingsSyncV230: { status: () => 'Konfigurasi tersinkron' },
    openSettingsPage: () => { context.baseSettingsCalled = true; },
    openSecuritySettings: () => {}, openNotificationSettingsPage: () => {}, openNotificationCenter: () => {},
    exportData: () => {}, openImportData: () => {}, exportCsvReport: () => {}, exportPdfReport: () => {},
    renderReports: () => '<button>Ekspor PDF</button>',
    renderMore: () => '<div>Diagnostik Aplikasi — Periksa kesehatan data, runtime, dan error lokal tanpa mengirim data ke server.</div>',
    networkErrorMessage: () => 'Periksa internet atau perbarui Android System WebView.',
    infoContent: kind => kind === 'tutorial'
      ? '<h3>14. Pusat Pengingat dan notifikasi</h3><ul><li>Android 13</li></ul><h3>17. Keamanan dan privasi aplikasi</h3><ul><li>Biometrik</li></ul><p>tombol kembali Android</p><p>Aktifkan PIN atau biometrik pada perangkat yang digunakan bersama orang lain.</p>'
      : kind === 'privacy'
        ? '<p>Hash PIN, preferensi biometrik, izin Android, token perangkat, cache, dan antrean offline yang tetap disimpan lokal pada masing-masing perangkat.</p>'
        : '<p>base</p>',
    openDiagnosticsV230: () => {},
    loadJson: (key, fallback) => { const raw=local.getItem(key); return raw?JSON.parse(raw):fallback; },
    saveJson: (key, value) => local.setItem(key, JSON.stringify(value)),
    setTimeout: fn => { fn(); return 1; },
    open: () => ({ document: { open(){}, write(){}, close(){} } }),
    fetch: (url, options) => { fetchCalls.push({url, options}); return Promise.resolve({ok:true,status:200,text:async()=>JSON.stringify({ok:true,status:'up_to_date',localCommit:'123456789',remoteCommit:'123456789',updateAvailable:false,dirty:false,localVersion:{versionName:'2.3.2',webRevision:1}})}); }
  };
  context.window = context;
  context.window.setTimeout = context.setTimeout;
  context.window.open = context.open;
  context.$ = id => { if (!elements[id]) elements[id] = { innerHTML: '', className: '', disabled:false, textContent:'', value:'', focus(){} }; return elements[id]; };
  vm.createContext(context);
  vm.runInContext(adapter, context);
  return { context, elements, downloads, messages, activities, fetchCalls };
}

(async function testWebAdapter() {
  const env = makeContext(false);
  const c = env.context;
  assert.strictEqual(c.__FINUP_PLATFORM__, 'web');
  assert.strictEqual(c.__finupWebAdapterV232, true);
  assert.strictEqual(c.__finupWebRevision, 1);
  assert(env.elements.finupRememberSessionV232, 'remember session control must be installed');

  c.saveJson(c.KSES, {localId:'u1',refreshToken:'secret'});
  assert(c.sessionStorage.getItem(c.KSES));
  assert.strictEqual(c.localStorage.getItem(c.KSES), null);

  c.openSettingsPage();
  const settings = env.elements.modalRoot.innerHTML;
  assert(settings.includes('Khusus admin VPS'));
  assert(settings.includes('Unduh backup JSON'));
  assert(!settings.includes('Pengaturan Android'));

  c.openFinUpWebUpdatePage();
  env.elements.finupWebUpdateToken = { value:'admin-token', focus(){} };
  await c.checkFinUpWebUpdateStatus(false);
  assert.strictEqual(env.fetchCalls[0].options.headers['X-FinUp-Update-Token'], 'admin-token');

  c.openSecuritySettings();
  assert(!env.elements.modalRoot.innerHTML.includes('biometrik Android'));
  c.openNotificationSettingsPage();
  assert(!env.elements.modalRoot.innerHTML.includes('notifikasi sistem Android'));

  c.exportData();
  assert.strictEqual(env.downloads[0].filename, 'FinUp-backup-2026-07-31.json');
  c.exportCsvReport();
  assert.strictEqual(env.downloads[1].filename, 'FinUp-laporan-2026-07-01-2026-07-31.csv');
  assert(c.renderReports().includes('Cetak / Simpan PDF'));
  assert(c.infoContent('about').includes('v2.3.2 Revision 1'));

  const android = makeContext(true);
  assert.strictEqual(android.context.__finupWebAdapterV232, undefined);
  android.context.openSettingsPage();
  assert.strictEqual(android.context.baseSettingsCalled, true);
  console.log('PASS: web session policy, admin updater, web-only UI, downloads, Android isolation');
})().catch(error => { console.error(error); process.exit(1); });
