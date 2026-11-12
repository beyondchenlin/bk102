package com.deepseekharness.media;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import androidx.media3.common.*;
import androidx.media3.common.audio.*;
import androidx.media3.effect.*;
import androidx.media3.transformer.*;
import com.google.common.collect.ImmutableList;
import java.io.*;
import java.util.*;

/** 通用冻结计划到Media3；预览和导出只在最后的输出尺寸上有差别。 */
@androidx.annotation.OptIn(markerClass={androidx.media3.common.util.UnstableApi.class,androidx.media3.common.util.ExperimentalApi.class})
public final class NativePlanComposition {
    private NativePlanComposition() {}
    public static Composition create(FrozenRenderPlan plan,File privateBlackImage)throws Exception {
        EditedMediaItemSequence.Builder video=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_VIDEO));
        for(FrozenRenderPlan.Clip c:plan.clips())video.addItem(new EditedMediaItem.Builder(media(c.asset(),c.startUs(),c.endUs())).setDurationUs(c.asset().durationUs()).setRemoveAudio(true)
                .setEffects(new Effects(ImmutableList.of(),ImmutableList.of(new SourceFrameEffect(c.sourceTimes(),c.startUs())))).build());
        int tail=plan.expectedFrames()-plan.videoFrames();
        if(tail>0){
            if(!privateBlackImage.exists()){Bitmap black=Bitmap.createBitmap(16,16,Bitmap.Config.ARGB_8888);black.eraseColor(android.graphics.Color.BLACK);try(OutputStream out=new FileOutputStream(privateBlackImage)){if(!black.compress(Bitmap.CompressFormat.PNG,100,out))throw new IOException("BLACK_IMAGE_FAILED");}finally{black.recycle();}}
            long duration=Math.round(tail*1_000_000d/30);
            MediaItem item=new MediaItem.Builder().setUri(Uri.fromFile(privateBlackImage)).setImageDurationMs((duration+999)/1000).build();
            video.addItem(new EditedMediaItem.Builder(item).setDurationUs(duration).setFrameRate(30).setRemoveAudio(true).build());
        }
        List<EditedMediaItemSequence> sequences=new ArrayList<>();sequences.add(video.build());float mixScale=plan.mixScale();
        for(FrozenRenderPlan.Audio a:continuousAudio(plan.audio())){
            EditedMediaItemSequence.Builder sequence=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_AUDIO));
            if(a.startFrame()>0)sequence.addGap(Math.round(a.startFrame()*1_000_000d/30));
            sequence.addItem(new EditedMediaItem.Builder(media(a.asset(),a.inUs(),a.outUs())).setDurationUs(a.asset().durationUs()).setRemoveVideo(true)
                    .setEffects(new Effects(ImmutableList.of(new GainProcessor(new DefaultGainProvider.Builder(a.volume()*mixScale).build())),ImmutableList.of())).build()).setIsLooping(a.loop());
            sequences.add(sequence.build());
        }
        // 有限音乐区间：先播放分割处剩余源片段，再循环完整源，末次精确截尾。
        // 不能把带前置静音的整个sequence设为loop，否则每轮都会重复静音。
        for(FrozenRenderPlan.Music m:plan.music()){
            EditedMediaItemSequence.Builder sequence=new EditedMediaItemSequence.Builder(Set.of(C.TRACK_TYPE_AUDIO));
            if(m.startFrame()>0)sequence.addGap(Math.round(m.startFrame()*1_000_000d/30));
            long remaining=Math.round((m.endFrame()-m.startFrame())*1_000_000d/30),offset=Math.min(m.asset().durationUs()-1,Math.round(m.offsetSamples()*1_000_000d/48000));
            while(remaining>0){long duration=Math.min(remaining,m.asset().durationUs()-offset);
                sequence.addItem(new EditedMediaItem.Builder(media(m.asset(),offset,offset+duration)).setDurationUs(m.asset().durationUs()).setRemoveVideo(true)
                        .setEffects(new Effects(ImmutableList.of(new GainProcessor(new DefaultGainProvider.Builder(m.volume()*mixScale).build())),ImmutableList.of())).build());
                remaining-=duration;offset=0;
            }
            sequences.add(sequence.build());
        }
        // 预览直接在360×640画布合成，避免先处理1080p贴片再缩小。
        List<Effect> effects=new ArrayList<>();effects.add(Presentation.createForWidthAndHeight(plan.preview()?360:1080,plan.preview()?640:1920,Presentation.LAYOUT_SCALE_TO_FIT));
        // 分组避免单个着色器超出设备纹理单元数；保持计划中的贴片先后顺序。
        List<TextureOverlay> overlays=new ArrayList<>();
        for(FrozenRenderPlan.Sticker sticker:plan.stickers()){
            overlays.add(new TimedSticker(sticker,plan.preview()?1f/3:1));if(overlays.size()==8){effects.add(new OverlayEffect(ImmutableList.copyOf(overlays)));overlays.clear();}
        }
        if(!overlays.isEmpty())effects.add(new OverlayEffect(ImmutableList.copyOf(overlays)));
        return new Composition.Builder(sequences).setEffects(new Effects(ImmutableList.of(new AudioTailPadding(plan.expectedFrames())),effects)).setTransmuxVideo(false).setTransmuxAudio(false).build();
    }
    // UI分段不应重建连续源的解码器。只合并源区间、工程时间及音量完全连续的配音；
    // 短于一帧的真实静音缺口、重叠、不同音量和循环音轨均保留独立执行。
    static List<FrozenRenderPlan.Audio> continuousAudio(List<FrozenRenderPlan.Audio> source){
        List<FrozenRenderPlan.Audio> sorted=new ArrayList<>(source);sorted.sort(Comparator.comparing((FrozenRenderPlan.Audio a)->a.asset().id()).thenComparingInt(FrozenRenderPlan.Audio::startFrame));
        List<FrozenRenderPlan.Audio> result=new ArrayList<>();
        for(FrozenRenderPlan.Audio a:sorted){FrozenRenderPlan.Audio previous=result.isEmpty()?null:result.get(result.size()-1);
            if(previous!=null&&!previous.loop()&&!a.loop()&&previous.asset().equals(a.asset())&&previous.volume()==a.volume()&&previous.outUs()==a.inUs()&&Math.abs(previous.outUs()-previous.inUs()-Math.round((a.startFrame()-previous.startFrame())*1_000_000d/30))<=1){
                result.set(result.size()-1,new FrozenRenderPlan.Audio(previous.asset(),previous.inUs(),a.outUs(),previous.startFrame(),previous.volume(),false));
            }else result.add(a);
        }
        return result;
    }
    private static MediaItem media(AuthorizedAssets.Asset asset,long start,long end){return new MediaItem.Builder().setUri(Uri.fromFile(asset.file())).setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder().setStartPositionUs(start).setEndPositionUs(end).build()).build();}
    private static final class TimedSticker extends BitmapOverlay {
        private final FrozenRenderPlan.Sticker source;private Bitmap bitmap;private final StaticOverlaySettings visible,hidden;
        TimedSticker(FrozenRenderPlan.Sticker source,float canvasScale){
            this.source=source;bitmap=BitmapFactory.decodeFile(source.asset().file().toString());if(bitmap==null)throw new IllegalArgumentException("INVALID_STICKER_BITMAP");
            float scale=source.width()/1080f,cx=source.x()+source.width()/2f,cy=source.y()+400*scale/2;
            visible=settings(scale*canvasScale,cx,cy,1);hidden=settings(scale*canvasScale,cx,cy,0);
        }
        private StaticOverlaySettings settings(float scale,float cx,float cy,float alpha){return new StaticOverlaySettings.Builder().setScale(scale,scale).setBackgroundFrameAnchor(cx/540-1,1-cy/960).setAlphaScale(alpha).build();}
        // Media3在镜头的选帧效果变化时重建GL链，同一个全局贴片会重新使用。
        // release只释放本轮位图，下一轮按已授权的同一文件重建，不能返回回收后的Bitmap。
        @Override public Bitmap getBitmap(long timeUs){if(bitmap==null){bitmap=BitmapFactory.decodeFile(source.asset().file().toString());if(bitmap==null)throw new IllegalArgumentException("INVALID_STICKER_BITMAP");}return bitmap;}
        @Override public OverlaySettings getOverlaySettings(long timeUs){long frame=Math.round(timeUs*30d/1_000_000);return frame>=source.startFrame()&&frame<source.endFrame()?visible:hidden;}
        @Override public void release()throws VideoFrameProcessingException{try{super.release();}finally{if(bitmap!=null){bitmap.recycle();bitmap=null;}}}
    }
}
