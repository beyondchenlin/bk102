package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.SurfaceView;
import android.view.View;
import android.widget.*;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.SeekParameters;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.transformer.*;
import androidx.media3.effect.DebugTraceUtil;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

/** 临时验证入口；不伪装成编辑器，不运行用户输入的路径或脚本。 */
@androidx.annotation.OptIn(markerClass = {androidx.media3.common.util.UnstableApi.class, androidx.media3.common.util.ExperimentalApi.class})
public final class SpikeActivity extends Activity {
    private final ExecutorService worker=new java.util.concurrent.ThreadPoolExecutor(1,1,0,java.util.concurrent.TimeUnit.MILLISECONDS,new java.util.concurrent.ArrayBlockingQueue<>(1),new java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy());
    private final AtomicInteger generation=new AtomicInteger();
    private final Handler main=new Handler(Looper.getMainLooper());
    private final JSONArray events=new JSONArray();
    private SpikeEngine engine;private CompositionPlayer player;
    private TextView status;private ImageView still;private SurfaceView surface;
    private int selected=17;private long[] sourcePts;private boolean destroyed=false;private boolean exporting=false;
    private boolean boundedSurface;
    private ExoPlayer cachedPlayer;
    private AudioClockTrace audioClockTrace;
    private final MediaTaskGate taskGate=new MediaTaskGate();
    private RunningTask activeTask;
    private long revision=1,playbackEpoch;
    private boolean alternateSticker,foreground,mediaBlocked;
    private static final class RunningTask {
        final MediaTaskGate.Ticket ticket;final RenderJobSnapshot snapshot;final MediaArtifacts.Pending pending;
        final boolean full;final long started=SystemClock.elapsedRealtime();Transformer transformer;
        RunningTask(MediaTaskGate.Ticket ticket,RenderJobSnapshot snapshot,MediaArtifacts.Pending pending,boolean full){this.ticket=ticket;this.snapshot=snapshot;this.pending=pending;this.full=full;}
    }
    private int previewRun;
    private volatile boolean previewPlaying;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        if(state!=null){revision=Math.max(1,state.getLong("revision",1));alternateSticker=state.getBoolean("alternateSticker");selected=Math.max(17,Math.min(76,state.getInt("selected",17)));}
        boundedSurface=SurfacePipeline.affectedEmulator()&&!getIntent().getBooleanExtra("stockSurface",false);
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(20,40,20,20);
        status=new TextView(this);status.setTextSize(16);status.setText("初始化媒体验证");layout.addView(status);
        FrameLayout preview=new FrameLayout(this);surface=new SurfaceView(this);still=new ImageView(this);still.setScaleType(ImageView.ScaleType.FIT_CENTER);
        preview.addView(surface,new FrameLayout.LayoutParams(-1,-1));preview.addView(still,new FrameLayout.LayoutParams(-1,-1));layout.addView(preview,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout frames=new LinearLayout(this);addButton(frames,"−1 帧",()->step(-1));addButton(frames,"+1 帧",()->step(1));layout.addView(frames);
        addButton(layout,"从当前帧连续播放",()->preparePreview(false));
        addButton(layout,"直接合成预览（诊断）",this::play);
        addButton(layout,"连续预览 60 秒",()->preparePreview(true));
        addButton(layout,"暂停",this::releasePlayers);
        addButton(layout,"取消任务",()->cancelTask("用户取消"),true);
        addButton(layout,"切换贴片版本",this::changeRevision,true);
        addButton(layout,"导出 4 秒 1080P",()->export(false));addButton(layout,"导出 60 秒 1080P",()->export(true));
        addButton(layout,"逐帧夹具检查",this::verifyFrames);setContentView(layout);
        record("run-start",json("id",getIntent().getStringExtra("evidenceRunId")));
        worker.execute(()->{try{SpikeEngine prepared=new SpikeEngine(this);long[] pts=ExactFrames.index(prepared.asset("a.mp4"));main.post(()->{if(destroyed)return;engine=prepared;sourcePts=pts;step(0);});}catch(Exception e){fail(e);}});
    }
    private void addButton(LinearLayout parent,String label,Runnable run){addButton(parent,label,run,false);}
    private void addButton(LinearLayout parent,String label,Runnable run,boolean whileBusy){Button button=new Button(this);button.setText(label);button.setOnClickListener(v->{if(engine==null){status.setText("素材尚未就绪");return;}if(exporting&&!whileBusy){status.setText("正在处理媒体任务");return;}try{run.run();}catch(Exception e){fail(e);}});parent.addView(button);}
    private void releasePlayers(){playbackEpoch++;previewPlaying=false;if(player!=null){player.release();player=null;}if(cachedPlayer!=null){cachedPlayer.release();cachedPlayer=null;}if(audioClockTrace!=null){AudioClockTrace trace=audioClockTrace;audioClockTrace=null;trace.save(new File(getFilesDir(),"audio-clock-"+previewRun+".json"));}}
    private void changeRevision(){cancelTask("工程版本变化");releasePlayers();generation.incrementAndGet();revision=Math.incrementExact(revision);alternateSticker=!alternateSticker;record("project-revision",json("revision",revision));status.setText("工程 V"+revision);}
    private void step(int delta){
        releasePlayers();selected=Math.max(17,Math.min(76,selected+delta));final int frame=selected,token=generation.incrementAndGet();
        status.setText("正在定位："+frame);
        worker.execute(()->{try{ExactFrames.Frame result=ExactFrames.decode(engine.asset("a.mp4"),sourcePts[frame],()->token!=generation.get());main.post(()->{if(destroyed||token!=generation.get()){result.bitmap().recycle();return;}still.setVisibility(View.VISIBLE);still.setImageBitmap(result.bitmap());record("frame",json("sourceFrame",frame).put("actualPtsUs",result.ptsUs()).put("barcode",result.barcode()).put("elapsedMs",result.elapsedMs()));status.setText("源帧 "+frame+" · PTS "+result.ptsUs()+" µs");});}catch(java.util.concurrent.CancellationException ignored){}catch(Exception e){fail(e);}});
    }
    private void play(){
        releasePlayers();final long epoch=playbackEpoch;
        DebugTraceUtil.enableTracing=true;DebugTraceUtil.reset();
        generation.incrementAndGet();if(player!=null)player.release();
        CompositionPlayer.Builder builder=new CompositionPlayer.Builder(this);
        if(boundedSurface)builder.setVideoGraphFactory(SurfacePipeline.previewFactory());
        player=builder.build();record("surface-policy",json("bounded",boundedSurface));
        player.setVideoSurfaceView(surface);
        player.addListener(new Player.Listener(){
            @Override public void onRenderedFirstFrame(){if(!playbackCurrent(epoch))return;still.setVisibility(View.GONE);record("preview-first-frame",new JSONObject());}
            @Override public void onPlaybackStateChanged(int state){if(!playbackCurrent(epoch))return;record("preview-state",json("state",state));if(state==Player.STATE_ENDED){record("preview-trace",json("trace",DebugTraceUtil.generateTraceSummary()));status.setText("连续预览结束");}}
            @Override public void onPlayerError(PlaybackException error){if(playbackCurrent(epoch))fail(error);}
        });
        player.setVideoFrameMetadataListener((pts,release,format,mediaFormat)->{
            // 记录组合输出 PTS 和呈现节奏；不把此回调直接当实际屏幕/扬声器验收。
            main.post(()->{if(playbackCurrent(epoch))record("preview-frame",json("ptsUs",pts).put("releaseNs",release));});
        });
        try{player.setComposition(engine.composition(engine.snapshot(false,revision,alternateSticker,true)),(sourcePts[selected]-sourcePts[17])/1000);player.prepare();player.play();status.setText("连续预览：A → B");}catch(Exception e){fail(e);}
    }
    private void preparePreview(boolean full) {
        generation.incrementAndGet();releasePlayers();
        try{RenderJobSnapshot snapshot=engine.snapshot(full,revision,alternateSticker,true);File cached=engine.artifacts.lookup(full?"preview-60s.mp4":"preview-4s.mp4",snapshot.key());if(cached!=null){startCachedPreview(cached,full,true,snapshot);return;}beginTask(snapshot,full);}
        catch(Exception error){fail(error);}
    }
    private boolean playbackCurrent(long epoch){return !destroyed&&foreground&&epoch==playbackEpoch;}
    private void startCachedPreview(File file,boolean full,boolean cacheHit,RenderJobSnapshot snapshot) {
        if(!foreground||destroyed||snapshot.revision()!=revision)return;
        final long epoch=++playbackEpoch;
        final int run=++previewRun;long startUs=sourcePts[selected]-sourcePts[17];
        previewPlaying=false;
        record("preview-start",json("run",run).put("mode","local-cache").put("seconds",full?60:4).put("startUs",startUs).put("cacheHit",cacheHit).put("revision",snapshot.revision()).put("snapshotKey",snapshot.key()));
        audioClockTrace=getIntent().getBooleanExtra("audioClockTrace",false)?new AudioClockTrace():null;
        DefaultRenderersFactory renderers=new DefaultRenderersFactory(this){
            @Override protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(android.content.Context context,boolean floating,boolean playbackParams){
                if(audioClockTrace==null)return NativePreviewAudio.sink(context,floating,playbackParams);
                return new androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context).setEnableFloatOutput(floating).setEnableAudioOutputPlaybackParameters(playbackParams).setAudioOutputProvider(audioClockTrace.provider(context,getIntent().getBooleanExtra("naturalDrain",false))).build();
            }
        }.forceEnableMediaCodecAsynchronousQueueing();
        // 显式诊断对照：只改变本独立页面的播放解码器，不改变导出/共享模块或门禁。
        boolean software=getIntent().getBooleanExtra("softwarePreview",false);
        if(software)renderers.setMediaCodecSelector((mime,secure,tunnel)->{
            java.util.List<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> codecs=androidx.media3.exoplayer.mediacodec.MediaCodecUtil.getDecoderInfos(mime,secure,tunnel);
            java.util.ArrayList<androidx.media3.exoplayer.mediacodec.MediaCodecInfo> selected=new java.util.ArrayList<>();
            for(var codec:codecs)if(codec.softwareOnly)selected.add(codec);
            return selected;
        });
        record("preview-decoder-policy",json("run",run).put("softwareOnly",software));
        cachedPlayer=new ExoPlayer.Builder(this,renderers).build();cachedPlayer.setSeekParameters(SeekParameters.EXACT);cachedPlayer.setVideoSurfaceView(surface);
        cachedPlayer.addAnalyticsListener(new androidx.media3.exoplayer.analytics.AnalyticsListener(){
            @Override public void onVideoDecoderInitialized(EventTime time,String name,long at,long duration){if(playbackCurrent(epoch))record("preview-decoder",json("run",run).put("name",name).put("durationMs",duration));}
            @Override public void onDroppedVideoFrames(EventTime time,int count,long elapsed){if(playbackCurrent(epoch))record("preview-dropped",json("run",run).put("count",count).put("elapsedMs",elapsed));}
            @Override public void onAudioUnderrun(EventTime time,int size,long duration,long elapsed){if(playbackCurrent(epoch))record("preview-audio-underrun",json("run",run).put("bufferBytes",size).put("bufferMs",duration).put("sinceFeedMs",elapsed));}
        });
        cachedPlayer.addListener(new Player.Listener(){
            @Override public void onRenderedFirstFrame(){if(!playbackCurrent(epoch))return;still.setVisibility(View.GONE);record("preview-first-frame",json("run",run));cachedPlayer.play();}
            @Override public void onIsPlayingChanged(boolean playing){if(!playbackCurrent(epoch))return;previewPlaying=playing;record("preview-playing",json("run",run).put("playing",playing));if(playing)status.setText("连续预览 · V"+snapshot.revision());}
            @Override public void onPlaybackStateChanged(int state){if(!playbackCurrent(epoch))return;record("preview-state",json("run",run).put("state",state));if(state==Player.STATE_ENDED){record("preview-ended",json("run",run));status.setText("连续预览结束");}}
            @Override public void onPlayerError(PlaybackException error){if(playbackCurrent(epoch))fail(error);}
        });
        cachedPlayer.setVideoFrameMetadataListener((pts,release,format,mediaFormat)->{boolean playing=previewPlaying;main.post(()->{if(playbackCurrent(epoch))record("preview-frame",json("run",run).put("ptsUs",pts).put("releaseNs",release).put("playing",playing));});});
        cachedPlayer.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)));cachedPlayer.seekTo(startUs/1000);cachedPlayer.prepare();status.setText("正在准备播放");
    }
    private void export(boolean full){
        generation.incrementAndGet();releasePlayers();
        try{beginTask(engine.snapshot(full,revision,alternateSticker,false),full);}catch(Exception error){fail(error);}
    }
    private boolean current(RunningTask task){return !destroyed&&foreground&&activeTask==task&&taskGate.isCurrent(task.ticket,revision);}
    private void beginTask(RenderJobSnapshot snapshot,boolean full)throws Exception {
        if(!foreground||destroyed||mediaBlocked)throw new IllegalStateException("MEDIA_SESSION_UNAVAILABLE");
        DebugTraceUtil.enableTracing=true;DebugTraceUtil.reset();
        String name=(snapshot.preview()?"preview-":"export-")+(full?"60s.mp4":"4s.mp4");
        MediaTaskGate.Ticket ticket=taskGate.begin(snapshot);MediaArtifacts.Pending pending;
        try{pending=engine.artifacts.begin(name,snapshot.key());}catch(Exception error){taskGate.cancel();throw error;}
        RunningTask task=new RunningTask(ticket,snapshot,pending,full);activeTask=task;exporting=true;
        try {
            record(snapshot.preview()?"preview-cache-start":"export-start",json("file",name).put("bounded",boundedSurface).put("task",ticket.id()).put("revision",snapshot.revision()).put("snapshotKey",snapshot.key()).put("planAdapter",snapshot instanceof FrozenRenderPlan?"frozen-native-v1":"legacy-fixed"));
            task.transformer=engine.exporter(new Transformer.Listener(){
                @Override public void onCompleted(Composition value,ExportResult result){
                    if(!current(task))return;
                    worker.execute(()->{try{
                        if(result.videoFrameCount!=snapshot.expectedFrames())throw new IllegalStateException("OUTPUT_FRAME_COUNT "+result.videoFrameCount);
                        NativeOutputVerifier.verify(task.pending.path().toFile(),snapshot);
                        main.post(()->{if(!current(task))return;try{
                        File out=engine.artifacts.commit(task.pending);taskGate.finish(ticket,revision);activeTask=null;exporting=false;
                        record(snapshot.preview()?"preview-cache-ready":"export-completed",json("file",name).put("task",ticket.id()).put("revision",snapshot.revision()).put("snapshotKey",snapshot.key()).put("elapsedMs",SystemClock.elapsedRealtime()-task.started).put("bytes",out.length()).put("videoFrames",result.videoFrameCount).put("durationMs",result.durationMs).put("videoEncoder",result.videoEncoderName).put("audioEncoder",result.audioEncoderName));
                        record(snapshot.preview()?"preview-cache-trace":"export-trace",json("file",name).put("trace",DebugTraceUtil.generateTraceSummary()));
                        if(snapshot.preview())startCachedPreview(out,full,false,snapshot);else status.setText("已导出 "+out.getName()+"；待读回核验");
                        }catch(Exception error){if(activeTask==task)failTask(task,error);else fail(error);}});
                    }catch(Exception error){main.post(()->{if(current(task))failTask(task,error);});}});
                }
                @Override public void onError(Composition value,ExportResult result,ExportException error){if(current(task))failTask(task,error);}
            },boundedSurface,snapshot);
            task.transformer.start(engine.composition(snapshot),pending.path().toString());status.setText(snapshot.preview()?"正在准备连续预览":"本地编码 "+(full?60:4)+" 秒 1080P");
        }catch(Exception error){failTask(task,error);}
    }
    private void failTask(RunningTask task,Exception error){if(activeTask==task){cancelTask("任务失败");fail(error);}}
    private void cancelTask(String reason){
        RunningTask task=activeTask;if(task==null)return;
        // 先退休，再调用可能同步触发回调的底层取消；旧回调无法发布或抢占新任务。
        activeTask=null;exporting=false;taskGate.cancel();
        try{if(task.transformer!=null)task.transformer.cancel();engine.artifacts.discard(task.pending);record("task-cancelled",json("task",task.ticket.id()).put("revision",task.snapshot.revision()).put("reason",reason).put("pendingFiles",engine.artifacts.pendingCount()));status.setText("任务已取消");}
        catch(Exception error){mediaBlocked=true;record("task-cleanup-error",json("task",task.ticket.id()).put("message",error.toString()));fail(error);}
    }
    private void verifyFrames(){
        int token=generation.incrementAndGet();status.setText("检查 CFR、B 帧、VFR、60 fps");
        worker.execute(()->{try{
            for(String name:new String[]{"a.mp4","b.mp4","bframes.mp4","vfr.mp4","60fps.mp4"}){
                long[] pts=ExactFrames.index(engine.asset(name));
                for(int frame:new int[]{0,1,17,18,17,pts.length-1}){
                    ExactFrames.Frame result=ExactFrames.decode(engine.asset(name),pts[frame],()->token!=generation.get());
                    int expectedBarcode=(name.equals("vfr.mp4")&&frame>=60 ? 60+(frame-60)*2 : frame)%256;
                    boolean pass=result.ptsUs()==pts[frame] && result.barcode()==expectedBarcode;
                    result.bitmap().recycle();JSONObject event=json("asset",name).put("frame",frame).put("actualPtsUs",result.ptsUs()).put("barcode",result.barcode()).put("pass",pass).put("elapsedMs",result.elapsedMs());
                    main.post(()->{if(!destroyed&&token==generation.get())record("frame-check",event);});if(!pass)throw new IllegalStateException("FRAME_MISMATCH "+name+" "+frame);
                }
            }main.post(()->{if(!destroyed&&token==generation.get())status.setText("逐帧夹具检查完成；见 evidence.json");});
        }catch(java.util.concurrent.CancellationException ignored){}catch(Exception e){if(token==generation.get())fail(e);}});
    }
    private static SafeJson json(String key,Object value){return new SafeJson().put(key,value);}
    private static final class SafeJson extends JSONObject {
        @Override public SafeJson put(String key,Object value){try{super.put(key,value);return this;}catch(Exception e){throw new IllegalStateException(e);}}
        @Override public SafeJson put(String key,long value){return put(key,Long.valueOf(value));}
        @Override public SafeJson put(String key,int value){return put(key,Integer.valueOf(value));}
        @Override public SafeJson put(String key,boolean value){return put(key,Boolean.valueOf(value));}
        @Override public SafeJson put(String key,double value){return put(key,Double.valueOf(value));}
    }
    private void record(String type,JSONObject value){try{value.put("type",type);value.put("elapsedRealtimeMs",SystemClock.elapsedRealtime());if(events.length()>=6500)throw new IllegalStateException("EVIDENCE_LIMIT");events.put(value);if(engine!=null&&!type.equals("preview-frame"))Files.write(engine.output("evidence.json").toPath(),events.toString(2).getBytes(StandardCharsets.UTF_8));}catch(Exception e){status.setText("记录失败："+e.getMessage());}}
    private void fail(Exception error){main.post(()->{if(destroyed)return;status.setText("失败："+error.getClass().getSimpleName()+" "+error.getMessage());record("error",json("message",android.util.Log.getStackTraceString(error)).put("trace",DebugTraceUtil.generateTraceSummary()));});}
    @Override public void onStart(){super.onStart();foreground=true;}
    @Override protected void onSaveInstanceState(Bundle state){state.putLong("revision",revision);state.putBoolean("alternateSticker",alternateSticker);state.putInt("selected",selected);super.onSaveInstanceState(state);}
    @Override public void onStop(){foreground=false;generation.incrementAndGet();releasePlayers();cancelTask("切到后台");super.onStop();}
    @Override public void onDestroy(){foreground=false;cancelTask("页面销毁");destroyed=true;generation.incrementAndGet();releasePlayers();worker.shutdown();super.onDestroy();}
}
