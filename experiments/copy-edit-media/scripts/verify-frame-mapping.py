"""读回独立Android测试应用的本轮成片；每一帧检查条码、PTS、尺寸和音轨长度。"""
import argparse, hashlib, json, pathlib, subprocess
from android_evidence import read

p=argparse.ArgumentParser();p.add_argument('--serial',required=True);p.add_argument('--adb',required=True);p.add_argument('--output',required=True);args=p.parse_args()
assert args.serial.startswith('emulator-')
root=pathlib.Path(__file__).resolve().parents[3];out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
cases=json.loads((root/'experiments/copy-edit-media/app/src/main/assets/fixtures/native-mapping-expectations.json').read_text())
adb=[args.adb,'-s',args.serial];results=[]
for case in cases:
    for profile in case['profiles']:
        name=f"native-mapping-{case['name']}-{profile}.mp4";file=out/name
        file.write_bytes(read(adb,name))
        probe=json.loads(subprocess.check_output(['E:/ffmpeg/bin/ffprobe.exe','-v','error','-show_streams','-show_frames','-of','json',str(file)]))
        video=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
        frames=[f for f in probe['frames'] if f['media_type']=='video'];expected=case['expectedFrames']
        assert len(frames)==expected,(name,'count',len(frames),expected)
        rotation=next((s.get('rotation',0) for s in video.get('side_data_list',[]) if s.get('side_data_type')=='Display Matrix'),0)
        display=(video['height'],video['width']) if abs(rotation)%180==90 else (video['width'],video['height'])
        assert display==((360,640) if profile=='preview' else (1080,1920)),(name,display)
        pts=[round(float(f['best_effort_timestamp_time'])*1e6) for f in frames]
        assert all(abs(t-round(n*1e6/30))<=2 for n,t in enumerate(pts)),(name,'pts',pts)
        raw=subprocess.check_output(['E:/ffmpeg/bin/ffmpeg.exe','-v','error','-i',str(file),'-an','-vf','scale=360:640,crop=200:32:32:32','-pix_fmt','gray','-fps_mode','passthrough','-f','rawvideo','-'])
        assert len(raw)==expected*200*32
        actual=[]
        for n in range(expected):
            frame=raw[n*6400:(n+1)*6400];code=0
            for bit in range(8):
                mean=sum(frame[y*200+x] for y in range(12,20) for x in range(5+bit*24,11+bit*24))/48
                if mean>128:code|=1<<bit
            actual.append(code)
        assert actual==case['barcodes'],(name,'wrong-source-frames',[(n,a,b) for n,(a,b) in enumerate(zip(actual,case['barcodes'])) if a!=b][:12])
        assert abs(float(video['duration'])-expected/30)<.00001
        assert abs(float(audio['duration'])-expected/30)<.025,(name,'audio duration',audio['duration'])
        results.append(dict(name=name,frames=expected,allBarcodesMatch=True,maxPtsErrorUs=max(abs(t-round(n*1e6/30)) for n,t in enumerate(pts)),audioDuration=audio['duration'],bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
        print(name,'PASS',expected,flush=True)
(out/'readback.json').write_text(json.dumps(dict(passed=True,outputs=len(results),frames=sum(x['frames'] for x in results),results=results),indent=2))
