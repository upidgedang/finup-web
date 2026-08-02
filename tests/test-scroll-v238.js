const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'scroll-fix-v238.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'scroll-fix-v238.js'), 'utf8');
function ok(value, message) { if (!value) throw new Error(message); }
ok(html.includes('scroll-fix-v238.css?v=2.3.9-r1'), 'scroll CSS not loaded last');
ok(html.includes('scroll-fix-v238.js?v=2.3.9-r1'), 'scroll JS not loaded');
ok(css.includes('overflow-y: auto !important'), 'vertical page scroll not forced');
ok(css.includes('.modal-wrap:not(.finup-export-modal) > .modal'), 'feature page scroll selector missing');
ok(css.includes('-webkit-overflow-scrolling: touch'), 'momentum scroll missing');
ok(css.includes('touch-action: pan-y pinch-zoom'), 'vertical touch action missing');
ok(js.includes('FinUpScrollV238'), 'scroll diagnostics missing');
ok(html.includes('dashboardScrollTopV238'), 'pull refresh guard missing');
ok(html.includes("pullActive = false; pullDistance = 0; finishPullRefresh(); return;"), 'upward gesture cancellation missing');
console.log('PASS scroll reliability v2.3.9');
