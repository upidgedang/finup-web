/*
 * FinUp v2.3.0 - account-wide configuration synchronization.
 *
 * Synced through Cloud Firestore:
 * theme, text size, privacy preference, dashboard period, report defaults,
 * reminder preference, reminder lead time, screenshot protection preference,
 * automatic lock duration, budget thresholds, currency/date conventions, and
 * whether the account prefers application locking.
 *
 * Deliberately device-local:
 * PIN hash, biometric enrollment/preference, Android notification permission,
 * device token/id, cached data, pending queue, current page, and temporary filters.
 */
(function () {
    'use strict';

    var SETTINGS_DOCUMENT_ID_V230 = 'global';
    var SETTINGS_SCHEMA_V230 = 1;
    var SETTINGS_WRITE_DELAY_V230 = 140;
    var settingsUnsubscribeV230 = null;
    var settingsStartedUidV230 = '';
    var settingsWriteTimerV230 = null;
    var settingsWritePromiseV230 = null;
    var settingsDirtyFieldsV230 = {};
    var settingsLastLocalV230 = null;
    var settingsLastCloudV230 = null;
    var settingsReadyV230 = false;
    var settingsApplyingRemoteV230 = false;
    var settingsLastErrorV230 = '';

    var GLOBAL_FIELDS_V230 = [
        'theme',
        'textZoom',
        'autoLockMinutes',
        'secureScreen',
        'notifications',
        'notificationDays',
        'budgetThresholds',
        'dashboardPeriod',
        'hideBalance',
        'reportFilters',
        'appLockEnabled',
        'currency',
        'dateFormat'
    ];

    function firebaseReadyV230() {
        return !!(window.firebase
            && window.firebase.firestore
            && window.firebase.auth
            && window.firebase.auth().currentUser
            && session
            && session.localId);
    }

    function firestoreV230() {
        return window.firebase.firestore();
    }

    function settingsRefV230() {
        return firestoreV230()
            .collection('users')
            .doc(session.localId)
            .collection('settings')
            .doc(SETTINGS_DOCUMENT_ID_V230);
    }

    function deviceIdV230() {
        var key = 'finup_device_id_v221';
        var value = localStorage.getItem(key) || '';
        if (!value) {
            value = 'android-' + (typeof rid === 'function' ? rid() : String(Date.now())) + '-' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(key, value);
        }
        return value;
    }

    function cloneV230(value) {
        if (value === undefined) return undefined;
        try { return JSON.parse(JSON.stringify(value)); }
        catch (error) { return value; }
    }

    function equalV230(left, right) {
        try { return JSON.stringify(left) === JSON.stringify(right); }
        catch (error) { return String(left) === String(right); }
    }

    function allowedNumberV230(value, allowed, fallback) {
        var parsed = Number(value);
        return allowed.indexOf(parsed) >= 0 ? parsed : fallback;
    }

    function allowedStringV230(value, allowed, fallback) {
        var text = String(value || '');
        return allowed.indexOf(text) >= 0 ? text : fallback;
    }

    function validDateV230(value, fallback) {
        var text = String(value || '');
        return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
    }

    function sanitizeThresholdsV230(value) {
        var source = Array.isArray(value) ? value : [50, 80, 100];
        var unique = {};
        var result = [];
        source.forEach(function (item) {
            var number = Math.round(Number(item));
            if (!isFinite(number) || number < 1 || number > 100 || unique[number]) return;
            unique[number] = true;
            result.push(number);
        });
        result.sort(function (a, b) { return a - b; });
        return result.length ? result.slice(0, 10) : [50, 80, 100];
    }

    function sanitizeReportFiltersV230(value) {
        var today = typeof localDate === 'function' ? localDate() : new Date().toISOString().slice(0, 10);
        var yearStart = today.slice(0, 4) + '-01-01';
        var source = value && Object.prototype.toString.call(value) === '[object Object]' ? value : {};
        var result = {
            from: validDateV230(source.from, yearStart),
            to: validDateV230(source.to, today)
        };
        if (result.from > result.to) {
            var swap = result.from;
            result.from = result.to;
            result.to = swap;
        }
        return result;
    }

    function buildLocalSettingsV230() {
        var current = v2Settings || {};
        return {
            theme: allowedStringV230(current.theme, ['system', 'light', 'dark'], 'system'),
            textZoom: allowedNumberV230(current.textZoom, [90, 100, 115, 125], 100),
            autoLockMinutes: allowedNumberV230(current.autoLockMinutes, [0, 1, 5, 15], 1),
            secureScreen: !!current.secureScreen,
            notifications: current.notifications !== false,
            notificationDays: allowedNumberV230(current.notificationDays, [1, 3, 7, 14], 3),
            budgetThresholds: sanitizeThresholdsV230(current.budgetThresholds),
            dashboardPeriod: allowedStringV230(current.dashboardPeriod || dashboardPeriod, ['day', 'week', 'month', 'year'], 'month'),
            hideBalance: localStorage.getItem(uidKey('privacy')) === '1',
            reportFilters: sanitizeReportFiltersV230(reportFilters),
            appLockEnabled: typeof pinEnabled === 'function' ? !!pinEnabled() : false,
            currency: 'IDR',
            dateFormat: 'DD/MM/YYYY'
        };
    }

    function sanitizeCloudSettingsV230(raw) {
        var source = raw && Object.prototype.toString.call(raw) === '[object Object]' ? raw : {};
        return {
            theme: allowedStringV230(source.theme, ['system', 'light', 'dark'], 'system'),
            textZoom: allowedNumberV230(source.textZoom, [90, 100, 115, 125], 100),
            autoLockMinutes: allowedNumberV230(source.autoLockMinutes, [0, 1, 5, 15], 1),
            secureScreen: !!source.secureScreen,
            notifications: source.notifications !== false,
            notificationDays: allowedNumberV230(source.notificationDays, [1, 3, 7, 14], 3),
            budgetThresholds: sanitizeThresholdsV230(source.budgetThresholds),
            dashboardPeriod: allowedStringV230(source.dashboardPeriod, ['day', 'week', 'month', 'year'], 'month'),
            hideBalance: !!source.hideBalance,
            reportFilters: sanitizeReportFiltersV230(source.reportFilters),
            appLockEnabled: !!source.appLockEnabled,
            currency: source.currency === 'IDR' ? 'IDR' : 'IDR',
            dateFormat: source.dateFormat === 'DD/MM/YYYY' ? 'DD/MM/YYYY' : 'DD/MM/YYYY'
        };
    }

    function markChangedLocalFieldsV230(forceAll) {
        var current = buildLocalSettingsV230();
        if (forceAll || !settingsLastLocalV230) {
            GLOBAL_FIELDS_V230.forEach(function (field) { settingsDirtyFieldsV230[field] = true; });
        } else {
            GLOBAL_FIELDS_V230.forEach(function (field) {
                if (!equalV230(current[field], settingsLastLocalV230[field])) settingsDirtyFieldsV230[field] = true;
            });
        }
        return current;
    }

    function syncStatusTextV230() {
        if (settingsLastErrorV230) return 'Konfigurasi menunggu sinkronisasi';
        if (Object.keys(settingsDirtyFieldsV230).length || settingsWritePromiseV230) return 'Mengirim konfigurasi...';
        if (settingsReadyV230) return 'Konfigurasi tersinkron';
        return 'Menghubungkan konfigurasi...';
    }

    function settingsSyncNoticeV230() {
        return '<div class="notice notice-info"><b>' + syncStatusTextV230() + '</b><br>'
            + 'Tema, ukuran teks, privasi nominal, periode dashboard, laporan, pengingat, dan preferensi keamanan disamakan antarperangkat. '
            + 'PIN, biometrik, serta izin Android tetap dibuat pada masing-masing HP.</div>';
    }

    function promptLocalPinWhenNeededV230(cloud) {
        localStorage.setItem(uidKey('cloud_app_lock_enabled_v230'), cloud.appLockEnabled ? '1' : '0');
        if (!cloud.appLockEnabled || (typeof pinEnabled === 'function' && pinEnabled())) return;
        var key = uidKey('cloud_pin_prompted_v230');
        if (localStorage.getItem(key) === '1') return;
        localStorage.setItem(key, '1');
        setTimeout(function () {
            if (typeof toast === 'function') toast('Kunci aplikasi aktif pada akun ini. Buat PIN khusus untuk perangkat baru melalui Pengaturan.', false);
        }, 700);
    }

    function applyCloudSettingsV230(raw, metadata) {
        var cloud = sanitizeCloudSettingsV230(raw);
        settingsApplyingRemoteV230 = true;
        try {
            GLOBAL_FIELDS_V230.forEach(function (field) {
                if (settingsDirtyFieldsV230[field]) return;
                if (field === 'hideBalance') {
                    localStorage.setItem(uidKey('privacy'), cloud.hideBalance ? '1' : '0');
                    privacy = cloud.hideBalance;
                    return;
                }
                if (field === 'reportFilters') {
                    reportFilters = cloneV230(cloud.reportFilters);
                    saveJson(uidKey('report_filters'), reportFilters);
                    return;
                }
                if (field === 'appLockEnabled' || field === 'currency' || field === 'dateFormat') return;
                v2Settings[field] = cloneV230(cloud[field]);
            });
            dashboardPeriod = v2Settings.dashboardPeriod || cloud.dashboardPeriod || 'month';
            saveJson(uidKey('settings'), v2Settings);
            if (typeof applyV2Settings === 'function') applyV2Settings();
            if (typeof applyPrivacy === 'function') applyPrivacy();
            if (typeof scheduleBackgroundReminders === 'function') scheduleBackgroundReminders();
            promptLocalPinWhenNeededV230(cloud);
            if (typeof render === 'function' && !(metadata && metadata.hasPendingWrites)) render();
            if (typeof refreshVisibleFeaturePageV214 === 'function') refreshVisibleFeaturePageV214();
        } finally {
            settingsApplyingRemoteV230 = false;
        }
        settingsLastCloudV230 = cloneV230(cloud);
        settingsLastLocalV230 = buildLocalSettingsV230();
        settingsReadyV230 = true;
        settingsLastErrorV230 = '';
    }

    function rtdbUrlV230(uid, token) {
        var base = String((config && config.databaseURL) || 'https://finup-pribadi-a4ea7-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/$/, '');
        return base + '/finup_sync/' + encodeURIComponent(uid) + '/signal.json?auth=' + encodeURIComponent(token);
    }

    function publishSettingsSignalV230(version) {
        if (!navigator.onLine || !window.firebase || !window.firebase.auth || !window.firebase.auth().currentUser || !session) return Promise.resolve(false);
        var signal = {
            changedAtMillis: Date.now(),
            changedByDeviceId: deviceIdV230(),
            appVersion: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '2.2.4',
            nonce: (typeof rid === 'function' ? rid() : String(Date.now())) + '-' + Math.random().toString(36).slice(2, 8),
            collection: 'settings',
            documentId: SETTINGS_DOCUMENT_ID_V230,
            operation: 'set',
            version: Number(version) || 0
        };
        return window.firebase.auth().currentUser.getIdToken(false).then(function (token) {
            return fetch(rtdbUrlV230(session.localId, token), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify(signal)
            });
        }).then(function (response) {
            if (!response.ok) throw new Error('RTDB settings signal HTTP ' + response.status);
            return true;
        }).catch(function (error) {
            console.warn('Settings RTDB signal delayed', error);
            return false;
        });
    }

    function writeDirtySettingsV230(forceAll) {
        if (!firebaseReadyV230()) return Promise.resolve(false);
        var current = markChangedLocalFieldsV230(!!forceAll);
        var dirtyNames = Object.keys(settingsDirtyFieldsV230);
        if (!dirtyNames.length) return Promise.resolve(true);
        if (settingsWritePromiseV230) return settingsWritePromiseV230;

        var sentValues = {};
        dirtyNames.forEach(function (field) { sentValues[field] = cloneV230(current[field]); });
        var ref = settingsRefV230();
        settingsWritePromiseV230 = firestoreV230().runTransaction(function (transaction) {
            return transaction.get(ref).then(function (snapshot) {
                var remote = snapshot.exists ? snapshot.data() : {};
                var version = Number(remote && remote.version);
                if (!isFinite(version) || version < 0) version = 0;
                var patch = {
                    id: SETTINGS_DOCUMENT_ID_V230,
                    schemaVersion: SETTINGS_SCHEMA_V230,
                    version: version + 1,
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                    updatedByDevice: deviceIdV230()
                };
                if (!snapshot.exists || !remote.createdAt) patch.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
                dirtyNames.forEach(function (field) { patch[field] = cloneV230(sentValues[field]); });
                transaction.set(ref, patch, { merge: true });
                return { version: version + 1 };
            });
        }).then(function (result) {
            var latest = buildLocalSettingsV230();
            dirtyNames.forEach(function (field) {
                if (equalV230(latest[field], sentValues[field])) delete settingsDirtyFieldsV230[field];
            });
            settingsLastLocalV230 = cloneV230(latest);
            settingsLastErrorV230 = '';
            settingsReadyV230 = true;
            publishSettingsSignalV230(result && result.version);
            return true;
        }).catch(function (error) {
            settingsLastErrorV230 = String(error && error.message || error || 'Gagal menyinkronkan konfigurasi.');
            console.error('Settings synchronization failed', error);
            return false;
        }).finally(function () {
            settingsWritePromiseV230 = null;
            if (Object.keys(settingsDirtyFieldsV230).length && navigator.onLine) scheduleSettingsSyncV230(false);
        });
        return settingsWritePromiseV230;
    }

    function scheduleSettingsSyncV230(forceAll) {
        if (settingsApplyingRemoteV230 || !session || !session.localId) return;
        markChangedLocalFieldsV230(!!forceAll);
        if (settingsWriteTimerV230) clearTimeout(settingsWriteTimerV230);
        settingsWriteTimerV230 = setTimeout(function () {
            settingsWriteTimerV230 = null;
            writeDirtySettingsV230(false);
        }, SETTINGS_WRITE_DELAY_V230);
    }

    function pullSettingsDocumentV230() {
        if (!firebaseReadyV230()) return Promise.resolve(false);
        return settingsRefV230().get({ source: navigator.onLine ? 'default' : 'cache' }).then(function (snapshot) {
            if (snapshot.exists) applyCloudSettingsV230(snapshot.data(), snapshot.metadata || {});
            return snapshot.exists;
        }).catch(function (error) {
            console.warn('Settings signal pull delayed', error);
            return false;
        });
    }

    function stopSettingsSyncV230() {
        if (settingsWriteTimerV230) clearTimeout(settingsWriteTimerV230);
        settingsWriteTimerV230 = null;
        if (settingsUnsubscribeV230) {
            try { settingsUnsubscribeV230(); } catch (ignore) { }
        }
        settingsUnsubscribeV230 = null;
        settingsStartedUidV230 = '';
        settingsReadyV230 = false;
        settingsLastCloudV230 = null;
        settingsLastLocalV230 = null;
        settingsDirtyFieldsV230 = {};
        settingsLastErrorV230 = '';
    }

    function startSettingsSyncV230() {
        if (!firebaseReadyV230()) return;
        if (settingsStartedUidV230 === session.localId && settingsUnsubscribeV230) return;
        stopSettingsSyncV230();
        settingsStartedUidV230 = session.localId;
        settingsLastLocalV230 = buildLocalSettingsV230();
        var ref = settingsRefV230();
        settingsUnsubscribeV230 = ref.onSnapshot({ includeMetadataChanges: true }, function (snapshot) {
            if (!snapshot.exists) {
                settingsReadyV230 = false;
                scheduleSettingsSyncV230(true);
                return;
            }
            applyCloudSettingsV230(snapshot.data(), snapshot.metadata || {});
        }, function (error) {
            settingsLastErrorV230 = String(error && error.message || error || 'Gagal mendengarkan konfigurasi.');
            console.error('Settings listener failed', error);
        });
    }

    function installHooksV230() {
        if (typeof saveV2Settings === 'function') {
            var baseSaveV2Settings = saveV2Settings;
            saveV2Settings = function () {
                var result = baseSaveV2Settings.apply(this, arguments);
                scheduleSettingsSyncV230(false);
                return result;
            };
        }
        if (typeof togglePrivacy === 'function') {
            var baseTogglePrivacy = togglePrivacy;
            togglePrivacy = function () {
                var result = baseTogglePrivacy.apply(this, arguments);
                scheduleSettingsSyncV230(false);
                return result;
            };
        }
        if (typeof setReportFilter === 'function') {
            var baseSetReportFilter = setReportFilter;
            setReportFilter = function () {
                var result = baseSetReportFilter.apply(this, arguments);
                scheduleSettingsSyncV230(false);
                return result;
            };
        }
        if (typeof savePin === 'function') {
            var baseSavePin = savePin;
            savePin = async function () {
                var result = await baseSavePin.apply(this, arguments);
                scheduleSettingsSyncV230(false);
                return result;
            };
        }
        if (typeof disablePin === 'function') {
            var baseDisablePin = disablePin;
            disablePin = function () {
                var result = baseDisablePin.apply(this, arguments);
                scheduleSettingsSyncV230(false);
                return result;
            };
        }
        if (typeof enterApp === 'function') {
            var baseEnterApp = enterApp;
            enterApp = async function () {
                var result = await baseEnterApp.apply(this, arguments);
                startSettingsSyncV230();
                return result;
            };
        }
        if (typeof logout === 'function') {
            var baseLogout = logout;
            logout = function () {
                stopSettingsSyncV230();
                return baseLogout.apply(this, arguments);
            };
        }
        if (typeof deleteAccountAndData === 'function') {
            var baseDeleteAccountAndData = deleteAccountAndData;
            deleteAccountAndData = async function () {
                try { return await baseDeleteAccountAndData.apply(this, arguments); }
                finally { if (!session) stopSettingsSyncV230(); }
            };
        }
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && session && session.localId) startSettingsSyncV230();
        });
        window.addEventListener('online', function () {
            if (session && session.localId) {
                startSettingsSyncV230();
                if (Object.keys(settingsDirtyFieldsV230).length) scheduleSettingsSyncV230(false);
            }
        });
    }

    window.settingsSyncNoticeV230 = settingsSyncNoticeV230;
    window.FinUpSettingsSyncV230 = {
        start: startSettingsSyncV230,
        stop: stopSettingsSyncV230,
        schedule: scheduleSettingsSyncV230,
        syncNow: writeDirtySettingsV230,
        pullDocument: pullSettingsDocumentV230,
        ready: function () { return settingsReadyV230; },
        status: syncStatusTextV230,
        lastError: function () { return settingsLastErrorV230; },
        _buildLocal: buildLocalSettingsV230,
        _sanitizeCloud: sanitizeCloudSettingsV230,
        _applyCloud: applyCloudSettingsV230,
        _sanitizeReportFilters: sanitizeReportFiltersV230,
        _globalFields: GLOBAL_FIELDS_V230.slice()
    };

    installHooksV230();
})();
