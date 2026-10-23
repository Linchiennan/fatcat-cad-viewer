"""Test-only build: existing Vite backend alias + production SW template. Never publish dist-mock."""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess
w = Path(__file__).resolve().parent.parent
out = w / 'dist-mock'
env = {**os.environ, 'VITE_FATCAT_WEB': '1'}
log = w / 'evidence/offline-14days/mock-build.log'
with log.open('wb') as f:
    result = subprocess.run(['node', 'node_modules/vite/bin/vite.js', 'build', '--config', 'tests/vite.mock.config.ts'], cwd=w, env=env, stdout=f, stderr=subprocess.STDOUT)
if result.returncode: raise SystemExit(result.returncode)
for name in ['icons', 'manifest.webmanifest', 'WEB_PRIVACY.md']:
    src = w / 'dist-web' / name
    if src.is_dir(): shutil.copytree(src, out / name, dirs_exist_ok=True)
    else: shutil.copy2(src, out / name)
core = ['./', './index.html', './usage.html', './WEB_PRIVACY.md', './manifest.webmanifest']
core += ['./'+p.relative_to(out).as_posix() for folder in ['assets','icons'] for p in sorted((out/folder).rglob('*')) if p.is_file()]
runtime = ['./'+p.relative_to(out).as_posix() for folder in ['runtime','fonts'] for p in sorted((out/folder).rglob('*')) if p.is_file()]
identity = (w/'src/app/buildIdentity.ts').read_text(encoding='utf8')
build = re.search(r'BUILD_ID\s*=\s*["\']([^"\']+)', identity).group(1)
sw=(w/'web/sw.template.js').read_text(encoding='utf8').replace('__BUILD_ID__',build).replace('__PRECACHE__',json.dumps(core)).replace('__RUNTIME_PRECACHE__',json.dumps(runtime))
(out/'sw.js').write_text(sw,encoding='utf8')
summary={'testOnly':True,'realFirebase':False,'build':build,'core':len(core),'runtime':len(runtime),'workerTemplateSHA256':hashlib.sha256((w/'web/sw.template.js').read_bytes()).hexdigest()}
(w/'evidence/offline-14days/mock-build.json').write_text(json.dumps(summary,indent=2),encoding='utf8')
print(json.dumps(summary))
