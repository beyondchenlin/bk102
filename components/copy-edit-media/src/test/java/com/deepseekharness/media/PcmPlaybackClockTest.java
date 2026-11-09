package com.deepseekharness.media;

import org.junit.Test;
import static org.junit.Assert.*;

public class PcmPlaybackClockTest {
    @Test public void estimatorCatchupCannotAccelerateFixedRatePreview(){
        PcmPlaybackClock c=new PcmPlaybackClock();assertEquals(0,c.update(0,0,0,1_000_000,false));
        assertEquals(10_000,c.update(11_000,22_125,10_000,1_000_000,false));
        assertEquals(20_000,c.update(22_000,44_250,20_000,1_000_000,false));
        assertEquals(30_000,c.update(33_000,44_250,30_000,1_000_000,false));
    }
    @Test public void badTimestampSwitchesToConsumedSamplesWithoutFreezeOrJump(){
        PcmPlaybackClock c=new PcmPlaybackClock();c.update(0,0,0,1_000_000,false);
        assertEquals(20_000,c.update(20_000,44_000,20_000,1_000_000,false));
        assertEquals(30_000,c.update(-1_280_000,66_000,30_000,1_000_000,false));
        assertEquals(40_000,c.update(-1_270_000,66_000,40_000,1_000_000,false));
        assertEquals(50_000,c.update(900_000,66_000,50_000,1_000_000,false));
        assertEquals(60_000,c.update(910_000,88_000,60_000,1_000_000,false));
        assertEquals(97_333,c.update(999_999,88_000,200_000,1_000_000,false));
        assertEquals(97_333,c.update(999_999,88_000,300_000,1_000_000,false));
    }
    @Test public void noisyEstimatesDoNotAccumulateMinuteLongDrift(){
        PcmPlaybackClock c=new PcmPlaybackClock();c.update(0,0,0,60_000_000,false);c.update(10_000,22_125,10_000,60_000_000,false);
        // 首个块在10ms已读到22125us；后续块保持同一相位，不能在20ms伪造回退到0。
        long position=0;for(long now=20_000;now<=59_000_000;now+=10_000){long head=((now+12_125)/22_125)*22_125;position=c.update(now+(now/10_000%2==0?-2000:2000),head,now,60_000_000,false);}
        assertEquals(59_000_000,position);
    }
    @Test public void pauseResetAndDrainDoNotAdvanceOrSkipTheTail(){
        PcmPlaybackClock c=new PcmPlaybackClock();c.update(0,0,0,100_000,false);assertEquals(20_000,c.update(20_000,20_000,20_000,100_000,false));
        c.pause();assertEquals(20_000,c.update(90_000,90_000,1_000_000,100_000,false));
        c.resume(1_000_000);assertEquals(30_000,c.update(100_000,100_000,1_010_000,100_000,true));
        assertEquals(100_000,c.update(100_000,100_000,1_080_000,100_000,true));
        c.reset();assertEquals(0,c.update(0,0,2_000_000,100_000,false));assertEquals(0,c.update(0,0,3_000_000,100_000,false));
    }
}
