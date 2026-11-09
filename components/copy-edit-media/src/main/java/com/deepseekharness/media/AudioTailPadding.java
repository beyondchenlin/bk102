package com.deepseekharness.media;

import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import java.nio.ByteBuffer;

/** 在编码前排空AAC延迟；补齐工程末尾静音，封装器再裁掉保护样本。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class AudioTailPadding extends BaseAudioProcessor {
    private final int frames;
    private long bytes,remaining;
    AudioTailPadding(int frames){this.frames=frames;}
    @Override protected AudioFormat onConfigure(AudioFormat input){return input;}
    private long wantedBytes(){return Math.round(frames*inputAudioFormat.sampleRate/30d)*inputAudioFormat.bytesPerFrame;}
    @Override public void queueInput(ByteBuffer input){
        // 解码输出按PCM块交付，裁切边界可能落在块内。只保留工程内的完整样本，
        // 消费并丢弃边界后的源样本；不能把它们当尾音、也不能扩大工程时长。
        int limit=input.limit(),size=(int)Math.min(input.remaining(),Math.max(0,wantedBytes()-bytes));
        input.limit(input.position()+size);replaceOutputBuffer(size).put(input).flip();input.limit(limit);input.position(limit);bytes+=size;
    }
    @Override protected void onQueueEndOfStream(){
        long wanted=wantedBytes();
        remaining=Math.max(0,wanted-bytes)+4096L*inputAudioFormat.bytesPerFrame;
    }
    @Override public ByteBuffer getOutput(){
        ByteBuffer output=super.getOutput();if(output.hasRemaining()||remaining==0)return output;
        int size=(int)Math.min(16384,remaining);ByteBuffer silence=replaceOutputBuffer(size);silence.limit(size);
        while(silence.hasRemaining())silence.put((byte)0);silence.flip();remaining-=size;return super.getOutput();
    }
    @Override public boolean isEnded(){return remaining==0&&super.isEnded();}
    @Override protected void onFlush(){bytes=0;remaining=0;}
    @Override protected void onReset(){bytes=0;remaining=0;}
}
