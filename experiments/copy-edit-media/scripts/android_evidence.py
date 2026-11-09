"""非调试独立包通过同签名测试runner导出白名单证据；不要求root或用户存储权限。"""
import base64,re,subprocess
RUNNER='dsh.copyedit.spike.test/dsh.copyedit.spike.EvidenceRunner'
def read(adb,name):
    raw=subprocess.check_output(adb+['shell','am','instrument','-w','-r','-e','exportFile',name,RUNNER],timeout=60)
    assert b'INSTRUMENTATION_CODE: -1' in raw and b'evidenceError' not in raw,'TEST_EVIDENCE_READ_FAILED'
    chunks=re.findall(rb'^INSTRUMENTATION_STATUS: evidenceChunk=([^\r\n]+)',raw,re.M)
    result=b''.join(base64.b64decode(chunk,validate=True) for chunk in chunks)
    size=re.search(rb'INSTRUMENTATION_RESULT: evidenceBytes=(\d+)',raw)
    assert size and len(result)==int(size[1]) and len(result)<=128*1024*1024
    return result
def write(adb,name,data):
    assert len(data)<768*1024
    raw=subprocess.check_output(adb+['shell','am','instrument','-w','-r','-e','importFile',name,'-e','inputBase64',base64.b64encode(data).decode(),RUNNER],timeout=30)
    assert b'INSTRUMENTATION_CODE: -1' in raw and b'evidenceError' not in raw,'TEST_INPUT_WRITE_FAILED'
