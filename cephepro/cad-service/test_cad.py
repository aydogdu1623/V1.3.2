import os,sys,tempfile,unittest,json,base64,time
from pathlib import Path
from unittest.mock import patch
import ezdxf
sys.path.insert(0,str(Path(__file__).parent))
from convert import convert,semantic_layers
class CadTests(unittest.TestCase):
 def test_transformed_geometry_and_annotation_removal(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'fixture.dxf';doc=ezdxf.new('R2018');doc.units=6
   block=doc.blocks.new('VILLA');block.add_lwpolyline([(0,0),(10,0),(10,5),(0,5)],close=True)
   doc.modelspace().add_blockref('VILLA',(100,200),dxfattribs={'layer':'BUILDINGS','rotation':90,'xscale':2,'yscale':2})
   doc.modelspace().add_text('SECRET NOTE',dxfattribs={'layer':'TEXT'})
   doc.modelspace().add_line((0,0),(500,500),dxfattribs={'layer':'DIMENSIONS'})
   doc.saveas(path)
   with patch.dict(os.environ,{'OLLAMA_URL':'','OLLAMA_MODEL':''}): result=convert(path)
   self.assertEqual(len(result['features']),1);self.assertEqual(result['units'],'m');f=result['features'][0]
   self.assertEqual(f['geometry']['coordinates'][0][0],[100.0,200.0]);self.assertEqual(f['geometry']['coordinates'][0][1],[100.0,220.0]);self.assertEqual(f['kind'],'building');self.assertEqual(result['source']['mode'],'rules')
 def test_ai_output_is_restricted_to_known_layers_and_categories(self):
  class Response:
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def read(self):return json.dumps({'message':{'content':json.dumps({'layers':[{'layer':'X','kind':'building','confidence':.8},{'layer':'injected','kind':'building','confidence':1},{'layer':'Y','kind':'execute','confidence':1}]})}}).encode()
  with patch.dict(os.environ,{'OLLAMA_URL':'http://localhost:11434','OLLAMA_MODEL':'test'}),patch('urllib.request.urlopen',return_value=Response()):
   result,mode,warnings=semantic_layers({'X':{'layer':'X'},'Y':{'layer':'Y'}})
  self.assertEqual(list(result),['X']);self.assertEqual(mode,'ai')
 def test_chunk_upload_is_project_scoped_and_durable(self):
  from fastapi.testclient import TestClient
  with tempfile.TemporaryDirectory() as directory:
   os.environ['CAD_DATA_DIR']=directory;os.environ['CAD_SERVICE_KEY']='synthetic-test-secret'
   import server
   headers={'Authorization':'Bearer synthetic-test-secret','X-Project-Id':'A'}
   with TestClient(server.app) as client:
    self.assertEqual(client.post('/uploads',json={'name':'a.dxf','size':1}).status_code,403)
    path=Path(directory)/'synthetic.dxf';doc=ezdxf.new();doc.units=6;doc.modelspace().add_lwpolyline([(0,0),(10,0),(10,10),(0,10)],close=True,dxfattribs={'layer':'BUILDING'});doc.saveas(path);data=path.read_bytes()
    result=client.post('/uploads',headers=headers,json={'name':'a.dxf','size':len(data)});self.assertEqual(result.status_code,200);identifier=result.json()['id']
    self.assertEqual(client.get('/jobs/'+identifier,headers={**headers,'X-Project-Id':'B'}).status_code,404)
    payload={'id':identifier,'index':0,'data':base64.b64encode(data).decode()}
    self.assertEqual(client.post('/uploads/chunk',headers=headers,json=payload).status_code,200)
    self.assertEqual(client.post('/uploads/chunk',headers=headers,json=payload).status_code,200)
    self.assertEqual(client.post('/uploads/finish',headers=headers,json={'id':identifier}).status_code,200)
    for _ in range(60):
     result=client.get('/jobs/'+identifier,headers=headers).json()
     if result['status'] in ('ready','failed'):break
     time.sleep(.1)
    self.assertEqual(result['status'],'ready',result);self.assertEqual(len(result['map']['features']),1)
    # Transport test only: arbitrary bytes, no licensed DWG converter or real site data.
    import hashlib
    size=250_000_000
    self.assertEqual(client.post('/uploads',headers=headers,json={'name':'large.dwg','size':size+1}).status_code,422)
    res=client.post('/uploads',headers=headers,json={'name':'large.dwg','size':size});self.assertEqual(res.status_code,200)
    big=res.json()['id'];digest=hashlib.sha256()
    for i,offset in enumerate(range(0,size,900_000)):
     raw=bytes([i%251])*min(900_000,size-offset);digest.update(raw);payload={'id':big,'index':i,'data':base64.b64encode(raw).decode()}
     self.assertEqual(client.post('/uploads/chunk',json=payload,headers=headers).status_code,200,i)
    with patch.object(server.pool,'submit') as submit:
     self.assertEqual(client.post('/uploads/finish',json={'id':big},headers=headers).status_code,200);submit.assert_called_once()
     with (Path(directory)/big/'drawing.dwg').open('rb') as joined:self.assertEqual(hashlib.file_digest(joined,'sha256').digest(),digest.digest())
if __name__=='__main__':unittest.main()
