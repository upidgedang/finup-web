/* FinUp v2.3.0 — secure session migration and runtime error reporting. */
(function () {
    'use strict';

    var nativeBridge = window.FinUpAndroid || null;
    var originalLoadJson = window.loadJson;
    var originalSaveJson = window.saveJson;
    var originalRemoveItem = Storage.prototype.removeItem;

    function isSecureSessionKey(key) {
        try { return key === KSES; } catch (error) { return key === 'finup_session_v1'; }
    }

    function parseJson(raw, fallback) {
        if (!raw) return fallback;
        try {
            var parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function report(message, detail) {
        try {
            if (nativeBridge && typeof nativeBridge.reportJsError === 'function') {
                nativeBridge.reportJsError(String(message || 'JavaScript error'), String(detail || ''));
            }
        } catch (ignored) { }
    }

    function nativeSessionRaw() {
        try {
            return nativeBridge && typeof nativeBridge.getSecureSession === 'function'
                ? String(nativeBridge.getSecureSession() || '')
                : '';
        } catch (error) {
            report('Secure session tidak dapat dibaca', error && error.stack || error);
            return '';
        }
    }

    function storeNativeSession(value) {
        try {
            if (!nativeBridge || typeof nativeBridge.setSecureSession !== 'function') return false;
            return nativeBridge.setSecureSession(JSON.stringify(value)) === true;
        } catch (error) {
            report('Secure session tidak dapat disimpan', error && error.stack || error);
            return false;
        }
    }

    function clearNativeSession() {
        try {
            if (nativeBridge && typeof nativeBridge.clearSecureSession === 'function') {
                nativeBridge.clearSecureSession();
            }
        } catch (error) {
            report('Secure session tidak dapat dihapus', error && error.stack || error);
        }
    }

    function removePlainSession() {
        try { originalRemoveItem.call(localStorage, 'finup_session_v1'); } catch (ignored) { }
    }

    function migratePlainSessionOnce() {
        var existing = nativeSessionRaw();
        if (existing) {
            removePlainSession();
            return;
        }
        var plain = '';
        try { plain = localStorage.getItem('finup_session_v1') || ''; } catch (ignored) { }
        if (!plain) return;
        var parsed = parseJson(plain, null);
        if (parsed && storeNativeSession(parsed)) removePlainSession();
    }

    if (typeof originalLoadJson === 'function') {
        window.loadJson = function (key, fallback) {
            if (isSecureSessionKey(key) && nativeBridge) {
                var raw = nativeSessionRaw();
                if (raw) return parseJson(raw, fallback);
                // One last migration path for installs that skipped the origin migration.
                migratePlainSessionOnce();
                raw = nativeSessionRaw();
                return raw ? parseJson(raw, fallback) : fallback;
            }
            return originalLoadJson(key, fallback);
        };
    }

    if (typeof originalSaveJson === 'function') {
        window.saveJson = function (key, value) {
            if (isSecureSessionKey(key) && nativeBridge) {
                if (!storeNativeSession(value)) {
                    throw new Error('Sesi terenkripsi tidak dapat disimpan.');
                }
                removePlainSession();
                return;
            }
            return originalSaveJson(key, value);
        };
    }

    Storage.prototype.removeItem = function (key) {
        if (this === localStorage && isSecureSessionKey(key) && nativeBridge) {
            clearNativeSession();
        }
        return originalRemoveItem.call(this, key);
    };

    window.addEventListener('error', function (event) {
        var detail = [event && event.message, event && event.filename, event && event.lineno, event && event.colno]
            .filter(Boolean).join(' · ');
        report('Kesalahan JavaScript tidak tertangani', detail);
    });

    window.addEventListener('unhandledrejection', function (event) {
        var reason = event && event.reason;
        report('Promise tidak tertangani', reason && reason.stack || reason && reason.message || String(reason || ''));
    });

    migratePlainSessionOnce();
    window.__finupSecureSessionV230 = true;
})();
