package com.deepseekharness.media;

import android.content.Context;
import android.media.metrics.LogSessionId;
import androidx.annotation.Nullable;
import androidx.media3.common.*;
import androidx.media3.transformer.*;

/** 生产适配与独立实验共用编码器设置，不静默降低编码/输出规格。 */
@androidx.annotation.OptIn(markerClass={androidx.media3.common.util.UnstableApi.class,androidx.media3.common.util.ExperimentalApi.class})
public final class NativeEncoder {
    private NativeEncoder() {}
    public static Transformer create(Context context,Transformer.Listener listener,boolean boundedSurface){
        return create(context,listener,boundedSurface,0);
    }
    public static Transformer create(Context context,Transformer.Listener listener,boolean boundedSurface,int frames){
        return create(context,listener,boundedSurface,frames,false);
    }
    public static Transformer create(Context context,Transformer.Listener listener,boolean boundedSurface,int frames,boolean preview){
        DefaultEncoderFactory delegate=new DefaultEncoderFactory.Builder(context).setEnableFallback(false).setEnableFormatFallback(false).build();
        Codec.EncoderFactory forceEncode=new Codec.EncoderFactory(){
            @Override public Codec createForAudioEncoding(Format format,@Nullable LogSessionId id)throws ExportException{return delegate.createForAudioEncoding(format,id);}
            @Override public Codec createForVideoEncoding(Format format,@Nullable LogSessionId id)throws ExportException{return delegate.createForVideoEncoding(format,id);}
            @Override public boolean videoNeedsEncoding(){return true;}
            @Override public boolean audioNeedsEncoding(){return true;}
        };
        // 360×640缓存直接编码竖屏，避免部分Surface解码器忽略MP4旋转元数据。
        // 1080P导出保留Media3的设备兼容旋转策略，不扩大编码器高度要求。
        Transformer.Builder builder=new Transformer.Builder(context).setPortraitEncodingEnabled(preview).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC).setEncoderFactory(forceEncode).addListener(listener);
        if(frames>0)builder.setMuxerFactory(ExactDurationMuxer.factory(Math.round(frames*1_000_000d/30)));
        if(boundedSurface)builder.setAssetLoaderFactory(SurfacePipeline.exportFactory(context));return builder.build();
    }
}
