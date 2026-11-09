package dsh.copyedit.spike;

import com.deepseekharness.media.*;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import org.json.*;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import androidx.test.core.app.ActivityScenario;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

/** 与生产相同执行器：输入来自真实compilePlan夹具，生命周期在Android主线程执行。 */
public class NativeSessionTest {
  final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  ActivityScenario<SpikeActivity> foreground;
  @Before public void foreground(){foreground=ActivityScenario.launch(SpikeActivity.class);}
  @After public void leave(){if(foreground!=null)foreground.close();}
  interface Work<T>{T run()throws Exception;}
  <T>T main(Work<T> work)throws Exception{FutureTask<T> task=new FutureTask<>(work::run);InstrumentationRegistry.getInstrumentation().runOnMainSync(task);return task.get(20,TimeUnit.SECONDS);}
  final class Source implements NativeMediaSource {
    String envelope;final AtomicInteger loads=new AtomicInteger();boolean stale;CountDownLatch entered,release;
    Source()throws Exception{envelope=new NativeFixturePlans(context).envelope(false,false);}
    public String loadPlan(String project,long revision,String profile)throws Exception{
      int n=loads.incrementAndGet();if(entered!=null){entered.countDown();if(!release.await(20,TimeUnit.SECONDS))throw new IOException("TEST_WAIT");}
      if(stale&&n>1)throw new IllegalStateException("PROJECT_REVISION_CHANGED");
      return new JSONObject(envelope).put("profile",profile).toString();
    }
    public InputStream openAsset(String id)throws Exception{return context.getAssets().open("fixtures/"+id);}
  }
  JSONObject done(NativeMediaSession session,String id)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(90);while(System.nanoTime()<end){JSONObject value=main(()->session.job(id));if(!value.getString("status").equals("running"))return value;Thread.sleep(80);}throw new AssertionError("SESSION_DEADLINE");}
  @Test public void cancelledPreparationCannotPublishAndOldSessionRetires()throws Exception{
    Source source=new Source();source.entered=new CountDownLatch(1);source.release=new CountDownLatch(1);NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));String id=UUID.randomUUID().toString();
    try{
      main(()->session.start(id,"native-fixture-project",1,"preview"));assertTrue(source.entered.await(10,TimeUnit.SECONDS));
      assertEquals("cancelled",main(()->session.cancel(id)).getString("status"));
      assertEquals("cancelled",main(()->session.start(id,"native-fixture-project",1,"preview")).getString("status"));assertEquals(1,source.loads.get());
      source.release.countDown();assertNull(session.result(id));
    }finally{source.release.countDown();main(()->{session.close();return null;});}
    NativeMediaSession next=main(()->new NativeMediaSession(context,source,false));try{assertFalse(main(next::capabilities).getBoolean("available"));assertEquals("retired",main(()->next.job(id)).getString("status"));assertThrows(Exception.class,()->main(()->next.start(UUID.randomUUID().toString(),"native-fixture-project",1,"preview")));}finally{main(()->{next.close();return null;});}
  }
  @Test public void actualSessionCommitsVerifiedPreviewAndRejectsStaleRevision()throws Exception{
    for(boolean stale:new boolean[]{false,true}){Source source=new Source();source.stale=stale;NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));String id=UUID.randomUUID().toString();try{
      main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject value=done(session,id);assertEquals(value.toString(),stale?"failed":"complete",value.getString("status"));assertEquals(2,source.loads.get());
      if(stale){assertNull(session.result(id));assertEquals("PROJECT_REVISION_CHANGED",value.getString("error"));}else{assertTrue(session.result(id).length()>1000);assertEquals(120,value.getInt("totalFrames"));assertTrue(value.getBoolean("androidLocal"));}
    }finally{main(()->{session.close();return null;});}}
  }
  @Test public void backgroundSuspendsWithoutReplaying()throws Exception{
    Source source=new Source();source.entered=new CountDownLatch(1);source.release=new CountDownLatch(1);NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));String id=UUID.randomUUID().toString();try{main(()->session.start(id,"native-fixture-project",1,"preview"));assertTrue(source.entered.await(10,TimeUnit.SECONDS));main(()->{session.suspend();return null;});source.release.countDown();assertEquals("cancelled",main(()->session.job(id)).getString("status"));assertEquals(1,source.loads.get());assertNull(session.result(id));}finally{source.release.countDown();main(()->{session.close();return null;});}
  }
  @Test public void shiftedVoiceKeepsAudioTailAndBlackFrames()throws Exception{
    Source source=new Source();source.envelope=new NativeFixturePlans(context).tailEnvelope();NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));String id=UUID.randomUUID().toString();try{
      main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject job=done(session,id);assertEquals(job.toString(),"complete",job.getString("status"));assertEquals(180,job.getInt("totalFrames"));
      ExactFrames.Frame tail=ExactFrames.decodeAsset(session.result(id),5_000_000,()->false);try{int pixel=tail.bitmap().getPixel(100,100);assertTrue(android.graphics.Color.red(pixel)<5&&android.graphics.Color.green(pixel)<5&&android.graphics.Color.blue(pixel)<5);}finally{tail.bitmap().recycle();}
    }finally{main(()->{session.close();return null;});}
  }
  @Test public void segmentedMusicRendersFiniteGapAndSplitVoice()throws Exception{
    Source source=new Source();source.envelope=new NativeFixturePlans(context).segmentedEnvelope();
    NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
    try{assertTrue(main(session::capabilities).getBoolean("segmentedAudio"));for(String profile:new String[]{"preview","export"}){String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,profile));JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));assertEquals(120,result.getInt("totalFrames"));java.nio.file.Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"segmented-"+profile+".mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}}
    finally{main(()->{session.close();return null;});}
  }
  @Test public void splitVoiceMatchesNativeBaseline()throws Exception{
    for(boolean split:new boolean[]{false,true}){Source source=new Source();if(split){JSONObject e=new JSONObject(source.envelope),p=new JSONObject(e.getString("planJson")),v=p.getJSONArray("voices").getJSONObject(0),right=new JSONObject(v.toString());v.put("outUs",1_233_333);right.put("voiceId","right").put("inUs",1_233_333).put("startFrame",37);p.getJSONArray("voices").put(right);p.put("schemaVersion",2);String raw=p.toString();source.envelope=e.put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw)).toString();}
      NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));try{String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));java.nio.file.Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),split?"voice-split.mp4":"voice-baseline.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}finally{main(()->{session.close();return null;});}}
  }
  @Test public void segmentedMusicWrapsSource()throws Exception{
    Source source=new Source();JSONObject e=new JSONObject(new NativeFixturePlans(context).segmentedEnvelope()),p=new JSONObject(e.getString("planJson"));p.getJSONArray("music").getJSONObject(1).put("offsetSamples",60*48000-24000);String raw=p.toString();source.envelope=e.put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw)).toString();
    NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));try{String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));java.nio.file.Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"music-wrap.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}finally{main(()->{session.close();return null;});}
  }
}
