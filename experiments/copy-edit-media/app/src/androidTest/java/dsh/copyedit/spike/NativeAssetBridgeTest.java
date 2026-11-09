package dsh.copyedit.spike;
import android.content.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import static org.junit.Assert.*;

/** 原生素材路径：Host只保存上传字节，Android索引和解码，HTTP逐帧FFmpeg端点不参与。 */
public class NativeAssetBridgeTest {
  private JSONObject host(NativeBridgeTest probe,ActivityScenario<WebProbeActivity> scenario,String method,JSONObject args)throws Exception{
    JSONObject request=new JSONObject().put("type","client-request").put("rpcId",java.util.UUID.randomUUID().toString()).put("method","copyEdit/"+method).put("payload",new JSONObject().put("args",args));
    probe.async(scenario,"fetch('/api/copyEdit/"+method+"',{method:'POST',headers:{'Content-Type':'application/json'},body:"+JSONObject.quote(request.toString())+"}).then(r=>r.json()).then(b=>{if(!b.result.ok)throw Error('HOST_REQUEST_FAILED');return b.result.value;})");return new JSONObject(probe.eval(scenario,"window.result"));
  }
  @Test public void importAndExactFramesWithoutDesktopDecoder()throws Exception{
    Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();JSONObject input=new JSONObject(new String(Files.readAllBytes(new File(context.getCacheDir(),"native-import-input.json").toPath()),StandardCharsets.UTF_8));NativeBridgeTest probe=new NativeBridgeTest();JSONObject receipt=new JSONObject();
    try(ActivityScenario<WebProbeActivity> s=ActivityScenario.launch(new Intent(context,WebProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("bridgeHarness",true))){
      probe.waitFor(s,"window.ready===true",20000);probe.async(s,"client.capabilities()");JSONObject caps=new JSONObject(probe.eval(s,"window.result"));assertTrue(caps.getBoolean("assetImport"));assertTrue(caps.getBoolean("exactFrames"));
      probe.async(s,"client.call('import',{importId:"+JSONObject.quote(input.getString("assetId"))+"})");JSONObject asset=new JSONObject(probe.eval(s,"window.result"));assertEquals("android-mediaextractor",asset.getString("indexSource"));assertEquals("video",asset.getString("kind"));assertEquals(input.getString("sha256"),asset.getString("sha256"));assertTrue(asset.getJSONArray("ptsUs").length()>77);receipt.put("asset",asset);
      JSONArray frames=new JSONArray();for(int n:new int[]{17,18,19,18,17,76,75,76}){
        probe.async(s,"client.call('frame',{assetId:"+JSONObject.quote(asset.getString("assetId"))+",frame:"+n+"})");JSONObject frame=new JSONObject(probe.eval(s,"window.result"));assertEquals(asset.getJSONArray("ptsUs").getLong(n),frame.getLong("ptsUs"));
        String url=frame.getString("url");probe.async(s,"fetch("+JSONObject.quote(url)+").then(async r=>{var bytes=new Uint8Array(await r.arrayBuffer());var image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));var c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);var code=0;for(var i=0;i<8;i++){if(c.getContext('2d').getImageData(Math.floor((40+i*24)*image.width/"+asset.getInt("width")+"),Math.floor(48*image.height/"+asset.getInt("height")+"),1,1).data[0]>180)code|=1<<i;}return {status:r.status,width:image.width,height:image.height,signature:Array.from(bytes.slice(0,8)),barcode:code};})");JSONObject png=new JSONObject(probe.eval(s,"window.result"));assertEquals(200,png.getInt("status"));assertEquals(360,png.getInt("width"));assertEquals(n,png.getInt("barcode"));frames.put(new JSONObject().put("requested",n).put("frame",frame).put("png",png));
      }receipt.put("frames",frames);receipt.put("decoder","Android MediaExtractor/MediaCodec; no FFmpeg frame endpoint");
      JSONObject created=host(probe,s,"create",new JSONObject().put("request",new JSONObject().put("operationId","native-import-mobile-project-20261109").put("title","手机素材闭环·20261109")));
      JSONObject workspace=host(probe,s,"workspace",new JSONObject()),project=null;JSONArray projects=workspace.getJSONArray("projects");for(int i=0;i<projects.length();i++)if(projects.getJSONObject(i).getString("projectId").equals(created.getString("projectId")))project=projects.getJSONObject(i);assertNotNull(project);
      if(project.getJSONArray("clips").length()==0)project=host(probe,s,"mutate",new JSONObject().put("request",new JSONObject().put("projectId",project.getString("projectId")).put("expectedRevision",project.getLong("revision")).put("operationId",java.util.UUID.randomUUID().toString()).put("command",new JSONObject().put("type","addClip").put("assetId",asset.getString("assetId")))));
      assertEquals(1,project.getJSONArray("clips").length());assertEquals(asset.getString("assetId"),project.getJSONArray("clips").getJSONObject(0).getString("assetId"));
      JSONObject render=new JSONObject().put("projectId",project.getString("projectId")).put("revision",project.getLong("revision")).put("profile","export");probe.async(s,"startNativeRender(client,"+render+",v=>window.job=v,nextId)");String id=new JSONObject(probe.eval(s,"window.result")).getString("jobId");JSONObject job=null;long end=android.os.SystemClock.elapsedRealtime()+120000;
      while(android.os.SystemClock.elapsedRealtime()<end){probe.async(s,"client.call('job',{jobId:"+JSONObject.quote(id)+"})");job=new JSONObject(probe.eval(s,"window.result"));if(!job.getString("status").equals("running"))break;Thread.sleep(150);}assertEquals(job.toString(),"complete",job.getString("status"));assertTrue(job.getBoolean("androidLocal"));receipt.put("importedProjectExport",job);
      probe.async(s,"client.call('release')");
    }
    Files.write(new File(context.getFilesDir(),"native-import-receipt.json").toPath(),receipt.toString(2).getBytes(StandardCharsets.UTF_8));
  }
}
