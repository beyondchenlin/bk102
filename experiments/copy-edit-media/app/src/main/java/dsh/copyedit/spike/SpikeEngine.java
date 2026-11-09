package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.media.metrics.LogSessionId;
import android.net.Uri;
import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.DefaultGainProvider;
import androidx.media3.common.audio.GainProcessor;
import androidx.media3.effect.BitmapOverlay;
import androidx.media3.effect.OverlayEffect;
import androidx.media3.effect.Presentation;
import androidx.media3.effect.StaticOverlaySettings;
import androidx.media3.transformer.*;
import com.google.common.collect.ImmutableList;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 与 DSHA 无依赖的媒体试验实现，只认应用自行复制的四个素材句柄。 */
@androidx.annotation.OptIn(markerClass = {androidx.media3.common.util.UnstableApi.class, androidx.media3.common.util.ExperimentalApi.class})
public final class SpikeEngine implements MediaProvider {
    private final Context context;
    private final File directory;
    private final Map<String,File> assets;
    private final Map<String,String> assetDigests=new java.util.HashMap<>();
    public final MediaArtifacts artifacts;
    public final NativeFixturePlans nativePlans;
    public SpikeEngine(Context context) throws Exception {
        this.context=context.getApplicationContext();directory=new File(context.getFilesDir(),"media-spike");
        if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("CREATE_DIR_FAILED");
        assets=new java.util.HashMap<>();
        for(String name:List.of("a.mp4","b.mp4","bframes.mp4","vfr.mp4","60fps.mp4","voice.wav","bgm.wav")) {
            File file=new File(directory,name);
            try(InputStream in=context.getAssets().open("fixtures/"+name);FileOutputStream out=new FileOutputStream(file)) {byte[] buffer=new byte[65536];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);}
            assets.put(name,file);
            assetDigests.put(name,MediaArtifacts.digest(file));
        }
        // Android 的 /data/user/0 本身可为系统链接；先解析可信 Context 根，再检查任务子目录。
        artifacts=new MediaArtifacts(new File(context.getFilesDir().getCanonicalFile(),"media-spike"));
        nativePlans=new NativeFixturePlans(context);
    }
    @Override public Capabilities capabilities(){return new Capabilities(1,true,false,"独立验证程序，尚未认证设备能力");}
    public File asset(String id) {File file=assets.get(id);if(file==null)throw new IllegalArgumentException("UNKNOWN_ASSET");return file;}
    public File output(String name) {
        if(!Set.of("export-4s.mp4","export-60s.mp4","preview-4s.mp4","preview-60s.mp4","sticker.png","evidence.json").contains(name))throw new IllegalArgumentException("UNKNOWN_OUTPUT");
        return new File(directory,name);
    }
    public RenderPlan plan(boolean fullMinute) {
        List<Clip> clips=new ArrayList<>();
        for(int i=0;i<(fullMinute?15:1);i++) {
            clips.add(new Clip("a.mp4",FrameMath.toUs(17,30,1),FrameMath.toUs(77,30,1)));
            clips.add(new Clip("b.mp4",FrameMath.toUs(23,30,1),FrameMath.toUs(83,30,1)));
        }
        return new RenderPlan(1,1080,1920,30,clips);
    }
    public Composition composition(RenderPlan plan) throws Exception {
        return composition(plan,false);
    }
    public Composition composition(RenderPlan plan,boolean preview) throws Exception {
        return composition(new RenderSnapshot("fixture-project",1,plan,List.of("慢一点","也很好"),assetDigests,preview));
    }
    public FrozenRenderPlan snapshot(boolean fullMinute,long revision,boolean alternateSticker,boolean preview) throws Exception {
        return nativePlans.snapshot(fullMinute,revision,alternateSticker,preview);
    }
    public Composition composition(RenderJobSnapshot snapshot)throws Exception {
        if(snapshot instanceof FrozenRenderPlan plan){nativePlans.writeStickerEvidence(plan,output("sticker.png"));return NativePlanComposition.create(plan,new File(directory,"native-black.png"));}
        if(snapshot instanceof RenderSnapshot legacy)return composition(legacy);
        throw new IllegalArgumentException("UNKNOWN_SNAPSHOT");
    }
    public Composition composition(RenderSnapshot snapshot) throws Exception {
        RenderPlan plan=snapshot.plan();boolean preview=snapshot.preview();
        List<EditedMediaItem> video=new ArrayList<>();long total=0;
        for(Clip clip:plan.clips()) {
            // 逐帧边界必须来自素材索引；本夹具为精确 30 fps，末点排除。
            MediaItem item=new MediaItem.Builder().setUri(Uri.fromFile(asset(clip.assetId())))
                    .setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder().setStartPositionUs(clip.inUs()).setEndPositionUs(clip.outUs()).build()).build();
            video.add(new EditedMediaItem.Builder(item).setDurationUs(4_000_000).setRemoveAudio(true).build());
            total+=clip.outUs()-clip.inUs();
        }
        EditedMediaItem voice=audio("voice.wav",total,0.7f),bgm=audio("bgm.wav",total,0.18f);
        EditedMediaItemSequence main=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_VIDEO)).addItems(video).build();
        EditedMediaItemSequence narration=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_AUDIO)).addItem(voice).build();
        EditedMediaItemSequence music=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_AUDIO)).addItem(bgm).build();
        Bitmap sticker=sticker(snapshot.stickerLines());
        try(FileOutputStream out=new FileOutputStream(output("sticker.png"))){if(!sticker.compress(Bitmap.CompressFormat.PNG,100,out))throw new IllegalStateException("PNG_FAILED");}
        OverlayEffect overlay=new OverlayEffect(ImmutableList.of(BitmapOverlay.createStaticBitmapOverlay(sticker,new StaticOverlaySettings.Builder().setBackgroundFrameAnchor(0,-0.55f).build())));
        java.util.List<androidx.media3.common.Effect> effects=new ArrayList<>(List.of(Presentation.createForWidthAndHeight(plan.width(),plan.height(),Presentation.LAYOUT_SCALE_TO_FIT),overlay));
        if(preview)effects.add(Presentation.createForWidthAndHeight(360,640,Presentation.LAYOUT_SCALE_TO_FIT));
        return new Composition.Builder(main,narration,music)
                .setEffects(new Effects(ImmutableList.of(),effects))
                .setTransmuxVideo(false).setTransmuxAudio(false).build();
    }
    private EditedMediaItem audio(String name,long durationUs,float gain) {
        MediaItem item=new MediaItem.Builder().setUri(Uri.fromFile(asset(name)))
                .setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder().setEndPositionUs(durationUs).build()).build();
        return new EditedMediaItem.Builder(item).setDurationUs(60_000_000).setRemoveVideo(true)
                .setEffects(new Effects(ImmutableList.of(new GainProcessor(new DefaultGainProvider.Builder(gain).build())),ImmutableList.of())).build();
    }
    private Bitmap sticker(List<String> lines) {
        Bitmap bitmap=Bitmap.createBitmap(760,250,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setTextAlign(Paint.Align.CENTER);paint.setTextSize(78);paint.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        for(int i=0;i<lines.size();i++){float y=95+i*96;paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(8);paint.setColor(Color.rgb(32,32,32));canvas.drawText(lines.get(i),380,y,paint);paint.setStyle(Paint.Style.FILL);paint.setColor(Color.WHITE);canvas.drawText(lines.get(i),380,y,paint);}
        return bitmap;
    }
    public Transformer exporter(Transformer.Listener listener,boolean boundedSurface,RenderJobSnapshot snapshot) {
        return NativeEncoder.create(context,listener,boundedSurface,snapshot instanceof FrozenRenderPlan?snapshot.expectedFrames():0,snapshot.preview());
    }
}
