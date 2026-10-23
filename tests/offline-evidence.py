"""Build CAS manifests and verify untouched icons/export placement plus production/mock separation."""
from pathlib import Path
import hashlib, json, os, re
w=Path(__file__).resolve().parent.parent
e=w/'evidence/offline-14days'
baseline=json.loads((e/'baseline.json').read_text(encoding='utf8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
current={}
for root,dirs,files in os.walk(w):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','evidence']]
    for name in files:
        p=Path(root)/name
        current[p.relative_to(w).as_posix()]=sha(p)
def kind(path):
    if path.startswith(('dist-web/','dist-mock/','dist/','build-logs/','public/runtime/','public/licenses/')) or '__pycache__' in path or path.endswith('.tsbuildinfo'): return 'generated'
    return 'source'
rows=[]
for path in sorted(set(baseline)|set(current)):
    if path.startswith('evidence/'):continue
    before=baseline.get(path);after=current.get(path)
    if before==after:continue
    rows.append({'path':path,'kind':kind(path),'change':'added' if before is None else 'deleted' if after is None else 'modified','baselineSHA256':before,'currentSHA256':after})
protected=['src/app/ViewerChrome.tsx','src/auth/firebaseBackend.ts','firestore.rules']+[p for p in baseline if p.startswith('web/icons/') and p.endswith('.png')]
checks=[]
for path in protected:
    assert current[path]==baseline[path],path
    checks.append({'path':path,'unchanged':True,'sha256':current[path]})
for path in protected:
    if path.startswith('web/icons/'):
        target=w/'dist-web/icons'/Path(path).name
        assert sha(target)==current[path],str(target)
        checks.append({'path':target.relative_to(w).as_posix(),'matchesSource':True,'sha256':sha(target)})
prod_files=[p for p in (w/'dist-web').rglob('*') if p.is_file()]
for p in prod_files:
    assert p.suffix.lower() not in ['.dwg','.dxf','.jks','.pem','.p12','.keystore'],str(p)
    if p.suffix in ['.js','.mjs','.html']:
        raw=p.read_bytes()
        assert b'__accessTest' not in raw and b'test-only-identity' not in raw,str(p)
assert len([p for p in protected if p.startswith('web/icons/')])==5
headless=json.loads((e/'headless-results.json').read_text(encoding='utf8'))
regression=json.loads((e/'regression-headless/headless-results.json').read_text(encoding='utf8'))
assert headless['pass'] and not headless['errors'] and regression['pass'] and not regression['errors']
final=json.loads((e/'final-gate.json').read_text(encoding='utf8'))
assert len(final)==6 and all(r['exitCode']==0 for r in final)
repeats=[json.loads(p.read_text(encoding='utf8')) for p in sorted((e/'repeats-verified').glob('run-*/headless-results.json'))]
assert len(repeats)==6 and all(r['pass'] and not r['errors'] for r in repeats)
summary={'sourceChanges':sum(r['kind']=='source' for r in rows),'generatedChanges':sum(r['kind']=='generated' for r in rows),'productionFiles':len(prod_files),'productionContainsMock':False,'protected':checks,'headlessPass':True,'regressionPass':True,'repeatPasses':len(repeats),'build':json.loads((w/'build-logs/web-build.json').read_text())}
(e/'changes.json').write_text(json.dumps({'candidate':str(w),'backup':str(w.parent/'_backup/offline-14days'),'changes':rows},ensure_ascii=False,indent=2),encoding='utf8')
(e/'integrity.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')
lines=['# 精確修改清單','',f'候選根：`{w}`','',f'來源 {summary["sourceChanges"]} 項；生成產物 {summary["generatedChanges"]} 項。改前／後 SHA256 見 changes.json；新增來源 baseline=null。','']
for category in ['source','generated']:
    lines+=['## '+category,'','| 變動 | 相對路徑 |','|---|---|']
    lines += [f'| {r["change"]} | `{r["path"]}` |' for r in rows if r['kind']==category]
    lines+=['']
(e/'changes.md').write_text('\n'.join(lines),encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k!='protected'},ensure_ascii=False))
print('\n'.join(r['change']+' '+r['path'] for r in rows if r['kind']=='source'))
