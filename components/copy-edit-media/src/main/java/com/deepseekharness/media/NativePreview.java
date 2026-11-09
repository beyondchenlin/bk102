package com.deepseekharness.media;

import android.graphics.Color;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.media3.common.*;
import androidx.media3.exoplayer.*;
import org.json.*;
import java.io.File;
import java.util.function.Consumer;

/** 页面所属的原生预览。网页只传当前结果身份和可见区域，不提供路径或可执行内容。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public final class NativePreview implements AutoCloseable {
    public interface Observer {void frame(long ptsUs,long releaseNs,boolean playing);void dropped(int count);default void displayed(long ptsUs,long renderNs,boolean playing){}default void audio(long positionUs,long atNs){}}
    private final WebView web;private final String id;private final double duration;
    private final Consumer<JSONObject> events;private final Observer observer;
    private final boolean priorKeepScreenOn;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final FrameLayout layer;private final SurfaceView surface;private final ExoPlayer player;
    private boolean waiting,resumeAfterFrame,firstFrame,visible=true,endedPresented;private volatile boolean closed,running;
    private static final class FrameTarget {final long ptsUs;volatile long codecPts=Long.MIN_VALUE;volatile boolean nextReady;FrameTarget(long ptsUs){this.ptsUs=ptsUs;}}
    private volatile FrameTarget pendingFrame=new FrameTarget(0);
    private volatile long decodedPts=Long.MIN_VALUE;
    private Runnable initialFrame;
    private float aspect=9f/16f;private long command,sequence;private String error="";
    private final Runnable timeout=this::prepareTimedOut;
    private final Runnable tick=new Runnable(){public void run(){if(closed)return;emit();if(running)main.postDelayed(this,250);}};

    public NativePreview(WebView web,String id,File file,double duration,JSONObject bounds,Consumer<JSONObject> events,Observer observer)throws Exception {
        if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("MEDIA_MAIN_THREAD_REQUIRED");
        if(!id.matches("[-a-fA-F0-9]{32,36}")||!Double.isFinite(duration)||duration<=0||duration>60)throw new IllegalArgumentException("PREVIEW_IDENTITY");
        this.web=web;this.id=id;this.duration=duration;this.events=events;this.observer=observer;this.priorKeepScreenOn=web.getKeepScreenOn();
        layer=new FrameLayout(web.getContext());layer.setBackgroundColor(Color.rgb(20,22,27));surface=new SurfaceView(web.getContext());surface.setZOrderOnTop(true);layer.addView(surface);
        DefaultRenderersFactory renderers=new DefaultRenderersFactory(web.getContext()){
            @Override protected androidx.media3.exoplayer.audio.AudioSink buildAudioSink(android.content.Context context,boolean floating,boolean parameters){return NativePreviewAudio.sink(context,floating,parameters,observer==null?null:position->observer.audio(position,System.nanoTime()));}
            @Override protected androidx.media3.exoplayer.mediacodec.MediaCodecAdapter.Factory getCodecAdapterFactory(){
                var factory=super.getCodecAdapterFactory();return configuration->{var codec=factory.createAdapter(configuration);
                    if(configuration.format.sampleMimeType!=null&&configuration.format.sampleMimeType.startsWith("video/"))codec=new PreviewCodec(codec,pts->{decodedPts=pts;FrameTarget target=pendingFrame;if(target!=null&&target.codecPts!=Long.MIN_VALUE&&pts>target.codecPts){target.nextReady=true;main.post(NativePreview.this::ready);}});
                    // 系统渲染回执只供验收；API 30允许回执延迟/批量，不作为业务播放时钟。
                    if(observer!=null&&configuration.format.sampleMimeType!=null&&configuration.format.sampleMimeType.startsWith("video/"))codec.setOnFrameRenderedListener((adapter,pts,at)->{if(!closed)observer.displayed(pts,at,running);},main);
                    return codec;};
            }
        // 提前三个30fps帧提交给Surface，由原时间戳定时显示；给冷启动解码留出缓冲。
        // 不修改播放速度、丢帧策略或实际呈现的150ms验收界限。
        }.forceEnableMediaCodecAsynchronousQueueing().setVideoRendererEarlySchedulingThresholdUs(100_000);
        player=new ExoPlayer.Builder(web.getContext(),renderers).build();
        try{
            web.getOverlay().add(layer);layout(bounds);player.setSeekParameters(SeekParameters.EXACT);player.setVideoSurfaceView(surface);
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),true);
            player.addListener(new Player.Listener(){

                @Override public void onVideoSizeChanged(VideoSize size){if(size.height>0){float next=size.width*size.pixelWidthHeightRatio/size.height;if(Math.abs(aspect-next)>.0001f){aspect=next;fit();}}}
                @Override public void onIsPlayingChanged(boolean value){if(closed)return;running=value;web.setKeepScreenOn(value||priorKeepScreenOn);main.removeCallbacks(tick);emit();if(value)main.postDelayed(tick,250);}
                @Override public void onPlaybackStateChanged(int state){if(closed)return;if(state==Player.STATE_READY)ready();if(state==Player.STATE_ENDED){waiting=false;resumeAfterFrame=false;endedPresented=true;main.removeCallbacks(timeout);}emit();}
                @Override public void onPlayerError(PlaybackException failure){if(closed)return;waiting=false;resumeAfterFrame=false;main.removeCallbacks(timeout);error="原生预览失败（"+failure.errorCode+"）";emit();}
            });
            player.setVideoFrameMetadataListener((pts,release,format,mediaFormat)->{
                FrameTarget target=pendingFrame;if(target!=null&&Math.abs(pts-target.ptsUs)<=1){target.codecPts=decodedPts;main.post(()->settleFirstFrame(target));}
                if(observer!=null)observer.frame(pts,release,running);
            });
            if(observer!=null)player.addAnalyticsListener(new androidx.media3.exoplayer.analytics.AnalyticsListener(){@Override public void onDroppedVideoFrames(EventTime time,int count,long elapsed){observer.dropped(count);}});
            player.setMediaItem(MediaItem.fromUri(android.net.Uri.fromFile(file)));player.prepare();
        }catch(Exception failure){close();throw failure;}
    }
    public String id(){return id;}
    private void settleFirstFrame(FrameTarget target){
        if(closed||pendingFrame!=target)return;
        if(initialFrame!=null)surface.removeCallbacks(initialFrame);
        // 解码器排入首帧后完成两次界面帧，让视频层挂载稳定，再启动音频时钟。
        // 单个不可变目标同时绑定PTS和代次，旧定位回调不能与新目标交叉拼接。
        initialFrame=new Runnable(){int frames;public void run(){if(closed||pendingFrame!=target)return;if(++frames<2){surface.postOnAnimation(this);return;}firstFrame=true;initialFrame=null;ready();}};
        surface.postOnAnimation(initialFrame);
    }
    private void prepareTimedOut(){if(!closed&&waiting){waiting=false;resumeAfterFrame=false;player.pause();error="预览画面提交超时，请重试";emit();}}
    private void ready(){if(closed||!waiting||!firstFrame||player.getPlaybackState()!=Player.STATE_READY)return;FrameTarget target=pendingFrame;boolean buffered=target==null||target.nextReady||target.ptsUs>=Math.round((duration-1d/30)*1e6)-1;if(resumeAfterFrame&&!buffered)return;if(buffered)pendingFrame=null;waiting=false;main.removeCallbacks(timeout);if(resumeAfterFrame&&visible)player.play();resumeAfterFrame=false;emit();}
    public JSONObject seek(double seconds,boolean resume)throws Exception {
        if(closed||!Double.isFinite(seconds))throw new IllegalArgumentException("PREVIEW_RETIRED_OR_POSITION");
        boolean samePausedPosition=!player.isPlaying()&&firstFrame&&Math.abs(player.getCurrentPosition()/1000d-seconds)<=.001;
        command++;error="";player.pause();resumeAfterFrame=resume;waiting=true;endedPresented=false;
        long targetFrame=(long)Math.floor(Math.max(0,Math.min(seconds,duration-1d/30))*30+.0001),targetMs=targetFrame*1000/30;
        if((!samePausedPosition&&Math.abs(player.getCurrentPosition()-targetMs)>1)||player.getPlaybackState()==Player.STATE_ENDED){firstFrame=false;pendingFrame=new FrameTarget(Math.round(targetFrame*1_000_000d/30));player.seekTo(targetMs);}
        main.removeCallbacks(timeout);main.postDelayed(timeout,10000);ready();emit();return state();
    }
    public JSONObject pause(){if(!closed){command++;resumeAfterFrame=false;waiting=false;endedPresented=false;main.removeCallbacks(timeout);player.pause();emit();}return state();}
    public JSONObject layout(JSONObject bounds)throws Exception {
        double viewport=bounds.getDouble("viewport"),x=bounds.getDouble("x"),y=bounds.getDouble("y"),width=bounds.getDouble("width"),height=bounds.getDouble("height");
        for(double n:new double[]{viewport,x,y,width,height})if(!Double.isFinite(n)||Math.abs(n)>8192)throw new IllegalArgumentException("PREVIEW_BOUNDS");
        boolean next=bounds.optBoolean("visible",true);
        if(viewport<100||width<0||height<0||(next&&(width==0||height==0))||width>viewport+1||web.getWidth()<=0)throw new IllegalArgumentException("PREVIEW_BOUNDS");
        double scale=web.getWidth()/viewport;
        if(!next&&visible)pause();visible=next;layer.setVisibility(visible?View.VISIBLE:View.INVISIBLE);
        if(width==0||height==0)return state();
        int left=(int)Math.round(x*scale),top=(int)Math.round(y*scale),w=(int)Math.round(width*scale),h=(int)Math.round(height*scale);
        layer.layout(left,top,left+w,top+h);fit();return state();
    }
    private void fit(){int w=layer.getWidth(),h=layer.getHeight();if(w<=0||h<=0)return;int fittedW=Math.min(w,Math.round(h*aspect)),fittedH=Math.min(h,Math.round(w/aspect));FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(fittedW,fittedH,Gravity.CENTER);surface.setLayoutParams(p);layer.measure(View.MeasureSpec.makeMeasureSpec(w,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(h,View.MeasureSpec.EXACTLY));layer.layout(layer.getLeft(),layer.getTop(),layer.getLeft()+w,layer.getTop()+h);}
    public JSONObject state(){try{return new JSONObject().put("playbackId",id).put("command",command).put("sequence",++sequence).put("position",closed?0:Math.min(duration,player.getCurrentPosition()/1000d)).put("duration",duration).put("running",running).put("preparing",waiting).put("ended",!closed&&endedPresented).put("error",error).put("closed",closed);}catch(JSONException failure){throw new IllegalStateException(failure);}}
    private void emit(){if(!closed)events.accept(state());}
    @Override public void close(){if(closed)return;closed=true;running=false;web.setKeepScreenOn(priorKeepScreenOn);main.removeCallbacksAndMessages(null);if(initialFrame!=null)surface.removeCallbacks(initialFrame);player.release();web.getOverlay().remove(layer);}
}
