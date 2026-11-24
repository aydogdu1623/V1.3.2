"""Single-worker durable CAD queue. Private server; only authenticated CephePro API calls it."""
import base64, json, os, re, secrets, shutil, sqlite3, subprocess, sys, threading, time
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
ROOT=Path(os.environ.get('CAD_DATA_DIR','/tmp/cephepro-cad'));ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
DB=ROOT/'jobs.sqlite'; KEY=os.environ.get('CAD_SERVICE_KEY',''); pool=ThreadPoolExecutor(max_workers=1); lock=threading.Lock()
@asynccontextmanager
async def lifespan(app):
    recover_jobs()
    yield
app=FastAPI(title='CephePro CAD worker',lifespan=lifespan)
def db():
    conn=sqlite3.connect(DB,timeout=20);conn.row_factory=sqlite3.Row;return conn
with db() as conn:
    conn.execute('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project TEXT,name TEXT,size INTEGER,status TEXT,error TEXT,created REAL)')
def auth(authorization,project):
    if not KEY: raise HTTPException(503,'CAD_SERVICE_KEY yapılandırılmamış.')
    if not secrets.compare_digest(authorization or '','Bearer '+KEY) or not project or len(project)>100: raise HTTPException(403,'Yetkisiz istek.')
def job(identifier,project):
    if not re.fullmatch('[a-f0-9]{32}',identifier): raise HTTPException(400,'İş kimliği geçersiz.')
    with db() as conn: row=conn.execute('SELECT * FROM jobs WHERE id=? AND project=?',(identifier,project)).fetchone()
    if not row: raise HTTPException(404,'İş bulunamadı.')
    return row

def run(identifier):
    with db() as conn:
        row=conn.execute('SELECT * FROM jobs WHERE id=?',(identifier,)).fetchone()
        if not row or row['status'] not in ('queued','processing'): return
        conn.execute('UPDATE jobs SET status=? WHERE id=?',('processing',identifier))
    folder=ROOT/identifier;source=folder/('drawing'+Path(row['name']).suffix.lower())
    try:
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('convert.py')),str(source),str(folder/'result.json')],capture_output=True,text=True,timeout=150,env={**os.environ,'OPENBLAS_NUM_THREADS':'1','QT_QPA_PLATFORM':'offscreen'},check=False)
        if result.returncode: raise ValueError(result.stderr[-500:] or 'CAD dönüşümü başarısız.')
        with db() as conn: conn.execute('UPDATE jobs SET status=? WHERE id=?',('ready',identifier))
    except Exception as exc:
        with db() as conn: conn.execute('UPDATE jobs SET status=?,error=? WHERE id=?',('failed',str(exc)[:500],identifier))
def recover_jobs():
    with db() as conn:
        expired=conn.execute('SELECT id FROM jobs WHERE created<?',(time.time()-7*86400,)).fetchall()
        for row in expired:
            if re.fullmatch('[a-f0-9]{32}',row['id']): shutil.rmtree(ROOT/row['id'],ignore_errors=True)
        conn.execute('DELETE FROM jobs WHERE created<?',(time.time()-7*86400,))
    with db() as conn: rows=conn.execute("SELECT id FROM jobs WHERE status IN ('queued','processing')").fetchall()
    for row in rows: pool.submit(run,row['id'])
class Start(BaseModel):
    name:str=Field(max_length=200);size:int=Field(gt=0,le=40_000_000)
class Chunk(BaseModel):
    id:str;index:int=Field(ge=0,lt=45);data:str=Field(max_length=1_400_000)
class Finish(BaseModel): id:str
@app.post('/uploads')
def start(body:Start,authorization:str=Header(''),x_project_id:str=Header('')):
    auth(authorization,x_project_id)
    if Path(body.name).suffix.lower() not in ('.dwg','.dxf'): raise HTTPException(400,'DWG/DXF gerekli.')
    with db() as conn:
        n=conn.execute("SELECT count(*) FROM jobs WHERE project=? AND created>?",(x_project_id,time.time()-3600)).fetchone()[0]
        if n>=20: raise HTTPException(429,'Saatlik çizim sınırına ulaşıldı.')
        identifier=secrets.token_hex(16);conn.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',(identifier,x_project_id,Path(body.name).name,body.size,'uploading','',time.time()))
    (ROOT/identifier).mkdir(mode=0o700);return {'id':identifier}
@app.post('/uploads/chunk')
def chunk(body:Chunk,authorization:str=Header(''),x_project_id:str=Header('')):
    auth(authorization,x_project_id);row=job(body.id,x_project_id)
    if row['status']!='uploading': raise HTTPException(409,'Yükleme tamamlandı.')
    try: data=base64.b64decode(body.data,validate=True)
    except Exception: raise HTTPException(400,'Parça kodlaması geçersiz.')
    expected=min(900000,row['size']-body.index*900000)
    if expected<=0 or len(data)!=expected: raise HTTPException(400,'Parça boyutu/sırası geçersiz.')
    path=ROOT/body.id/('part-'+str(body.index))
    with lock:
        if job(body.id,x_project_id)['status']!='uploading': raise HTTPException(409,'Yükleme tamamlandı.')
        if path.exists() and path.read_bytes()!=data: raise HTTPException(409,'Aynı parça farklı içerikle gönderildi.')
        path.write_bytes(data)
    return {'ok':True}
@app.post('/uploads/finish')
def finish(body:Finish,authorization:str=Header(''),x_project_id:str=Header('')):
    auth(authorization,x_project_id);row=job(body.id,x_project_id)
    if row['status']!='uploading': return {'id':body.id,'status':row['status']}
    folder=ROOT/body.id;parts=[folder/('part-'+str(i)) for i in range((row['size']+899999)//900000)]
    if any(not p.exists() for p in parts) or sum(p.stat().st_size for p in parts)!=row['size']: raise HTTPException(400,'Dosya parçaları eksik.')
    with lock:
        current=job(body.id,x_project_id)
        if current['status']!='uploading': return {'id':body.id,'status':current['status']}
        target=folder/('drawing'+Path(row['name']).suffix.lower())
        with target.open('wb') as output:
            for p in parts: output.write(p.read_bytes())
        for p in parts: p.unlink()
        with db() as conn: conn.execute('UPDATE jobs SET status=? WHERE id=?',('queued',body.id))
    pool.submit(run,body.id);return {'id':body.id,'status':'queued'}
@app.get('/jobs/{identifier}')
def get_job(identifier:str,authorization:str=Header(''),x_project_id:str=Header('')):
    auth(authorization,x_project_id);row=job(identifier,x_project_id)
    out={'id':identifier,'status':row['status'],'error':row['error']}
    if row['status']=='ready': out['map']=json.loads((ROOT/identifier/'result.json').read_text(encoding='utf8'))
    return out
@app.get('/health')
def health(): return {'ok':True,'service':'cad-worker'}
