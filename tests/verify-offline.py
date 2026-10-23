"""Local-only final gate. Every result is a real process exit, never synthesized."""
from pathlib import Path
import json, subprocess, time
w=Path(__file__).resolve().parent.parent
e=w/'evidence/offline-14days'
e.mkdir(parents=True,exist_ok=True)
steps=[
 ('vitest-full',['node','node_modules/vitest/vitest.mjs','run','--reporter=verbose']),
 ('typecheck',['node','node_modules/typescript/bin/tsc','-b','--pretty','false']),
 ('web-build',['python','scripts/web-build.py']),
 ('mock-prepare',['python','tests/build-offline-mock.py']),
 ('headless-run',['node','tests/offline-headless.mjs']),
 ('regression-headless',['node','tests/headless.mjs']),
]
results=[]
for name,command in steps:
    start=time.monotonic()
    with (e/(name+'.log')).open('wb') as f:
        result=subprocess.run(command,cwd=w,stdout=f,stderr=subprocess.STDOUT)
    results.append({'name':name,'command':command,'exitCode':result.returncode,'seconds':round(time.monotonic()-start,3),'log':str(e/(name+'.log'))})
    (e/'final-gate.json').write_text(json.dumps(results,indent=2),encoding='utf8')
    print(name,result.returncode,flush=True)
    if result.returncode:raise SystemExit(result.returncode)
