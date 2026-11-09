package com.deepseekharness.media;

import android.media.*;
import android.os.*;
import android.view.Surface;
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter;
import androidx.media3.decoder.CryptoInfo;
import androidx.media3.common.util.ThrowingRunnable;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.function.LongConsumer;

/** 观察真实解码输出的准备状态；不修改缓冲、PTS、释放时间或解码策略。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class PreviewCodec implements MediaCodecAdapter {
    private final MediaCodecAdapter delegate;private final LongConsumer decoded;
    PreviewCodec(MediaCodecAdapter delegate,LongConsumer decoded){this.delegate=delegate;this.decoded=decoded;}
    @Override public int dequeueOutputBufferIndex(MediaCodec.BufferInfo info){int index=delegate.dequeueOutputBufferIndex(info);if(index>=0)decoded.accept(info.presentationTimeUs);return index;}
    @Override public int dequeueInputBufferIndex(){return delegate.dequeueInputBufferIndex();}
    @Override public MediaFormat getOutputFormat(){return delegate.getOutputFormat();}
    @Override public ByteBuffer getInputBuffer(int index){return delegate.getInputBuffer(index);}
    @Override public ByteBuffer getOutputBuffer(int index){return delegate.getOutputBuffer(index);}
    @Override public <E extends Exception> void useBuffer(ThrowingRunnable<E> work)throws E{delegate.useBuffer(work);}
    @Override public void queueInputBuffer(int index,int offset,int size,long pts,int flags){delegate.queueInputBuffer(index,offset,size,pts,flags);}
    @Override public void queueSecureInputBuffer(int index,int offset,CryptoInfo info,long pts,int flags){delegate.queueSecureInputBuffer(index,offset,info,pts,flags);}
    @Override public void releaseOutputBuffer(int index,boolean render){delegate.releaseOutputBuffer(index,render);}
    @Override public void releaseOutputBuffer(int index,long at){delegate.releaseOutputBuffer(index,at);}
    @Override public void flush(){decoded.accept(Long.MIN_VALUE);delegate.flush();}
    @Override public void release(){delegate.release();}
    @Override public void setOnFrameRenderedListener(OnFrameRenderedListener listener,Handler handler){delegate.setOnFrameRenderedListener((codec,pts,at)->listener.onFrameRendered(this,pts,at),handler);}
    @Override public boolean registerOnBufferAvailableListener(OnBufferAvailableListener listener){return delegate.registerOnBufferAvailableListener(listener);}
    @Override public void setOutputSurface(Surface surface){delegate.setOutputSurface(surface);}
    @androidx.annotation.RequiresApi(35) @Override public void detachOutputSurface(){delegate.detachOutputSurface();}
    @Override public void setParameters(Bundle params){delegate.setParameters(params);}
    @Override public void setVideoScalingMode(int mode){delegate.setVideoScalingMode(mode);}
    @Override public boolean needsReconfiguration(){return delegate.needsReconfiguration();}
    @Override public PersistableBundle getMetrics(){return delegate.getMetrics();}
    @androidx.annotation.RequiresApi(31) @Override public void subscribeToVendorParameters(List<String> names){delegate.subscribeToVendorParameters(names);}
    @androidx.annotation.RequiresApi(31) @Override public void unsubscribeFromVendorParameters(List<String> names){delegate.unsubscribeFromVendorParameters(names);}
}
