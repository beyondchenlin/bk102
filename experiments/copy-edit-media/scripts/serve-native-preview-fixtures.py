"""只读自制夹具服务；不连接工作台、不创建工程、不接受写入。"""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import json,hashlib,shutil
from urllib.parse import urlparse,parse_qs

fixtures=Path(__file__).resolve().parents[1]/'app/src/main/assets/fixtures'
assets={a['assetId'] for a in json.loads((fixtures/'native-assets.json').read_text(encoding='utf8'))}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  try:
   length=int(self.headers.get('Content-Length',0));assert 0<length<4096
   request=json.loads(self.rfile.read(length));args=request['payload']['args']
   assert self.path=='/api/copyEdit/nativePlan' and args['revision']==1 and args['profile']=='preview'
   assert args['projectId'] in ('native-fixture-4','native-fixture-60');seconds=int(args['projectId'].rsplit('-',1)[1])
   envelope=json.loads((fixtures/f'native-plan-{seconds}-1.json').read_text(encoding='utf8'));plan=json.loads(envelope['planJson']);plan['projectId']=args['projectId'];raw=json.dumps(plan,ensure_ascii=False,separators=(',',':'))
   envelope.update(projectId=args['projectId'],profile='preview',planJson=raw,planHash=hashlib.sha256(raw.encode()).hexdigest())
   body=json.dumps({'result':{'ok':True,'value':envelope}},ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  except Exception:self.send_error(400)
 def do_GET(self):
  request=urlparse(self.path);name=parse_qs(request.query).get('assetId',[''])[0]
  if request.path!='/api/copy-edit/media' or name not in assets:self.send_error(404);return
  file=fixtures/name;self.send_response(200);self.send_header('Content-Length',str(file.stat().st_size));self.end_headers()
  try:
   with file.open('rb') as source:shutil.copyfileobj(source,self.wfile,65536)
  except (BrokenPipeError,ConnectionResetError):pass
print('Read-only native preview fixtures: 127.0.0.1:61329',flush=True)
ThreadingHTTPServer(('127.0.0.1',61329),Handler).serve_forever()
