package com.deepseekharness.media;

import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class SourceFrameMappingTest {
    private List<Long> pts(int count, double fps) {
        List<Long> result=new ArrayList<>();for(int n=0;n<count;n++)result.add(Math.round(n*1_000_000/fps));return result;
    }
    @Test public void highRateDropsAndLowRateRepeatsAccordingToPts() {
        var high=pts(120,60);var mapped=SourceFrameMapping.create(high,2_000_000,0,120,0,120,0,60,false);
        for(int n=0;n<60;n++)assertEquals(high.get(n*2),mapped.get(n));
        var low=pts(48,24);mapped=SourceFrameMapping.create(low,2_000_000,0,48,0,48,0,60,false);
        for(int n=0;n<60;n++)assertEquals(low.get(n*24/30),mapped.get(n));
    }
    @Test public void splitPreservesOriginalVariableRatePhase() {
        var pts=List.of(0L,40_000L,100_000L,133_333L,220_000L,250_000L,310_000L);
        var full=SourceFrameMapping.create(pts,350_000,0,7,0,7,0,11,false);
        var left=SourceFrameMapping.create(pts,350_000,0,4,0,7,0,5,true);
        var right=SourceFrameMapping.create(pts,350_000,3,7,0,7,5,6,true);
        var joined=new ArrayList<>(left);joined.addAll(right);assertEquals(full,joined);
        assertEquals(133_333L,(long)right.get(0));
    }
    @Test public void toleratesExtractorMicrosecondTruncationAndFractionalFps() {
        var pts=pts(60,29.97);var mapped=SourceFrameMapping.create(pts,2_002_002,0,60,0,60,0,61,false);
        assertEquals(61,mapped.size());assertEquals(pts.get(0),mapped.get(1));assertEquals(pts.get(59),mapped.get(60));
        assertEquals(List.of(0L,33_332L,66_666L),SourceFrameMapping.create(List.of(0L,33_332L,66_666L),100_000,0,3,0,3,0,3,false));
    }
    @Test public void rejectsForgedFramesWindowAndUnselectedBoundaries() {
        var pts=pts(120,60);
        assertThrows(IllegalArgumentException.class,()->SourceFrameMapping.create(pts,2_000_000,0,120,0,120,0,120,false));
        assertThrows(IllegalArgumentException.class,()->SourceFrameMapping.create(pts,2_000_000,0,120,0,120,30,60,true));
        assertThrows(IllegalArgumentException.class,()->SourceFrameMapping.create(pts,2_000_000,0,120,0,120,0,60,true));
        assertThrows(UnsupportedOperationException.class,()->SourceFrameMapping.create(pts,2_000_000,0,120,0,120,0,60,false).clear());
    }
}
