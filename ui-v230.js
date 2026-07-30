/*
 * FinUp v2.3.0 — UI, navigation, opening balance, and hybrid sync release notes.
 */
(function () {
    'use strict';

    function finiteNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (value === null || value === undefined || value === '') return 0;
        var text = String(value).trim();
        if (!text) return 0;
        var negative = text.indexOf('-') >= 0;
        var digits = text.replace(/[^0-9]/g, '');
        if (!digits) return 0;
        var parsed = Number(digits);
        if (!Number.isFinite(parsed)) return 0;
        return negative ? -parsed : parsed;
    }

    function openingBalance(account) {
        if (!account) return 0;
        if (account.initialBalance !== undefined && account.initialBalance !== null) {
            return finiteNumber(account.initialBalance);
        }
        // Compatibility with possible legacy/imported field names.
        if (account.openingBalance !== undefined && account.openingBalance !== null) {
            return finiteNumber(account.openingBalance);
        }
        if (account.saldoAwal !== undefined && account.saldoAwal !== null) {
            return finiteNumber(account.saldoAwal);
        }
        return 0;
    }

    function transactionAmount(transaction) {
        return finiteNumber(transaction && transaction.amount);
    }

    function calculateAccountBalance(id) {
        var accountId = String(id || '');
        var account = Array.isArray(data && data.accounts)
            ? data.accounts.find(function (item) { return item && String(item.id) === accountId; })
            : null;
        var balance = openingBalance(account);
        var transactions = Array.isArray(data && data.transactions) ? data.transactions : [];

        transactions.forEach(function (transaction) {
            if (!transaction || transaction.deleted === true || transaction._deleted === true) return;
            var amount = transactionAmount(transaction);
            if (transaction.type === 'income' && String(transaction.accountId || '') === accountId) {
                balance += amount;
            } else if (transaction.type === 'expense' && String(transaction.accountId || '') === accountId) {
                balance -= amount;
            } else if (transaction.type === 'transfer') {
                if (String(transaction.fromAccountId || '') === accountId) balance -= amount;
                if (String(transaction.toAccountId || '') === accountId) balance += amount;
            }
        });
        return balance;
    }

    function normalizeOpeningBalances(queueChanges) {
        if (!data || !Array.isArray(data.accounts)) return false;
        var changed = false;
        data.accounts.forEach(function (account) {
            if (!account) return;
            var normalized = openingBalance(account);
            var needsChange = typeof account.initialBalance !== 'number'
                || !Number.isFinite(account.initialBalance)
                || account.initialBalance !== normalized;
            if (!needsChange) return;
            account.initialBalance = normalized;
            delete account.openingBalance;
            delete account.saldoAwal;
            account.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
            changed = true;
            if (queueChanges && typeof queueSet === 'function' && account.id) {
                queueSet('accounts', account);
            }
        });
        if (changed && typeof persist === 'function') persist();
        return changed;
    }

    accountBalance = calculateAccountBalance;
    totalBalance = function () {
        var accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
        return accounts.reduce(function (sum, account) {
            return sum + calculateAccountBalance(account && account.id);
        }, 0);
    };

    saveAccount = function () {
        var idNode = $('accId');
        var nameNode = $('accName');
        var initialNode = $('accInitial');
        var name = nameNode ? nameNode.value.trim() : '';
        if (!name) {
            toast('Nama akun wajib diisi.', true);
            return;
        }

        var id = idNode && idNode.value ? idNode.value : rid();
        var old = Array.isArray(data.accounts)
            ? data.accounts.find(function (item) { return item && item.id === id; })
            : null;
        var initialBalance = finiteNumber(initialNode ? initialNode.value : 0);
        var orderNode = $('accOrder');
        var activeNode = $('accActive');
        var account = {
            id: id,
            name: name,
            icon: ($('accIcon') && $('accIcon').value) || '💳',
            type: ($('accType') && $('accType').value) || 'cash',
            initialBalance: initialBalance,
            active: activeNode ? activeNode.checked : true,
            order: orderNode ? (Number(orderNode.value) || 0) : 0,
            isDefault: !!(old && old.isDefault),
            createdAt: (old && old.createdAt) || nowIso(),
            updatedAt: nowIso()
        };

        saveEntity('accounts', account);
        if (typeof recordActivity === 'function') {
            recordActivity(old ? 'account_edit' : 'account_add', old
                ? 'Akun keuangan diperbarui.'
                : 'Akun keuangan ditambahkan.', {
                accountId: id,
                initialBalance: initialBalance
            });
        }
        closeModal();
        toast((old ? 'Akun diperbarui' : 'Akun ditambahkan') + ' · saldo awal ' + rupiah(initialBalance));
    };

    openAccountsPage = function () {
        normalizeOpeningBalances(false);
        var accounts = Array.isArray(data.accounts) ? data.accounts.slice() : [];
        accounts.sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
        var rows = accounts.map(function (account) {
            var initial = openingBalance(account);
            var current = calculateAccountBalance(account.id);
            return '<div class="list-item ' + (account.active === false ? 'inactive-item' : '') + '" onclick="openAccountModal(\'' + esc(account.id) + '\')">'
                + '<div class="list-main"><div class="list-icon">' + esc(account.icon || '💳') + '</div>'
                + '<div class="list-text"><b>' + esc(account.name) + '</b>'
                + '<small>' + esc(account.type || 'cash') + ' · Saldo awal <span class="money privacy-value">' + rupiah(initial) + '</span>'
                + (account.active === false ? ' · nonaktif' : '') + '</small></div></div>'
                + '<b class="money privacy-value">' + rupiah(current) + '</b></div>';
        }).join('');

        $('modalRoot').innerHTML = '<div class="modal-wrap"><div class="modal"><div class="modal-handle"></div>'
            + '<div class="row-between"><h3>Akun Keuangan</h3><button class="btn btn-secondary btn-small" onclick="openAccountModal()">+ Tambah</button></div>'
            + '<div class="notice notice-info"><b>Saldo saat ini</b> dihitung dari saldo awal + pemasukan − pengeluaran ± transfer.</div>'
            + '<div class="list">' + (rows || '<div class="empty">Belum ada akun keuangan.</div>') + '</div>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
        pushModalHistory();
        applyPrivacy();
    };

    var enterAppV223Base = enterApp;
    enterApp = async function () {
        var result = await enterAppV223Base.apply(this, arguments);
        normalizeOpeningBalances(true);
        if (typeof render === 'function') render();
        return result;
    };

    var infoContentV223Base = infoContent;
    infoContent = function (kind) {
        if (kind === 'about') {
            return '<div class="version-box"><img src="logo-mark.png"><h2>FinUp</h2><p>Atur uang, raih tujuan.</p>'
                + '<span class="badge badge-green">Versi ' + APP_VERSION + '</span><p>Version Code ' + VERSION_CODE + '</p></div>'
                + '<div class="legal"><h3>Yang baru di v2.3.1</h3><ul>'
                + '<li>Layar pembuka memeriksa sesi terlebih dahulu sehingga form login tidak berkedip saat akun masih aktif.</li>'
                + '<li>Tombol Enter/Done pada kolom kata sandi kini menjalankan proses login.</li>'
                + '<li>Seluruh halaman dan subhalaman di menu Lainnya kini memiliki jarak aman dari status bar.</li>'
                + '<li>Setelah menyimpan formulir, aplikasi kembali ke modul induk yang benar.</li>'
                + '<li>Saldo awal akun disimpan sebagai angka, ditampilkan pada daftar akun, dan dihitung ke saldo saat ini.</li>'
                + '<li>Data saldo awal lama atau hasil impor dinormalisasi otomatis.</li>'
                + '<li>Konflik palsu dari pantulan perangkat sendiri dan isi data identik diabaikan otomatis.</li>'
                + '<li>Perubahan pada kolom berbeda digabung otomatis; konflik hanya dicatat bila kolom yang sama benar-benar berbeda.</li>'
                + '<li>Realtime Database dipakai sebagai sinyal cepat antarperangkat, sementara data utama tetap di Firestore.</li>'
                + '<li>Konfigurasi akun seperti tema, ukuran teks, privasi nominal, periode dashboard, laporan, pengingat, dan auto-lock tersinkron antarperangkat.</li>'
                + '<li>PIN, biometrik, izin Android, token perangkat, cache, dan antrean offline tetap khusus pada masing-masing HP.</li>'
                + '</ul><h3>Pengembang</h3><p><b>' + FINUP_DEVELOPER_V213 + '</b><br>' + FINUP_SUPPORT_EMAIL_V213 + '</p></div>';
        }
        return infoContentV223Base(kind);
    };

    // In real-time mode the custom init previously skipped this installer.
    // Calling it here makes every nested feature page preserve its parent page.
    if (typeof installFullScreenNavigation === 'function') {
        installFullScreenNavigation();
    }

    window.FinUpUiV230 = {
        finiteNumber: finiteNumber,
        openingBalance: openingBalance,
        accountBalance: calculateAccountBalance,
        normalizeOpeningBalances: normalizeOpeningBalances
    };
    window.FinUpUiV223 = window.FinUpUiV230;
    window.FinUpUiV222 = window.FinUpUiV230;
})();
