"""独立读回浏览器下载成片：检验源帧顺序，而非仅核对帧数。"""
import pathlib, subprocess, json, array, math, hashlib
root=pathlib.Path(__file__).resolve().parents[3]
directory=root/'build/copy-edit-desktop/browser-20261108'
file=directory/'browser-export.mp4'
ffmpeg='E:/ffmpeg/bin/ffmpeg.exe';ffprobe='E:/ffmpeg/bin/ffprobe.exe'
probe=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(file)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'])==(1080,1920) and v['codec_name']=='h264' and a['codec_name']=='aac'
decoder=subprocess.Popen([ffmpeg,'-v','error','-i',str(file),'-an','-vf','crop=720:200:0:0,format=gray','-fps_mode','passthrough','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
codes=[]
while True:
    pixels=decoder.stdout.read(720*200)
    if not pixels:break
    assert len(pixels)==720*200
    scale=3 if len(codes)<60 else 1  # 首段来自 360P B 帧源，第二段来自 1080P 源。
    codes.append(sum(1<<bit for bit in range(8) if pixels[48*scale*720+(40+24*bit)*scale]>180))
error=decoder.stderr.read();assert decoder.wait()==0,error
expected=list(range(7,67))+list(range(11,71))
raw=subprocess.check_output([ffmpeg,'-v','error','-i',str(file),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'])
samples=array.array('f');samples.frombytes(raw)
def energy(t,freq):
    window=samples[round(t*48000):round(t*48000)+2400]
    return 2*abs(sum(v*complex(math.cos(2*math.pi*freq*i/48000),math.sin(2*math.pi*freq*i/48000)) for i,v in enumerate(window)))/len(window)
tones=[{'time':t,'voice880':energy(t,880),'bgm220':energy(t,220)} for t in [0.02,0.2,1.02,2.02,3.02]]
timestamps=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(file)]))
pts=[round(float(f['best_effort_timestamp_time'])*1e6) for f in timestamps['frames']]
state=json.loads((root/'build/copy-edit-spike/home/copy-edit/state.json').read_text(encoding='utf8'))
p=next(p for p in state['projects'] if p['projectId']=='copy-edit-workspace')
png=next(a for a in state['assets'] if a['assetId']==p['sticker']['assetId'])
alpha=subprocess.check_output([ffmpeg,'-v','error','-f','image2','-c:v','png','-i',str(root/'build/copy-edit-spike/home/copy-edit/assets'/png['sha256']),'-vf','alphaextract','-frames:v','1','-f','rawvideo','-pix_fmt','gray','pipe:1'])
overlay=subprocess.check_output([ffmpeg,'-v','error','-i',str(file),'-vf','crop=1080:400:0:230,format=gray','-frames:v','1','-f','rawvideo','pipe:1'])
report={'frames':len(codes),'expectedFrames':120,'barcodesPass':codes==expected,'first':codes[:5],'cut':codes[58:63],'last':codes[-5:],
 'ptsPass':len(pts)==120 and all(abs(t-round(i*1e6/30))<=2 for i,t in enumerate(pts)),
 'audioPass':all(t['bgm220']>0.08 for t in tones) and all(t['voice880']>0.4 for t in tones if t['time']!=0.2) and tones[1]['voice880']<0.03,
 'tones':tones,'stickerAlphaPass':alpha.count(0)>10000 and alpha.count(255)>100,'stickerVisiblePass':sum(b>220 for b in overlay)>500,
 'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':v['width'],'height':v['height'],'duration':probe['format']['duration']}
report['pass']=all(report[k] for k in ['barcodesPass','ptsPass','audioPass','stickerAlphaPass','stickerVisiblePass'])
(directory/'readback-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False));raise SystemExit(0 if report['pass'] else 1)
