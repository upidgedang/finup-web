/* FinUp v2.3.9 - exact PDF preview generated from the same drawing operations as export. */
(function () {
    'use strict';
    if (window.__finupReportPeriodV234) return;
    window.__finupReportPeriodV234 = true;

    var PRESETS = [
        ['today', 'Hari ini'],
        ['yesterday', 'Kemarin'],
        ['last7', '7 hari terakhir'],
        ['monthToDate', 'Bulan ini'],
        ['previousMonth', 'Bulan lalu'],
        ['last30', '30 hari terakhir'],
        ['yearToDate', 'Tahun berjalan (YTD)'],
        ['previousYear', 'Tahun lalu'],
        ['custom', 'Rentang khusus']
    ];
    var presetKeys = PRESETS.map(function (item) { return item[0]; });
    var lastRealtimeDay = '';
    var activePreviewReportV235 = null;
    var activePreviewPdfV237 = null;

    function pad2(value) { return String(value).padStart(2, '0'); }
    function localIso(date) {
        date = date instanceof Date ? date : new Date();
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }
    function dateAt(year, month, day) { return new Date(year, month, day, 12, 0, 0, 0); }
    function addDays(date, amount) {
        return dateAt(date.getFullYear(), date.getMonth(), date.getDate() + amount);
    }
    function periodRange(mode, now) {
        now = now instanceof Date ? now : new Date();
        var today = dateAt(now.getFullYear(), now.getMonth(), now.getDate());
        var y = today.getFullYear(), m = today.getMonth();
        if (mode === 'today') return { from: localIso(today), to: localIso(today) };
        if (mode === 'yesterday') {
            var yesterday = addDays(today, -1);
            return { from: localIso(yesterday), to: localIso(yesterday) };
        }
        if (mode === 'last7') return { from: localIso(addDays(today, -6)), to: localIso(today) };
        if (mode === 'previousMonth') return { from: localIso(dateAt(y, m - 1, 1)), to: localIso(dateAt(y, m, 0)) };
        if (mode === 'last30') return { from: localIso(addDays(today, -29)), to: localIso(today) };
        if (mode === 'yearToDate') return { from: localIso(dateAt(y, 0, 1)), to: localIso(today) };
        if (mode === 'previousYear') return { from: localIso(dateAt(y - 1, 0, 1)), to: localIso(dateAt(y - 1, 11, 31)) };
        return { from: localIso(dateAt(y, m, 1)), to: localIso(today) };
    }
    function validIso(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
    function inferPresetMode(filter, defaultMode) {
        if (presetKeys.indexOf(filter && filter.dateMode) >= 0) return filter.dateMode;
        if (!filter || !validIso(filter.from) || !validIso(filter.to)) return defaultMode;
        var matched = presetKeys.filter(function (mode) { return mode !== 'custom'; }).find(function (mode) {
            var range = periodRange(mode);
            return range.from === filter.from && range.to === filter.to;
        });
        return matched || 'custom';
    }
    function normalizeFilter(filter, defaultMode) {
        filter = filter || {};
        var mode = inferPresetMode(filter, defaultMode);
        filter.dateMode = mode;
        if (mode === 'custom') {
            if (!validIso(filter.from) || !validIso(filter.to)) {
                var fallback = periodRange(defaultMode);
                filter.from = fallback.from;
                filter.to = fallback.to;
                filter.dateMode = defaultMode;
            } else if (filter.from > filter.to) {
                var swap = filter.from;
                filter.from = filter.to;
                filter.to = swap;
            }
        } else {
            var range = periodRange(mode);
            filter.from = range.from;
            filter.to = range.to;
        }
        return filter;
    }
    function presetLabel(mode) {
        var found = PRESETS.find(function (item) { return item[0] === mode; });
        return found ? found[1] : 'Bulan ini';
    }
    function formatPeriod(from, to) {
        var fromText = typeof shortDate === 'function' ? shortDate(from) : from;
        var toText = typeof shortDate === 'function' ? shortDate(to) : to;
        return from === to ? fromText : fromText + ' - ' + toText;
    }
    function selectOptions(selected) {
        return PRESETS.map(function (item) {
            return '<option value="' + item[0] + '" ' + (selected === item[0] ? 'selected' : '') + '>' + item[1] + '</option>';
        }).join('');
    }
    function saveFilter(key, value) {
        try { if (typeof saveJson === 'function' && typeof uidKey === 'function') saveJson(uidKey(key), value); } catch (ignored) { }
    }
    function scheduleSettingsSyncV235() {
        try {
            if (window.FinUpSettingsSyncV230 && typeof window.FinUpSettingsSyncV230.schedule === 'function') {
                window.FinUpSettingsSyncV230.schedule(false);
            }
        } catch (ignored) { }
    }

    window.finupPeriodRangeV234 = periodRange;
    window.finupPeriodPresetsV234 = PRESETS.slice();

    window.ensureRealtimeTxDateRange = function (save) {
        normalizeFilter(txFilters, 'monthToDate');
        if (save) saveFilter('tx_filters', txFilters);
        return txFilters;
    };
    window.ensureRealtimeReportDateRangeV234 = function (save) {
        normalizeFilter(reportFilters, 'monthToDate');
        if (save) saveFilter('report_filters', reportFilters);
        return reportFilters;
    };

    var originalLoadV2Settings = window.loadV2Settings;
    if (typeof originalLoadV2Settings === 'function') {
        window.loadV2Settings = function () {
            originalLoadV2Settings.apply(this, arguments);
            normalizeFilter(txFilters, 'monthToDate');
            normalizeFilter(reportFilters, 'monthToDate');
            saveFilter('tx_filters', txFilters);
            saveFilter('report_filters', reportFilters);
        };
    }

    window.setTxPeriodPresetV234 = function (mode) {
        txFilters.dateMode = presetKeys.indexOf(mode) >= 0 ? mode : 'monthToDate';
        normalizeFilter(txFilters, 'monthToDate');
        saveFilter('tx_filters', txFilters);
        scheduleSettingsSyncV235();
        if (typeof render === 'function') render();
    };
    window.setReportPeriodPresetV234 = function (mode) {
        reportFilters.dateMode = presetKeys.indexOf(mode) >= 0 ? mode : 'monthToDate';
        normalizeFilter(reportFilters, 'monthToDate');
        saveFilter('report_filters', reportFilters);
        scheduleSettingsSyncV235();
        if (typeof render === 'function') render();
    };

    var originalUpdateTxFilter = window.updateTxFilter;
    if (typeof originalUpdateTxFilter === 'function') {
        window.updateTxFilter = function (key, value) {
            if (key === 'from' || key === 'to') txFilters.dateMode = 'custom';
            return originalUpdateTxFilter.apply(this, arguments);
        };
    }
    window.setReportFilter = function (key, value) {
        reportFilters[key] = value;
        if (key === 'from' || key === 'to') reportFilters.dateMode = 'custom';
        normalizeFilter(reportFilters, 'monthToDate');
        saveFilter('report_filters', reportFilters);
        scheduleSettingsSyncV235();
        if (typeof render === 'function') render();
    };

    function periodHeader(scope, filter) {
        var onChange = scope === 'tx' ? 'setTxPeriodPresetV234(this.value)' : 'setReportPeriodPresetV234(this.value)';
        return '<div class="finup-period-control">'
            + '<div class="field finup-period-select"><label>Periode</label><select class="input" onchange="' + onChange + '">' + selectOptions(filter.dateMode) + '</select></div>'
            + '<div class="finup-period-summary"><small>' + presetLabel(filter.dateMode) + '</small><strong>' + formatPeriod(filter.from, filter.to) + '</strong></div>'
            + '</div>';
    }

    var originalRenderTransactions = window.renderTransactions;
    if (typeof originalRenderTransactions === 'function') {
        window.renderTransactions = function () {
            normalizeFilter(txFilters, 'monthToDate');
            var output = String(originalRenderTransactions.apply(this, arguments));
            output = output.replace(/<div class="row-between"><b>Filter transaksi<\/b><div>.*?<\/div><\/div>/,
                '<div class="row-between"><b>Filter transaksi</b><button class="text-btn" onclick="clearTxFilters()">Reset</button></div>' + periodHeader('tx', txFilters));
            var disabled = txFilters.dateMode === 'custom' ? '' : ' disabled aria-disabled="true"';
            output = output.replace('id="txFilterFrom" class="input" type="date"', 'id="txFilterFrom" class="input" type="date"' + disabled);
            output = output.replace('id="txFilterTo" class="input" type="date"', 'id="txFilterTo" class="input" type="date"' + disabled);
            output = output.replace('Otomatis: tanggal 1 bulan berjalan sampai hari ini. Mengubah tanggal akan memakai periode khusus.',
                txFilters.dateMode === 'custom' ? 'Rentang khusus aktif. Tanggal awal dan akhir dapat diubah.' : 'Rentang diperbarui otomatis mengikuti tanggal perangkat. Pilih Rentang khusus untuk mengubah tanggal manual.');
            return output;
        };
    }

    window.renderReports = function () {
        normalizeFilter(reportFilters, 'monthToDate');
        var tot = totalsBetween(reportFilters.from, reportFilters.to), list = reportTransactions();
        var customFields = reportFilters.dateMode === 'custom'
            ? '<div class="filter-grid finup-custom-period"><div class="field"><label>Dari tanggal</label><input class="input" type="date" value="' + reportFilters.from + '" onchange="setReportFilter(\'from\',this.value)"></div><div class="field"><label>Sampai tanggal</label><input class="input" type="date" value="' + reportFilters.to + '" onchange="setReportFilter(\'to\',this.value)"></div></div>'
            : '';
        return '<div class="filter-box"><div class="row-between"><b>Periode laporan</b><span class="badge badge-blue">' + list.length + ' transaksi</span></div>'
            + periodHeader('report', reportFilters) + customFields
            + '<div class="tiny">Default Bulan ini: tanggal 1 bulan berjalan sampai hari ini dan diperbarui otomatis.</div>'
            + '<div class="row report-actions"><button class="btn btn-secondary" onclick="exportCsvReport()">Pratinjau CSV / Excel</button><button class="btn btn-primary" onclick="exportPdfReport()">Pratinjau PDF A4</button></div></div>'
            + '<div class="grid-2"><button class="metric card green metric-button" onclick="txFilters={...txFilters,type:\'income\',from:reportFilters.from,to:reportFilters.to,dateMode:\'custom\'};saveJson(uidKey(\'tx_filters\'),txFilters);goPage(\'transactions\')"><small>Pemasukan</small><strong class="money privacy-value">' + rupiah(tot.income) + '</strong></button>'
            + '<button class="metric card red metric-button" onclick="txFilters={...txFilters,type:\'expense\',from:reportFilters.from,to:reportFilters.to,dateMode:\'custom\'};saveJson(uidKey(\'tx_filters\'),txFilters);goPage(\'transactions\')"><small>Pengeluaran</small><strong class="money privacy-value">' + rupiah(tot.expense) + '</strong></button></div>'
            + '<section class="section"><div class="metric card ' + (tot.income - tot.expense >= 0 ? 'green' : 'red') + '"><small>Arus kas bersih</small><strong class="money privacy-value">' + rupiah(tot.income - tot.expense) + '</strong></div></section>'
            + renderTrendCard(true) + '<section class="section">' + renderCategoryCardForRange(reportFilters.from, reportFilters.to) + '</section>';
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
        });
    }
    function cloneFilter(filter) {
        return {
            dateMode: String(filter && filter.dateMode || ''),
            from: String(filter && filter.from || ''),
            to: String(filter && filter.to || '')
        };
    }
    function selectedReportFilterV235() {
        var snapshot = cloneFilter(reportFilters);
        normalizeFilter(snapshot, 'monthToDate');
        return snapshot;
    }
    function reportData(filterSnapshot) {
        if (!window.FinUpReportV233 || typeof window.FinUpReportV233.buildReportData !== 'function') throw new Error('Mesin laporan belum siap.');
        var snapshot = cloneFilter(filterSnapshot || selectedReportFilterV235());
        normalizeFilter(snapshot, 'monthToDate');
        return window.FinUpReportV233.buildReportData(snapshot);
    }
    function pdfColorCssV237(value) {
        var parts = String(value || '').trim().split(/\s+/).map(Number);
        if (parts.length !== 3 || parts.some(function (item) { return !isFinite(item); })) return 'transparent';
        return 'rgb(' + parts.map(function (item) { return Math.max(0, Math.min(255, Math.round(item * 255))); }).join(',') + ')';
    }
    function previewOpSvgV237(op) {
        if (!op || !op.type) return '';
        if (op.type === 'rect') {
            return '<rect x="' + op.x + '" y="' + op.top + '" width="' + op.width + '" height="' + op.height + '" fill="' + (op.fill ? pdfColorCssV237(op.fill) : 'none') + '" stroke="' + (op.stroke ? pdfColorCssV237(op.stroke) : 'none') + '" stroke-width="0.6"/>';
        }
        if (op.type === 'line') {
            return '<line x1="' + op.x1 + '" y1="' + op.top1 + '" x2="' + op.x2 + '" y2="' + op.top2 + '" stroke="' + pdfColorCssV237(op.stroke) + '" stroke-width="' + op.width + '"/>';
        }
        if (op.type === 'text') {
            return '<text x="' + op.x + '" y="' + (Number(op.top) + Number(op.size)) + '" font-family="Arial,Helvetica,sans-serif" font-size="' + op.size + '" font-weight="' + (op.bold ? '700' : '400') + '" fill="' + pdfColorCssV237(op.color) + '">' + escapeHtml(op.value) + '</text>';
        }
        return '';
    }
    function previewPackageV237(report) {
        var engine = window.FinUpReportV233;
        if (!engine || typeof engine.buildPdfPreviewPackage !== 'function') throw new Error('Mesin pratinjau PDF belum siap.');
        return engine.buildPdfPreviewPackage(report);
    }
    function previewPagesFromPackageV237(pkg) {
        var pages = pkg && Array.isArray(pkg.pages) ? pkg.pages : [];
        return pages.map(function (ops, index) {
            return '<div class="finup-a4-sheet"><article class="finup-a4-page"><svg class="finup-pdf-svg" viewBox="0 0 ' + pkg.pageWidth + ' ' + pkg.pageHeight + '" role="img" aria-label="Pratinjau PDF halaman ' + (index + 1) + ' dari ' + pages.length + '">' + ops.map(previewOpSvgV237).join('') + '</svg></article></div>';
        }).join('');
    }
    function buildPreviewPages(report) {
        return previewPagesFromPackageV237(previewPackageV237(report));
    }
    function fitA4PreviewV235(root) {
        root = root || document;
        var host = root.querySelector ? root.querySelector('.finup-a4-preview') : null;
        if (!host) return;
        var available = Math.max(240, host.clientWidth - 12);
        root.querySelectorAll('.finup-a4-sheet').forEach(function (sheet) {
            var page = sheet.querySelector('.finup-a4-page');
            if (!page) return;
            var scale = Math.min(1, available / 595);
            sheet.style.width = Math.round(595 * scale) + 'px';
            sheet.style.height = Math.round(842 * scale) + 'px';
            page.style.transform = 'scale(' + scale + ')';
        });
    }
    function buildPrintableHtmlV234(report) {
        var pkg = previewPackageV237(report);
        return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FinUp - Laporan A4</title><style>'
            + '@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#d9dee2}.pages{padding:0}.finup-a4-sheet{width:210mm;height:297mm;margin:0;break-after:page;page-break-after:always}.finup-a4-sheet:last-child{break-after:auto;page-break-after:auto}.finup-a4-page{width:210mm;height:297mm;background:#fff;overflow:hidden}.finup-pdf-svg{display:block;width:100%;height:100%}@media print{body{background:#fff}}</style></head><body><main class="pages">'
            + previewPagesFromPackageV237(pkg) + '</main></body></html>';
    }
    function downloadPdfV237(filename, pdf) {
        if (!window.URL || typeof Blob === 'undefined' || !document || !document.createElement) throw new Error('Fitur unduh PDF tidak tersedia.');
        var bytes = new Uint8Array(pdf.length);
        for (var index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 255;
        var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        var anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }

    function openPreview(format) {
        var filterSnapshot = selectedReportFilterV235();
        var report = reportData(filterSnapshot);
        activePreviewReportV235 = report;
        if (!$('modalRoot')) throw new Error('Wadah pratinjau tidak tersedia.');
        if (format === 'csv') {
            var previewRows = report.transactions.slice(0, 50).map(function (item) {
                return '<tr><td>' + item.number + '</td><td>' + escapeHtml(item.dateFormatted) + '</td><td>' + escapeHtml(item.typeLabel) + '</td><td>' + escapeHtml(item.category) + '</td><td>' + escapeHtml(item.sourceAccount) + '</td><td class="num">' + escapeHtml(item.amountFormatted) + '</td></tr>';
            }).join('') || '<tr><td colspan="6" class="empty">Belum ada transaksi.</td></tr>';
            $('modalRoot').innerHTML = '<div class="modal-wrap finup-export-modal"><div class="modal finup-export-dialog"><div class="modal-handle"></div><div class="row-between"><div><h3>Pratinjau CSV / Excel</h3><p class="desc">' + escapeHtml(formatPeriod(report.period.from, report.period.to)) + ' · ' + report.transactions.length + ' transaksi</p></div><button class="icon-btn" onclick="closeModal()" aria-label="Tutup">×</button></div><div class="finup-csv-preview"><table><thead><tr><th>No</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Akun</th><th class="num">Nominal</th></tr></thead><tbody>' + previewRows + '</tbody></table></div>' + (report.transactions.length > 50 ? '<div class="tiny">Menampilkan 50 baris pertama dari ' + report.transactions.length + ' transaksi.</div>' : '') + '<div class="action-row"><button class="btn btn-secondary" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="confirmFinUpExportV234(\'csv\')">Unduh CSV</button></div></div></div>';
        } else {
            var pdfPackage = previewPackageV237(report);
            activePreviewPdfV237 = pdfPackage.pdf;
            $('modalRoot').innerHTML = '<div class="modal-wrap finup-export-modal"><div class="modal finup-export-dialog finup-pdf-dialog"><div class="modal-handle"></div><div class="row-between"><div><h3>Pratinjau PDF A4</h3><p class="desc">A4 portrait · ' + escapeHtml(formatPeriod(report.period.from, report.period.to)) + ' · ' + pdfPackage.pages.length + ' halaman</p></div><button class="icon-btn" onclick="closeModal()" aria-label="Tutup">×</button></div><div class="finup-a4-preview">' + previewPagesFromPackageV237(pdfPackage) + '</div><div class="action-row finup-preview-actions"><button class="btn btn-secondary" onclick="closeModal()">Batal</button><button class="btn btn-primary" onclick="confirmFinUpExportV234(\'pdf\')">Simpan PDF</button></div></div></div>';
        }
        if (typeof pushModalHistory === 'function') pushModalHistory();
        setTimeout(function () { var dialog = document.querySelector('.finup-export-dialog'); if (dialog) dialog.focus(); fitA4PreviewV235(document); }, 20);
    }

    window.openFinUpExportPreviewV234 = openPreview;
    window.fitA4PreviewV235 = fitA4PreviewV235;
    window.confirmFinUpExportV234 = function (format) {
        var report = activePreviewReportV235 || reportData(selectedReportFilterV235());
        var engine = window.FinUpReportV233;
        if (format === 'csv') {
            var csvName = 'FinUp-laporan-' + report.period.from + '-' + report.period.to + '.csv';
            var csv = engine.buildCsv(report);
            if (window.FinUpAndroid && typeof window.FinUpAndroid.exportText === 'function') window.FinUpAndroid.exportText(csvName, 'text/csv', csv);
            else if (typeof window.finupDownloadTextV232 === 'function') window.finupDownloadTextV232(csvName, 'text/csv;charset=utf-8', csv);
            else throw new Error('Fitur unduh CSV tidak tersedia.');
            if (typeof recordActivity === 'function') recordActivity('report_csv', 'Laporan CSV diunduh setelah pratinjau.', { from: report.period.from, to: report.period.to });
            activePreviewReportV235 = null;
            activePreviewPdfV237 = null;
            if (typeof closeModal === 'function') closeModal();
            if (typeof toast === 'function') toast('Laporan CSV berhasil dibuat.');
            return;
        }
        var pdfName = 'FinUp-laporan-A4-' + report.period.from + '-' + report.period.to + '.pdf';
        var exactPdf = activePreviewPdfV237 || engine.buildAndroidPdf(report);
        if (window.FinUpAndroid && typeof window.FinUpAndroid.exportText === 'function') {
            window.FinUpAndroid.exportText(pdfName, 'application/pdf', exactPdf);
        } else {
            downloadPdfV237(pdfName, exactPdf);
        }
        activePreviewPdfV237 = null;
        activePreviewReportV235 = null;
        if (typeof closeModal === 'function') closeModal();
        if (typeof toast === 'function') toast('PDF yang disimpan sama persis dengan pratinjau.');
        if (typeof recordActivity === 'function') recordActivity('report_pdf', 'Laporan PDF A4 dibuat setelah pratinjau.', { from: report.period.from, to: report.period.to });
    };

    window.exportCsvReport = function () {
        try { openPreview('csv'); } catch (error) { if (typeof toast === 'function') toast(error.message || 'Pratinjau CSV gagal dibuka.', true); }
    };
    window.exportPdfReport = function () {
        try { openPreview('pdf'); } catch (error) { if (typeof toast === 'function') toast(error.message || 'Pratinjau PDF gagal dibuka.', true); }
    };

    function refreshRealtimePeriods() {
        var current = localIso(new Date());
        if (lastRealtimeDay && lastRealtimeDay !== current) {
            normalizeFilter(txFilters, 'monthToDate');
            normalizeFilter(reportFilters, 'monthToDate');
            saveFilter('tx_filters', txFilters);
            saveFilter('report_filters', reportFilters);
            if (typeof render === 'function' && typeof page !== 'undefined' && (page === 'transactions' || page === 'reports')) render();
        }
        lastRealtimeDay = current;
    }
    lastRealtimeDay = localIso(new Date());
    if (typeof window.setInterval === 'function') window.setInterval(refreshRealtimePeriods, 60000);

    window.FinUpReportPeriodV234 = Object.freeze({
        presets: PRESETS.slice(),
        periodRange: periodRange,
        normalizeFilter: normalizeFilter,
        inferPresetMode: inferPresetMode,
        selectedReportFilter: selectedReportFilterV235,
        buildPreviewPages: buildPreviewPages,
        buildPrintableHtml: buildPrintableHtmlV234
    });
})();
