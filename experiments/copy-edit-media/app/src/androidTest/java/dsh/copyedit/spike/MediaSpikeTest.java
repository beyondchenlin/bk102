package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.content.Context;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

/** 只能在本次授权的模拟器/测试机执行；不访问生产 DSHA。 */
public class MediaSpikeTest {
    @Test public void nativeContract() throws Exception {
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()){
            waitText(scenario,"源帧 17",30_000);
            NativePlanTest test=new NativePlanTest();test.frozenPlanRejectsWrongIdentityHashPtsAndUnauthorizedAssets();test.rejectedImportClosesAuthorizedStream();
        }
    }
    @Test public void cacheLifecycle() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();java.io.File dir=new java.io.File(context.getFilesDir(),"media-spike");
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            JSONObject v1=lastEvent(context,"preview-start");assertEquals(1,v1.getLong("revision"));assertFalse(v1.getBoolean("cacheHit"));
            String firstPng=MediaArtifacts.digest(new java.io.File(dir,"sticker.png"));
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            JSONObject reused=lastEvent(context,"preview-start");assertTrue(reused.getBoolean("cacheHit"));assertEquals(v1.getString("snapshotKey"),reused.getString("snapshotKey"));
            click(scenario,"导出 4 秒 1080P");waitText(scenario,"已导出 export-4s.mp4",180_000);verifyOutput(context,"export-4s.mp4",120);
            String goodExport=MediaArtifacts.digest(new java.io.File(dir,"export-4s.mp4"));
            click(scenario,"切换贴片版本");waitText(scenario,"工程 V2",5_000);
            click(scenario,"导出 4 秒 1080P");waitText(scenario,"本地编码",5_000);waitPartialBytes(dir,10_000);
            click(scenario,"取消任务");waitText(scenario,"任务已取消",10_000);
            long cancelledExport=lastEvent(context,"task-cancelled").getLong("task");
            assertEquals(goodExport,MediaArtifacts.digest(new java.io.File(dir,"export-4s.mp4")));assertNoPartial(dir);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            JSONObject v2=lastEvent(context,"preview-start");assertEquals(2,v2.getLong("revision"));assertFalse(v2.getBoolean("cacheHit"));assertNotEquals(v1.getString("snapshotKey"),v2.getString("snapshotKey"));
            assertNotEquals(firstPng,MediaArtifacts.digest(new java.io.File(dir,"sticker.png")));
            click(scenario,"切换贴片版本");waitText(scenario,"工程 V3",5_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"正在准备连续预览",5_000);
            long cancelledPreview=lastEvent(context,"preview-cache-start").getLong("task");int before=countEvents(context,"preview-start");
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            waitText(scenario,"任务已取消",10_000);Thread.sleep(1200);
            assertEquals(before,countEvents(context,"preview-start"));assertNoPartial(dir);
            JSONArray events=events(context);
            for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);String type=e.getString("type");if(type.equals("export-completed")||type.equals("preview-cache-ready")){assertNotEquals(cancelledExport,e.optLong("task",-1));assertNotEquals(cancelledPreview,e.optLong("task",-1));}}
            // 后台取消后能发起新任务，不假装旧任务恢复。
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            JSONObject v3=lastEvent(context,"preview-start");assertEquals(3,v3.getLong("revision"));assertFalse(v3.getBoolean("cacheHit"));assertNotEquals(v1.getString("snapshotKey"),v3.getString("snapshotKey"));assertNoPartial(dir);
        }
    }
    private static ActivityScenario<SpikeActivity> launchScenario(){
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.Intent intent=new android.content.Intent(context,SpikeActivity.class)
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("evidenceRunId",InstrumentationRegistry.getArguments().getString("evidenceRunId"))
                .putExtra("audioClockTrace","true".equals(InstrumentationRegistry.getArguments().getString("audioClockTrace")))
                .putExtra("naturalDrain","true".equals(InstrumentationRegistry.getArguments().getString("naturalDrain")))
                .putExtra("softwarePreview","true".equals(InstrumentationRegistry.getArguments().getString("softwarePreview")));
        return ActivityScenario.launch(intent);
    }
    private static JSONArray events(Context context)throws Exception{return new JSONArray(new String(Files.readAllBytes(new java.io.File(context.getFilesDir(),"media-spike/evidence.json").toPath()),java.nio.charset.StandardCharsets.UTF_8));}
    private static JSONObject lastEvent(Context context,String type)throws Exception {JSONArray es=events(context);for(int i=es.length()-1;i>=0;i--)if(es.getJSONObject(i).getString("type").equals(type))return es.getJSONObject(i);throw new AssertionError("Missing event "+type);}
    private static int countEvents(Context context,String type)throws Exception {int count=0;JSONArray es=events(context);for(int i=0;i<es.length();i++)if(es.getJSONObject(i).getString("type").equals(type))count++;return count;}
    private static void assertNoPartial(java.io.File dir){java.io.File[] files=dir.listFiles((d,n)->n.startsWith("job-")&&n.endsWith(".part.mp4"));assertNotNull(files);assertEquals("No unfinished file may survive cancellation",0,files.length);}
    private static void waitPartialBytes(java.io.File dir,long timeout)throws Exception {long end=android.os.SystemClock.elapsedRealtime()+timeout;while(android.os.SystemClock.elapsedRealtime()<end){java.io.File[] files=dir.listFiles((d,n)->n.startsWith("job-")&&n.endsWith(".part.mp4"));if(files!=null)for(java.io.File f:files)if(f.length()>0)return;Thread.sleep(50);}fail("Export did not produce a partial file");}
    @Test public void rawSurface() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();SpikeEngine engine=new SpikeEngine(context);
        JSONArray probes=new JSONArray();
        probes.put(RawSurfaceProbe.run(engine.asset("a.mp4"),5));
        JSONObject bounded=RawSurfaceProbe.run(engine.asset("a.mp4"),1);probes.put(bounded);
        Files.write(new java.io.File(context.getFilesDir(),"media-spike/raw-surface.json").toPath(),probes.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertEquals(60,bounded.getInt("rendered"));JSONArray pts=bounded.getJSONArray("receivedPtsUs");assertEquals(60,pts.length());
        for(int i=0;i<60;i++)assertTrue(Math.abs(pts.getLong(i)-FrameMath.toUs(i+17,30,1))<=1);
    }
    @Test public void previewOnly() throws Exception {
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",60_000);
        }
    }
    @Test public void diagnose4() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",60_000);
            click(scenario,"导出 4 秒 1080P");waitText(scenario,"已导出 export-4s.mp4",180_000);
            verifyOutput(context,"export-4s.mp4",120);
        }
    }
    @Test public void exportOnly() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"导出 4 秒 1080P");waitText(scenario,"已导出 export-4s.mp4",180_000);
            verifyOutput(context,"export-4s.mp4",120);
        }
    }
    @Test public void framePreviewExport() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"逐帧夹具检查");waitText(scenario,"逐帧夹具检查完成",120_000);
            click(scenario,"+1 帧");waitText(scenario,"源帧 18",20_000);
            click(scenario,"−1 帧");waitText(scenario,"源帧 17",20_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            click(scenario,"导出 4 秒 1080P");waitText(scenario,"已导出 export-4s.mp4",180_000);
            verifyOutput(context,"export-4s.mp4",120);
            verifyPreview(context,1,120,0);
            click(scenario,"+1 帧");waitText(scenario,"源帧 18",20_000);
            click(scenario,"从当前帧连续播放");waitText(scenario,"连续预览结束",45_000);
            verifyPreview(context,2,119,33333);
            JSONArray events=new JSONArray(new String(Files.readAllBytes(new java.io.File(context.getFilesDir(),"media-spike/evidence.json").toPath()),java.nio.charset.StandardCharsets.UTF_8));
            int checks=0;
            for(int i=0;i<events.length();i++) {
                JSONObject event=events.getJSONObject(i);
                if(event.getString("type").equals("frame-check")){assertTrue(event.toString(),event.getBoolean("pass"));checks++;}
            }
            assertEquals(30,checks);
        }
    }
    @Test public void minute() throws Exception {
        // runner 必须先读回同一 APK 的 4 秒正确性报告才准入。
        assertEquals("true",InstrumentationRegistry.getArguments().getString("fourSecondGate"));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<SpikeActivity> scenario=launchScenario()) {
            waitText(scenario,"源帧 17",30_000);
            click(scenario,"导出 60 秒 1080P");waitText(scenario,"已导出 export-60s.mp4",600_000);
            verifyOutput(context,"export-60s.mp4",1800);
            click(scenario,"连续预览 60 秒");waitText(scenario,"连续预览结束",600_000);
            verifyPreview(context,1,1800,0);
            for(int run=2;run<=3;run++){
                click(scenario,"连续预览 60 秒");waitText(scenario,"连续预览结束",90_000);
                verifyPreview(context,run,1800,0);
            }
        }
    }
    private static void verifyPreview(Context context,int run,int count,long firstPts)throws Exception {
        JSONArray events=new JSONArray(new String(Files.readAllBytes(new java.io.File(context.getFilesDir(),"media-spike/evidence.json").toPath()),java.nio.charset.StandardCharsets.UTF_8));
        int actual=0;long priorPts=-1,priorRelease=-1,maxGap=0;boolean ended=false;
        for(int i=0;i<events.length();i++) {
            JSONObject e=events.getJSONObject(i);if(e.optInt("run",-1)!=run)continue;
            if(e.getString("type").equals("preview-ended"))ended=true;
            if(!e.getString("type").equals("preview-frame"))continue;
            long pts=e.getLong("ptsUs");if(actual++==0)assertEquals(firstPts,pts);
            if(priorPts>=0)assertTrue("Preview PTS gap "+(pts-priorPts),pts-priorPts>=33332&&pts-priorPts<=33335);
            priorPts=pts;
            if(e.optBoolean("playing")){long release=e.getLong("releaseNs");if(priorRelease>=0)maxGap=Math.max(maxGap,release-priorRelease);priorRelease=release;}
        }
        assertTrue(ended);assertEquals(count,actual);assertTrue("Playing release gap(ms): "+maxGap/1_000_000,maxGap<150_000_000);
    }
    private static void verifyOutput(Context context,String name,int expectedFrames)throws Exception {
        java.io.File file=new java.io.File(context.getFilesDir(),"media-spike/"+name);assertTrue(file.length()>0);
        MediaExtractor extractor=new MediaExtractor();
        try{extractor.setDataSource(file.getAbsolutePath());int video=0,audio=0;
            for(int i=0;i<extractor.getTrackCount();i++){
                MediaFormat format=extractor.getTrackFormat(i);String mime=format.getString(MediaFormat.KEY_MIME);
                if(mime.startsWith("video/")){video++;assertEquals("video/avc",mime);int w=format.getInteger(MediaFormat.KEY_WIDTH),h=format.getInteger(MediaFormat.KEY_HEIGHT);assertEquals(1080,Math.min(w,h));assertEquals(1920,Math.max(w,h));}
                if(mime.startsWith("audio/")){audio++;assertEquals("audio/mp4a-latm",mime);}
            }
            assertEquals(1,video);assertEquals(1,audio);
        }finally{extractor.release();}
        long[] pts=ExactFrames.index(file);assertEquals(expectedFrames,pts.length);
        // 真正解码第一帧、接缝前后和末帧；完整条码/音轨核验由主机读回脚本继续执行。
        for(int frame:new int[]{0,59,60,expectedFrames-1}){ExactFrames.Frame decoded=ExactFrames.decode(file,pts[frame],()->false);assertEquals(pts[frame],decoded.ptsUs());decoded.bitmap().recycle();}
    }
    private static void click(ActivityScenario<SpikeActivity> scenario,String label){scenario.onActivity(activity->{View view=find(activity.getWindow().getDecorView(),label,true);assertNotNull(label,view);assertTrue(view.performClick());});}
    private static void waitText(ActivityScenario<SpikeActivity> scenario,String text,long timeout)throws Exception {
        long deadline=android.os.SystemClock.elapsedRealtime()+timeout;
        while(android.os.SystemClock.elapsedRealtime()<deadline){AtomicBoolean found=new AtomicBoolean();scenario.onActivity(a->{View root=a.getWindow().getDecorView();TextView failure=(TextView)find(root,"失败：",false);assertNull(failure==null?"":failure.getText().toString(),failure);found.set(find(root,text,false)!=null);});if(found.get())return;Thread.sleep(100);}
        fail("Timeout: "+text);
    }
    private static View find(View view,String text,boolean exact){if(view instanceof TextView t&&(!exact||view instanceof Button)&&(exact?t.getText().toString().equals(text):t.getText().toString().contains(text)))return view;if(view instanceof ViewGroup group)for(int i=0;i<group.getChildCount();i++){View found=find(group.getChildAt(i),text,exact);if(found!=null)return found;}return null;}
}
