package com.deepseekharness.media;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import java.nio.ByteBuffer;
import org.junit.Test;
import static org.junit.Assert.*;

@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
public class NativeAudioTailTest {
  @Test public void pcmAndGapFlushInBoundedChunks()throws Exception{
    for(int rate:new int[]{44100,48000})for(int channels:new int[]{1,2}){
      AudioTailPadding p=new AudioTailPadding(37);p.configure(new AudioFormat(rate,channels,C.ENCODING_PCM_16BIT));p.flush();
      ByteBuffer source=ByteBuffer.allocateDirect(1028);for(int i=0;i<1028;i++)source.put((byte)(i%127));source.flip();p.queueInput(source);ByteBuffer data=p.getOutput();assertEquals(1028,data.remaining());for(int i=0;i<1028;i++)assertEquals((byte)(i%127),data.get());
      p.queueEndOfStream();long tail=0;int iterations=0;while(!p.isEnded()){assertTrue(++iterations<1000);data=p.getOutput();assertTrue(data.remaining()<=16384);tail+=data.remaining();while(data.hasRemaining())assertEquals(0,data.get());}
      assertEquals((Math.round(37*rate/30d)+4096)*channels*2-1028,tail);p.flush();assertFalse(p.isEnded());p.reset();
    }
  }
}
