package com.deepseekharness.media;
import java.io.File;import java.util.List;import org.junit.Test;import static org.junit.Assert.*;
public class NativeAudioContinuityTest {
    private final AuthorizedAssets.Asset asset=new AuthorizedAssets.Asset("audio","audio","a".repeat(64),new File("unused.wav"),4_000_000,List.of(),0,0,0,"audio/wav");
    private FrozenRenderPlan.Audio clip(long in,long out,int frame,float volume,boolean loop){return new FrozenRenderPlan.Audio(asset,in,out,frame,volume,loop);}
    @Test public void onlyExactContinuityMerges(){
        var first=clip(0,1_233_333,0,.2f,false);assertEquals(1,NativePlanComposition.continuousAudio(List.of(first,clip(1_233_333,4_000_000,37,.2f,false))).size());
        for(var second:List.of(clip(1_233_333,4_000_000,38,.2f,false),clip(1_233_333,4_000_000,36,.2f,false),clip(1_233_333,4_000_000,37,.3f,false),clip(1_233_334,4_000_000,37,.2f,false),clip(1_233_333,4_000_000,37,.2f,true)))assertEquals(2,NativePlanComposition.continuousAudio(List.of(first,second)).size());
        assertEquals(2,NativePlanComposition.continuousAudio(List.of(clip(0,100,0,.2f,false),clip(100,4_000_000,1,.2f,false))).size());
    }
}
