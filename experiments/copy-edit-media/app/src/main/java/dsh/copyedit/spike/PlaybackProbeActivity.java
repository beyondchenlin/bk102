package dsh.copyedit.spike;

import android.app.Activity;
import android.os.*;
import android.view.SurfaceView;
import androidx.media3.common.*;
import androidx.media3.exoplayer.*;
import androidx.media3.exoplayer.analytics.AnalyticsListener;
import androidx.media3.exoplayer.DecoderCounters;
import com.deepseekharness.media.MediaArtifacts;
import org.json.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** 同一既有代理的播放诊断；禁音仅用于区分时钟，不作为产品门禁。 */
@androidx.annotation.OptIn(markerClass={androidx.media3.common.util.UnstableApi.class})
public final class PlaybackProbeActivity extends Activity {
  private final Handler main=new Handler(Looper.getMainLooper());
  private final JSONArray events=new JSONArray();
  private ExoPlayer player;private DecoderCounters videoCounters;private boolean closed;
  volatile boolean ended;volatile String failure="";private String output;private long started;
  private void event(String type,JSONObject data){try{data.put("type",type).put("elapsedNs",SystemClock.elapsedRealtimeNanos());synchronized(events){if(events.length()<2000)events.put(data);}}catch(Exception e){failure=e.toString();}}
  private SafeJson obj(String key,Object value){return new SafeJson().put(key,value);}
  private static final class SafeJson extends JSONObject {
    @Override public SafeJson put(String key,Object value){try{super.put(key,value);return this;}catch(Exception e){throw new IllegalStateException(e);}}
    @Override public SafeJson put(String key,long value){return put(key,Long.valueOf(value));}
    @Override public SafeJson put(String key,int value){return put(key,Integer.valueOf(value));}
    @Override public SafeJson put(String key,boolean value){return put(key,Boolean.valueOf(value));}
  }
  private final Runnable clock=new Runnable(){@Override public void run(){if(closed||player==null)return;event("clock",obj("positionMs",player.getCurrentPosition()).put("bufferedMs",player.getBufferedPosition()).put("playing",player.isPlaying()).put("state",player.getPlaybackState()));if(!ended)main.postDelayed(this,50);}};
  @Override public void onCreate(Bundle state){
    super.onCreate(state);SurfaceView surface=new SurfaceView(this);setContentView(surface);started=SystemClock.elapsedRealtime();
    boolean disableAudio=getIntent().getBooleanExtra("disableAudio",false),async=getIntent().getBooleanExtra("async",true);
    output=getIntent().getStringExtra("output");if(output==null||!output.matches("playback-probe-[a-z0-9-]+\\.json"))throw new IllegalArgumentException("OUTPUT_ID");
    File source=new File(getCacheDir(),"playback-probe.mp4");
    try{String hash=MediaArtifacts.digest(source);if(!hash.equals(getIntent().getStringExtra("sha256")))throw new IllegalStateException("SOURCE_HASH");event("start",obj("sha256",hash).put("bytes",source.length()).put("disableAudio",disableAudio).put("asynchronousQueue",async));}catch(Exception e){failure=e.toString();ended=true;save();return;}
    DefaultRenderersFactory factory=new DefaultRenderersFactory(this);if(async)factory.forceEnableMediaCodecAsynchronousQueueing();else factory.forceDisableMediaCodecAsynchronousQueueing();
    player=new ExoPlayer.Builder(this,factory).build();player.setSeekParameters(SeekParameters.EXACT);player.setVideoSurfaceView(surface);
    if(disableAudio)player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_AUDIO,true).build());
    player.addAnalyticsListener(new AnalyticsListener(){
      @Override public void onVideoEnabled(EventTime t,DecoderCounters counters){videoCounters=counters;}
      @Override public void onVideoDecoderInitialized(EventTime t,String name,long at,long duration){event("video-decoder",obj("name",name).put("durationMs",duration));}
      @Override public void onAudioDecoderInitialized(EventTime t,String name,long at,long duration){event("audio-decoder",obj("name",name).put("durationMs",duration));}
      @Override public void onDroppedVideoFrames(EventTime t,int count,long elapsed){event("dropped-event",obj("count",count).put("elapsedMs",elapsed));}
      @Override public void onAudioPositionAdvancing(EventTime t,long startMs){event("audio-advancing",obj("startMs",startMs));}
      @Override public void onAudioUnderrun(EventTime t,int size,long duration,long elapsed){event("audio-underrun",obj("bufferBytes",size).put("bufferMs",duration).put("sinceFeedMs",elapsed));}
      @Override public void onAudioSinkError(EventTime t,Exception e){event("audio-sink-error",obj("error",e.toString()));}
    });
    player.addListener(new Player.Listener(){
      @Override public void onRenderedFirstFrame(){event("first-frame",new JSONObject());player.play();}
      @Override public void onIsPlayingChanged(boolean value){event("playing",obj("value",value));}
      @Override public void onPositionDiscontinuity(Player.PositionInfo old,Player.PositionInfo now,int reason){event("position-discontinuity",obj("beforeMs",old.positionMs).put("afterMs",now.positionMs).put("reason",reason));}
      @Override public void onPlaybackStateChanged(int state){event("state",obj("value",state));if(state==Player.STATE_ENDED){ended=true;save();}}
      @Override public void onPlayerError(PlaybackException e){failure=e.toString();ended=true;save();}
    });
    player.setVideoFrameMetadataListener((pts,release,format,media)->event("frame",obj("ptsUs",pts).put("releaseNs",release).put("callbackNs",System.nanoTime())));
    player.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(source)));player.prepare();main.post(clock);
  }
  private void save(){try{JSONObject result=obj("diagnosticOnly",true).put("failure",failure).put("ended",ended).put("elapsedMs",SystemClock.elapsedRealtime()-started);if(videoCounters!=null){videoCounters.ensureUpdated();result.put("counters",obj("rendered",videoCounters.renderedOutputBufferCount).put("dropped",videoCounters.droppedBufferCount).put("droppedInput",videoCounters.droppedInputBufferCount).put("skippedOutput",videoCounters.skippedOutputBufferCount).put("queuedInput",videoCounters.queuedInputBufferCount).put("maxConsecutiveDropped",videoCounters.maxConsecutiveDroppedBufferCount));}synchronized(events){result.put("events",events);Files.write(new File(getFilesDir(),output).toPath(),result.toString(2).getBytes(StandardCharsets.UTF_8));}}catch(Exception e){failure=e.toString();}}
  @Override protected void onStop(){if(player!=null){save();player.release();player=null;}closed=true;main.removeCallbacks(clock);super.onStop();}
}
