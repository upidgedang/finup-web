/* FinUp Web v2.3.3 — browser adapter revision 1 (2026-08-01).
 * Keeps the shared FinUp application core aligned with Android while replacing
 * Android-only bridges and labels with browser-native behavior, including a secured VPS updater.
 */
(function () {
    'use strict';

    var IS_ANDROID_APP = !!window.FinUpAndroid;
    if (IS_ANDROID_APP) return;

    window.__FINUP_PLATFORM__ = 'web';
    document.documentElement.dataset.finupPlatform = 'web';


    var baseOpenSettingsPage = window.openSettingsPage;
    var baseOpenSecuritySettings = window.openSecuritySettings;
    var baseOpenNotificationSettingsPage = window.openNotificationSettingsPage;
    var baseOpenNotificationCenter = window.openNotificationCenter;
    var baseExportData = window.exportData;
    var baseOpenImportData = window.openImportData;
    var baseExportCsvReport = window.exportCsvReport;
    var baseExportPdfReport = window.exportPdfReport;
    var baseRenderReports = window.renderReports;
    var baseInfoContent = window.infoContent;
    var baseRenderMore = window.renderMore;
    var baseNetworkErrorMessage = window.networkErrorMessage;
    var baseLoadJson = window.loadJson;
    var baseSaveJson = window.saveJson;
    var baseLogout = window.logout;
    var baseDeleteAccountAndData = window.deleteAccountAndData;


    var WEB_REMEMBER_KEY = 'finup_web_remember_session_v232';

    function storageGet(storage, key) {
        try { return storage && storage.getItem(key); } catch (ignored) { return null; }
    }

    function storageSet(storage, key, value) {
        try { storage.setItem(key, value); return true; } catch (ignored) { return false; }
    }

    function storageRemove(storage, key) {
        try { if (storage) storage.removeItem(key); } catch (ignored) { }
    }

    function rememberSessionEnabled() {
        return storageGet(localStorage, WEB_REMEMBER_KEY) === '1';
    }

    function moveWebSession(remember) {
        var current = storageGet(sessionStorage, KSES) || storageGet(localStorage, KSES);
        storageRemove(sessionStorage, KSES);
        storageRemove(localStorage, KSES);
        if (current) storageSet(remember ? localStorage : sessionStorage, KSES, current);
        storageSet(localStorage, WEB_REMEMBER_KEY, remember ? '1' : '0');
    }

    function clearWebSession() {
        storageRemove(sessionStorage, KSES);
        storageRemove(localStorage, KSES);
    }

    // Revision 4 stored refresh tokens directly in localStorage. Migrate that
    // legacy session into tab-scoped storage unless the user explicitly chose
    // to remain signed in on this browser.
    (function migrateLegacyWebSession() {
        var legacy = storageGet(localStorage, KSES);
        var choice = storageGet(localStorage, WEB_REMEMBER_KEY);
        if (legacy && choice !== '1') {
            storageSet(sessionStorage, KSES, legacy);
            storageRemove(localStorage, KSES);
            if (choice === null) storageSet(localStorage, WEB_REMEMBER_KEY, '0');
        }
    })();

    window.loadJson = function (key, fallback) {
        if (key === KSES) {
            var raw = storageGet(rememberSessionEnabled() ? localStorage : sessionStorage, key);
            if (!raw) raw = storageGet(rememberSessionEnabled() ? sessionStorage : localStorage, key);
            if (!raw) return fallback;
            try { return JSON.parse(raw); } catch (ignored) { clearWebSession(); return fallback; }
        }
        return baseLoadJson(key, fallback);
    };

    window.saveJson = function (key, value) {
        if (key === KSES) {
            if (!value) { clearWebSession(); return; }
            var raw = JSON.stringify(value);
            var target = rememberSessionEnabled() ? localStorage : sessionStorage;
            var other = rememberSessionEnabled() ? sessionStorage : localStorage;
            storageRemove(other, key);
            if (!storageSet(target, key, raw)) throw new Error('Sesi login tidak dapat disimpan oleh browser.');
            return;
        }
        return baseSaveJson(key, value);
    };

    function installRememberSessionControl() {
        var authMessage = document.getElementById('authMsg');
        if (!authMessage || document.getElementById('finupRememberSessionV232')) return;
        var row = document.createElement('label');
        row.className = 'tiny';
        row.style.cssText = 'display:flex;align-items:flex-start;gap:9px;margin:10px 2px 14px;cursor:pointer';
        row.innerHTML = '<input id="finupRememberSessionV232" type="checkbox" style="margin-top:2px">'
            + '<span><b>Tetap masuk di browser ini</b><br>Jika tidak dicentang, sesi berakhir saat seluruh tab FinUp ditutup.</span>';
        authMessage.parentNode.insertBefore(row, authMessage);
        var checkbox = document.getElementById('finupRememberSessionV232');
        checkbox.checked = rememberSessionEnabled();
        checkbox.addEventListener('change', function () { moveWebSession(checkbox.checked); });
    }

    installRememberSessionControl();

    function downloadText(filename, mimeType, text) {
        var blob = new Blob([String(text == null ? '' : text)], { type: mimeType || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    window.finupDownloadTextV232 = downloadText;

    function selectJsonFile() {
        var input = document.getElementById('finupWebImportFileV232');
        if (!input) {
            input = document.createElement('input');
            input.id = 'finupWebImportFileV232';
            input.type = 'file';
            input.accept = '.json,application/json,text/json';
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                if (!file) return;
                if (file.size > 25 * 1024 * 1024) {
                    toast('File backup terlalu besar. Batas maksimum 25 MB.', true);
                    input.value = '';
                    return;
                }
                file.text().then(function (raw) {
                    processImportedJson(raw);
                }).catch(function () {
                    toast('File backup tidak dapat dibaca.', true);
                }).finally(function () {
                    input.value = '';
                });
            });
        }
        input.value = '';
        input.click();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
        });
    }

    function openPrintableReport() {
        if (window.FinUpReportV233 && typeof window.FinUpReportV233.openPrintableReport === 'function') {
            return window.FinUpReportV233.openPrintableReport();
        }
        toast('Mesin template laporan belum tersedia. Muat ulang FinUp Web.', true);
        return false;
    }

    function settingsNotice() {
        var status = 'Konfigurasi akun aktif';
        try {
            if (window.FinUpSettingsSyncV230 && typeof window.FinUpSettingsSyncV230.status === 'function') {
                status = window.FinUpSettingsSyncV230.status();
            }
        } catch (ignored) { }
        return '<div class="notice notice-info"><b>' + escapeHtml(status) + '</b><br>'
            + 'Tema, ukuran teks, privasi nominal, periode dashboard, laporan, dan pengingat disamakan antarperangkat. '
            + 'PIN dan sesi login browser tetap khusus pada browser/perangkat ini.</div>';
    }

    window.settingsSyncNoticeV230 = settingsNotice;

    window.exportData = function () {
        try {
            var filename = 'FinUp-backup-' + localDate() + '.json';
            downloadText(filename, 'application/json;charset=utf-8', backupJsonText());
            localStorage.setItem(uidKey('last_backup'), nowIso());
            if (typeof recordActivity === 'function') recordActivity('backup_export', 'Backup JSON diunduh melalui browser.');
            toast('Backup JSON berhasil diunduh.');
        } catch (error) {
            if (typeof baseExportData === 'function' && window.FinUpAndroid) return baseExportData.apply(this, arguments);
            toast('Backup belum dapat dibuat.', true);
        }
    };

    window.openImportData = function () {
        try {
            selectJsonFile();
        } catch (error) {
            if (typeof baseOpenImportData === 'function' && window.FinUpAndroid) return baseOpenImportData.apply(this, arguments);
            toast('Pemilih file browser belum dapat dibuka.', true);
        }
    };

    window.exportCsvReport = function () {
        try {
            var filename = 'FinUp-laporan-profesional-' + reportFilters.from + '-' + reportFilters.to + '.csv';
            downloadText(filename, 'text/csv;charset=utf-8', reportCsv());
            if (typeof recordActivity === 'function') recordActivity('report_csv', 'Laporan CSV diunduh melalui browser.', { from: reportFilters.from, to: reportFilters.to });
            toast('Laporan CSV profesional berhasil diunduh.');
        } catch (error) {
            if (typeof baseExportCsvReport === 'function' && window.FinUpAndroid) return baseExportCsvReport.apply(this, arguments);
            toast('Laporan CSV belum dapat dibuat.', true);
        }
    };

    window.exportPdfReport = function () {
        try {
            if (openPrintableReport() && typeof recordActivity === 'function') {
                recordActivity('report_pdf', 'Laporan dibuka untuk dicetak atau disimpan sebagai PDF.', { from: reportFilters.from, to: reportFilters.to });
            }
        } catch (error) {
            if (typeof baseExportPdfReport === 'function' && window.FinUpAndroid) return baseExportPdfReport.apply(this, arguments);
            toast('Laporan cetak belum dapat dibuka.', true);
        }
    };

    window.renderReports = function () {
        var html = typeof baseRenderReports === 'function' ? baseRenderReports.apply(this, arguments) : '';
        return String(html).replace('Ekspor CSV</button>', 'CSV untuk Excel</button>').replace('Ekspor PDF</button>', 'PDF Profesional</button>').replace('Cetak / Simpan PDF</button>', 'PDF Profesional</button>');
    };

    var FINUP_WEB_UPDATE_API = '/api/finup-update';
    var FINUP_WEB_REPOSITORY = 'https://github.com/upidgedang/finup-web.git';
    var finupWebUpdateStatus = null;

    function updateElementText(id, text) {
        var element = document.getElementById(id);
        if (element) element.textContent = String(text == null ? '' : text);
    }

    function shortCommit(value) {
        var text = String(value || '');
        return text ? text.slice(0, 8) : '-';
    }

    function webUpdateMessage(status) {
        if (!status) return 'Periksa pembaruan dari GitHub';
        if (status.dirty) return 'Perubahan lokal terdeteksi · update dikunci';
        if (status.updateAvailable) return 'Pembaruan tersedia · ' + shortCommit(status.remoteCommit);
        if (status.status === 'up_to_date') return 'Sudah versi terbaru · ' + shortCommit(status.localCommit);
        return status.message || 'Status pembaruan belum diketahui';
    }

    function applyWebUpdateStatus(status, errorText) {
        finupWebUpdateStatus = status || null;
        var menuText = errorText || webUpdateMessage(status);
        updateElementText('finupWebUpdateMenuStatus', menuText);
        updateElementText('finupWebUpdateState', errorText || webUpdateMessage(status));
        updateElementText('finupWebLocalCommit', status ? shortCommit(status.localCommit) : '-');
        updateElementText('finupWebRemoteCommit', status ? shortCommit(status.remoteCommit) : '-');
        updateElementText('finupWebLocalVersion', status && status.localVersion
            ? status.localVersion.versionName + ' · Web Revision ' + status.localVersion.webRevision
            : APP_VERSION + ' · Web Revision 1');
        var updateButton = document.getElementById('finupWebUpdateRun');
        if (updateButton) updateButton.disabled = !status || !status.updateAvailable || !!status.dirty;
        var notice = document.getElementById('finupWebUpdateNotice');
        if (notice) {
            notice.className = 'notice ' + (errorText ? 'notice-error' : status && status.updateAvailable ? 'notice-info' : 'notice-ok');
        }
    }

    function parseUpdateResponse(response) {
        return response.text().then(function (raw) {
            var payload = {};
            try { payload = raw ? JSON.parse(raw) : {}; } catch (ignored) { payload = { message: raw }; }
            if (!response.ok) {
                var error = new Error(payload.message || ('HTTP ' + response.status));
                error.status = response.status;
                throw error;
            }
            return payload;
        });
    }

    window.checkFinUpWebUpdateStatus = function (silent) {
        var tokenInput = document.getElementById('finupWebUpdateToken');
        var token = tokenInput ? String(tokenInput.value || '').trim() : '';
        if (!token) {
            applyWebUpdateStatus(null, 'Masukkan token admin VPS untuk memeriksa pembaruan.');
            if (!silent) toast('Token admin VPS diperlukan.', true);
            if (tokenInput) tokenInput.focus();
            return Promise.resolve(null);
        }
        updateElementText('finupWebUpdateMenuStatus', 'Memeriksa repository...');
        updateElementText('finupWebUpdateState', 'Memeriksa pembaruan dari GitHub...');
        if (typeof fetch !== 'function') {
            applyWebUpdateStatus(null, 'Browser tidak mendukung pemeriksaan pembaruan.');
            return Promise.resolve(null);
        }
        return fetch(FINUP_WEB_UPDATE_API + '/status?_=' + Date.now(), {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Accept': 'application/json', 'X-FinUp-Update-Token': token }
        }).then(parseUpdateResponse).then(function (status) {
            applyWebUpdateStatus(status, '');
            return status;
        }).catch(function (error) {
            var message = error && error.status === 401
                ? 'Token admin VPS salah atau akses dikunci sementara.'
                : 'Layanan updater VPS belum dapat dihubungi.';
            applyWebUpdateStatus(null, message);
            if (!silent) toast(message, true);
            return null;
        });
    };

    window.openFinUpWebUpdatePage = function () {
        $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Update FinUp Web</h3>'
            + '<div id="finupWebUpdateNotice" class="notice notice-info"><b id="finupWebUpdateState">Khusus administrator VPS.</b><br>Masukkan token admin untuk memeriksa dan memasang pembaruan dari repository resmi <b>upidgedang/finup-web</b>.</div>'
            + '<div class="card"><div class="row-between"><span>Versi terpasang</span><b id="finupWebLocalVersion">' + esc(APP_VERSION) + ' · Web Revision 1</b></div>'
            + '<div class="row-between"><span>Commit lokal</span><b id="finupWebLocalCommit">-</b></div>'
            + '<div class="row-between"><span>Commit terbaru</span><b id="finupWebRemoteCommit">-</b></div></div>'
            + '<div class="field"><label>Token admin update VPS</label><input id="finupWebUpdateToken" class="input" type="password" autocomplete="off" placeholder="Token dari /etc/finup-web-updater.env"></div>'
            + '<div class="notice notice-info"><b>Keamanan</b><br>Token hanya digunakan untuk permintaan ini, tidak disimpan di browser, dan pemeriksaan status juga memerlukan token.</div>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="checkFinUpWebUpdateStatus(false)">Periksa status</button>'
            + '<button id="finupWebUpdateRun" class="btn btn-primary" disabled onclick="runFinUpWebUpdate()">Update sekarang</button></div>'
            + '<div id="finupWebUpdateResult"></div>'
            + '<p class="tiny">Installer server: <b>sudo bash /var/www/finup/deploy/install-finup-updater.sh</b></p>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        pushModalHistory();
    };

    window.runFinUpWebUpdate = function () {
        var tokenInput = document.getElementById('finupWebUpdateToken');
        var token = tokenInput ? String(tokenInput.value || '').trim() : '';
        var button = document.getElementById('finupWebUpdateRun');
        var result = document.getElementById('finupWebUpdateResult');
        if (!token) {
            toast('Masukkan token admin update VPS.', true);
            if (tokenInput) tokenInput.focus();
            return;
        }
        if (button) { button.disabled = true; button.textContent = 'Memperbarui...'; }
        if (result) result.innerHTML = '<div class="notice notice-info">Mengambil pembaruan dan memvalidasi server...</div>';
        fetch(FINUP_WEB_UPDATE_API + '/run', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-FinUp-Update-Token': token
            },
            body: JSON.stringify({ repository: FINUP_WEB_REPOSITORY, branch: 'main' })
        }).then(parseUpdateResponse).then(function (payload) {
            var message = payload.updated
                ? 'Pembaruan berhasil dipasang. FinUp akan dimuat ulang.'
                : (payload.message || 'FinUp sudah menggunakan versi terbaru.');
            if (result) result.innerHTML = '<div class="notice notice-ok"><b>' + escapeHtml(message) + '</b><br>Commit aktif: ' + escapeHtml(shortCommit(payload.localCommit || payload.newCommit)) + '</div>';
            if (typeof recordActivity === 'function') recordActivity('web_update', message, { commit: payload.localCommit || payload.newCommit || '' });
            toast(message);
            window.setTimeout(function () {
                if (payload.updated && window.location) {
                    var separator = window.location.pathname.indexOf('?') >= 0 ? '&' : '?';
                    window.location.href = window.location.pathname + separator + 'updated=' + Date.now();
                } else {
                    window.checkFinUpWebUpdateStatus(true);
                }
            }, payload.updated ? 1200 : 0);
        }).catch(function (error) {
            var message = error && error.status === 401
                ? 'Token admin update salah.'
                : 'Pembaruan gagal: ' + String(error && error.message || error || 'Kesalahan tidak diketahui');
            if (result) result.innerHTML = '<div class="notice notice-error"><b>' + escapeHtml(message) + '</b></div>';
            toast(message, true);
            if (button) { button.disabled = !(finupWebUpdateStatus && finupWebUpdateStatus.updateAvailable); button.textContent = 'Update sekarang'; }
        });
    };

    window.openSecuritySettings = function () {
        var html = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Keamanan & Privasi</h3>'
            + '<div class="notice notice-info"><b>Keamanan browser</b><br>PIN, auto-lock, dan penyimpanan sesi terbatas membantu melindungi FinUp pada browser ini.</div>'
            + '<div class="list"><div class="list-item" onclick="openPinSetup()"><div class="list-main"><div class="list-icon">🔐</div><div class="list-text"><b>Kunci PIN</b><small>'
            + (pinEnabled() ? 'Aktif' : 'Belum aktif') + ' pada browser ini</small></div></div><b>›</b></div>'
            + '<div class="field"><label>Kunci otomatis setelah tab ditinggalkan</label><select class="input" onchange="v2Settings.autoLockMinutes=Number(this.value);saveV2Settings()">'
            + '<option value="0" ' + (v2Settings.autoLockMinutes === 0 ? 'selected' : '') + '>Langsung</option>'
            + '<option value="1" ' + (v2Settings.autoLockMinutes === 1 ? 'selected' : '') + '>1 menit</option>'
            + '<option value="5" ' + (v2Settings.autoLockMinutes === 5 ? 'selected' : '') + '>5 menit</option>'
            + '<option value="15" ' + (v2Settings.autoLockMinutes === 15 ? 'selected' : '') + '>15 menit</option></select></div>'
            + '<label class="setting-row"><span><b>Sembunyikan nominal</b><small>Nominal diburamkan di seluruh aplikasi</small></span><input type="checkbox" '
            + (privacy ? 'checked' : '') + ' onchange="togglePrivacy()"></label></div>'
            + '<p class="tiny">Menghapus data situs/browser dapat menghapus sesi login dan PIN lokal. Data keuangan yang telah tersinkron tetap berada di akun Firebase.</p>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        $('modalRoot').innerHTML = html;
        pushModalHistory();
    };

    window.openNotificationCenter = function () {
        var items = reminders();
        $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div>'
            + '<div class="row-between"><h3>Pusat Pengingat</h3><span class="badge badge-blue">' + items.length + '</span></div>'
            + '<div class="notice notice-info">Pengingat ditampilkan di dalam FinUp Web saat aplikasi dibuka.</div>'
            + '<div class="list">' + (items.map(function (item) {
                return '<div class="reminder reminder-' + (item.level || 'info') + '"><strong>' + esc(item.title) + '</strong><p>' + esc(item.text) + '</p></div>';
            }).join('') || '<div class="empty"><div class="emoji">✅</div>Tidak ada pengingat yang perlu ditangani.</div>') + '</div>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        pushModalHistory();
    };

    window.openNotificationSettingsPage = function () {
        $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Pengingat</h3>'
            + '<div class="notice notice-info"><b>Pengingat dalam aplikasi</b><br>FinUp Web menampilkan pengingat ketika aplikasi dibuka.</div>'
            + '<div class="field"><label>Tampilkan jatuh tempo dalam</label><select class="input" onchange="v2Settings.notificationDays=Number(this.value);saveV2Settings()">'
            + '<option value="1" ' + (v2Settings.notificationDays === 1 ? 'selected' : '') + '>1 hari</option>'
            + '<option value="3" ' + (v2Settings.notificationDays === 3 ? 'selected' : '') + '>3 hari</option>'
            + '<option value="7" ' + (v2Settings.notificationDays === 7 ? 'selected' : '') + '>7 hari</option>'
            + '<option value="14" ' + (v2Settings.notificationDays === 14 ? 'selected' : '') + '>14 hari</option></select></div>'
            + '<button class="btn btn-secondary" onclick="openNotificationCenter()">Buka pusat pengingat</button>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        pushModalHistory();
    };

    window.openSettingsPage = function () {
        $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Pengaturan</h3>'
            + settingsNotice()
            + '<div class="list">'
            + '<div class="list-item" onclick="openSecuritySettings()"><div class="list-main"><div class="list-icon">🔐</div><div class="list-text"><b>Keamanan & privasi</b><small>PIN browser, auto-lock, dan privasi nominal</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openAppearanceSettings()"><div class="list-main"><div class="list-icon">🌓</div><div class="list-text"><b>Tampilan</b><small>Mode gelap dan ukuran teks</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openNotificationSettingsPage()"><div class="list-main"><div class="list-icon">🔔</div><div class="list-text"><b>Pengingat</b><small>' + reminders().length + ' pengingat aktif dalam aplikasi</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openAccountSecurity()"><div class="list-main"><div class="list-icon">👤</div><div class="list-text"><b>Akun & login</b><small>Ubah email atau kata sandi</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openFinUpWebUpdatePage()"><div class="list-main"><div class="list-icon">🔄</div><div class="list-text"><b>Update FinUp Web</b><small id="finupWebUpdateMenuStatus">Khusus admin VPS · token diperlukan</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="exportData()"><div class="list-main"><div class="list-icon">⬇️</div><div class="list-text"><b>Unduh backup JSON</b><small>Simpan seluruh data melalui browser</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openImportData()"><div class="list-main"><div class="list-icon">⬆️</div><div class="list-text"><b>Impor backup JSON</b><small>Pilih file, lalu gabungkan atau ganti data</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="openActivityPage()"><div class="list-main"><div class="list-icon">🕘</div><div class="list-text"><b>Riwayat aktivitas</b><small>Perubahan penting pada data</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="restoreDefaults()"><div class="list-main"><div class="list-icon">♻️</div><div class="list-text"><b>Pulihkan data default</b><small>Tambahkan akun dan kategori yang hilang</small></div></div><b>›</b></div>'
            + '<div class="list-item" onclick="logout()"><div class="list-main"><div class="list-icon">🚪</div><div class="list-text"><b>Keluar dari browser ini</b><small>' + esc((session && session.email) || '') + '</small></div></div><b>›</b></div></div>'
            + '<div class="notice notice-error"><b>Zona berbahaya</b><br>Penghapusan akun bersifat permanen dan menghapus seluruh data dari Firebase.</div>'
            + '<button class="btn btn-danger" onclick="deleteAccountAndData()">Hapus akun dan seluruh data</button>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        pushModalHistory();
    };

    window.logout = function () {
        clearWebSession();
        return baseLogout.apply(this, arguments);
    };

    window.deleteAccountAndData = function () {
        var result = baseDeleteAccountAndData.apply(this, arguments);
        return Promise.resolve(result).finally(function () { if (!session) clearWebSession(); });
    };

    window.networkErrorMessage = function (error) {
        var text = typeof baseNetworkErrorMessage === 'function' ? baseNetworkErrorMessage(error) : String(error && error.message || error || '');
        return String(text).replace('atau perbarui Android System WebView', 'lalu muat ulang browser');
    };

    window.infoContent = function (kind) {
        var html = typeof baseInfoContent === 'function' ? String(baseInfoContent(kind) || '') : '';
        if (kind === 'about') {
            return '<div class="version-box"><img src="logo-mark.png"><h2>FinUp Web</h2><p>Atur uang, raih tujuan.</p><span class="badge badge-green">Versi ' + APP_VERSION + '</span><p>Version Code ' + VERSION_CODE + '</p></div>'
                + '<div class="legal"><h3>Pengembang</h3><p><b>' + esc(typeof FINUP_DEVELOPER_V213 !== 'undefined' ? FINUP_DEVELOPER_V213 : 'FinUp') + '</b><br>'
                + esc(typeof FINUP_SUPPORT_EMAIL_V213 !== 'undefined' ? FINUP_SUPPORT_EMAIL_V213 : 'upidgedang@gmail.com') + '</p>'
                + '<h3>Penyempurnaan Web v2.3.3 Revision 1</h3><ul><li>Sesi login memakai penyimpanan tab secara default; penyimpanan persisten hanya aktif bila pengguna memilih Tetap masuk.</li><li>Impor backup divalidasi per koleksi, membatasi ukuran dan jumlah record, serta membuat backup otomatis sebelum mengganti data.</li><li>Status dan pemasangan update hanya dapat diakses dengan token administrator VPS serta dilindungi pembatasan percobaan.</li><li>Backup JSON, impor JSON, CSV siap Excel, dan PDF profesional menggunakan fitur browser.</li><li>Pengingat, keamanan, dan petunjuk hanya menampilkan fungsi yang tersedia pada FinUp Web.</li></ul>'
                + '<h3>Teknologi</h3><p>Firebase Authentication, Cloud Firestore, dan Realtime Database digunakan berdasarkan UID pengguna. Data inti dan aturan sinkronisasi sama dengan aplikasi Android.</p></div>';
        }
        if (kind === 'tutorial') {
            html = html
                .replace(/<h3>14\. Pusat Pengingat dan notifikasi<\/h3><ul>[\s\S]*?<\/ul>/, '<h3>14. Pusat Pengingat</h3><ul><li>Pusat Pengingat merangkum anggaran, target, transaksi berulang, utang, dan piutang yang perlu diperhatikan.</li><li>Atur berapa hari sebelum jatuh tempo pengingat ditampilkan ketika FinUp Web dibuka.</li></ul>')
                .replace(/<h3>17\. Keamanan dan privasi aplikasi<\/h3><ul>[\s\S]*?<\/ul>/, '<h3>17. Keamanan dan privasi web</h3><ul><li>Aktifkan PIN enam digit untuk mengunci tampilan FinUp pada browser ini.</li><li>Atur auto-lock ketika tab ditinggalkan.</li><li>Gunakan Sembunyikan nominal ketika membuka FinUp di tempat umum.</li><li>Biarkan opsi Tetap masuk tidak dicentang pada perangkat bersama.</li></ul>')
                .replace('tombol kembali Android', 'tombol kembali browser')
                .replace('Aktifkan PIN atau biometrik pada perangkat yang digunakan bersama orang lain.', 'Aktifkan PIN pada browser atau perangkat yang digunakan bersama orang lain.');
        }
        if (kind === 'privacy') {
            html = html
                .replace('Hash PIN, preferensi biometrik, izin Android, token perangkat, cache, dan antrean offline yang tetap disimpan lokal pada masing-masing perangkat.', 'Hash PIN browser, pilihan penyimpanan sesi, cache, token perangkat, dan antrean offline disimpan lokal pada browser/perangkat yang digunakan.')
                .replace('izin Android', 'preferensi browser');
        }
        return html;
    };

    if (typeof baseRenderMore === 'function') {
        window.renderMore = function () {
            return String(baseRenderMore.apply(this, arguments))
                .replace('Diagnostik Aplikasi', 'Pemeriksaan Data')
                .replace('Periksa kesehatan data, runtime, dan error lokal tanpa mengirim data ke server.', 'Periksa konsistensi data lokal tanpa mengirim data ke server.');
        };
    }

    if (typeof window.openDiagnosticsV230 === 'function') {
        window.openDiagnosticsV230 = function () {
            var audit = typeof window.runIntegrityAuditV230 === 'function' ? window.runIntegrityAuditV230() : { errors: [], warnings: [] };
            var summaryClass = audit.errors.length ? 'notice-error' : audit.warnings.length ? 'notice-info' : 'notice-ok';
            $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Pemeriksaan Data</h3>'
                + '<div class="notice ' + summaryClass + '"><b>' + (audit.errors.length ? 'Ditemukan masalah data' : audit.warnings.length ? 'Ada peringatan data' : 'Pemeriksaan data berhasil') + '</b><br>'
                + audit.errors.length + ' error · ' + audit.warnings.length + ' peringatan.</div>'
                + '<div class="card"><b>Runtime Web</b><p class="tiny">FinUp ' + esc(APP_VERSION) + ' · ' + esc(navigator.userAgent || 'Browser') + '</p><p class="tiny">Real-time: ' + (window.FinUpRealtimeV230 ? 'aktif' : 'memeriksa') + '</p></div>'
                + ((audit.errors.length || audit.warnings.length) ? '<section class="section"><h3>Temuan integritas</h3><div class="legal"><ul>'
                    + audit.errors.concat(audit.warnings).slice(0, 100).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul></div></section>' : '')
                + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
            pushModalHistory();
        };
    }

    window.__finupWebAdapterV232 = true;
    window.__finupWebRevision = 1;
})();
