package dsh.copyedit.spike;

import android.content.Intent;
import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.lifecycle.Lifecycle;
import org.json.*;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class WebStabilityTest extends NativeBridgeTest {
  @Override void waitFor(ActivityScenario<WebProbeActivity> s,String expression,long ms)throws Exception{try{super.waitFor(s,expression,ms);}catch(AssertionError e){throw new AssertionError(e.getMessage()+" page="+eval(s,"({url:location.href,html:document.documentElement.outerHTML.slice(-1200),ready:window.ready,failure:window.failure,media:document.querySelector('video')&&{state:document.querySelector('video').readyState,error:document.querySelector('video').error?.message}})"),e);}}
  ActivityScenario<WebProbeActivity> open(){return ActivityScenario.launch(new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),WebProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("playbackHarness",true));}
  void tapPlay(ActivityScenario<WebProbeActivity> s)throws Exception{
    tapOnly(s);
    waitFor(s,"!!(window.done||window.failure)",15000);assertEquals("null",eval(s,"window.failure"));
  }
  void tapOnly(ActivityScenario<WebProbeActivity> s)throws Exception{
    JSONArray point=new JSONArray(eval(s,"(()=>{const r=document.querySelector('#play').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,devicePixelRatio]})()"));
    s.onActivity(a->{float x=(float)(point.optDouble(0)*point.optDouble(2)),y=(float)(point.optDouble(1)*point.optDouble(2));long time=SystemClock.uptimeMillis();for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){MotionEvent e=MotionEvent.obtain(time,time+20,action,x,y,0);a.web.dispatchTouchEvent(e);e.recycle();}});
  }
  void save(String name,JSONObject receipt)throws Exception{Files.write(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),name).toPath(),receipt.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  void recover(ActivityScenario<WebProbeActivity> s,int expected)throws Exception{
    s.onActivity(a->assertTrue(a.web.getWebViewRenderProcess().terminate()));
    AtomicInteger exits=new AtomicInteger();long deadline=SystemClock.elapsedRealtime()+10000;while(exits.get()<expected&&SystemClock.elapsedRealtime()<deadline){s.onActivity(a->exits.set(a.rendererExits));Thread.sleep(80);}assertEquals(expected,exits.get());
    s.onActivity(a->{assertNull(a.web);assertNull(a.media);assertTrue(a.rendererFailed);((android.widget.Button)((android.view.ViewGroup)a.findViewById(android.R.id.content)).getChildAt(0)).performClick();});
    waitFor(s,"window.ready===true",20000);assertEquals("true",eval(s,"video.paused"));assertEquals("0",eval(s,"playCalls"));
    async(s,"fetch('/stability-proxy.mp4',{cache:'no-store'}).then(r=>r.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join(''))");
    byte[] source=Files.readAllBytes(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"stability-proxy.mp4").toPath());StringBuilder hash=new StringBuilder();for(byte b:java.security.MessageDigest.getInstance("SHA-256").digest(source))hash.append(String.format("%02x",b&255));assertEquals(hash.toString(),new JSONTokener(eval(s,"window.result")).nextValue());
    tapPlay(s);waitFor(s,"video.currentTime>1",5000);
  }
  @Test public void rendererRecovery()throws Exception{
    JSONObject receipt=new JSONObject();try(ActivityScenario<WebProbeActivity> s=open()){
      waitFor(s,"window.ready===true",20000);tapPlay(s);waitFor(s,"video.currentTime>1",5000);
      for(int i=1;i<=3;i++){recover(s,i);receipt.put("recoveries",i);save("web-renderer-recovery.json",receipt);}
    }
  }
  @Test public void activePlaybackTimingDiagnostic()throws Exception{
    try(ActivityScenario<WebProbeActivity> s=open()){
      waitFor(s,"window.ready===true",20000);tapPlay(s);waitFor(s,"report.ended===1",80000);assertEquals("[]",eval(s,"report.errors"));
      JSONObject receipt=new JSONObject(eval(s,"report")).put("diagnosticOnly",true);save("web-active-frame-diagnostic.json",receipt);
    }
  }
  @Test public void strictContinuousPlayback()throws Exception{
    try(ActivityScenario<WebProbeActivity> s=open()){
      waitFor(s,"window.ready===true",20000);
      java.util.concurrent.atomic.AtomicReference<java.util.concurrent.BlockingQueue<String>> events=new java.util.concurrent.atomic.AtomicReference<>();s.onActivity(a->events.set(a.playbackEvents));
      tapOnly(s);
      for(int pass=1;pass<=3;pass++){
        if(pass>1)eval(s,"(start(0),true)");
        // 原生等待单次通知，避免验收探针在播放中每100ms跨线程执行脚本。
        assertEquals("started",events.get().poll(15,java.util.concurrent.TimeUnit.SECONDS));
        assertEquals("ended:"+pass,events.get().poll(80,java.util.concurrent.TimeUnit.SECONDS));
      }
      JSONObject receipt=new JSONObject(eval(s,"report")).put("diagnosticOnly",false).put("requiredFrames",5400).put("maxAllowedGapMs",150);
      save("web-strict-playback.json",receipt);
      assertEquals("[]",receipt.getJSONArray("errors").toString());assertEquals(3,receipt.getInt("ended"));
      assertEquals(0,receipt.getJSONObject("quality").getInt("droppedVideoFrames"));
      JSONArray pts=receipt.getJSONArray("pts");assertEquals(5400,pts.length());
      for(int i=0;i<pts.length();i++)assertTrue("PTS frame "+i,Math.abs(pts.getJSONObject(i).getDouble("time")-(i%1800)/30d)<.000002);
      assertTrue("Active frame gap(ms): "+receipt.getDouble("maxGap"),receipt.getDouble("maxGap")<150);
      for(int i=0;i<3;i++)assertTrue(Math.abs(receipt.getJSONArray("ends").getDouble(i)-60)<1d/30);
    }
  }
  @Test public void continuousPlaybackAndRecovery()throws Exception{
    JSONObject receipt=new JSONObject();
    try(ActivityScenario<WebProbeActivity> s=open()){
      waitFor(s,"window.ready===true",20000);assertTrue(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"stability-proxy.mp4").length()>1000);tapPlay(s);
      for(int pass=1;pass<=3;pass++){
        if(pass>1){eval(s,"(start(0),true)");waitFor(s,"!!(window.done||window.failure)",15000);assertEquals("null",eval(s,"window.failure"));}
        waitFor(s,"report.ended==="+pass,80000);
      }
      JSONObject continuous=new JSONObject(eval(s,"report"));receipt.put("continuous",continuous).put("browserReportedDuration",Double.parseDouble(eval(s,"video.duration")));assertEquals("[]",eval(s,"report.errors"));assertEquals("60",eval(s,"report.position"));assertTrue(continuous.getDouble("maxGap")<2000);for(int i=0;i<3;i++)assertTrue(Math.abs(continuous.getJSONArray("ends").getDouble(i)-60)<1d/30);
      for(double target:new double[]{.033333333,1.966666667,59.5,15,0,37.1}){eval(s,"(start("+target+"),true)");waitFor(s,"!!(window.done||window.failure)",15000);assertEquals("null",eval(s,"window.failure"));eval(s,"(player.pause(),true)");}
      eval(s,"(start(12.5),true)");waitFor(s,"!!(window.done||window.failure)",15000);assertEquals("null",eval(s,"window.failure"));Thread.sleep(500);
      s.moveToState(Lifecycle.State.CREATED);Thread.sleep(400);String calls=eval(s,"playCalls"),pausedAt=eval(s,"video.currentTime");assertEquals("true",eval(s,"video.paused"));
      s.moveToState(Lifecycle.State.RESUMED);Thread.sleep(600);assertEquals(calls,eval(s,"playCalls"));assertEquals(pausedAt,eval(s,"video.currentTime"));receipt.put("backgroundNoReplay",true);
      eval(s,"(start(video.currentTime),true)");waitFor(s,"!!(window.done||window.failure)",15000);assertEquals("null",eval(s,"window.failure"));
      save("web-continuous.json",receipt);
      // 强制终止当前测试页渲染进程：宿主保留，旧桥关闭，必须由用户重开。
      recover(s,1);receipt.put("rendererRecoveryNoReplay",true);
    }
    File file=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"web-stability.json");Files.write(file.toPath(),receipt.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }
}
