package com.deepseekharness.media;

import android.content.Context;
import androidx.media3.common.C;
import androidx.media3.common.util.Clock;
import androidx.media3.exoplayer.audio.*;

/** 固定1倍速缓存预览：PCM计数校准时钟，排空后stop；暂停/释放直接执行。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public final class NativePreviewAudio {
    private NativePreviewAudio(){}
    public static AudioSink sink(Context context,boolean floating,boolean playbackParams){
        return sink(context,floating,playbackParams,null);
    }
    public static AudioSink sink(Context context,boolean floating,boolean playbackParams,java.util.function.LongConsumer observer){
        return new DefaultAudioSink.Builder(context).setEnableFloatOutput(floating).setEnableAudioOutputPlaybackParameters(playbackParams)
                // 预览契约固定1倍速，缓冲也按这一上限配置。
                .setAudioOutputProvider(wrapProvider(new AudioTrackAudioOutputProvider.Builder(context).setMaxPlaybackSpeed(1f).build(),observer)).build();
    }
    static AudioOutputProvider wrapProvider(AudioOutputProvider provider){
        return wrapProvider(provider,null);
    }
    private static AudioOutputProvider wrapProvider(AudioOutputProvider provider,java.util.function.LongConsumer observer){
        return new AudioOutputProvider(){
            @Override public FormatSupport getFormatSupport(FormatConfig config){return provider.getFormatSupport(config);}
            @Override public OutputConfig getOutputConfig(FormatConfig config)throws ConfigurationException{return provider.getOutputConfig(config);}
            @Override public AudioOutput getAudioOutput(OutputConfig config)throws InitializationException{
                int sampleBytes=switch(config.encoding){case C.ENCODING_PCM_8BIT->1;case C.ENCODING_PCM_16BIT->2;case C.ENCODING_PCM_24BIT->3;case C.ENCODING_PCM_32BIT,C.ENCODING_PCM_FLOAT->4;default->0;};
                if(observer!=null)android.util.Log.d("NativePreviewAudio","PCM buffer="+config.bufferSize+" rate="+config.sampleRate+" parameters="+config.usePlaybackParameters);
                AudioOutput output=provider.getAudioOutput(config);
                return DrainAudioOutput.wrap(output,sampleBytes*Integer.bitCount(config.channelMask),config.sampleRate,observer,
                        output instanceof AudioTrackAudioOutput track?()->Integer.toUnsignedLong(track.getAudioTrack().getPlaybackHeadPosition()):null);
            }
            @Override public void addListener(Listener listener){provider.addListener(listener);}
            @Override public void removeListener(Listener listener){provider.removeListener(listener);}
            @Override public void setClock(Clock clock){provider.setClock(clock);}
            @Override public boolean hasPendingReleases(){return provider.hasPendingReleases();}
            @Override public void release(){provider.release();}
        };
    }
}
