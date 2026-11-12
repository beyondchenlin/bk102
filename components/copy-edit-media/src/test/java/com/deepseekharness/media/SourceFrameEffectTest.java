package com.deepseekharness.media;

import androidx.media3.common.GlTextureInfo;
import androidx.media3.effect.GlShaderProgram;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public class SourceFrameEffectTest {
    private GlTextureInfo texture(int id){return new GlTextureInfo(id,-1,-1,2,2);}
    @Test public void holdsInputUntilAllRepeatedOutputsReturnAndDefersEnd() {
        var p=new SourceFrameEffect.Program(List.of(100L,100L,200L),100);
        List<Long> output=new ArrayList<>();List<GlTextureInfo> returned=new ArrayList<>();int[] end={0};
        p.setInputListener(new GlShaderProgram.InputListener(){@Override public void onInputFrameProcessed(GlTextureInfo t){returned.add(t);}});
        p.setOutputListener(new GlShaderProgram.OutputListener(){@Override public void onOutputFrameAvailable(GlTextureInfo t,long us){output.add(us);}@Override public void onCurrentOutputStreamEnded(){end[0]++;}});
        var first=texture(1);p.queueInputFrame(null,first,1_000_000);assertTrue(returned.isEmpty());
        p.releaseOutputFrame(first);assertTrue(returned.isEmpty());assertEquals(List.of(1_000_000L,1_033_333L),output);
        p.releaseOutputFrame(first);assertEquals(List.of(first),returned);
        var last=texture(2);p.queueInputFrame(null,last,1_000_100);p.signalEndOfCurrentInputStream();assertEquals(0,end[0]);
        p.releaseOutputFrame(last);assertEquals(1,end[0]);assertEquals(1_066_667L,(long)output.get(2));
    }
    @Test public void synchronousReleaseDoesNotRecurseForLongStillFrame() {
        var p=new SourceFrameEffect.Program(Collections.nCopies(1800,0L),0);int[] outputs={0},inputs={0};
        p.setInputListener(new GlShaderProgram.InputListener(){@Override public void onInputFrameProcessed(GlTextureInfo t){inputs[0]++;}});
        p.setOutputListener(new GlShaderProgram.OutputListener(){@Override public void onOutputFrameAvailable(GlTextureInfo t,long us){outputs[0]++;p.releaseOutputFrame(t);}});
        p.queueInputFrame(null,texture(1),0);p.signalEndOfCurrentInputStream();assertEquals(1800,outputs[0]);assertEquals(1,inputs[0]);
    }
    @Test public void dropsUnselectedFramesAndReportsMissingDecodedFrame() {
        var p=new SourceFrameEffect.Program(List.of(0L,66_667L),0);int[] outputs={0},inputs={0},errors={0};
        p.setErrorListener(Runnable::run,e->errors[0]++);
        p.setInputListener(new GlShaderProgram.InputListener(){@Override public void onInputFrameProcessed(GlTextureInfo t){inputs[0]++;}});
        p.setOutputListener(new GlShaderProgram.OutputListener(){@Override public void onOutputFrameAvailable(GlTextureInfo t,long us){outputs[0]++;p.releaseOutputFrame(t);}});
        p.queueInputFrame(null,texture(1),0);p.queueInputFrame(null,texture(2),33_333);assertEquals(1,outputs[0]);assertEquals(2,inputs[0]);
        p.signalEndOfCurrentInputStream();assertEquals(1,errors[0]);
    }
    @Test public void flushRestartsMappingAndReleasedProgramIgnoresLateReturn() {
        var p=new SourceFrameEffect.Program(List.of(0L),0);List<Long> times=new ArrayList<>();
        p.setOutputListener(new GlShaderProgram.OutputListener(){@Override public void onOutputFrameAvailable(GlTextureInfo t,long us){times.add(us);p.releaseOutputFrame(t);}});
        p.queueInputFrame(null,texture(1),100);p.signalEndOfCurrentInputStream();p.flush();p.queueInputFrame(null,texture(2),200);
        p.release();p.releaseOutputFrame(texture(2));assertEquals(List.of(100L,200L),times);
    }
}
