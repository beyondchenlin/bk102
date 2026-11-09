"""本任务的自制小素材，不下载媒体、不读取用户文件。"""
import argparse, hashlib, json, pathlib, subprocess

root = pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--ffmpeg',default='E:/ffmpeg/bin/ffmpeg.exe')
parser.add_argument('--ffprobe',default='E:/ffmpeg/bin/ffprobe.exe')
parser.add_argument('--main-b-frames',type=int,default=0)
args=parser.parse_args()
target=root/'experiments/copy-edit-media/app/src/main/assets/fixtures'
target.mkdir(parents=True,exist_ok=True)

def run(command):
    result=subprocess.run(command,capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.decode('utf8',errors='replace'))

manifest={'schema':1,'generator':'fixtures.py','sources':[]}
for name,rate,color,vfr in [('a.mp4',30,'0x183744',False),('b.mp4',30,'0x553228',False),('bframes.mp4',30,'0x183744',False),('vfr.mp4',30,'0x28384a',True),('60fps.mp4',60,'0x184430',False)]:
    # 固定 8 位亮度条码携带编码前帧序号；非关键帧剪裁不能靠时长蒙混通过。
    filters=['drawbox=x=24:y=24:w=212:h=50:color=black:t=fill']
    for bit in range(8):
        filters.append(f"drawbox=x={32+bit*24}:y=32:w=16:h=32:color=white:t=fill:enable='mod(floor(n/{2**bit}),2)'")
    filters.append("drawbox=x=280:y=200:w=80:h=80:color=white:t=fill:enable='lt(mod(t,1),0.1)'")
    if vfr: filters.append("select='if(lt(n,60),1,not(mod(n,2)))'")
    main=name in ('a.mp4','b.mp4')
    size='1080x1920' if main else '360x640'
    run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i',f'color=c={color}:s={size}:r={rate}:d=4','-vf',','.join(filters),'-fps_mode','vfr','-c:v','libx264','-preset','fast','-g',str(rate*3),'-bf',str(args.main_b_frames if main else 3),'-pix_fmt','yuv420p','-an',str(target/name)])
    result=json.loads(subprocess.check_output([args.ffprobe,'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,key_frame,pict_type','-of','json',str(target/name)]))
    frames=result['frames']
    manifest['sources'].append({'file':name,'size':size,'sha256':hashlib.sha256((target/name).read_bytes()).hexdigest(),'frames':len(frames),'ptsUs':[round(float(f['best_effort_timestamp_time'])*1_000_000) for f in frames],'barcodes':[(i if not vfr or i<60 else 60+(i-60)*2)%256 for i in range(len(frames))],'bFrames':sum(f['pict_type']=='B' for f in frames),'keyFrames':sum(f['key_frame'] for f in frames)})
for name,freq in [('voice.wav',880),('bgm.wav',220)]:
    expression=f'sin(2*PI*{freq}*t)' + ('*lt(mod(t,1),0.1)' if name=='voice.wav' else '')
    run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i',f"aevalsrc='{expression}':s=48000:d=60",'-ac','2','-c:a','pcm_s16le',str(target/name)])
(target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'bytes':sum(p.stat().st_size for p in target.iterdir()),'sources':[{k:v for k,v in s.items() if k not in ('ptsUs','barcodes')} for s in manifest['sources']]},ensure_ascii=False))
