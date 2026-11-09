package dsh.copyedit.spike;

import android.content.Intent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

/** 真实网页控制器→同源桥→原生缓存→SurfaceView，零丢帧/完整PTS/150ms沿用原门禁。 */
public class NativePreviewTest extends WebStabilityTest {
    ActivityScenario<WebProbeActivity> openNative(int seconds){return ActivityScenario.launch(new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),WebProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("nativeHarness",true).putExtra("seconds",seconds));}
    @Test public void hybridFour()throws Exception{strict(4);}
    @Test public void hybridMinute()throws Exception{assertEquals("true",InstrumentationRegistry.getArguments().getString("hybridFourGate"));strict(60);}
    @Test public void controlsAndRecovery()throws Exception{
        JSONObject receipt=new JSONObject();
        try(ActivityScenario<WebProbeActivity> s=openNative(4)){
            waitFor(s,"window.ready===true||!!window.failure",150000);assertEquals("null",eval(s,"window.failure"));
            for(int target:new int[]{1,59,119,0}){
                async(s,"player.seek("+target+"/30).then(()=>player.readPosition())");
                assertEquals(target/30d,Double.parseDouble(eval(s,"window.result")),.0011);
                s.onActivity(a->{synchronized(a.nativeFrames){assertTrue(Math.abs(a.nativeFrames.optJSONObject(a.nativeFrames.length()-1).optLong("ptsUs")-Math.round(target*1e6/30))<=1);}});
            }
            receipt.put("exactSeekFrames",new JSONArray(new int[]{1,59,119,0}));
            async(s,"Promise.allSettled([player.seek(2),player.seek(1),player.seek(59/30)]).then(()=>player.readPosition())");assertEquals(59/30d,Double.parseDouble(eval(s,"window.result")),.0011);receipt.put("rapidSeekLatest",true);
            async(s,"player.seek(1).then(()=>player.playFrom(1)).then(()=>true)");waitFor(s,"window.running===true",5000);s.onActivity(a->assertTrue(a.web.getKeepScreenOn()));receipt.put("immediateResumeAfterSeek",true);
            android.graphics.Bitmap shot=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();assertNotNull(shot);
            try(var image=new java.io.FileOutputStream(new java.io.File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"native-preview-controls.png"))){assertTrue(shot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,image));}finally{shot.recycle();}
            async(s,"client.call('preview',{playbackId:'00000000000000000000000000000000',command:'close'}).then(()=>false,e=>e.message)");assertEquals("PREVIEW_RETIRED",new JSONTokener(eval(s,"window.result")).nextValue());assertEquals("true",eval(s,"window.running"));receipt.put("staleCloseRejected",true);
            eval(s,"(()=>{const e=document.createElement('div');e.id='cover';e.style='position:fixed;inset:0;z-index:99;background:white';document.body.append(e);return true})()");waitFor(s,"window.running===false",5000);
            s.onActivity(a->assertFalse(a.web.getKeepScreenOn()));async(s,"player.readPosition()");double covered=Double.parseDouble(eval(s,"window.result"));Thread.sleep(400);async(s,"player.readPosition()");assertEquals(covered,Double.parseDouble(eval(s,"window.result")),.0011);
            eval(s,"(document.querySelector('#cover').remove(),true)");Thread.sleep(300);assertEquals("false",eval(s,"window.running"));receipt.put("occlusionPauseNoReplay",true);
            async(s,"player.playFrom(0).then(()=>true)");s.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);Thread.sleep(250);async(s,"player.readPosition()");double paused=Double.parseDouble(eval(s,"window.result"));
            s.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);Thread.sleep(400);async(s,"player.readPosition()");assertEquals(paused,Double.parseDouble(eval(s,"window.result")),.0011);assertEquals("false",eval(s,"window.running"));receipt.put("backgroundPauseNoReplay",true);
            for(int pass=1;pass<=3;pass++){
                async(s,"player.playFrom(0).then(()=>true)");String previousJob=new JSONObject(eval(s,"window.job")).getString("jobId");s.onActivity(a->assertTrue(a.web.getWebViewRenderProcess().terminate()));
                int[] exits={0};long until=android.os.SystemClock.elapsedRealtime()+10000;while(exits[0]<pass&&android.os.SystemClock.elapsedRealtime()<until){s.onActivity(a->exits[0]=a.rendererExits);Thread.sleep(50);}assertEquals(pass,exits[0]);
                s.onActivity(a->{assertNull(a.web);assertNull(a.media);((android.widget.Button)((android.view.ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).performClick();});
                waitFor(s,"window.ready===true||!!window.failure",150000);assertEquals("null",eval(s,"window.failure"));waitFor(s,"window.running===false",10000);
                async(s,"client.call('job',{jobId:"+JSONObject.quote(previousJob)+"})");assertEquals("retired",new JSONObject(eval(s,"window.result")).getString("status"));
                receipt.put("rendererRecoveries",pass);save("native-controls.json",receipt);
            }
            assertEquals("[]",eval(s,"report.errors"));receipt.put("passed",true);save("native-controls.json",receipt);
        }
    }
    static String shell(String command)throws Exception{try(var in=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command));var out=new java.io.ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>1024*1024)throw new java.io.IOException("SHELL_EVIDENCE_LIMIT");}return out.toString("UTF-8");}}
    void strict(int seconds)throws Exception{
        String runId=InstrumentationRegistry.getArguments().getString("evidenceRunId","");assertTrue(runId.matches("[-a-f0-9]{36}"));save("native-hybrid-"+seconds+".json",new JSONObject().put("runId",runId).put("status","started"));
        try(ActivityScenario<WebProbeActivity> s=openNative(seconds)){
            waitFor(s,"window.ready===true||!!window.failure",150000);assertEquals("null",eval(s,"window.failure"));
            // 只保留本次自制结果用于主机完整读回；不扫描或复制任何工作台工程。
            String job=new JSONObject(eval(s,"window.job")).getString("jobId");assertTrue(job.matches("[-a-fA-F0-9]{32,36}"));
            java.io.File contextRoot=InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir();java.io.File result=null;
            java.io.File[] sessions=new java.io.File(contextRoot,"copy-edit-native").listFiles();if(sessions!=null)for(java.io.File session:sessions){java.io.File candidate=new java.io.File(new java.io.File(session,job),"preview.mp4");if(java.nio.file.Files.isRegularFile(candidate.toPath(),java.nio.file.LinkOption.NOFOLLOW_LINKS)){assertNull(result);result=candidate;}}
            assertNotNull(result);assertTrue(result.length()<128L*1024*1024);java.nio.file.Files.copy(result.toPath(),new java.io.File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"native-hybrid-"+seconds+".mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            AtomicReference<BlockingQueue<String>> events=new AtomicReference<>();s.onActivity(a->events.set(a.playbackEvents));tapOnly(s);
            for(int pass=1;pass<=3;pass++){
                if(pass>1)eval(s,"(start(0),true)");String started=events.get().poll(15,TimeUnit.SECONDS);if(!"started".equals(started)){JSONObject failed=new JSONObject(eval(s,"report"));s.onActivity(a->{try{failed.put("frames",a.nativeFrames).put("displayed",a.nativeDisplayed);}catch(Exception e){throw new IllegalStateException(e);}});save("native-hybrid-failure.json",failed);}assertEquals("started",started);assertEquals("ended:"+pass,events.get().poll(seconds+15,TimeUnit.SECONDS));
                Thread.sleep(2500); // 仅在结束后给2秒周期采样器收集尾帧，不计入播放时钟。
            }
            JSONObject receipt=new JSONObject(eval(s,"report")).put("runId",runId);s.onActivity(a->{try{synchronized(a.nativeFrames){receipt.put("frames",new JSONArray(a.nativeFrames.toString())).put("displayed",new JSONArray(a.nativeDisplayed.toString())).put("dropped",a.nativeDropped);}synchronized(a.nativeAudio){receipt.put("audio",new JSONArray(a.nativeAudio.toString()));}}catch(Exception e){throw new IllegalStateException(e);}});
            save("native-hybrid-"+seconds+".json",receipt);
            assertEquals("[]",receipt.getJSONArray("errors").toString());assertEquals(0,receipt.getInt("dropped"));JSONArray frames=receipt.getJSONArray("frames");assertEquals(seconds*30*3,frames.length());
            long maxGap=0,prior=-1;for(int i=0;i<frames.length();i++){JSONObject f=frames.getJSONObject(i);assertTrue("PTS "+i,Math.abs(f.getLong("ptsUs")-Math.round((i%(seconds*30))*1_000_000d/30))<=1);if(i%(seconds*30)==0)prior=-1;if(f.getBoolean("playing")){long now=f.getLong("releaseNs");if(prior>=0)maxGap=Math.max(maxGap,now-prior);prior=now;}}
            receipt.put("maxGapMs",maxGap/1e6);save("native-hybrid-"+seconds+".json",receipt);assertTrue("播放间隔 "+maxGap/1e6,maxGap<150_000_000);
            // Android 11的Codec回执可能缺尾部；正式显示门禁由宿主逐一匹配SurfaceFlinger真实呈现记录。
            // runner必须同时验证完整PTS、全部呈现和<150ms间隔，单独JUnit成功不能准入长测。
            receipt.put("displayEvidence","host-surfaceflinger-required");save("native-hybrid-"+seconds+".json",receipt);
        }
    }
}
