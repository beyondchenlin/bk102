"""独立解码单帧、VFR、60 秒验证输出的帧条码。"""
import json,pathlib,subprocess,sys
directory=pathlib.Path(sys.argv[1]);report=json.loads((directory/'report.json').read_text(encoding='utf8'));checks=[]
for record in report['checks']:
    case=record.get('case')
    if not case:continue
    file=directory/'jobs'/record['jobId']/'output.mp4'
    expected=([i%120 for i in range(1800)] if case=='60-seconds' else [59,60,60,62,62,64,64,66,66] if case=='vfr' else list(range(record['first'],record['last'])))
    cmd=['E:/ffmpeg/bin/ffmpeg.exe','-v','error','-i',str(file),'-an','-vf','crop=212:50:24:24,format=gray','-fps_mode','passthrough','-f','rawvideo','pipe:1']
    p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE);codes=[]
    while True:
        pixels=p.stdout.read(212*50)
        if not pixels:break
        assert len(pixels)==212*50
        codes.append(sum(1<<bit for bit in range(8) if pixels[24*212+16+24*bit]>180))
    error=p.stderr.read();assert p.wait()==0,error
    checks.append({'case':case,'frames':len(codes),'expectedFrames':len(expected),'pass':codes==expected,'firstCodes':codes[:10],'lastCodes':codes[-4:]})
output={'checks':checks,'pass':all(c['pass'] for c in checks)}
(directory/'boundary-readback.json').write_text(json.dumps(output,indent=2),encoding='utf8');print(json.dumps(output));raise SystemExit(0 if output['pass'] else 1)
