/* FinUp v2.3.9 — sticky header measurement and lifecycle repair. */
(function () {
    'use strict';

    var root = document.documentElement;
    var app = document.getElementById('appScreen');
    var topbar = app && app.querySelector(':scope > .topbar');
    var resizeObserver = null;
    var scheduled = 0;

    function isVisible(element) {
        return !!element && !element.classList.contains('hidden') && element.getClientRects().length > 0;
    }

    function measure() {
        scheduled = 0;
        if (!root || !topbar) return 0;
        var height = Math.ceil(topbar.getBoundingClientRect().height || topbar.offsetHeight || 0);
        if (height > 0) root.style.setProperty('--finup-topbar-height', height + 'px');
        document.body.classList.toggle('finup-app-header-active', isVisible(app));
        return height;
    }

    function scheduleMeasure() {
        if (scheduled) cancelAnimationFrame(scheduled);
        scheduled = requestAnimationFrame(measure);
    }

    function diagnostics() {
        var headerRect = topbar ? topbar.getBoundingClientRect() : null;
        var modalHeader = document.querySelector('#modalRoot .modal > .full-page-header');
        var modalRect = modalHeader ? modalHeader.getBoundingClientRect() : null;
        return {
            appVisible: isVisible(app),
            topbarHeight: headerRect ? Math.round(headerRect.height) : 0,
            topbarTop: headerRect ? Math.round(headerRect.top) : null,
            modalHeaderTop: modalRect ? Math.round(modalRect.top) : null,
            cssTopbarHeight: getComputedStyle(root).getPropertyValue('--finup-topbar-height').trim()
        };
    }

    window.FinUpStickyHeaderV239 = {
        measure: measure,
        scheduleMeasure: scheduleMeasure,
        diagnostics: diagnostics
    };

    function start() {
        scheduleMeasure();
        if (window.ResizeObserver && topbar) {
            resizeObserver = new ResizeObserver(scheduleMeasure);
            resizeObserver.observe(topbar);
        }
        if (window.MutationObserver && app) {
            new MutationObserver(scheduleMeasure).observe(app, {
                attributes: true,
                attributeFilter: ['class'],
                childList: true,
                subtree: false
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.addEventListener('load', scheduleMeasure, { once: true });
    window.addEventListener('pageshow', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('orientationchange', function () {
        setTimeout(scheduleMeasure, 80);
        setTimeout(scheduleMeasure, 260);
    }, { passive: true });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleMeasure, { passive: true });
    }
})();
