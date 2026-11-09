package com.deepseekharness.media;

import android.media.AudioDeviceInfo;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.exoplayer.analytics.PlayerId;
import androidx.media3.exoplayer.audio.AudioOutput;
import androidx.media3.exoplayer.audio.AudioOutputProvider;
import java.nio.ByteBuffer;

/** PCM写完后先排空已接受的样本，再stop；避免AudioTrack提前切换结束时钟导致视频等待。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class DrainAudioOutput implements AudioOutput {
    private final AudioOutput delegate;
    private final int frameBytes,sampleRate;
    private long writtenBytes;
    private boolean stopping,drained;
    private java.util.function.LongConsumer observer;
    private java.util.function.LongSupplier playbackHead;
    private long lastHead,headWraps,consumedUs;
    private final PcmPlaybackClock clock=new PcmPlaybackClock();

    static AudioOutput wrap(AudioOutput delegate,int frameBytes,int sampleRate){
        return frameBytes>0&&sampleRate>0&&!delegate.isOffloadedPlayback()?new DrainAudioOutput(delegate,frameBytes,sampleRate):delegate;
    }
    static AudioOutput wrap(AudioOutput delegate,int frameBytes,int sampleRate,java.util.function.LongConsumer observer){AudioOutput output=wrap(delegate,frameBytes,sampleRate);if(output instanceof DrainAudioOutput drain)drain.observer=observer;return output;}
    static AudioOutput wrap(AudioOutput delegate,int frameBytes,int sampleRate,java.util.function.LongConsumer observer,java.util.function.LongSupplier playbackHead){AudioOutput output=wrap(delegate,frameBytes,sampleRate,observer);if(output instanceof DrainAudioOutput drain)drain.playbackHead=playbackHead;return output;}
    private DrainAudioOutput(AudioOutput delegate,int frameBytes,int sampleRate){this.delegate=delegate;this.frameBytes=frameBytes;this.sampleRate=sampleRate;}
    // 向上取整到微秒，否则Media3换回样本数时会少一帧，尾部可能永远处于pending。
    private long endUs(){return Math.addExact(Math.multiplyExact(writtenBytes/frameBytes,1_000_000L),sampleRate-1L)/sampleRate;}
    private long positionUs(){
        long estimate=delegate.getPositionUs();if(playbackHead==null)return estimate;
        long raw=playbackHead.getAsLong()&0xffffffffL;
        if(raw<lastHead){if(lastHead-raw>0x80000000L)headWraps++;else raw=lastHead;}
        lastHead=raw;long frames=Math.min(writtenBytes/frameBytes,raw+(headWraps<<32));
        consumedUs=Math.addExact(Math.multiplyExact(frames,1_000_000L),sampleRate-1L)/sampleRate;
        return clock.update(estimate,consumedUs,System.nanoTime()/1000,endUs(),stopping);
    }
    private long finishIfDrained(long position){
        if(drained)return endUs();
        if(stopping&&position>=endUs()&&(playbackHead==null||consumedUs>=endUs())){
            // 只有真实输出位置已经消费完已接受的PCM才关闭；不改正在播放的时钟。
            delegate.stop();drained=true;return endUs();
        }
        return position;
    }
    @Override public boolean write(ByteBuffer buffer,int count,long pts)throws WriteException{
        int before=buffer.position();boolean handled=delegate.write(buffer,count,pts);writtenBytes=Math.addExact(writtenBytes,buffer.position()-before);return handled;
    }
    @Override public void stop(){if(drained)return;stopping=true;finishIfDrained(positionUs());}
    @Override public long getPositionUs(){long position=drained?endUs():finishIfDrained(positionUs());if(observer!=null)observer.accept(position);return position;}
    @Override public void flush(){delegate.flush();writtenBytes=0;lastHead=0;headWraps=0;consumedUs=0;stopping=false;drained=false;clock.reset();}
    @Override public void play(){clock.resume(System.nanoTime()/1000);delegate.play();}
    @Override public void pause(){clock.pause();delegate.pause();}
    @Override public void release(){delegate.release();}
    @Override public void setVolume(float volume){delegate.setVolume(volume);}
    @Override public boolean isOffloadedPlayback(){return delegate.isOffloadedPlayback();}
    @Override public int getAudioSessionId(){return delegate.getAudioSessionId();}
    @Override public int getSampleRate(){return delegate.getSampleRate();}
    @Override public long getBufferSizeInFrames(){return delegate.getBufferSizeInFrames();}
    @Override public PlaybackParameters getPlaybackParameters(){return delegate.getPlaybackParameters();}
    @Override public boolean isStalled(){return delegate.isStalled();}
    @Override public void addListener(Listener listener){delegate.addListener(listener);}
    @Override public void removeListener(Listener listener){delegate.removeListener(listener);}
    @Override public void setPlaybackParameters(PlaybackParameters parameters){delegate.setPlaybackParameters(parameters);}
    @Override public void setOffloadDelayPadding(int delay,int padding){delegate.setOffloadDelayPadding(delay,padding);}
    @Override public void setOffloadEndOfStream(){delegate.setOffloadEndOfStream();}
    @Override public void setPlayerId(PlayerId playerId){delegate.setPlayerId(playerId);}
    @Override public boolean canReuseAudioOutput(AudioOutputProvider.OutputConfig current,AudioOutputProvider.FormatConfig format,AudioOutputProvider.OutputConfig next){return delegate.canReuseAudioOutput(current,format,next);}
    @Override public void attachAuxEffect(int effect){delegate.attachAuxEffect(effect);}
    @Override public void setAuxEffectSendLevel(float level){delegate.setAuxEffectSendLevel(level);}
    @Override public void setPreferredDevice(AudioDeviceInfo device){delegate.setPreferredDevice(device);}
}
