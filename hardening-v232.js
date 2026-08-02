/* FinUp v2.3.9 shared data hardening.
 * Loaded by Android and Web after the legacy core so the final runtime uses
 * validated imports without changing Firebase collection compatibility.
 */
(function () {
    'use strict';

    var MAX_BACKUP_BYTES = 25 * 1024 * 1024;
    var MAX_TOTAL_RECORDS = 25000;
    var COLLECTION_LIMITS = {
        accounts: 500,
        categories: 1000,
        transactions: 12000,
        budgets: 2000,
        recurring: 2000,
        goals: 2000,
        debts: 2000,
        activities: 5000
    };
    var ALLOWED_FIELDS = {
        accounts: ['id', 'name', 'icon', 'type', 'initialBalance', 'balance', 'active', 'order', 'isDefault', 'createdAt', 'updatedAt'],
        categories: ['id', 'name', 'icon', 'type', 'active', 'order', 'isDefault', 'createdAt', 'updatedAt'],
        transactions: ['id', 'type', 'amount', 'date', 'note', 'reference', 'accountId', 'categoryId', 'fromAccountId', 'toAccountId', 'recurringId', 'goalId', 'debtId', 'createdAt', 'updatedAt'],
        budgets: ['id', 'categoryId', 'amount', 'period', 'month', 'week', 'startDate', 'carryOver', 'thresholds', 'createdAt', 'updatedAt'],
        recurring: ['id', 'name', 'type', 'amount', 'accountId', 'categoryId', 'frequency', 'nextDate', 'preferredDay', 'autoCreate', 'active', 'reminderDays', 'createdAt', 'updatedAt'],
        goals: ['id', 'name', 'target', 'current', 'deadline', 'accountId', 'reminderEnabled', 'history', 'createdAt', 'updatedAt'],
        debts: ['id', 'kind', 'person', 'amount', 'paid', 'dueDate', 'note', 'accountId', 'history', 'payments', 'createdAt', 'updatedAt'],
        activities: ['id', 'action', 'description', 'meta', 'date', 'createdAt', 'updatedAt']
    };
    var STRING_LIMITS = {
        id: 128, name: 160, person: 160, note: 2000, reference: 240,
        icon: 16, type: 32, kind: 32, period: 32, frequency: 32,
        action: 80, description: 500, accountId: 128, categoryId: 128,
        fromAccountId: 128, toAccountId: 128, recurringId: 128, goalId: 128, debtId: 128,
        date: 10, deadline: 10, dueDate: 10, nextDate: 10, startDate: 10, month: 10, week: 10,
        createdAt: 40, updatedAt: 40
    };
    var NUMBER_FIELDS = new Set(['initialBalance', 'balance', 'order', 'amount', 'target', 'current', 'paid', 'preferredDay', 'reminderDays']);
    var BOOLEAN_FIELDS = new Set(['active', 'isDefault', 'carryOver', 'autoCreate', 'reminderEnabled']);
    var DATE_ONLY_FIELDS = new Set(['date', 'deadline', 'dueDate', 'nextDate', 'startDate']);
    var TIMESTAMP_FIELDS = new Set(['createdAt', 'updatedAt']);
    var ID_FIELDS = new Set(['id', 'accountId', 'categoryId', 'fromAccountId', 'toAccountId', 'recurringId', 'goalId', 'debtId']);
    var BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

    function isPlainObject(value) {
        if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function cleanText(value, maximum) {
        return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maximum || 500);
    }

    function cleanId(value) {
        var text = cleanText(value, 128);
        return /^[A-Za-z0-9._:@-]{1,128}$/.test(text) ? text : '';
    }

    function cleanFiniteNumber(value) {
        var number = Number(value);
        if (!Number.isFinite(number) || Math.abs(number) > 1000000000000000) return null;
        return number;
    }

    function cleanDateOnly(value) {
        var text = cleanText(value, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
        var parsed = new Date(text + 'T12:00:00Z');
        return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? '' : text;
    }

    function cleanTimestamp(value) {
        var text = cleanText(value, 40);
        if (!text) return '';
        var parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
    }

    function cleanNested(value, depth) {
        if (depth > 3 || value == null) return null;
        if (typeof value === 'string') return cleanText(value, 500);
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return cleanFiniteNumber(value);
        if (Array.isArray(value)) return value.slice(0, 200).map(function (item) { return cleanNested(item, depth + 1); }).filter(function (item) { return item !== null; });
        if (!isPlainObject(value)) return null;
        var output = {};
        Object.keys(value).slice(0, 100).forEach(function (key) {
            if (BLOCKED_KEYS.has(key)) return;
            var safeKey = cleanText(key, 80);
            if (!/^[A-Za-z0-9._-]{1,80}$/.test(safeKey)) return;
            var safeValue = cleanNested(value[key], depth + 1);
            if (safeValue !== null) output[safeKey] = safeValue;
        });
        return output;
    }

    function validEnum(collection, field, value) {
        var allowed = null;
        if (field === 'type' && collection === 'transactions') allowed = ['income', 'expense', 'transfer'];
        if (field === 'type' && collection === 'categories') allowed = ['income', 'expense'];
        if (field === 'type' && collection === 'recurring') allowed = ['income', 'expense'];
        if (field === 'kind' && collection === 'debts') allowed = ['debt', 'receivable'];
        if (field === 'period' && collection === 'budgets') allowed = ['weekly', 'monthly'];
        if (field === 'frequency' && collection === 'recurring') allowed = ['daily', 'weekly', 'monthly', 'yearly'];
        return !allowed || allowed.indexOf(value) >= 0;
    }

    function sanitizeRecord(collection, raw, report) {
        if (!isPlainObject(raw)) {
            report.dropped++;
            return null;
        }
        var id = cleanId(raw.id);
        if (!id) {
            report.dropped++;
            return null;
        }
        var output = {};
        output.id = id;
        var fields = ALLOWED_FIELDS[collection] || ['id'];
        Object.keys(raw).forEach(function (field) {
            if (BLOCKED_KEYS.has(field) || fields.indexOf(field) < 0) report.droppedFields++;
        });
        fields.forEach(function (field) {
            if (field === 'id' || !Object.prototype.hasOwnProperty.call(raw, field)) return;
            var value = raw[field];
            var acceptedField = false;
            if (ID_FIELDS.has(field)) {
                var safeId = cleanId(value);
                if (safeId) { output[field] = safeId; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            if (NUMBER_FIELDS.has(field)) {
                var safeNumber = cleanFiniteNumber(value);
                if (safeNumber !== null) { output[field] = safeNumber; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            if (BOOLEAN_FIELDS.has(field)) {
                if (typeof value === 'boolean') { output[field] = value; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            if (DATE_ONLY_FIELDS.has(field)) {
                var safeDate = cleanDateOnly(value);
                if (safeDate) { output[field] = safeDate; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            if (TIMESTAMP_FIELDS.has(field)) {
                var safeTimestamp = cleanTimestamp(value);
                if (safeTimestamp) { output[field] = safeTimestamp; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            if (field === 'history' || field === 'payments' || field === 'meta' || field === 'thresholds') {
                var safeNested = cleanNested(value, 0);
                if (safeNested !== null) { output[field] = safeNested; acceptedField = true; }
                if (!acceptedField) report.droppedFields++;
                return;
            }
            var safeText = cleanText(value, STRING_LIMITS[field] || 500);
            if (safeText && validEnum(collection, field, safeText)) { output[field] = safeText; acceptedField = true; }
            if (!acceptedField) report.droppedFields++;
        });

        var valid = true;
        if (collection === 'accounts' || collection === 'categories' || collection === 'goals' || collection === 'recurring') valid = !!output.name;
        if (collection === 'transactions') {
            valid = !!output.type && !!output.date && Number(output.amount) > 0;
            if (output.type === 'transfer') valid = valid && !!output.fromAccountId && !!output.toAccountId && output.fromAccountId !== output.toAccountId;
            else valid = valid && !!output.accountId && !!output.categoryId;
        }
        if (collection === 'budgets') {
            valid = !!output.categoryId && Number(output.amount) > 0 && !!output.period;
            if (output.period === 'weekly') valid = valid && !!output.startDate;
            if (output.period === 'monthly') valid = valid && /^\d{4}-\d{2}$/.test(output.month || '');
        }
        if (collection === 'goals') valid = valid && Number(output.target) > 0;
        if (collection === 'recurring') valid = valid && Number(output.amount) > 0 && !!output.nextDate && !!output.accountId && !!output.categoryId;
        if (collection === 'debts') valid = !!output.person && !!output.kind && Number(output.amount) > 0;
        if (collection === 'activities') valid = !!output.action && !!output.description;
        if (!valid) {
            report.dropped++;
            return null;
        }
        report.accepted++;
        return output;
    }

    function sanitizeSettings(raw) {
        if (!isPlainObject(raw)) return {};
        var output = {};
        if (['system', 'light', 'dark'].indexOf(raw.theme) >= 0) output.theme = raw.theme;
        var textZoom = cleanFiniteNumber(raw.textZoom);
        if (textZoom !== null) output.textZoom = Math.max(80, Math.min(140, Math.round(textZoom)));
        var autoLock = cleanFiniteNumber(raw.autoLockMinutes);
        if (autoLock !== null) output.autoLockMinutes = Math.max(0, Math.min(120, Math.round(autoLock)));
        var notificationDays = cleanFiniteNumber(raw.notificationDays);
        if (notificationDays !== null) output.notificationDays = Math.max(0, Math.min(30, Math.round(notificationDays)));
        if (['day', 'week', 'month', 'year'].indexOf(raw.dashboardPeriod) >= 0) output.dashboardPeriod = raw.dashboardPeriod;
        ['biometric', 'secureScreen', 'notifications', 'hideBalance', 'appLockEnabled'].forEach(function (key) {
            if (typeof raw[key] === 'boolean') output[key] = raw[key];
        });
        if (Array.isArray(raw.budgetThresholds)) {
            output.budgetThresholds = raw.budgetThresholds.slice(0, 5).map(cleanFiniteNumber).filter(function (value) { return value !== null && value >= 1 && value <= 100; });
        }
        var reportFilters = cleanNested(raw.reportFilters, 0);
        if (reportFilters && isPlainObject(reportFilters)) output.reportFilters = reportFilters;
        if (typeof raw.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency)) output.currency = raw.currency;
        if (typeof raw.dateFormat === 'string' && ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].indexOf(raw.dateFormat) >= 0) output.dateFormat = raw.dateFormat;
        return output;
    }

    function validateBackup(raw) {
        var source = String(raw == null ? '' : raw).trim();
        if (!source) throw new Error('File backup kosong.');
        if (new Blob([source]).size > MAX_BACKUP_BYTES) throw new Error('File backup terlalu besar. Batas maksimum 25 MB.');
        var parsed = JSON.parse(source);
        if (!isPlainObject(parsed)) throw new Error('Struktur backup tidak valid.');
        if (parsed.app && parsed.app !== 'FinUp') throw new Error('File bukan backup FinUp.');
        if (!isPlainObject(parsed.data)) throw new Error('Format backup tidak lengkap.');
        var report = { accepted: 0, dropped: 0, droppedFields: 0, collections: {}, warnings: [] };
        var sanitized = {};
        var total = 0;
        Object.keys(COLLECTION_LIMITS).forEach(function (collection) {
            var values = Array.isArray(parsed.data[collection]) ? parsed.data[collection] : [];
            var limit = COLLECTION_LIMITS[collection];
            if (values.length > limit) report.warnings.push(collection + ' dibatasi menjadi ' + limit + ' record.');
            var localReport = { accepted: 0, dropped: 0, droppedFields: 0 };
            sanitized[collection] = values.slice(0, limit).map(function (item) { return sanitizeRecord(collection, item, localReport); }).filter(Boolean);
            report.accepted += localReport.accepted;
            report.dropped += localReport.dropped + Math.max(0, values.length - limit);
            report.droppedFields += localReport.droppedFields;
            report.collections[collection] = sanitized[collection].length;
            total += sanitized[collection].length;
        });
        if (total > MAX_TOTAL_RECORDS) throw new Error('Jumlah data backup melebihi batas aman 25.000 record.');
        if (!sanitized.accounts.length && !sanitized.transactions.length) throw new Error('Backup tidak memiliki akun atau transaksi yang valid.');
        var versionCode = Number(parsed.versionCode || 0);
        var currentVersionCode = typeof VERSION_CODE !== 'undefined' ? Number(VERSION_CODE) : 0;
        if (versionCode > currentVersionCode) report.warnings.push('Backup dibuat oleh versi FinUp yang lebih baru. Hanya field yang dikenali yang akan diimpor.');
        return {
            app: 'FinUp',
            version: cleanText(parsed.version || '-', 32),
            versionCode: versionCode,
            exportedAt: cleanTimestamp(parsed.exportedAt),
            data: sanitized,
            settings: sanitizeSettings(parsed.settings),
            report: report
        };
    }

    function collectionSummary(report) {
        var labels = {
            accounts: 'akun', categories: 'kategori', transactions: 'transaksi', budgets: 'anggaran',
            recurring: 'jadwal', goals: 'target', debts: 'utang/piutang', activities: 'aktivitas'
        };
        return Object.keys(report.collections).filter(function (key) { return report.collections[key] > 0; }).map(function (key) {
            return report.collections[key] + ' ' + labels[key];
        }).join(' · ') || 'Tidak ada record';
    }

    function automaticPreImportBackup() {
        var text = typeof backupJsonText === 'function' ? backupJsonText() : '';
        if (!text) return false;
        var stamp = typeof localDate === 'function' ? localDate() : new Date().toISOString().slice(0, 10);
        var filename = 'FinUp-backup-sebelum-impor-' + stamp + '.json';
        var saved = false;
        try {
            localStorage.setItem(uidKey('pre_import_backup'), text);
            saved = true;
        } catch (ignored) { }
        try {
            if (window.FinUpAndroid && typeof window.FinUpAndroid.exportJson === 'function') {
                window.FinUpAndroid.exportJson(filename, text);
                saved = true;
            } else if (typeof window.finupDownloadTextV232 === 'function') {
                window.finupDownloadTextV232(filename, 'application/json;charset=utf-8', text);
                saved = true;
            }
        } catch (ignored2) { }
        return saved;
    }

    var baseApplyImportedData = window.applyImportedData;

    window.processImportedJson = function (raw) {
        try {
            var validated = validateBackup(raw);
            pendingImport = { data: validated.data, settings: validated.settings, validation: validated.report };
            var warningHtml = validated.report.warnings.length
                ? '<div class="notice notice-info"><b>Catatan validasi</b><br>' + validated.report.warnings.map(function (item) { return esc(item); }).join('<br>') + '</div>'
                : '';
            $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div><h3>Impor Backup FinUp</h3>'
                + '<p class="desc">Backup versi ' + esc(validated.version || '-') + (validated.exportedAt ? ' dibuat ' + esc(shortDate(validated.exportedAt)) : '') + '.</p>'
                + '<div class="card"><b>Data valid</b><p class="tiny">' + esc(collectionSummary(validated.report)) + '</p><p class="tiny">' + validated.report.accepted + ' record diterima · ' + validated.report.dropped + ' record ditolak · ' + validated.report.droppedFields + ' field diabaikan.</p></div>'
                + warningHtml
                + '<div class="notice notice-info"><b>Gabungkan</b>: mempertahankan data saat ini dan memilih versi item yang paling baru.<br><b>Ganti seluruh data</b>: membuat backup otomatis, lalu mengganti data aktif dengan isi backup yang sudah divalidasi.</div>'
                + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal();pendingImport=null">Batal</button><button class="btn btn-outline" onclick="applyImportedData(\'merge\')">Gabungkan</button><button class="btn btn-danger" onclick="applyImportedData(\'replace\')">Backup & ganti data</button></div></div></div>';
            pushModalHistory();
        } catch (error) {
            toast(error && error.message ? error.message : 'File JSON tidak valid.', true);
        }
    };

    window.applyImportedData = function (mode) {
        if (!pendingImport) return;
        if (mode === 'replace' && !automaticPreImportBackup()) {
            if (!window.confirm('Backup otomatis tidak dapat dibuat. Tetap mengganti seluruh data?')) return;
        }
        return baseApplyImportedData.apply(this, arguments);
    };

    var baseInfoContentV232 = window.infoContent;
    window.infoContent = function (kind) {
        if (kind === 'about') {
            return '<div class="version-box"><img src="logo-mark.png"><h2>FinUp</h2><p>Atur uang, raih tujuan.</p><span class="badge badge-green">Versi ' + esc(APP_VERSION) + '</span><p>Version Code ' + esc(VERSION_CODE) + '</p></div>'
                + '<div class="legal"><h3>Yang baru di v2.3.9</h3><ul>'
                + '<li>Periode pratinjau dan file ekspor selalu mengikuti pilihan pengguna.</li>'
                + '<li>Mode periode dipertahankan pada penyimpanan lokal dan sinkronisasi.</li>'
                + '<li>Pratinjau A4 memisahkan isi dari footer dan membagi tabel ke halaman yang aman.</li>'
                + '<li>PDF Android mengulang header tabel pada halaman lanjutan.</li>'
                + '<li>Seluruh perbaikan keamanan dan ekspor sebelumnya tetap dipertahankan.</li>'
                + '</ul><h3>Teknologi lisensi</h3><p>Private key tidak disimpan di APK. Aplikasi hanya membawa public key untuk memverifikasi token FUP2.</p></div>';
        }
        return baseInfoContentV232.apply(this, arguments);
    };

    window.FinUpImportValidatorV232 = Object.freeze({
        validateBackup: validateBackup,
        maxBackupBytes: MAX_BACKUP_BYTES,
        maxTotalRecords: MAX_TOTAL_RECORDS
    });
})();
