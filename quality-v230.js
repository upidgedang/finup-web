/* FinUp v2.3.0 — accessibility, diagnostics, integrity checks, and large-list handling. */
(function () {
    'use strict';

    var TX_PAGE_SIZE = 200;
    var txVisibleLimit = TX_PAGE_SIZE;
    var originalRender = window.render;
    var originalUpdateTxFilter = window.updateTxFilter;
    var originalUseCurrentMonth = window.useCurrentMonthTxFilter;
    var originalClearTxFilters = window.clearTxFilters;
    var originalRenderMore = window.renderMore;
    var originalGoPage = window.goPage;

    function reportJs(message, detail) {
        try {
            if (window.FinUpAndroid && typeof window.FinUpAndroid.reportJsError === 'function') {
                window.FinUpAndroid.reportJsError(String(message || ''), String(detail || ''));
            }
        } catch (ignored) { }
    }

    function enhanceAccessibility(root) {
        var scope = root && root.querySelectorAll ? root : document;
        try {
            scope.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea)').forEach(function (node) {
                if (!node.hasAttribute('role')) node.setAttribute('role', 'button');
                if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
                if (node.dataset.keyboardBoundV230 === '1') return;
                node.dataset.keyboardBoundV230 = '1';
                node.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        node.click();
                    }
                });
            });
            scope.querySelectorAll('button').forEach(function (button) {
                if (!button.getAttribute('type')) button.setAttribute('type', 'button');
                if (!button.getAttribute('aria-label') && button.getAttribute('title')) {
                    button.setAttribute('aria-label', button.getAttribute('title'));
                }
            });
            var sync = document.getElementById('syncText');
            if (sync) {
                sync.setAttribute('role', 'status');
                sync.setAttribute('aria-live', 'polite');
                sync.setAttribute('aria-atomic', 'true');
            }
            var authMsg = document.getElementById('authMsg');
            if (authMsg) {
                authMsg.setAttribute('role', 'status');
                authMsg.setAttribute('aria-live', 'polite');
            }
        } catch (error) {
            reportJs('Peningkatan aksesibilitas gagal', error && error.stack || error);
        }
    }

    function transactionRowsHtml(list) {
        if (!list.length) return '<div class="card empty"><div class="emoji">🔎</div>Tidak ada transaksi yang cocok.</div>';
        var visible = list.slice(0, txVisibleLimit);
        var html = visible.map(txItem).join('');
        if (visible.length < list.length) {
            html += '<button type="button" class="btn btn-outline tx-load-more-v230" onclick="loadMoreTransactionsV230()">Tampilkan 200 transaksi berikutnya ('
                + visible.length + ' dari ' + list.length + ')</button>';
        }
        return html;
    }

    function idrFilterValue(value) {
        if (value === '' || value == null) return '';
        return typeof formatIdrInputV215 === 'function' ? formatIdrInputV215(value) : String(value);
    }

    // Render only the first transaction page from the start. This avoids
    // constructing thousands of transaction DOM nodes and then discarding them.
    window.renderTransactions = function () {
        if (typeof ensureRealtimeTxDateRange === 'function') ensureRealtimeTxDateRange(true);
        filterType = txFilters.type || 'all';
        var list = filteredTransactions();
        var todayValue = localDate();
        var minHandler = typeof updateTxFilterIdrV215 === 'function'
            ? "updateTxFilterIdrV215('min',this)" : "updateTxFilter('min',this.value)";
        var maxHandler = typeof updateTxFilterIdrV215 === 'function'
            ? "updateTxFilterIdrV215('max',this)" : "updateTxFilter('max',this.value)";
        var tabs = [['all', 'Semua'], ['income', 'Pemasukan'], ['expense', 'Pengeluaran'], ['transfer', 'Transfer']]
            .map(function (item) {
                var active = txFilters.type === item[0];
                return '<button type="button" data-tx-filter-type="' + item[0] + '" aria-pressed="' + (active ? 'true' : 'false')
                    + '" class="tab ' + (active ? 'active' : '') + '" onclick="updateTxFilter(\'type\',\'' + item[0] + '\')">' + item[1] + '</button>';
            }).join('');
        var accounts = data.accounts.map(function (account) {
            return '<option value="' + esc(account.id) + '" ' + (txFilters.account === account.id ? 'selected' : '') + '>' + esc(account.name) + '</option>';
        }).join('');
        var categories = data.categories.map(function (category) {
            return '<option value="' + esc(category.id) + '" ' + (txFilters.category === category.id ? 'selected' : '') + '>' + esc(category.name) + '</option>';
        }).join('');
        return '<div class="filter-box"><div class="row-between"><b>Filter transaksi</b><div>'
            + '<button class="text-btn" onclick="useCurrentMonthTxFilter()">Bulan ini</button>'
            + '<button class="text-btn" onclick="clearTxFilters()">Reset</button></div></div>'
            + '<input id="txSearch" class="input" value="' + esc(txFilters.search || '') + '" placeholder="Cari catatan, referensi, kategori, atau akun..." oninput="updateTxFilter(\'search\',this.value)">'
            + '<div class="tabs" style="margin-top:10px">' + tabs + '</div>'
            + '<details class="advanced-filter" open><summary>Filter lanjutan</summary><div class="filter-grid">'
            + '<div class="field"><label>Dari tanggal</label><input id="txFilterFrom" class="input" type="date" max="' + todayValue + '" value="' + esc(txFilters.from || '') + '" onchange="updateTxFilter(\'from\',this.value)"></div>'
            + '<div class="field"><label>Sampai tanggal</label><input id="txFilterTo" class="input" type="date" max="' + todayValue + '" value="' + esc(txFilters.to || '') + '" onchange="updateTxFilter(\'to\',this.value)"></div>'
            + '<div class="field"><label>Akun</label><select class="input" onchange="updateTxFilter(\'account\',this.value)"><option value="">Semua akun</option>' + accounts + '</select></div>'
            + '<div class="field"><label>Kategori</label><select class="input" onchange="updateTxFilter(\'category\',this.value)"><option value="">Semua kategori</option>' + categories + '</select></div>'
            + '<div class="field"><label>Nominal minimum (IDR)</label><input id="txFilterMin" class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="Rp 0" value="' + esc(idrFilterValue(txFilters.min)) + '" oninput="' + minHandler + '"></div>'
            + '<div class="field"><label>Nominal maksimum (IDR)</label><input id="txFilterMax" class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="Rp 0" value="' + esc(idrFilterValue(txFilters.max)) + '" oninput="' + maxHandler + '"></div>'
            + '</div><div class="tiny">Otomatis: tanggal 1 bulan berjalan sampai hari ini. Mengubah tanggal akan memakai periode khusus.</div></details>'
            + '<div id="txFilterCount" class="tiny">' + list.length + ' transaksi ditemukan' + (list.length > txVisibleLimit ? ' · menampilkan ' + txVisibleLimit + ' pertama' : '') + '.</div></div>'
            + '<div id="transactionList" class="list">' + transactionRowsHtml(list) + '</div>';
    };

    function refreshTransactionListV230() {
        var box = document.getElementById('transactionList');
        if (!box || typeof filteredTransactions !== 'function') return;
        var list = filteredTransactions();
        box.innerHTML = transactionRowsHtml(list);
        if (typeof updateTxFilterUi === 'function') updateTxFilterUi(list);
        var count = document.getElementById('txFilterCount');
        if (count && list.length > txVisibleLimit) {
            count.textContent = list.length + ' transaksi ditemukan · menampilkan ' + txVisibleLimit + ' pertama.';
        }
        if (typeof applyPrivacy === 'function') applyPrivacy();
        enhanceAccessibility(box);
    }

    window.loadMoreTransactionsV230 = function () {
        txVisibleLimit += TX_PAGE_SIZE;
        refreshTransactionListV230();
    };

    window.refreshTransactionList = refreshTransactionListV230;

    if (typeof originalUpdateTxFilter === 'function') {
        window.updateTxFilter = function (key, value) {
            txVisibleLimit = TX_PAGE_SIZE;
            return originalUpdateTxFilter(key, value);
        };
    }
    if (typeof originalUseCurrentMonth === 'function') {
        window.useCurrentMonthTxFilter = function () {
            txVisibleLimit = TX_PAGE_SIZE;
            return originalUseCurrentMonth();
        };
    }
    if (typeof originalClearTxFilters === 'function') {
        window.clearTxFilters = function () {
            txVisibleLimit = TX_PAGE_SIZE;
            return originalClearTxFilters();
        };
    }

    if (typeof originalGoPage === 'function') {
        window.goPage = function (targetPage) {
            if (targetPage === 'transactions') txVisibleLimit = TX_PAGE_SIZE;
            return originalGoPage.apply(this, arguments);
        };
    }

    function auditDataIntegrity() {
        var result = { checkedAt: new Date().toISOString(), errors: [], warnings: [], counts: {} };
        var collections = ['accounts', 'categories', 'transactions', 'budgets', 'recurring', 'goals', 'debts', 'activities'];
        var source = window.data || {};
        var ids = {};

        collections.forEach(function (name) {
            var list = Array.isArray(source[name]) ? source[name] : [];
            result.counts[name] = list.length;
            var seen = Object.create(null);
            list.forEach(function (item, index) {
                var id = item && String(item.id || '');
                if (!id) result.errors.push(name + '[' + index + '] tidak memiliki ID.');
                else if (seen[id]) result.errors.push('ID duplikat pada ' + name + ': ' + id);
                else seen[id] = true;
            });
            ids[name] = seen;
        });

        (source.accounts || []).forEach(function (account) {
            var opening = Number(account.initialBalance != null ? account.initialBalance : account.openingBalance != null ? account.openingBalance : account.saldoAwal || 0);
            if (!Number.isFinite(opening)) result.errors.push('Saldo awal akun ' + String(account.id || '') + ' bukan angka.');
        });

        (source.transactions || []).forEach(function (tx) {
            var amount = Number(tx.amount);
            if (!(amount > 0) || !Number.isFinite(amount)) result.errors.push('Nominal transaksi ' + String(tx.id || '') + ' tidak valid.');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tx.date || ''))) result.errors.push('Tanggal transaksi ' + String(tx.id || '') + ' tidak valid.');
            if (tx.type === 'transfer') {
                if (!ids.accounts[tx.fromAccountId]) result.warnings.push('Akun asal transfer tidak ditemukan: ' + String(tx.id || ''));
                if (!ids.accounts[tx.toAccountId]) result.warnings.push('Akun tujuan transfer tidak ditemukan: ' + String(tx.id || ''));
                if (tx.fromAccountId === tx.toAccountId) result.errors.push('Transfer memakai akun yang sama: ' + String(tx.id || ''));
            } else {
                if (!ids.accounts[tx.accountId]) result.warnings.push('Akun transaksi tidak ditemukan: ' + String(tx.id || ''));
                if (tx.categoryId && !ids.categories[tx.categoryId]) result.warnings.push('Kategori transaksi tidak ditemukan: ' + String(tx.id || ''));
            }
        });
        return result;
    }

    window.runIntegrityAuditV230 = auditDataIntegrity;

    function getNativeJson(method, fallback) {
        try {
            if (!window.FinUpAndroid || typeof window.FinUpAndroid[method] !== 'function') return fallback;
            return JSON.parse(window.FinUpAndroid[method]() || JSON.stringify(fallback));
        } catch (error) {
            return fallback;
        }
    }

    function diagnosticsHtml() {
        var integrity = auditDataIntegrity();
        var runtime = getNativeJson('getRuntimeInfo', {});
        var events = getNativeJson('getDiagnostics', []);
        var summaryClass = integrity.errors.length ? 'notice-error' : integrity.warnings.length ? 'notice-info' : 'notice-ok';
        var eventHtml = events.length ? events.slice().reverse().map(function (event) {
            return '<div class="list-item"><div class="list-text"><b>' + esc(event.type || 'diagnostic') + '</b><small>'
                + esc(new Date(Number(event.at || 0)).toLocaleString('id-ID')) + ' · ' + esc(event.message || '')
                + (event.detail ? '<br>' + esc(event.detail) : '') + '</small></div></div>';
        }).join('') : '<div class="card empty">Belum ada catatan diagnostik.</div>';
        return '<div class="modal-wrap"><div class="modal"><h3>Diagnostik & Kesehatan Data</h3>'
            + '<div class="notice ' + summaryClass + '"><b>' + (integrity.errors.length ? 'Ditemukan masalah data' : integrity.warnings.length ? 'Ada peringatan data' : 'Pemeriksaan data berhasil') + '</b><br>'
            + integrity.errors.length + ' error · ' + integrity.warnings.length + ' peringatan.</div>'
            + '<div class="card"><b>Runtime</b><p class="tiny">FinUp ' + esc(runtime.appVersion || APP_VERSION) + ' · Android ' + esc(runtime.android || '-') + ' · SDK ' + esc(runtime.sdk || '-') + '</p>'
            + '<p class="tiny">Sesi terenkripsi: ' + (window.__finupSecureSessionV230 ? 'aktif' : 'tidak tersedia') + ' · Real-time: ' + (window.FinUpRealtimeV230 ? 'aktif' : 'memeriksa') + '</p></div>'
            + (integrity.errors.length || integrity.warnings.length ? '<section class="section"><h3>Temuan integritas</h3><div class="legal"><ul>'
                + integrity.errors.concat(integrity.warnings).slice(0, 100).map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('') + '</ul></div></section>' : '')
            + '<section class="section"><div class="row-between"><h3>Catatan lokal</h3><button class="text-btn" onclick="clearDiagnosticsV230()">Hapus catatan</button></div><div class="list">' + eventHtml + '</div></section>'
            + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Tutup</button></div></div></div>';
    }

    window.openDiagnosticsV230 = function () {
        var root = document.getElementById('modalRoot');
        if (!root) return;
        root.innerHTML = diagnosticsHtml();
        if (typeof pushModalHistory === 'function') pushModalHistory();
        enhanceAccessibility(root);
    };

    window.clearDiagnosticsV230 = function () {
        try {
            if (window.FinUpAndroid && typeof window.FinUpAndroid.clearDiagnostics === 'function') window.FinUpAndroid.clearDiagnostics();
        } catch (ignored) { }
        var root = document.getElementById('modalRoot');
        if (root) {
            root.innerHTML = diagnosticsHtml();
            enhanceAccessibility(root);
        }
    };

    if (typeof originalRenderMore === 'function') {
        window.renderMore = function () {
            var html = originalRenderMore();
            var card = '<button class="menu-card" onclick="openDiagnosticsV230()"><i>🩺</i><b>Diagnostik Aplikasi</b><small>Periksa kesehatan data, runtime, dan error lokal tanpa mengirim data ke server.</small></button>';
            return html.replace('</div>', card + '</div>');
        };
    }

    if (typeof originalRender === 'function') {
        window.render = function () {
            var result = originalRender.apply(this, arguments);
            setTimeout(function () {
                if (window.page === 'transactions' || (typeof page !== 'undefined' && page === 'transactions')) refreshTransactionListV230();
                enhanceAccessibility(document);
            }, 0);
            return result;
        };
    }

    window.finUpOnPause = (function (previous) {
        return function () {
            try {
                if (typeof persist === 'function') persist();
                if (typeof syncNow === 'function' && navigator.onLine) syncNow(false);
            } catch (error) {
                reportJs('Penyimpanan saat aplikasi dijeda gagal', error && error.stack || error);
            }
            if (typeof previous === 'function') return previous.apply(this, arguments);
        };
    })(window.finUpOnPause);

    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node && node.nodeType === 1) enhanceAccessibility(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    enhanceAccessibility(document);
    window.__finupQualityV230 = true;
})();
