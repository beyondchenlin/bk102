package com.deepseekharness.media;

import android.content.Context;
import androidx.media3.common.GlObjectsProvider;
import androidx.media3.common.GlTextureInfo;
import androidx.media3.common.VideoFrameProcessingException;
import androidx.media3.effect.GlEffect;
import androidx.media3.effect.GlShaderProgram;
import java.util.List;
import java.util.concurrent.Executor;

/** 单纹理重采样：高帧率丢帧，低帧率复用纹理，输出固定30fps；预览与导出共用。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public final class SourceFrameEffect implements GlEffect {
    private final List<Long> sourceTimes;
    private final long clipStartUs;
    public SourceFrameEffect(List<Long> sourceTimes, long clipStartUs) {
        if (sourceTimes.isEmpty()) throw new IllegalArgumentException("EMPTY_FRAME_MAPPING");
        this.sourceTimes = List.copyOf(sourceTimes);
        this.clipStartUs = clipStartUs;
    }
    @Override public long getDurationAfterEffectApplied(long durationUs) { return SourceFrameMapping.timeUs(sourceTimes.size()); }
    @Override public GlShaderProgram toGlShaderProgram(Context context, boolean useHdr) { return new Program(sourceTimes, clipStartUs); }

    static final class Program implements GlShaderProgram {
        private final List<Long> times;
        private final long start;
        private InputListener input = new InputListener() {};
        private OutputListener output = new OutputListener() {};
        private Executor errorExecutor = Runnable::run;
        private ErrorListener errorListener = e -> {};
        private GlTextureInfo held;
        private long origin = Long.MIN_VALUE, previous = Long.MIN_VALUE, source;
        private int next;
        private boolean outstanding, ended, endSent, released, failed, draining;
        Program(List<Long> times, long start) { this.times = times; this.start = start; }
        @Override public void setInputListener(InputListener listener) {
            input = listener;
            if (held == null && !ended && !released) input.onReadyToAcceptInputFrame();
        }
        @Override public void setOutputListener(OutputListener listener) { output = listener; }
        @Override public void setErrorListener(Executor executor, ErrorListener listener) { errorExecutor = executor; errorListener = listener; }
        @Override public void queueInputFrame(GlObjectsProvider provider, GlTextureInfo texture, long timeUs) {
            if (released || failed) return;
            if (held != null || ended || timeUs <= previous) { fail("NATIVE_FRAME_INPUT_ORDER"); return; }
            if (origin == Long.MIN_VALUE) origin = timeUs;
            previous = timeUs;
            source = start + timeUs - origin;
            held = texture;
            if (next < times.size() && times.get(next) < source - 1) { fail("NATIVE_SOURCE_FRAME_MISSING"); return; }
            drain();
        }
        // 回调可同步释放输出；循环防止长静帧重复输出时递归耗尽栈。
        private void drain() {
            if (draining) return;
            draining = true;
            try {
                while (!released && !failed && !outstanding && held != null) {
                    if (next < times.size() && Math.abs(times.get(next) - source) <= 1) {
                        long pts = origin + SourceFrameMapping.timeUs(next++);
                        outstanding = true;
                        output.onOutputFrameAvailable(held, pts);
                    } else {
                        GlTextureInfo done = held; held = null;
                        input.onInputFrameProcessed(done);
                        if (!ended && !released && !failed) input.onReadyToAcceptInputFrame();
                    }
                }
                if (ended && held == null && !endSent && !released && !failed) {
                    if (next != times.size()) { fail("NATIVE_SOURCE_FRAME_MISSING"); return; }
                    endSent = true;
                    output.onCurrentOutputStreamEnded();
                }
            } finally { draining = false; }
        }
        @Override public void releaseOutputFrame(GlTextureInfo texture) {
            if (released || failed) return;
            if (!outstanding || held != texture) { fail("NATIVE_FRAME_TEXTURE_OWNERSHIP"); return; }
            outstanding = false;
            drain();
        }
        @Override public void signalEndOfCurrentInputStream() { ended = true; drain(); }
        @Override public void flush() {
            held = null; outstanding = ended = endSent = failed = false;
            origin = previous = Long.MIN_VALUE; next = 0;
            input.onFlush();
            if (!released) input.onReadyToAcceptInputFrame();
        }
        @Override public void release() { released = true; held = null; }
        private void fail(String code) {
            if (failed || released) return;
            failed = true;
            errorExecutor.execute(() -> errorListener.onError(VideoFrameProcessingException.from(new IllegalStateException(code))));
        }
    }
}
