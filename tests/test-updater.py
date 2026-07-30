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

    (source / 'deploy').mkdir()
    for name, content in {
        'index.html': '<script src="web-adapter-v231.js"></script>',
        'web-adapter-v231.js': 'window.__test=true;',
        'logo-mark.png': 'png',
        'deploy/finup_updater.py': '#!/usr/bin/env python3\n',
    }.items():
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    (source / 'version.json').write_text(json.dumps({
        'versionName': '2.3.1', 'versionCode': 29, 'webRevision': 2,
        'repository': 'https://github.com/upidgedang/finup-web.git', 'branch': 'main'
    }))
    run('git', 'add', '.', cwd=source)
    run('git', 'commit', '-m', 'initial', cwd=source)
    run('git', 'remote', 'add', 'origin', str(remote), cwd=source)
    run('git', 'push', '-u', 'origin', 'main', cwd=source)
    run('git', 'clone', '-b', 'main', str(remote), str(app))
    # Mode-only differences must not lock updates after VPS chmod.
    (app / 'deploy' / 'finup_updater.py').chmod(0o755)

    # Create a newer remote revision after the VPS clone.
    version = json.loads((source / 'version.json').read_text())
    version['webRevision'] = 3
    (source / 'version.json').write_text(json.dumps(version))
    (source / 'web-adapter-v231.js').write_text('window.__testRevision=3;')
    run('git', 'add', '.', cwd=source)
    run('git', 'commit', '-m', 'revision 3', cwd=source)
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

    status = module.current_status(refresh=True)
    assert status['updateAvailable'] is True
    assert status['dirty'] is False
    assert status['dirtyFiles'] == []
    assert status['localVersion']['webRevision'] == 2

    result = module.perform_update()
    assert result['updated'] is True
    assert module.read_version()['webRevision'] == 3
    assert module.current_status(refresh=True)['updateAvailable'] is False

    (app / 'forbidden.apk').write_text('not allowed')
    try:
        module.validate_release_tree()
        raise AssertionError('APK in web root must be rejected')
    except RuntimeError as error:
        assert 'File rahasia' in str(error)
    (app / 'forbidden.apk').unlink()

print('PASS: updater detects fast-forward revisions and rejects Android artifacts')
