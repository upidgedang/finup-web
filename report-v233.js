/* FinUp v2.3.3 professional report engine shared by Android and Web. */
(function () {
    'use strict';
    if (window.__finupReportV233) return;
    window.__finupReportV233 = true;

    function safeText(value, maxLength) {
        var text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        return typeof maxLength === 'number' && text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
    }

    function html(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
        });
    }

    function csvCell(value) {
        var text = String(value == null ? '' : value);
        return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function typeLabel(type) {
        if (type === 'income') return 'Pemasukan';
        if (type === 'expense') return 'Pengeluaran';
        if (type === 'transfer') return 'Transfer';
        return safeText(type || '-', 24);
    }

    function accountTypeLabel(type) {
        if (type === 'cash') return 'Tunai';
        if (type === 'ewallet') return 'E-Wallet';
        if (type === 'bank') return 'Bank/Tabungan';
        return safeText(type || '-', 24);
    }

    function formattedDateTime(value) {
        try {
            return new Intl.DateTimeFormat('id-ID', {
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }).format(new Date(value));
        } catch (ignored) {
            return safeText(value || '-', 48);
        }
    }

    function reportCategories(transactions) {
        var map = {};
        transactions.filter(function (item) { return item.type === 'expense'; }).forEach(function (item) {
            var id = String(item.categoryId || 'tanpa-kategori');
            map[id] = (map[id] || 0) + (Number(item.amount) || 0);
        });
        var total = Object.keys(map).reduce(function (sum, key) { return sum + map[key]; }, 0);
        return Object.keys(map).map(function (id) {
            var amount = map[id];
            return {
                id: id,
                name: safeText(typeof catName === 'function' ? catName(id) : id, 80),
                amount: amount,
                amountFormatted: typeof rupiah === 'function' ? rupiah(amount) : String(amount),
                percentage: total > 0 ? Math.round(amount / total * 1000) / 10 : 0
            };
        }).sort(function (a, b) { return b.amount - a.amount; }).slice(0, 12);
    }

    function reportAccounts() {
        var accounts = data && Array.isArray(data.accounts) ? data.accounts : [];
        return accounts.slice().sort(function (a, b) {
            return (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name || '').localeCompare(String(b.name || ''));
        }).map(function (account) {
            var balance = typeof accountBalance === 'function' ? Number(accountBalance(account.id)) || 0 : 0;
            return {
                id: safeText(account.id, 120),
                name: safeText(account.name || 'Akun', 80),
                type: accountTypeLabel(account.type),
                balance: balance,
                balanceFormatted: typeof rupiah === 'function' ? rupiah(balance) : String(balance)
            };
        });
    }

    function buildReportData() {
        var list = typeof reportTransactions === 'function' ? reportTransactions() : [];
        var totals = typeof totalsBetween === 'function'
            ? totalsBetween(reportFilters.from, reportFilters.to)
            : { income: 0, expense: 0 };
        var generatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
        var transactions = list.map(function (item, index) {
            var amount = Number(item.amount) || 0;
            var isTransfer = item.type === 'transfer';
            var sourceAccount = isTransfer ? accName(item.fromAccountId) : accName(item.accountId);
            var destinationAccount = isTransfer ? accName(item.toAccountId) : '';
            return {
                number: index + 1,
                date: safeText(item.date || '', 20),
                dateFormatted: typeof shortDate === 'function' ? shortDate(item.date) : safeText(item.date || '-', 24),
                type: safeText(item.type, 20),
                typeLabel: typeLabel(item.type),
                category: isTransfer ? 'Transfer antar-akun' : safeText(catName(item.categoryId), 80),
                sourceAccount: safeText(sourceAccount, 80),
                destinationAccount: safeText(destinationAccount, 80),
                note: safeText(item.note || '-', 180),
                reference: safeText(item.reference || '', 80),
                amount: amount,
                amountFormatted: typeof rupiah === 'function' ? rupiah(amount) : String(amount),
                income: item.type === 'income' ? amount : 0,
                expense: item.type === 'expense' ? amount : 0,
                transfer: item.type === 'transfer' ? amount : 0
            };
        });
        var income = Number(totals.income) || 0;
        var expense = Number(totals.expense) || 0;
        var net = income - expense;
        var balance = typeof totalBalance === 'function' ? Number(totalBalance()) || 0 : 0;
        return {
            schema: 1,
            app: 'FinUp',
            versionName: typeof APP_VERSION !== 'undefined' ? String(APP_VERSION) : '-',
            versionCode: typeof VERSION_CODE !== 'undefined' ? Number(VERSION_CODE) : 0,
            generatedAt: generatedAt,
            generatedAtFormatted: formattedDateTime(generatedAt),
            period: {
                from: safeText(reportFilters.from, 20),
                to: safeText(reportFilters.to, 20),
                fromFormatted: typeof shortDate === 'function' ? shortDate(reportFilters.from) : safeText(reportFilters.from, 24),
                toFormatted: typeof shortDate === 'function' ? shortDate(reportFilters.to) : safeText(reportFilters.to, 24)
            },
            owner: safeText(session && session.email ? session.email : '-', 120),
            totals: {
                income: income,
                expense: expense,
                net: net,
                balance: balance,
                incomeFormatted: rupiah(income),
                expenseFormatted: rupiah(expense),
                netFormatted: rupiah(net),
                balanceFormatted: rupiah(balance)
            },
            accounts: reportAccounts(),
            categories: reportCategories(list),
            transactions: transactions
        };
    }

    function buildCsv(report) {
        var rows = [];
        rows.push(['FinUp', 'Laporan Keuangan Profesional']);
        rows.push(['Periode', report.period.fromFormatted + ' sampai ' + report.period.toFormatted]);
        rows.push(['Dibuat', report.generatedAtFormatted]);
        rows.push(['Akun pengguna', report.owner]);
        rows.push([]);
        rows.push(['RINGKASAN']);
        rows.push(['Pemasukan', report.totals.income]);
        rows.push(['Pengeluaran', report.totals.expense]);
        rows.push(['Arus kas bersih', report.totals.net]);
        rows.push(['Saldo seluruh akun', report.totals.balance]);
        rows.push([]);
        rows.push(['SALDO AKUN']);
        rows.push(['Nama akun', 'Jenis', 'Saldo']);
        report.accounts.forEach(function (account) {
            rows.push([account.name, account.type, account.balance]);
        });
        rows.push([]);
        rows.push(['PENGELUARAN PER KATEGORI']);
        rows.push(['Kategori', 'Nominal', 'Persentase']);
        report.categories.forEach(function (category) {
            rows.push([category.name, category.amount, category.percentage + '%']);
        });
        rows.push([]);
        rows.push(['RINCIAN TRANSAKSI']);
        rows.push(['No', 'Tanggal', 'Jenis', 'Kategori', 'Akun asal', 'Akun tujuan', 'Catatan', 'Referensi', 'Pemasukan', 'Pengeluaran', 'Transfer']);
        report.transactions.forEach(function (transaction) {
            rows.push([
                transaction.number, transaction.date, transaction.typeLabel, transaction.category,
                transaction.sourceAccount, transaction.destinationAccount, transaction.note, transaction.reference,
                transaction.income, transaction.expense, transaction.transfer
            ]);
        });
        return '\ufeffsep=,\n' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\n');
    }

    function buildPrintableHtml(report) {
        var logoUrl = '';
        try { logoUrl = new URL('logo-mark.png', window.location.href).href; } catch (ignored) { logoUrl = 'logo-mark.png'; }
        var accountRows = report.accounts.length ? report.accounts.map(function (account) {
            return '<tr><td>' + html(account.name) + '</td><td>' + html(account.type) + '</td><td class="money">' + html(account.balanceFormatted) + '</td></tr>';
        }).join('') : '<tr><td colspan="3" class="empty">Belum ada akun.</td></tr>';
        var categoryRows = report.categories.length ? report.categories.map(function (category) {
            return '<tr><td>' + html(category.name) + '</td><td class="money">' + html(category.amountFormatted) + '</td><td class="money">' + html(category.percentage) + '%</td></tr>';
        }).join('') : '<tr><td colspan="3" class="empty">Belum ada pengeluaran pada periode ini.</td></tr>';
        var transactionRows = report.transactions.length ? report.transactions.map(function (transaction) {
            var account = transaction.type === 'transfer'
                ? transaction.sourceAccount + ' → ' + transaction.destinationAccount
                : transaction.sourceAccount;
            var amountClass = transaction.type === 'income' ? 'income' : transaction.type === 'expense' ? 'expense' : '';
            return '<tr><td class="center">' + transaction.number + '</td><td>' + html(transaction.dateFormatted) + '</td><td>' + html(transaction.typeLabel) + '</td><td>' + html(transaction.category) + '</td><td>' + html(account) + '</td><td class="note">' + html(transaction.note) + '</td><td class="money ' + amountClass + '">' + html(transaction.amountFormatted) + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="empty">Belum ada transaksi pada periode ini.</td></tr>';
        return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>FinUp - Laporan Keuangan</title>'
            + '<meta name="viewport" content="width=device-width,initial-scale=1"><style>'
            + '@page{size:A4;margin:13mm 10mm 16mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#17212b;background:#fff;font-size:10.5px;line-height:1.45}.report-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:3px solid #0fba85;padding:0 0 14px;margin-bottom:14px}.brand{display:flex;gap:10px;align-items:center}.brand img{width:42px;height:42px;border-radius:11px}.brand h1{font-size:22px;margin:0;color:#0a2638}.brand p{margin:1px 0 0;color:#62727d}.meta{text-align:right;font-size:9.5px;color:#53636e}.meta b{color:#17212b}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 14px}.metric{border:1px solid #dce6e2;border-radius:10px;padding:9px;background:#f8fbfa}.metric span{display:block;color:#60717c;font-size:8.5px;text-transform:uppercase;letter-spacing:.4px}.metric strong{display:block;font-size:13px;margin-top:4px;color:#0a2638}.metric.in strong{color:#078257}.metric.out strong{color:#b93432}.metric.net.negative strong{color:#b93432}.section{margin:14px 0;break-inside:avoid}.section h2{font-size:12px;margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid #dce6e2;color:#0a2638}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#0a2638;color:#fff;text-align:left;font-size:8.5px;padding:6px 5px;border:1px solid #0a2638}td{padding:5px;border:1px solid #dde5e9;vertical-align:top;word-wrap:break-word}tbody tr:nth-child(even){background:#f7faf9}.money{text-align:right;white-space:nowrap}.center{text-align:center}.income{color:#078257;font-weight:700}.expense{color:#b93432;font-weight:700}.note{font-size:9px}.empty{text-align:center;color:#788892;padding:13px}.footer{position:fixed;bottom:-11mm;left:0;right:0;border-top:1px solid #dce6e2;padding-top:4px;font-size:8px;color:#71818b;display:flex;justify-content:space-between}.page-number:after{content:"Halaman " counter(page)}.print-hint{background:#eef8f4;border:1px solid #cce9dd;padding:9px 11px;border-radius:8px;margin-bottom:12px;color:#176b51}@media print{.print-hint{display:none}}@media(max-width:760px){.summary,.two-col{grid-template-columns:1fr 1fr}}</style></head><body>'
            + '<div class="print-hint">Pada dialog cetak, pilih <b>Simpan sebagai PDF</b>, ukuran A4, skala 100%, dan aktifkan grafik latar belakang.</div>'
            + '<header class="report-header"><div class="brand"><img src="' + html(logoUrl) + '" alt="FinUp"><div><h1>FinUp</h1><p>Laporan Keuangan Profesional</p></div></div><div class="meta"><b>Periode</b><br>' + html(report.period.fromFormatted) + ' – ' + html(report.period.toFormatted) + '<br><br><b>Dibuat</b><br>' + html(report.generatedAtFormatted) + '<br>' + html(report.owner) + '</div></header>'
            + '<section class="summary"><div class="metric in"><span>Pemasukan</span><strong>' + html(report.totals.incomeFormatted) + '</strong></div><div class="metric out"><span>Pengeluaran</span><strong>' + html(report.totals.expenseFormatted) + '</strong></div><div class="metric net ' + (report.totals.net < 0 ? 'negative' : '') + '"><span>Arus bersih</span><strong>' + html(report.totals.netFormatted) + '</strong></div><div class="metric"><span>Saldo akun</span><strong>' + html(report.totals.balanceFormatted) + '</strong></div></section>'
            + '<div class="two-col"><section class="section"><h2>Saldo Akun</h2><table><thead><tr><th>Nama akun</th><th>Jenis</th><th class="money">Saldo</th></tr></thead><tbody>' + accountRows + '</tbody></table></section><section class="section"><h2>Pengeluaran per Kategori</h2><table><thead><tr><th>Kategori</th><th class="money">Nominal</th><th class="money">%</th></tr></thead><tbody>' + categoryRows + '</tbody></table></section></div>'
            + '<section class="section"><h2>Rincian Transaksi (' + report.transactions.length + ')</h2><table><colgroup><col style="width:5%"><col style="width:11%"><col style="width:11%"><col style="width:15%"><col style="width:18%"><col style="width:25%"><col style="width:15%"></colgroup><thead><tr><th>No</th><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Akun</th><th>Catatan</th><th class="money">Nominal</th></tr></thead><tbody>' + transactionRows + '</tbody></table></section>'
            + '<footer class="footer"><span>FinUp · Atur uang, raih tujuan.</span><span class="page-number"></span></footer></body></html>';
    }

    function pdfAscii(value, maxLength) {
        var text = safeText(value, maxLength || 240)
            .replace(/→/g, '->').replace(/[–—]/g, '-').replace(/…/g, '...')
            .replace(/\u00a0/g, ' ');
        try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignored) { }
        return text.replace(/[^\x20-\x7e]/g, '?');
    }

    function pdfEscape(value) {
        return pdfAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }

    function pdfWrap(value, maxChars, maxLines) {
        var words = pdfAscii(value).split(/\s+/).filter(Boolean);
        var lines = [], line = '';
        words.forEach(function (word) {
            while (word.length > maxChars) {
                if (line) { lines.push(line); line = ''; }
                lines.push(word.slice(0, maxChars));
                word = word.slice(maxChars);
            }
            var next = line ? line + ' ' + word : word;
            if (next.length > maxChars && line) { lines.push(line); line = word; }
            else line = next;
        });
        if (line || !lines.length) lines.push(line || '-');
        if (maxLines && lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(0, maxChars - 3)) + '...';
        }
        return lines;
    }

    function buildAndroidPdf(report) {
        var PAGE_W = 595, PAGE_H = 842, LEFT = 32, RIGHT = 32, TOP = 34, BOTTOM = 32;
        var usableW = PAGE_W - LEFT - RIGHT;
        var pages = [], page = null, y = 0;
        function n(value) { return Math.round(Number(value) * 100) / 100; }
        function add(command) { page.commands.push(command); }
        function rect(x, top, width, height, fill, stroke) {
            var bottom = PAGE_H - top - height;
            if (fill) add(fill + ' rg');
            if (stroke) add(stroke + ' RG');
            add(n(x) + ' ' + n(bottom) + ' ' + n(width) + ' ' + n(height) + ' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S'));
        }
        function line(x1, top1, x2, top2, stroke, width) {
            if (stroke) add(stroke + ' RG');
            add(n(width || 1) + ' w ' + n(x1) + ' ' + n(PAGE_H - top1) + ' m ' + n(x2) + ' ' + n(PAGE_H - top2) + ' l S');
        }
        function text(value, x, top, size, bold, color, align, width) {
            var content = pdfEscape(value);
            var estimated = content.length * size * (bold ? 0.56 : 0.51);
            var px = x;
            if (align === 'right') px = x + Math.max(0, (width || 0) - estimated);
            else if (align === 'center') px = x + Math.max(0, ((width || 0) - estimated) / 2);
            add((color || '0.08 0.13 0.18') + ' rg BT /' + (bold ? 'F2' : 'F1') + ' ' + n(size) + ' Tf ' + n(px) + ' ' + n(PAGE_H - top - size) + ' Td (' + content + ') Tj ET');
        }
        function newPage() {
            page = { commands: [] };
            pages.push(page);
            rect(0, 0, PAGE_W, 8, '0.04 0.15 0.22');
            rect(0, 8, PAGE_W, 3, '0.06 0.73 0.52');
            text('FinUp', LEFT, 22, 17, true, '0.04 0.15 0.22');
            text('LAPORAN KEUANGAN PROFESIONAL', LEFT + 70, 26, 8.5, true, '0.31 0.39 0.44');
            text('Periode: ' + report.period.fromFormatted + ' - ' + report.period.toFormatted, PAGE_W - RIGHT - 220, 22, 7.5, false, '0.31 0.39 0.44', 'right', 220);
            text('Dibuat: ' + report.generatedAtFormatted, PAGE_W - RIGHT - 220, 33, 7.5, false, '0.31 0.39 0.44', 'right', 220);
            line(LEFT, 52, PAGE_W - RIGHT, 52, '0.84 0.89 0.88', 0.8);
            y = 64;
        }
        function ensure(height) { if (!page || y + height > PAGE_H - BOTTOM - 18) newPage(); }
        function sectionTitle(title) {
            ensure(24);
            text(title, LEFT, y, 10.5, true, '0.04 0.15 0.22');
            line(LEFT, y + 15, PAGE_W - RIGHT, y + 15, '0.84 0.89 0.88', 0.7);
            y += 23;
        }
        function tableHeader(columns, widths) {
            ensure(24);
            rect(LEFT, y, usableW, 21, '0.04 0.15 0.22');
            var x = LEFT;
            columns.forEach(function (column, index) {
                text(column, x + 4, y + 5, 7.2, true, '1 1 1', column.align || 'left', widths[index] - 8);
                x += widths[index];
            });
            y += 21;
        }
        function tableRow(cells, widths, options) {
            options = options || {};
            var wraps = cells.map(function (cell, index) {
                var chars = Math.max(5, Math.floor((widths[index] - 8) / ((options.fontSize || 7.2) * 0.51)));
                return pdfWrap(cell.text, chars, cell.maxLines || 2);
            });
            var lines = Math.max.apply(Math, wraps.map(function (value) { return value.length; }));
            var rowH = Math.max(20, 8 + lines * (options.lineHeight || 9));
            ensure(rowH + 1);
            if (options.repeatHeader && options.header && y < 75) tableHeader(options.header.labels, options.header.widths);
            if (options.shade) rect(LEFT, y, usableW, rowH, '0.97 0.98 0.98');
            var x = LEFT;
            cells.forEach(function (cell, index) {
                line(x, y, x, y + rowH, '0.86 0.89 0.91', 0.45);
                wraps[index].forEach(function (value, lineIndex) {
                    text(value, x + 4, y + 5 + lineIndex * (options.lineHeight || 9), options.fontSize || 7.2, !!cell.bold, cell.color || '0.08 0.13 0.18', cell.align || 'left', widths[index] - 8);
                });
                x += widths[index];
            });
            line(PAGE_W - RIGHT, y, PAGE_W - RIGHT, y + rowH, '0.86 0.89 0.91', 0.45);
            line(LEFT, y + rowH, PAGE_W - RIGHT, y + rowH, '0.86 0.89 0.91', 0.45);
            y += rowH;
        }

        newPage();
        text('Akun pengguna: ' + report.owner, LEFT, y, 8, false, '0.31 0.39 0.44');
        y += 18;
        var metricGap = 8, metricW = (usableW - metricGap * 3) / 4;
        var metrics = [
            ['PEMASUKAN', report.totals.incomeFormatted, '0.93 0.98 0.96', '0.03 0.51 0.34'],
            ['PENGELUARAN', report.totals.expenseFormatted, '0.99 0.95 0.95', '0.72 0.20 0.19'],
            ['ARUS BERSIH', report.totals.netFormatted, '0.95 0.97 0.99', report.totals.net < 0 ? '0.72 0.20 0.19' : '0.04 0.15 0.22'],
            ['SALDO AKUN', report.totals.balanceFormatted, '0.95 0.97 0.99', '0.04 0.15 0.22']
        ];
        metrics.forEach(function (metric, index) {
            var x = LEFT + index * (metricW + metricGap);
            rect(x, y, metricW, 50, metric[2], '0.84 0.89 0.88');
            text(metric[0], x + 7, y + 8, 6.5, true, '0.37 0.44 0.48');
            var lines = pdfWrap(metric[1], 20, 2);
            lines.forEach(function (value, lineIndex) { text(value, x + 7, y + 23 + lineIndex * 11, 9.3, true, metric[3]); });
        });
        y += 65;

        sectionTitle('SALDO AKUN');
        var accountWidths = [235, 125, usableW - 360];
        tableHeader([{toString:function(){return 'Nama akun';}}, {toString:function(){return 'Jenis';}}, {toString:function(){return 'Saldo';}, align:'right'}], accountWidths);
        if (!report.accounts.length) tableRow([{text:'Belum ada akun.'},{text:'-'},{text:'-',align:'right'}], accountWidths, {shade:true});
        report.accounts.forEach(function (account, index) {
            tableRow([{text:account.name,bold:true},{text:account.type},{text:account.balanceFormatted,align:'right',bold:true}], accountWidths, {shade:index % 2 === 1});
        });
        y += 12;

        sectionTitle('PENGELUARAN PER KATEGORI');
        var categoryWidths = [300, 145, usableW - 445];
        tableHeader([{toString:function(){return 'Kategori';}}, {toString:function(){return 'Nominal';},align:'right'}, {toString:function(){return '%';},align:'right'}], categoryWidths);
        if (!report.categories.length) tableRow([{text:'Belum ada pengeluaran pada periode ini.'},{text:'-'},{text:'-'}], categoryWidths, {shade:true});
        report.categories.forEach(function (category, index) {
            tableRow([{text:category.name,bold:true},{text:category.amountFormatted,align:'right'},{text:String(category.percentage)+'%',align:'right'}], categoryWidths, {shade:index % 2 === 1});
        });
        y += 14;

        sectionTitle('RINCIAN TRANSAKSI (' + report.transactions.length + ')');
        var txWidths = [25, 55, 55, 80, 105, 116, usableW - 436];
        var txLabels = ['No','Tanggal','Jenis','Kategori','Akun','Catatan','Nominal'];
        var txColumns = txLabels.map(function (label, index) { return {toString:function(){return label;}, align:index === 0 ? 'center' : index === 6 ? 'right' : 'left'}; });
        tableHeader(txColumns, txWidths);
        if (!report.transactions.length) tableRow([{text:'-'},{text:'-'},{text:'-'},{text:'Belum ada transaksi.'},{text:'-'},{text:'-'},{text:'-'}], txWidths, {shade:true,fontSize:6.7});
        report.transactions.forEach(function (transaction, index) {
            var account = transaction.type === 'transfer' ? transaction.sourceAccount + ' -> ' + transaction.destinationAccount : transaction.sourceAccount;
            var color = transaction.type === 'income' ? '0.03 0.51 0.34' : transaction.type === 'expense' ? '0.72 0.20 0.19' : '0.08 0.13 0.18';
            var beforePageCount = pages.length;
            var cells = [
                {text:String(transaction.number),align:'center'},
                {text:transaction.dateFormatted},
                {text:transaction.typeLabel},
                {text:transaction.category,maxLines:2},
                {text:account,maxLines:2},
                {text:transaction.note,maxLines:3},
                {text:transaction.amountFormatted,align:'right',bold:true,color:color,maxLines:2}
            ];
            var estimatedLines = Math.max.apply(Math, cells.map(function (cell, cellIndex) {
                var chars = Math.max(5, Math.floor((txWidths[cellIndex]-8)/(6.5*0.51)));
                return pdfWrap(cell.text, chars, cell.maxLines || 2).length;
            }));
            var estimatedHeight = Math.max(20, 8 + estimatedLines * 8.2);
            if (y + estimatedHeight > PAGE_H - BOTTOM - 18) { newPage(); sectionTitle('RINCIAN TRANSAKSI - LANJUTAN'); tableHeader(txColumns, txWidths); }
            tableRow(cells, txWidths, {shade:index % 2 === 1,fontSize:6.5,lineHeight:8.2});
        });

        pages.forEach(function (item, index) {
            page = item;
            var footerTop = PAGE_H - BOTTOM - 8;
            line(LEFT, footerTop - 6, PAGE_W - RIGHT, footerTop - 6, '0.84 0.89 0.88', 0.6);
            text('FinUp - Atur uang, raih tujuan.', LEFT, footerTop, 7, false, '0.40 0.47 0.51');
            text('Halaman ' + (index + 1) + ' dari ' + pages.length, PAGE_W - RIGHT - 100, footerTop, 7, false, '0.40 0.47 0.51', 'right', 100);
        });

        var objects = [];
        objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        var kids = [];
        pages.forEach(function (item, index) {
            var pageObject = 5 + index * 2;
            var contentObject = pageObject + 1;
            kids.push(pageObject + ' 0 R');
            var stream = item.commands.join('\n') + '\n';
            objects[pageObject] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentObject + ' 0 R >>';
            objects[contentObject] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream';
        });
        objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';
        var pdf = '%PDF-1.4\n%FinUp Professional Report\n';
        var offsets = [0];
        for (var objectNumber = 1; objectNumber < objects.length; objectNumber++) {
            offsets[objectNumber] = pdf.length;
            pdf += objectNumber + ' 0 obj\n' + objects[objectNumber] + '\nendobj\n';
        }
        var xref = pdf.length;
        pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
        for (var offsetIndex = 1; offsetIndex < objects.length; offsetIndex++) {
            pdf += String(offsets[offsetIndex]).padStart(10, '0') + ' 00000 n \n';
        }
        pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
        return pdf;
    }

    function openPrintableReport() {
        var report = buildReportData();
        var popup = window.open('', '_blank');
        if (!popup) {
            if (typeof toast === 'function') toast('Popup diblokir browser. Izinkan popup untuk mencetak laporan.', true);
            return false;
        }
        popup.document.open();
        popup.document.write(buildPrintableHtml(report));
        popup.document.close();
        try {
            popup.addEventListener('load', function () { setTimeout(function () { popup.print(); }, 350); });
        } catch (ignored) {
            setTimeout(function () { try { popup.print(); } catch (ignored2) { } }, 500);
        }
        return true;
    }

    function exportCsv() {
        var report = buildReportData();
        var filename = 'FinUp-laporan-profesional-' + report.period.from + '-' + report.period.to + '.csv';
        var content = buildCsv(report);
        if (window.FinUpAndroid && typeof window.FinUpAndroid.exportText === 'function') {
            window.FinUpAndroid.exportText(filename, 'text/csv', content);
        } else if (typeof window.finupDownloadTextV232 === 'function') {
            window.finupDownloadTextV232(filename, 'text/csv;charset=utf-8', content);
        } else {
            throw new Error('Fitur unduh CSV tidak tersedia.');
        }
        if (typeof recordActivity === 'function') recordActivity('report_csv', 'Laporan CSV profesional dibuat.', { from: report.period.from, to: report.period.to });
        if (typeof toast === 'function') toast('Laporan CSV profesional berhasil dibuat.');
    }

    function exportPdf() {
        var report = buildReportData();
        var filename = 'FinUp-laporan-profesional-' + report.period.from + '-' + report.period.to + '.pdf';
        if (window.FinUpAndroid && typeof window.FinUpAndroid.exportText === 'function') {
            window.FinUpAndroid.exportText(filename, 'application/pdf', buildAndroidPdf(report));
            if (typeof recordActivity === 'function') recordActivity('report_pdf', 'Laporan PDF profesional dibuat.', { from: report.period.from, to: report.period.to });
            if (typeof toast === 'function') toast('Laporan PDF profesional berhasil dibuat.');
            return true;
        }
        if (!window.FinUpAndroid && openPrintableReport()) {
            if (typeof recordActivity === 'function') recordActivity('report_pdf', 'Laporan profesional dibuka untuk dicetak atau disimpan sebagai PDF.', { from: report.period.from, to: report.period.to });
            return true;
        }
        if (window.FinUpAndroid && typeof window.FinUpAndroid.exportPdf === 'function') {
            window.FinUpAndroid.exportPdf(filename, 'Laporan Keuangan FinUp', JSON.stringify(report, null, 2));
            return true;
        }
        throw new Error('Fitur PDF tidak tersedia.');
    }

    window.FinUpReportV233 = Object.freeze({
        buildReportData: buildReportData,
        buildCsv: buildCsv,
        buildPrintableHtml: buildPrintableHtml,
        buildAndroidPdf: buildAndroidPdf,
        openPrintableReport: openPrintableReport,
        exportCsv: exportCsv,
        exportPdf: exportPdf
    });

    window.reportCsv = function () { return buildCsv(buildReportData()); };
    window.reportText = function () { return JSON.stringify(buildReportData(), null, 2); };
    window.exportCsvReport = function () {
        try { exportCsv(); } catch (error) { if (typeof toast === 'function') toast(error.message || 'Laporan CSV belum dapat dibuat.', true); }
    };
    window.exportPdfReport = function () {
        try { exportPdf(); } catch (error) { if (typeof toast === 'function') toast(error.message || 'Laporan PDF belum dapat dibuat.', true); }
    };

    var previousRenderReports = window.renderReports;
    if (typeof previousRenderReports === 'function') {
        window.renderReports = function () {
            var output = String(previousRenderReports.apply(this, arguments));
            return output
                .replace('Ekspor CSV</button>', 'CSV untuk Excel</button>')
                .replace('Ekspor PDF</button>', 'PDF Profesional</button>')
                .replace('Cetak / Simpan PDF</button>', 'PDF Profesional</button>');
        };
    }
})();
