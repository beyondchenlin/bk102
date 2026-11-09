package com.deepseekharness.media;

import android.content.Context;
import android.media.MediaCodec.BufferInfo;
import android.media.MediaCodecList;
import android.media.metrics.LogSessionId;
import android.os.Build;
import android.view.Surface;
import androidx.annotation.Nullable;
import androidx.media3.common.*;
import androidx.media3.common.util.Clock;
import androidx.media3.decoder.DecoderInputBuffer;
import androidx.media3.effect.DefaultVideoFrameProcessor;
import androidx.media3.effect.SingleInputVideoGraph;
import androidx.media3.transformer.*;
import java.nio.ByteBuffer;
import java.util.concurrent.Executor;

/** 只在已复现缺帧的 API 30 Goldfish 模拟器启用；不改变宿主或 Media3 二进制。 */
@androidx.annotation.OptIn(markerClass = {androidx.media3.common.util.UnstableApi.class, androidx.media3.common.util.ExperimentalApi.class})
public final class SurfacePipeline {
    private SurfacePipeline() {}
    public static boolean affectedEmulator() {
        if(Build.VERSION.SDK_INT!=30 || !Build.HARDWARE.equals("ranchu"))return false;
        for(android.media.MediaCodecInfo codec:new MediaCodecList(MediaCodecList.ALL_CODECS).getCodecInfos())
            if(!codec.isEncoder()&&codec.getName().equals("OMX.android.goldfish.h264.decoder"))return true;
        return false;
    }
    public static VideoGraph.Factory previewFactory() {
        return new VideoGraph.Factory() {
            @Override public boolean supportsMultipleInputs(){return false;}
            @Override public VideoGraph create(Context context,ColorInfo color,DebugViewProvider debug,VideoGraph.Listener listener,Executor executor,long offset,boolean automatic) {
                return new SingleInputVideoGraph(context,new DefaultVideoFrameProcessor.Factory.Builder().build(),color,listener,debug,executor,automatic) {
                    @Override public boolean registerInputFrame(int input) {
                        // 真实未消费帧计数控制准入；不篡改计数，不阻塞 GL 线程，不降低丢帧门槛。
                        return getPendingInputFrameCount(input)==0 && super.registerInputFrame(input);
                    }
                };
            }
        };
    }
    public static DefaultAssetLoaderFactory exportFactory(Context context) {
        DefaultDecoderFactory delegate=new DefaultDecoderFactory.Builder(context).build();
        Codec.DecoderFactory factory=new Codec.DecoderFactory() {
            @Override public Codec createForAudioDecoding(Format format,@Nullable LogSessionId id)throws ExportException {return delegate.createForAudioDecoding(format,id);}
            @Override public Codec createForVideoDecoding(Format format,Surface surface,boolean toneMap,@Nullable LogSessionId id)throws ExportException {
                Codec codec=delegate.createForVideoDecoding(format,surface,toneMap,id);
                return codec.getName().equals("OMX.android.goldfish.h264.decoder")?new OnePendingFrameCodec(codec):codec;
            }
        };
        return new DefaultAssetLoaderFactory(context,factory,Clock.DEFAULT,null);
    }
    private static final class OnePendingFrameCodec implements Codec {
        private final Codec delegate;
        OnePendingFrameCodec(Codec delegate){this.delegate=delegate;}
        @Override public int getMaxPendingFrameCount(){return 1;}
        @Override public Format getConfigurationFormat(){return delegate.getConfigurationFormat();}
        @Override public String getName(){return delegate.getName();}
        @Override public Surface getInputSurface(){return delegate.getInputSurface();}
        @Override public boolean maybeDequeueInputBuffer(DecoderInputBuffer buffer)throws ExportException{return delegate.maybeDequeueInputBuffer(buffer);}
        @Override public void queueInputBuffer(DecoderInputBuffer buffer)throws ExportException{delegate.queueInputBuffer(buffer);}
        @Override public void signalEndOfInputStream()throws ExportException{delegate.signalEndOfInputStream();}
        @Override public Format getInputFormat()throws ExportException{return delegate.getInputFormat();}
        @Override public Format getOutputFormat()throws ExportException{return delegate.getOutputFormat();}
        @Override public ByteBuffer getOutputBuffer()throws ExportException{return delegate.getOutputBuffer();}
        @Override public BufferInfo getOutputBufferInfo()throws ExportException{return delegate.getOutputBufferInfo();}
        @Override public void releaseOutputBuffer(boolean render)throws ExportException{delegate.releaseOutputBuffer(render);}
        @Override public void releaseOutputBuffer(long pts)throws ExportException{delegate.releaseOutputBuffer(pts);}
        @Override public boolean isEnded(){return delegate.isEnded();}
        @Override public void release(){delegate.release();}
    }
}
