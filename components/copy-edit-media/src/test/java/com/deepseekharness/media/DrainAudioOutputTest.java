package com.deepseekharness.media;

import androidx.media3.exoplayer.audio.AudioOutput;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import org.junit.Test;
import static org.junit.Assert.*;

public class DrainAudioOutputTest {
    private static final class Fake {
        long position;int stops,pauses,plays,releases,chunk=Integer.MAX_VALUE;boolean offload;
        final AudioOutput output=(AudioOutput)Proxy.newProxyInstance(AudioOutput.class.getClassLoader(),new Class<?>[]{AudioOutput.class},(proxy,method,args)->switch(method.getName()){
            case "getPositionUs"->position;
            case "isOffloadedPlayback"->offload;
            case "write"->{ByteBuffer b=(ByteBuffer)args[0];b.position(b.position()+Math.min(chunk,b.remaining()));yield !b.hasRemaining();}
            case "stop"->{stops++;position=Math.max(0,position-200_000);yield null;}
            case "pause"->{pauses++;yield null;}
            case "play"->{plays++;yield null;}
            case "release"->{releases++;yield null;}
            case "flush"->{position=0;yield null;}
            default->null;
        });
    }
    @Test public void drainsAcceptedPcmBeforeStopWithoutClockRegression()throws Exception{
        Fake f=new Fake();AudioOutput out=DrainAudioOutput.wrap(f.output,4,48000);out.write(ByteBuffer.allocate(192000),1,0);f.position=750000;
        out.stop();assertEquals(0,f.stops);assertEquals(750000,out.getPositionUs());f.position=999999;assertEquals(999999,out.getPositionUs());assertEquals(0,f.stops);
        f.position=1000000;assertEquals(1000000,out.getPositionUs());assertEquals(1,f.stops);assertEquals(800000,f.position);assertEquals(1000000,out.getPositionUs());out.stop();assertEquals(1,f.stops);
    }
    @Test public void partialWritesPauseAndFlushKeepRealPositionAndResetDrain()throws Exception{
        Fake f=new Fake();f.chunk=48000;AudioOutput out=DrainAudioOutput.wrap(f.output,4,48000);ByteBuffer b=ByteBuffer.allocate(96000);
        assertFalse(out.write(b,1,0));assertTrue(out.write(b,1,0));f.position=200000;out.stop();out.pause();assertEquals(1,f.pauses);assertEquals(200000,out.getPositionUs());out.play();assertEquals(1,f.plays);
        f.position=100000;assertEquals("不能伪造底层正在播放的时钟",100000,out.getPositionUs());out.flush();assertEquals(0,out.getPositionUs());out.write(ByteBuffer.allocate(48000),1,0);out.stop();f.position=250000;assertEquals(250000,out.getPositionUs());assertEquals(1,f.stops);out.release();assertEquals(1,f.releases);
    }
    @Test public void emptyOffloadedAndEncodedOutputsDoNotWait(){
        Fake f=new Fake();AudioOutput out=DrainAudioOutput.wrap(f.output,4,48000);out.stop();assertEquals(1,f.stops);assertEquals(0,out.getPositionUs());
        assertSame(f.output,DrainAudioOutput.wrap(f.output,0,48000));f.offload=true;assertSame(f.output,DrainAudioOutput.wrap(f.output,4,48000));
    }
    @Test public void fractionalMicrosecondEndStillAccountsForLastSample()throws Exception{
        Fake f=new Fake();AudioOutput out=DrainAudioOutput.wrap(f.output,4,48000);out.write(ByteBuffer.allocate(4),1,0);out.stop();
        f.position=20;assertEquals(20,out.getPositionUs());assertEquals(0,f.stops);
        f.position=21;assertEquals(21,out.getPositionUs());assertEquals(1,out.getPositionUs()*48000/1_000_000);assertEquals(1,f.stops);
    }
    @Test public void estimatedEndCannotStopBeforePhysicalPcmConsumption()throws Exception{
        Fake f=new Fake();long[] head={0};AudioOutput out=DrainAudioOutput.wrap(f.output,4,48000,null,()->head[0]);out.write(ByteBuffer.allocate(4),1,0);
        f.position=21;out.stop();assertEquals(0,f.stops);assertEquals(0,out.getPositionUs());assertEquals(0,f.stops);
        head[0]=1;Thread.sleep(1);assertEquals(21,out.getPositionUs());assertEquals(1,f.stops);
        out.flush();head[0]=0;assertEquals(0,out.getPositionUs());
    }
}
