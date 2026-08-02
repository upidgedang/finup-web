/* FinUp v2.3.8 — scroll state repair and diagnostics. */
(function () {
    'use strict';

    function scrollingElement() {
        return document.scrollingElement || document.documentElement || document.body;
    }

    function activeContainer(target) {
        var node = target && target.nodeType === 1 ? target : document.activeElement;
        if (node && node.closest) {
            var local = node.closest('.finup-a4-preview,.finup-csv-preview,.modal,.center-screen,.lock,.quick-add-wrap');
            if (local) return local;
        }
        var modal = document.querySelector('#modalRoot .modal');
        return modal || scrollingElement();
    }

    function isScrollable(element) {
        if (!element) return false;
        var style = getComputedStyle(element);
        var overflowY = style.overflowY;
        return (overflowY === 'auto' || overflowY === 'scroll' || element === scrollingElement())
            && element.scrollHeight > element.clientHeight + 1;
    }

    function repair() {
        var html = document.documentElement;
        var body = document.body;
        if (html) {
            html.style.removeProperty('height');
            html.style.removeProperty('overflow');
            html.style.removeProperty('overflow-y');
            html.style.removeProperty('position');
        }
        if (body) {
            body.style.removeProperty('height');
            body.style.removeProperty('overflow');
            body.style.removeProperty('overflow-y');
            body.style.removeProperty('position');
            body.style.removeProperty('top');
        }
        var app = document.getElementById('appScreen');
        if (app) {
            app.style.removeProperty('height');
            app.style.removeProperty('overflow');
            app.style.removeProperty('overflow-y');
        }
        document.querySelectorAll('#modalRoot .modal').forEach(function (modal) {
            modal.style.removeProperty('overflow');
            modal.style.removeProperty('overflow-y');
            modal.style.removeProperty('height');
        });
    }

    function diagnostics() {
        var container = activeContainer(document.activeElement);
        var page = scrollingElement();
        return {
            pageScrollTop: Number(page && page.scrollTop || 0),
            pageScrollHeight: Number(page && page.scrollHeight || 0),
            pageClientHeight: Number(page && page.clientHeight || 0),
            activeTag: container && container.tagName || '',
            activeClass: container && container.className || '',
            activeScrollTop: Number(container && container.scrollTop || 0),
            activeScrollHeight: Number(container && container.scrollHeight || 0),
            activeClientHeight: Number(container && container.clientHeight || 0),
            activeScrollable: isScrollable(container)
        };
    }

    window.FinUpScrollV238 = {
        repair: repair,
        activeContainer: activeContainer,
        isScrollable: isScrollable,
        diagnostics: diagnostics
    };

    var observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
            if (records[i].addedNodes && records[i].addedNodes.length) {
                requestAnimationFrame(repair);
                break;
            }
        }
    });

    function start() {
        repair();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    window.addEventListener('pageshow', repair);
    window.addEventListener('resize', repair, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(repair, 80); }, { passive: true });
})();
