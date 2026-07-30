'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const adapter = fs.readFileSync(path.resolve(__dirname, '../web-adapter-v231.js'), 'utf8');

function makeContext(android = false) {
  const elements = {};
  const downloads = [];
  const messages = [];
  const activities = [];
  const created = [];
  const document = {
    documentElement: { dataset: {} },
    body: { appendChild(node) { created.push(node); }, removeChild() {} },
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const node = {
        tagName: tag.toUpperCase(), id: '', type: '', accept: '', style: {}, files: [], value: '',
        addEventListener(type, cb) { this['on' + type] = cb; },
        click() { if (tag === 'a') downloads.push({ filename: this.download, href: this.href }); },
        remove() {}
      };
      return node;
    }
  };
  const context = {
    console, JSON, String, Number, Boolean, Array, Object, Date, Math, Promise, Map, Set,
    Blob: class BlobMock { constructor(parts, options) { this.parts = parts; this.options = options; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
    navigator: { userAgent: 'TestBrowser/1.0' },
    localStorage: { map: new Map(), setItem(k,v){this.map.set(k,String(v));}, getItem(k){return this.map.get(k)||null;} },
    document,
    window: null,
    FinUpAndroid: android ? { exportJson() {} } : null,
    APP_VERSION: '2.3.1', VERSION_CODE: 29,
    FINUP_DEVELOPER_V213: 'Upid', FINUP_SUPPORT_EMAIL_V213: 'support@example.com',
    reportFilters: { from: '2026-07-01', to: '2026-07-30' },
    v2Settings: { autoLockMinutes: 1, notificationDays: 3 }, privacy: false,
    session: { email: 'user@example.com' },
    nowIso: () => '2026-07-30T12:00:00.000Z', localDate: () => '2026-07-30',
    uidKey: k => 'uid:' + k,
    backupJsonText: () => '{"app":"FinUp"}', reportCsv: () => 'a,b\n1,2', reportText: () => 'FinUp report',
    processImportedJson: raw => { context.imported = raw; },
    recordActivity: (...args) => activities.push(args),
    toast: (...args) => messages.push(args),
    esc: value => String(value ?? '').replace(/[&<>"']/g, ''),
    reminders: () => [{ title: 'Jatuh tempo', text: 'Besok', level: 'warning' }],
    pinEnabled: () => true, saveV2Settings: () => {}, togglePrivacy: () => {},
    openPinSetup: () => {}, openAppearanceSettings: () => {}, openAccountSecurity: () => {},
    openActivityPage: () => {}, restoreDefaults: () => {}, logout: () => {}, deleteAccountAndData: () => {},
    closeModal: () => {}, pushModalHistory: () => {},
    runIntegrityAuditV230: () => ({ errors: [], warnings: [] }),
    FinUpRealtimeV230: {}, FinUpSettingsSyncV230: { status: () => 'Konfigurasi tersinkron' },
    openSettingsPage: () => { context.baseSettingsCalled = true; },
    openSecuritySettings: () => {}, openNotificationSettingsPage: () => {}, openNotificationCenter: () => {},
    exportData: () => { context.baseExportCalled = true; }, openImportData: () => {},
    exportCsvReport: () => {}, exportPdfReport: () => {},
    renderReports: () => '<button>Ekspor PDF</button>',
    renderMore: () => '<div>Diagnostik Aplikasi — Periksa kesehatan data, runtime, dan error lokal tanpa mengirim data ke server.</div>',
    networkErrorMessage: () => 'Periksa internet atau perbarui Android System WebView.',
    infoContent: kind => kind === 'tutorial'
      ? '<h3>14. Pusat Pengingat dan notifikasi</h3><ul><li>Android 13</li></ul><h3>17. Keamanan dan privasi aplikasi</h3><ul><li>Biometrik</li></ul><p>tombol kembali Android</p><p>Aktifkan PIN atau biometrik pada perangkat yang digunakan bersama orang lain.</p>'
      : kind === 'privacy'
        ? '<p>Hash PIN, preferensi biometrik, izin Android, token perangkat, cache, dan antrean offline yang tetap disimpan lokal pada masing-masing perangkat.</p>'
        : '<p>base</p>',
    openDiagnosticsV230: () => {},
    setTimeout: fn => { fn(); return 1; },
    open: () => ({ document: { open(){}, write(){}, close(){} } })
  };
  context.window = context;
  context.window.setTimeout = context.setTimeout;
  context.window.open = context.open;
  context.$ = id => {
    if (!elements[id]) elements[id] = { innerHTML: '' };
    return elements[id];
  };
  vm.createContext(context);
  vm.runInContext(adapter, context);
  return { context, elements, downloads, messages, activities, created };
}

(function testWebMenusAndDownloads() {
  const env = makeContext(false);
  const c = env.context;
  assert.strictEqual(c.__FINUP_PLATFORM__, 'web');
  assert.strictEqual(c.__finupWebAdapterV231, true);
  assert.strictEqual(c.__finupWebRevision, 4);
  c.openSettingsPage();
  const html = env.elements.modalRoot.innerHTML;
  assert(html.includes('PIN browser'));
  assert(html.includes('Unduh backup JSON'));
  assert(!html.includes('Biometrik'));
  assert(!html.includes('Notifikasi sistem'));
  assert(!html.includes('Pengaturan Android'));

  c.openFinUpWebUpdatePage();
  assert(env.elements.modalRoot.innerHTML.includes('upidgedang/finup-web'));
  assert(env.elements.modalRoot.innerHTML.includes('Token admin update VPS'));

  c.openSecuritySettings();
  assert(!env.elements.modalRoot.innerHTML.includes('Lindungi tangkapan layar'));
  assert(!env.elements.modalRoot.innerHTML.includes('Gunakan sidik jari'));

  c.openNotificationSettingsPage();
  assert(env.elements.modalRoot.innerHTML.includes('Pengingat dalam aplikasi'));
  assert(!env.elements.modalRoot.innerHTML.includes('type="checkbox"'));

  c.exportData();
  assert.strictEqual(env.downloads[0].filename, 'FinUp-backup-2026-07-30.json');
  c.exportCsvReport();
  assert.strictEqual(env.downloads[1].filename, 'FinUp-laporan-2026-07-01-2026-07-30.csv');
  assert(c.renderReports().includes('Cetak / Simpan PDF'));
  assert(c.renderMore().includes('Pemeriksaan Data'));
  assert(!c.networkErrorMessage(new Error()).includes('Android System WebView'));
})();

(function testWebDocumentationText() {
  const c = makeContext(false).context;
  const tutorial = c.infoContent('tutorial');
  assert(tutorial.includes('Keamanan dan privasi web'));
  assert(!tutorial.includes('tombol kembali Android'));
  const privacy = c.infoContent('privacy');
  assert(privacy.includes('Hash PIN browser'));
  assert(!privacy.includes('preferensi biometrik'));
  const about = c.infoContent('about');
  assert(about.includes('FinUp Web'));
  assert(about.includes('Penyempurnaan Web v2.3.1 Revision 4'));
  assert(about.includes('repository GitHub resmi'));
})();

(function testAndroidIsUntouched() {
  const env = makeContext(true);
  assert.strictEqual(env.context.__finupWebAdapterV231, undefined);
  env.context.openSettingsPage();
  assert.strictEqual(env.context.baseSettingsCalled, true, 'Android base function must remain intact');
})();

console.log('PASS: web adapter menus, downloads, platform docs, and Android isolation');
