"""读回 Android 实际成片：逐帧条码、1080P、音轨、透明 PNG、预览节奏。"""
import argparse, array, json, math, pathlib, subprocess, hashlib
root=pathlib.Path(__file__).resolve().parents[3]
p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--export-only',action='store_true');p.add_argument('--seconds',type=int,choices=[4,60],nargs='+',default=[4,60]);p.add_argument('--ffmpeg',default='E:/ffmpeg/bin/ffmpeg.exe');p.add_argument('--ffprobe',default='E:/ffmpeg/bin/ffprobe.exe');args=p.parse_args()
directory=pathlib.Path(args.directory);results=[]
events=json.loads((directory/'evidence.json').read_text(encoding='utf8'))
adapter_events=[e for e in events if e['type'] in ['export-start','preview-cache-start']]
native_path=bool(adapter_events) and all(e.get('planAdapter')=='frozen-native-v1' for e in adapter_events)
produced={e['file'] for e in events if e['type'] in ['export-completed','preview-cache-ready']}
targets=[(s,'export') for s in args.seconds]+[(s,'preview') for s in args.seconds if not args.export_only]
for seconds,kind in targets:
    expected_count=seconds*30
    file=directory/f'{kind}-{seconds}s.mp4'
    if file.name not in produced or not file.exists() or not file.stat().st_size:results.append({'kind':kind,'seconds':seconds,'status':'MISSING_FROM_THIS_RUN'});continue
    probed=subprocess.run([args.ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(file)],capture_output=True)
    if probed.returncode:results.append({'seconds':seconds,'status':'INVALID_OR_NOT_PRODUCED','diagnostic':probed.stderr.decode(errors='replace')[:500]});continue
    probe=json.loads(probed.stdout)
    video=next(s for s in probe['streams'] if s['codec_type']=='video');audio=next(s for s in probe['streams'] if s['codec_type']=='audio')
    assert sorted([video['width'],video['height']])==([1080,1920] if kind=='export' else [360,640])
    assert video['codec_name']=='h264' and audio['codec_name']=='aac'
    # 生成器在 1080P 原素材坐标 (32+i*24, 32) 写入亮度条码。
    command=[args.ffmpeg,'-v','error','-i',str(file),'-an','-vf','scale=1080:1920,crop=212:50:24:24,format=gray','-fps_mode','passthrough','-f','rawvideo','pipe:1']
    decoder=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE);barcodes=[]
    while True:
        frame=decoder.stdout.read(212*50)
        if not frame:break
        assert len(frame)==212*50
        barcodes.append(sum((1<<bit) for bit in range(8) if frame[24*212+16+bit*24]>180))
    error=decoder.stderr.read();assert decoder.wait()==0,error.decode(errors='replace')
    expected=[(17+i%60 if (i//60)%2==0 else 23+i%60) for i in range(expected_count)]
    mismatches=[{'frame':i,'expected':expected[i],'actual':barcodes[i]} for i in range(min(len(barcodes),expected_count)) if barcodes[i]!=expected[i]]
    raw=subprocess.check_output([args.ffmpeg,'-v','error','-i',str(file),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'])
    samples=array.array('f');samples.frombytes(raw)
    def energy(time,freq):
        start=int(time*48000);window=samples[start:start+2400]
        return 2*abs(sum(v*complex(math.cos(2*math.pi*freq*i/48000),math.sin(2*math.pi*freq*i/48000)) for i,v in enumerate(window)))/len(window)
    tones=[{'t':t,'voice880':energy(t,880),'bgm220':energy(t,220)} for t in [0.02,0.2,1.02,2.02,seconds-0.8]]
    pulses=[energy(t+0.02,880) for t in range(seconds)]
    audio_ok=all(t['bgm220']>0.04 for t in tones) and min(pulses)>0.2 and tones[1]['voice880']<0.03
    timing=json.loads(subprocess.check_output([args.ffprobe,'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(file)]))
    pts=[round(float(f['best_effort_timestamp_time'])*1e6) for f in timing['frames']]
    pts_ok=len(pts)==expected_count and all(abs(t-round(i*1e6/30))<=2 for i,t in enumerate(pts))
    pass_video=len(barcodes)==expected_count and not mismatches
    sticker_frames=[]
    if native_path:
        selected=[0,59,60,expected_count-1]
        select='+'.join(f'eq(n,{n})' for n in selected)
        process=subprocess.Popen([args.ffmpeg,'-v','error','-i',str(file),'-an','-vf',f"select='{select}',scale=1080:1920,format=gray",'-fps_mode','passthrough','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        for n in selected:
            pixels=process.stdout.read(1080*1920);assert len(pixels)==1080*1920
            def whites(top,bottom):return sum(sum(v>180 for v in pixels[y*1080+160:y*1080+920]) for y in range(top,bottom))
            lower=whites(1300,1600);upper=whites(1000,1250)
            sticker_frames.append({'frame':n,'lowerWhitePixels':lower,'upperWhitePixels':upper,'pass':lower>100 and upper<10 if n<60 else upper>100 and lower<10})
        err=process.stderr.read();assert process.wait()==0,err
    results.append({'kind':kind,'seconds':seconds,'width':video['width'],'height':video['height'],'duration':probe['format']['duration'],'frames':len(barcodes),'expectedFrames':expected_count,'videoPass':pass_video and pts_ok,'ptsPass':pts_ok,'firstBarcodes':barcodes[:5],'lastBarcodes':barcodes[-5:],'mismatches':mismatches[:12],'audioPass':audio_ok,'testedPulseCount':len(pulses),'tones':tones,'nativeStickerFrames':sticker_frames,'nativeStickerPass':bool(sticker_frames) and all(s['pass'] for s in sticker_frames),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
runs=[]
for start in [e for e in events if e['type']=='preview-start']:
    run=start['run'];frames=[e for e in events if e['type']=='preview-frame' and e.get('run')==run]
    playing=[f for f in frames if f.get('playing')]
    gaps=[(b['releaseNs']-a['releaseNs'])/1e6 for a,b in zip(playing,playing[1:])]
    all_gaps=[(b['releaseNs']-a['releaseNs'])/1e6 for a,b in zip(frames,frames[1:])]
    pts=[e['ptsUs'] for e in frames];first=round(start['startUs']*30/1e6);expected=[round(i*1e6/30) for i in range(first,start['seconds']*30)]
    sequence_ok=len(pts)==len(expected) and all(abs(a-b)<=2 for a,b in zip(pts,expected))
    ended=any(e['type']=='preview-ended' and e.get('run')==run for e in events)
    runs.append({'run':run,'seconds':start['seconds'],'cacheHit':start['cacheHit'],'startUs':start['startUs'],'reportedFrames':len(frames),'ptsSequencePass':sequence_ok,'ended':ended,'maxPlayingGapMs':max(gaps,default=None),'maxGapIncludingPrerollMs':max(all_gaps,default=None),'startupToPlayingFrameMs':playing[0]['elapsedRealtimeMs']-start['elapsedRealtimeMs'] if playing else None,'continuousTimingPass':bool(gaps) and max(gaps)<150 and sequence_ok and ended})
preview={'runs':runs,'continuousTimingPass':bool(runs) and all(r['continuousTimingPass'] for r in runs),'note':'首帧暂停预滚与开始播放分开计时；门禁覆盖全部 PTS 顺序及播放中 150ms 最大间隔。回调不等于实际屏幕/扬声器录测。'}
png=directory/'sticker.png'
alpha=subprocess.check_output([args.ffmpeg,'-v','error','-i',str(png),'-vf','alphaextract','-f','rawvideo','-pix_fmt','gray','pipe:1'])
report={'exports':results,'preview':preview,'sticker':{'transparentPixels':alpha.count(0),'opaquePixels':alpha.count(255),'alphaPass':alpha.count(0)>10000 and alpha.count(255)>100},'frameChecks':len([e for e in events if e['type']=='frame-check' and e.get('pass')])}
report['passed']=all(r.get('videoPass',False) and r.get('audioPass',False) for r in results) and report['sticker']['alphaPass'] and (args.export_only or preview['continuousTimingPass'])
report['nativePlanPath']=native_path
if native_path:report['passed']=report['passed'] and all(r.get('nativeStickerPass',False) for r in results)
device=json.loads((directory/'device.json').read_text(encoding='utf8'))
report.update({k:device.get(k) for k in ['apkSha256','fingerprint']})
report['softwarePreview']=device.get('softwarePreview',False)
report['strictFourSecondGate']=report['passed'] and native_path and args.seconds==[4] and not args.export_only and report['frameChecks']==30 and len(runs)==2 and runs[1]['cacheHit'] and runs[1]['startUs']>0
(directory/'readback-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
raise SystemExit(0 if report['passed'] else 1)
