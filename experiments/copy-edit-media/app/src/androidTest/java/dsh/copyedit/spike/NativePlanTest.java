package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.*;
import java.io.*;
import static org.junit.Assert.*;

public class NativePlanTest {
    private interface Change {void edit(JSONObject plan)throws Exception;}
    private String change(String original,Change change)throws Exception {JSONObject e=new JSONObject(original),p=new JSONObject(e.getString("planJson"));change.edit(p);String raw=p.toString();e.put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw));return e.toString();}
    @Test public void frozenPlanRejectsWrongIdentityHashPtsAndUnauthorizedAssets()throws Exception {
        NativeFixturePlans provider=new NativeFixturePlans(InstrumentationRegistry.getInstrumentation().getTargetContext());String raw=provider.envelope(false,false);
        FrozenRenderPlan valid=provider.parse(raw,"native-fixture-project",1);assertEquals(120,valid.expectedFrames());assertEquals(2,valid.stickers().size());assertEquals(2,valid.audio().size());
        assertEquals((long)valid.clips().get(0).asset().pts().get(17),valid.clips().get(0).startUs());
        assertThrows(Exception.class,()->provider.parse(raw,"other",1));assertThrows(Exception.class,()->provider.parse(raw,"native-fixture-project",2));
        JSONObject badHash=new JSONObject(raw);badHash.put("planHash","a".repeat(64));assertThrows(Exception.class,()->provider.parse(badHash.toString(),"native-fixture-project",1));
        for(Change edit:new Change[]{p->p.put("schemaVersion",3),p->p.getJSONObject("canvas").put("width",1920),p->p.getJSONArray("clips").getJSONObject(0).put("startUs",0),p->p.getJSONArray("clips").getJSONObject(0).put("frames",59),p->p.getJSONArray("assets").getJSONObject(0).put("assetId","file:///sdcard/user.mp4"),p->p.getJSONArray("assets").getJSONObject(0).put("sha256","a".repeat(64)),p->p.getJSONArray("voices").getJSONObject(0).put("outUs",61_000_000),p->p.getJSONArray("stickers").getJSONObject(0).put("endFrame",121)}){
            String changed=change(raw,edit);assertThrows(Exception.class,()->provider.parse(changed,"native-fixture-project",1));
        }
        FrozenRenderPlan preview=provider.snapshot(false,1,false,true);assertNotEquals(valid.key(),preview.key());assertEquals(valid.clips(),preview.clips());assertEquals(valid.stickers(),preview.stickers());
    }
    @Test public void rejectedImportClosesAuthorizedStream()throws Exception {
        var context=InstrumentationRegistry.getInstrumentation().getTargetContext();AuthorizedAssets registry=new AuthorizedAssets(new File(context.getCacheDir().getCanonicalFile(),"native-stream-test"));
        boolean[] closed={false};InputStream input=new ByteArrayInputStream(new byte[]{1}){@Override public void close(){closed[0]=true;}};
        assertThrows(Exception.class,()->registry.importAuthorized("../bad","video","a".repeat(64),input));assertTrue(closed[0]);
    }
    @Test public void segmentedPlanRejectsAmbiguousAndOutOfRangeMusic()throws Exception {
        NativeFixturePlans provider=new NativeFixturePlans(InstrumentationRegistry.getInstrumentation().getTargetContext());String raw=provider.segmentedEnvelope();FrozenRenderPlan valid=provider.parse(raw,"native-fixture-project",1);assertEquals(2,valid.music().size());assertEquals(2,valid.audio().size());
        for(Change edit:new Change[]{p->p.put("schemaVersion",1),p->p.getJSONArray("music").getJSONObject(1).put("musicId","music-left"),p->p.getJSONArray("music").getJSONObject(1).put("offsetSamples",-1),p->p.getJSONArray("music").getJSONObject(1).put("endFrame",121),p->p.getJSONObject("audio").put("bgm",new JSONObject().put("assetId","bgm.wav").put("volume",.2))})assertThrows(Exception.class,()->provider.parse(change(raw,edit),"native-fixture-project",1));
    }
}
