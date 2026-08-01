#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / 'index.html').read_text(encoding='utf-8')
match = re.search(r'Content-Security-Policy" content="([^"]+)"', index)
assert match, 'Content Security Policy meta tag not found'
policy = match.group(1)
connect = next((part.strip() for part in policy.split(';') if part.strip().startswith('connect-src ')), '')
assert "'self'" in connect.split(), 'connect-src must allow same-origin updater API'
version = json.loads((ROOT / 'version.json').read_text(encoding='utf-8'))
assert version['webRevision'] == 2
assert version['versionName'] == '2.3.3'
assert version['versionCode'] == 31
assert 'hardening-v232.js?v=2.3.3-r1' in index
assert 'web-adapter-v232.js?v=2.3.3-r1' in index
installer = (ROOT / 'deploy' / 'install-finup-updater.sh').read_text(encoding='utf-8')
assert 'config core.fileMode false' in installer
assert 'systemctl restart finup-web-updater' in installer
updater = (ROOT / 'deploy' / 'finup_updater.py').read_text(encoding='utf-8')
assert 'AUTH_MAX_FAILURES = 5' in updater
assert 'authorize_request' in updater
nginx = (ROOT / 'deploy' / 'nginx-finup.conf.example').read_text(encoding='utf-8')
assert "frame-ancestors 'none'" in nginx
assert 'report-v233.js?v=2.3.3-r1' in index
assert 'responsive-v233-r2.css' in index
assert 'interactive-widget=resizes-content' in index
assert 'user-scalable=no' not in index
print('PASS: v2.3.3 web revision 2 metadata, CSP, responsive layer, updater throttling, Git mode handling')
