#!/usr/bin/env python3
import contextlib
import http.server
import socketserver
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

@contextlib.contextmanager
def server():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as httpd:
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            yield httpd.server_address[1]
        finally:
            httpd.shutdown()
            thread.join(timeout=2)


def verify_viewport(page, width, height):
    page.set_viewport_size({'width': width, 'height': height})
    page.evaluate("""
      document.getElementById('bootScreen').classList.add('hidden');
      document.getElementById('authScreen').classList.add('hidden');
      const app = document.getElementById('appScreen');
      app.classList.remove('hidden');
      const content = document.getElementById('content');
      content.innerHTML = '<div style="height:2200px;padding:20px">Sticky test content</div>';
      if (window.FinUpStickyHeaderV239) window.FinUpStickyHeaderV239.measure();
    """)
    page.wait_for_timeout(100)
    before = page.locator('.topbar').bounding_box()
    page.evaluate('window.scrollTo(0, 900)')
    page.wait_for_timeout(100)
    after = page.locator('.topbar').bounding_box()
    assert before and after
    assert abs(after['y']) <= 1, (width, height, 'topbar moved', before, after)
    overlap = page.evaluate("""
      const h = document.querySelector('.topbar').getBoundingClientRect();
      const c = document.getElementById('content').getBoundingClientRect();
      return {headerBottom:h.bottom, contentTopAtDocument: document.getElementById('content').offsetTop,
              cssHeight:getComputedStyle(document.documentElement).getPropertyValue('--finup-topbar-height')};
    """)
    assert overlap['contentTopAtDocument'] >= before['height'] - 1, (width, height, overlap)

    page.evaluate("""
      window.scrollTo(0, 0);
      document.getElementById('modalRoot').innerHTML = `
        <div class="modal-wrap">
          <div class="modal">
            <div class="full-page-header">
              <button class="full-page-back">‹</button><div class="full-page-title">Pengaturan</div><span class="full-page-spacer"></span>
            </div>
            <div style="height:1800px">Feature page content</div>
          </div>
        </div>`;
    """)
    page.wait_for_timeout(100)
    modal = page.locator('#modalRoot .modal')
    modal_before = page.locator('#modalRoot .full-page-header').bounding_box()
    modal.evaluate('(el) => el.scrollTop = 800')
    page.wait_for_timeout(100)
    modal_after = page.locator('#modalRoot .full-page-header').bounding_box()
    assert modal_before and modal_after
    assert abs(modal_after['y']) <= 1, (width, height, 'modal header moved', modal_before, modal_after)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        page.route('https://**/*', lambda route: route.abort())
        try:
            page.goto((ROOT / 'index.html').as_uri(), wait_until='domcontentloaded')
        except Exception as exc:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(exc):
                browser.close()
                print('SKIP runtime browser test: local navigation is blocked by the execution environment')
                return
            raise
        page.wait_for_function('window.FinUpStickyHeaderV239 !== undefined')
        for viewport in [(320,568),(390,844),(844,390),(768,1024),(1024,768),(1366,768)]:
            verify_viewport(page, *viewport)
            page.evaluate("document.getElementById('modalRoot').innerHTML=''; window.scrollTo(0,0)")
        browser.close()
    print('PASS sticky header runtime across mobile, landscape, tablet, and desktop')

if __name__ == '__main__':
    main()
