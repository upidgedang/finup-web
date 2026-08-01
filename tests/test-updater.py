#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
UPDATER = ROOT / 'deploy' / 'finup_updater.py'

def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()

class Headers(dict):
    def get(self, key, default=''):
        return super().get(key, default)

class FakeHandler:
    def __init__(self, token, ip='203.0.113.10'):
        self.headers = Headers({'X-FinUp-Update-Token': token, 'X-Real-IP': ip})
        self.client_address = ('127.0.0.1', 12345)

with tempfile.TemporaryDirectory() as temp_raw:
    temp = Path(temp_raw)
    remote = temp / 'upidgedang' / 'finup-web.git'
    source = temp / 'source'
    app = temp / 'app'
    remote.parent.mkdir(parents=True)
    run('git', 'init', '--bare', str(remote))
    run('git', 'init', '-b', 'main', str(source))
    run('git', 'config', 'user.email', 'test@example.com', cwd=source)
    run('git', 'config', 'user.name', 'FinUp Test', cwd=source)

    files = {
        'index.html': '<script src="hardening-v232.js"></script><script src="report-v233.js"></script><script src="web-adapter-v232.js"></script>',
        'web-adapter-v232.js': 'window.__test=true;',
        'hardening-v232.js': 'window.__hardening=true;',
        'report-v233.js': 'window.__report=true;',
        'logo-mark.png': 'png',
        'deploy/finup_updater.py': '#!/usr/bin/env python3\n',
    }
    for name, content in files.items():
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    (source / 'version.json').write_text(json.dumps({
        'versionName': '2.3.3', 'versionCode': 31, 'webRevision': 1,
        'repository': 'https://github.com/upidgedang/finup-web.git', 'branch': 'main'
    }))
    run('git', 'add', '.', cwd=source)
    run('git', 'commit', '-m', 'initial', cwd=source)
    run('git', 'remote', 'add', 'origin', str(remote), cwd=source)
    run('git', 'push', '-u', 'origin', 'main', cwd=source)
    run('git', 'clone', '-b', 'main', str(remote), str(app))
    (app / 'deploy' / 'finup_updater.py').chmod(0o755)

    version = json.loads((source / 'version.json').read_text())
    version['webRevision'] = 2
    (source / 'version.json').write_text(json.dumps(version))
    (source / 'web-adapter-v232.js').write_text('window.__testRevision=2;')
    run('git', 'add', '.', cwd=source)
    run('git', 'commit', '-m', 'revision 2', cwd=source)
    run('git', 'push', 'origin', 'main', cwd=source)

    os.environ['FINUP_APP_DIR'] = str(app)
    os.environ['FINUP_REPO_SLUG'] = 'upidgedang/finup-web'
    os.environ['FINUP_BRANCH'] = 'main'
    os.environ['FINUP_UPDATE_TOKEN'] = 'test-token'
    os.environ['FINUP_UPDATE_LOCK'] = str(temp / 'updater.lock')

    spec = importlib.util.spec_from_file_location('finup_updater_test', UPDATER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    module.set_permissions = lambda: None
    module.reload_nginx = lambda: None
    module.deploy_runtime_files = lambda: {}

    ok, code, _ = module.authorize_request(FakeHandler('test-token'))
    assert ok and code == 200
    for attempt in range(4):
        ok, code, _ = module.authorize_request(FakeHandler('wrong', '198.51.100.4'))
        assert not ok and code == 401
    ok, code, _ = module.authorize_request(FakeHandler('wrong', '198.51.100.4'))
    assert not ok and code == 429

    status = module.current_status(refresh=True)
    assert status['updateAvailable'] is True
    assert status['dirty'] is False
    result = module.perform_update()
    assert result['updated'] is True
    assert module.read_version()['webRevision'] == 2
    assert module.current_status(refresh=True)['updateAvailable'] is False

    (app / 'forbidden.apk').write_text('not allowed')
    try:
        module.validate_release_tree()
        raise AssertionError('APK in web root must be rejected')
    except RuntimeError as error:
        assert 'File rahasia' in str(error)

print('PASS: authenticated updater, failed-token throttling, fast-forward update, artifact rejection')
