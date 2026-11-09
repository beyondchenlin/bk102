package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.file.Files;
import java.util.*;
import static org.junit.Assert.*;

public class MediaSessionTest {
    @Rule public TemporaryFolder temporary=new TemporaryFolder();
    private Map<String,String> digests(){return new HashMap<>(Map.of("a.mp4","a".repeat(64),"b.mp4","b".repeat(64),"voice.wav","c".repeat(64),"bgm.wav","d".repeat(64)));}
    private MediaProvider.RenderPlan plan(){return new MediaProvider.RenderPlan(1,1080,1920,30,List.of(new MediaProvider.Clip("a.mp4",566666,2566666),new MediaProvider.Clip("b.mp4",766666,2766666)));}
    private RenderSnapshot snapshot(long revision){return new RenderSnapshot("project",revision,plan(),List.of("慢一点","也很好"),digests(),true);}
    @Test public void snapshotFreezesCallerStateAndNormalizesMapOrder(){
        Map<String,String> source=digests();ArrayList<String> lines=new ArrayList<>(List.of("慢一点","也很好"));
        RenderSnapshot frozen=new RenderSnapshot("project",1,plan(),lines,source,true);String key=frozen.key();
        lines.set(0,"已修改");source.put("a.mp4","e".repeat(64));
        assertEquals(key,frozen.key());assertEquals(snapshot(1).key(),key);assertEquals(120,frozen.expectedFrames());
        LinkedHashMap<String,String> reverse=new LinkedHashMap<>();List<String> keys=new ArrayList<>(digests().keySet());Collections.reverse(keys);for(String k:keys)reverse.put(k,digests().get(k));
        assertEquals(key,new RenderSnapshot("project",1,plan(),List.of("慢一点","也很好"),reverse,true).key());
    }
    @Test public void everyRenderingIdentityChangeInvalidatesCache(){
        RenderSnapshot base=snapshot(1);Set<String> keys=new HashSet<>();keys.add(base.key());keys.add(snapshot(2).key());
        keys.add(new RenderSnapshot("project",1,plan(),List.of("慢一点","再出发"),digests(),true).key());
        Map<String,String> changed=digests();changed.put("a.mp4","e".repeat(64));keys.add(new RenderSnapshot("project",1,plan(),base.stickerLines(),changed,true).key());
        keys.add(new RenderSnapshot("project",1,plan(),base.stickerLines(),digests(),false).key());
        var swapped=new MediaProvider.RenderPlan(1,1080,1920,30,List.of(plan().clips().get(1),plan().clips().get(0)));
        keys.add(new RenderSnapshot("project",1,swapped,base.stickerLines(),digests(),true).key());assertEquals(6,keys.size());
    }
    @Test public void snapshotRejectsMissingSourceIdentity(){Map<String,String> missing=digests();missing.remove("a.mp4");assertThrows(IllegalArgumentException.class,()->new RenderSnapshot("p",1,plan(),List.of("一","二"),missing,true));}
    @Test public void cancelledCompletionCannotFinishNewTask(){
        MediaTaskGate gate=new MediaTaskGate();var old=gate.begin(snapshot(1));gate.cancel();var current=gate.begin(snapshot(2));
        assertFalse(gate.finish(old,1));assertFalse(gate.finish(current,1));assertTrue(gate.isCurrent(current,2));assertTrue(gate.finish(current,2));assertFalse(gate.finish(current,2));
    }
    @Test public void activeTaskCannotBeSilentlyOverwritten(){MediaTaskGate gate=new MediaTaskGate();var task=gate.begin(snapshot(1));assertThrows(IllegalStateException.class,()->gate.begin(snapshot(2)));assertTrue(gate.isCurrent(task,1));}
    @Test public void failedReplacementPreservesLastGoodFile()throws Exception {
        File dir=temporary.newFolder("media-session");MediaArtifacts artifacts=new MediaArtifacts(dir);
        var first=artifacts.begin("preview-4s.mp4",snapshot(1).key());Files.write(first.path(),new byte[]{1,2,3});File good=artifacts.commit(first);
        var next=artifacts.begin("preview-4s.mp4",snapshot(2).key());assertThrows(java.io.IOException.class,()->artifacts.commit(next));artifacts.discard(next);
        assertArrayEquals(new byte[]{1,2,3},Files.readAllBytes(good.toPath()));assertNotNull(artifacts.lookup("preview-4s.mp4",snapshot(1).key()));assertNull(artifacts.lookup("preview-4s.mp4",snapshot(2).key()));assertEquals(0,artifacts.pendingCount());
    }
    @Test public void successfulReplacementInvalidatesOldKeyAndDetectsMutation()throws Exception {
        MediaArtifacts artifacts=new MediaArtifacts(temporary.newFolder("media-cache"));
        for(int i=1;i<=2;i++){var p=artifacts.begin("preview-4s.mp4",snapshot(i).key());Files.write(p.path(),new byte[]{(byte)i});artifacts.commit(p);}
        assertNull(artifacts.lookup("preview-4s.mp4",snapshot(1).key()));File current=artifacts.lookup("preview-4s.mp4",snapshot(2).key());assertNotNull(current);
        Files.write(current.toPath(),new byte[]{9});assertNull(artifacts.lookup("preview-4s.mp4",snapshot(2).key()));
    }
    @Test public void discardOnlyAcceptsOwnedTemporaryArtifact()throws Exception {
        File dir=temporary.newFolder("media-owned");File unrelated=new File(dir,"previous-evidence.mp4");Files.write(unrelated.toPath(),new byte[]{42});
        MediaArtifacts artifacts=new MediaArtifacts(dir);var fake=new MediaArtifacts.Pending(unrelated.toPath(),"preview-4s.mp4",snapshot(1).key());
        assertThrows(java.io.IOException.class,()->artifacts.discard(fake));assertTrue(unrelated.exists());assertThrows(IllegalArgumentException.class,()->artifacts.begin("../other.mp4",snapshot(1).key()));
    }
}
