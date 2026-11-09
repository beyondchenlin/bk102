package dsh.copyedit.spike;

import android.content.*;
import android.os.SystemClock;
import android.view.KeyEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** 真实WebView主帧 -> 插件客户端 -> 共享桥 -> 当前DSH RPC -> Android编码/Range/分享。 */
public class NativeBridgeTest {
  String eval(ActivityScenario<WebProbeActivity> scenario,String expression)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();scenario.onActivity(a->a.web.evaluateJavascript("JSON.stringify("+expression+")",r->{value.set(r);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));Object result=new JSONTokener(value.get()).nextValue();return result==JSONObject.NULL?"null":result.toString();}
  void waitFor(ActivityScenario<WebProbeActivity> scenario,String expression,long milliseconds)throws Exception{long end=SystemClock.elapsedRealtime()+milliseconds;while(SystemClock.elapsedRealtime()<end){if("true".equals(eval(scenario,expression)))return;Thread.sleep(100);}AtomicReference<String> error=new AtomicReference<>();scenario.onActivity(a->error.set(a.lastConsoleError));throw new AssertionError("BRIDGE_WAIT "+expression+" console="+error.get()+" state="+eval(scenario,"({error:window.error,job:window.job,caps:window.caps})"));}
  void async(ActivityScenario<WebProbeActivity> s,String expression)throws Exception{eval(s,"(()=>{window.result=null;window.error=null;("+expression+").then(v=>window.result=v).catch(e=>window.error=e.message);return true})()");waitFor(s,"window.result!==null||window.error!==null",15000);assertEquals("null",eval(s,"window.error"));}
  void verifyRangeBytes(ActivityScenario<WebProbeActivity> s,String url)throws Exception{
    async(s,"fetch("+JSONObject.quote(url)+",{cache:'no-store'}).then(r=>r.arrayBuffer()).then(b=>{window.rangeBytes=new Uint8Array(b);return b.byteLength})");
    int length=Integer.parseInt(eval(s,"window.result")),middle=length/2;assertTrue(length>1024);
    for(String header:new String[]{"bytes=0-31","bytes="+middle+"-"+(middle+511),"bytes="+(length-32)+"-","bytes=-32"}){
      int start=header.equals("bytes=0-31")?0:header.startsWith("bytes="+middle+"-")?middle:length-32,count=start==middle?512:32;
      async(s,"fetch("+JSONObject.quote(url)+",{headers:{Range:"+JSONObject.quote(header)+"},cache:'no-store'}).then(async r=>{const b=new Uint8Array(await r.arrayBuffer());return {status:r.status,match:b.length==="+count+"&&b.every((v,i)=>v===rangeBytes["+start+"+i])}})");
      JSONObject result=new JSONObject(eval(s,"window.result"));assertEquals(header,206,result.getInt("status"));assertTrue(header,result.getBoolean("match"));
    }
    async(s,"fetch("+JSONObject.quote(url)+",{method:'HEAD'}).then(async r=>({status:r.status,size:(await r.arrayBuffer()).byteLength}))");JSONObject head=new JSONObject(eval(s,"window.result"));assertEquals(200,head.getInt("status"));assertEquals(0,head.getInt("size"));
    eval(s,"(delete window.rangeBytes,true)");
  }
  @Test public void nativeRpcRangeSharingRetirementAndBackground()throws Exception{
    Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();JSONObject project=new JSONObject(new String(Files.readAllBytes(new File(context.getCacheDir(),"native-bridge-project.json").toPath()),StandardCharsets.UTF_8));
    Intent intent=new Intent(context,WebProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("bridgeHarness",true);JSONObject receipt=new JSONObject().put("projectId",project.getString("projectId")).put("revision",project.getLong("revision"));
    try(ActivityScenario<WebProbeActivity> s=ActivityScenario.launch(intent)){
      waitFor(s,"window.ready===true",20000);async(s,"client.capabilities()");JSONObject caps=new JSONObject(eval(s,"window.result"));assertTrue(caps.getBoolean("available"));assertFalse(caps.getBoolean("deviceVerified"));receipt.put("capabilities",caps);
      String request=new JSONObject().put("projectId",project.getString("projectId")).put("revision",project.getLong("revision")).put("profile","export").toString();
      async(s,"startNativeRender(client,"+request+",v=>window.job=v,nextId)");eval(s,"(()=>{window.job=window.result;return true})()");String id=new JSONObject(eval(s,"window.job")).getString("jobId");
      long deadline=SystemClock.elapsedRealtime()+120000;JSONObject job=null;
      while(SystemClock.elapsedRealtime()<deadline){async(s,"client.call('job',{jobId:"+JSONObject.quote(id)+"})");job=new JSONObject(eval(s,"window.result"));if(!job.getString("status").equals("running"))break;Thread.sleep(150);}
      assertEquals(job.toString(),"complete",job.getString("status"));receipt.put("complete",job);
      String url=job.getString("url");async(s,"fetch("+JSONObject.quote(url)+",{headers:{Range:'bytes=0-31'}}).then(async r=>({status:r.status,range:r.headers.get('Content-Range'),length:(await r.arrayBuffer()).byteLength}))");JSONObject range=new JSONObject(eval(s,"window.result"));assertEquals(206,range.getInt("status"));assertEquals(32,range.getInt("length"));receipt.put("range",range);
      verifyRangeBytes(s,url);receipt.put("rangeByteIntegrity",true);
      async(s,"fetch("+JSONObject.quote(url)+",{headers:{Range:'bytes=0-1,9-10'}}).then(r=>({status:r.status}))");assertEquals(416,new JSONObject(eval(s,"window.result")).getInt("status"));
      async(s,"client.call('share',{jobId:"+JSONObject.quote(id)+"})");JSONObject share=new JSONObject(eval(s,"window.result"));assertTrue(share.getBoolean("accepted"));assertFalse(share.has("opened"));
      long shareEnd=SystemClock.elapsedRealtime()+10000;JSONObject state=null;while(SystemClock.elapsedRealtime()<shareEnd){async(s,"client.call('shareStatus',{jobId:"+JSONObject.quote(id)+"})");state=new JSONObject(eval(s,"window.result"));if(!state.getString("status").equals("pending"))break;Thread.sleep(100);}assertEquals(state.toString(),"opened",state.getString("status"));receipt.put("share",state);
      // 系统分享窗口属于系统应用，用测试UiAutomation的shell通道返回；不增加应用权限。
      try(java.io.InputStream command=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("input keyevent 4"))){while(command.read()!=-1){}}
      // 同源子帧也无任务权限：消息无应答，不通过主帧校验。
      eval(s,"(()=>{window.childReplied=false;var f=document.createElement('iframe');f.srcdoc='<script>if(window.DshaCopyEdit){DshaCopyEdit.onmessage=function(){parent.childReplied=true};DshaCopyEdit.postMessage(JSON.stringify({id:\"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\",action:\"capabilities\"}))}<\\/script>';document.body.appendChild(f);return true})()");Thread.sleep(400);assertEquals("false",eval(s,"window.childReplied"));receipt.put("iframeDenied",true);
      // 后台入口拒绝新任务；恢复后不自动重放。
      s.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);eval(s,"(()=>{window.background=null;client.call('start',"+request+").then(()=>window.background='unexpected').catch(e=>window.background=e.message);return true})()");
      waitFor(s,"window.background!==null",10000);assertEquals("true",eval(s,"window.background==='MEDIA_BACKGROUND'"));s.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);receipt.put("backgroundRejected",true);
      s.recreate();waitFor(s,"window.ready===true",20000);async(s,"client.call('job',{jobId:"+JSONObject.quote(id)+"})");assertEquals("retired",new JSONObject(eval(s,"window.result")).getString("status"));receipt.put("retiredAfterNewWebView",true);async(s,"client.call('release')");
      async(s,"fetch("+JSONObject.quote(url)+").then(r=>({status:r.status}))");assertEquals(404,new JSONObject(eval(s,"window.result")).getInt("status"));receipt.put("releasedResult404",true);
    }
    Files.write(new File(context.getFilesDir(),"native-bridge-receipt.json").toPath(),receipt.toString(2).getBytes(StandardCharsets.UTF_8));
  }
}
