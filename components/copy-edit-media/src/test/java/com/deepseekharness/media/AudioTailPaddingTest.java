package com.deepseekharness.media;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class AudioTailPaddingTest {
    @Test public void nonWholeSecondBoundaryKeepsEveryInRangeSample()throws Exception{
        for(int rate:new int[]{44100,48000})for(int channels:new int[]{1,2}){
            int wanted=(int)Math.round(107*rate/30d)*channels*2;
            byte[] source=new byte[wanted+8192];for(int i=0;i<source.length;i++)source[i]=(byte)(i*31+7);
            byte[] actual=process(source,rate,channels);
            assertEquals(wanted+4096*channels*2,actual.length);
            assertArrayEquals(Arrays.copyOf(source,wanted),Arrays.copyOf(actual,wanted));
            for(int i=wanted;i<actual.length;i++)assertEquals(0,actual[i]);
        }
    }
    @Test public void earlyEndPadsOnlyMissingTimelineAndEncoderGuard()throws Exception{
        byte[] source=new byte[3200];Arrays.fill(source,(byte)3);byte[] actual=process(source,48000,2);
        assertArrayEquals(source,Arrays.copyOf(actual,source.length));
        assertEquals(171200*4+4096*4,actual.length);
        for(int i=source.length;i<actual.length;i++)assertEquals(0,actual[i]);
    }
    private byte[] process(byte[] source,int rate,int channels)throws Exception{
        AudioTailPadding processor=new AudioTailPadding(107);processor.configure(new AudioProcessor.AudioFormat(rate,channels,C.ENCODING_PCM_16BIT));processor.flush();
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        for(int offset=0;offset<source.length;offset+=2048){ByteBuffer input=ByteBuffer.wrap(source,offset,Math.min(2048,source.length-offset));processor.queueInput(input);assertFalse(input.hasRemaining());copy(processor.getOutput(),out);}
        processor.queueEndOfStream();int polls=0;while(!processor.isEnded()){assertTrue(++polls<1000);copy(processor.getOutput(),out);}processor.reset();return out.toByteArray();
    }
    private void copy(ByteBuffer input,ByteArrayOutputStream out){while(input.hasRemaining())out.write(input.get());}
}
