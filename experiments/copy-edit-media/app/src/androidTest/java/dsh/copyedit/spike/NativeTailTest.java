package dsh.copyedit.spike;

import com.deepseekharness.media.*;
import org.json.*;
import org.junit.Test;
import java.io.File;
import java.util.UUID;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import static org.junit.Assert.*;

/** 对实际编码产物解码验收；文件仅留在独立测试应用，宿主脚本读回样本数和末尾波形。 */
public class NativeTailTest extends NativeSessionTest {
  @Test public void inspectEncodedTail()throws Exception{
    android.media.MediaExtractor e=new android.media.MediaExtractor();try{e.setDataSource(new File(context.getFilesDir(),"tail-bgm.mp4").toString());for(int i=0;i<e.getTrackCount();i++){android.media.MediaFormat f=e.getTrackFormat(i);android.util.Log.i("TailFormat",f.toString());if(f.getString("mime").startsWith("audio/")){e.selectTrack(i);long first=e.getSampleTime(),last=first;int count=0;while(e.getSampleTrackIndex()>=0){last=e.getSampleTime();count++;e.advance();}android.util.Log.i("TailFormat","first="+first+" last="+last+" count="+count);e.unselectTrack(i);}}}finally{e.release();}
  }
  @Test public void longProxy()throws Exception{
    Source source=new Source();source.envelope=new NativeFixturePlans(context).envelope(true,false);NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
    try{String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject job=done(session,id);assertEquals(job.toString(),"complete",job.getString("status"));Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"stability-proxy.mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);}
    finally{main(()->{session.close();return null;});}
  }
  @Test public void tailMatrix()throws Exception{
    for(String kind:new String[]{"voice","bgm","mixed","finite"}){
      Source source=new Source();JSONObject e=new JSONObject(source.envelope),p=new JSONObject(e.getString("planJson"));
      if(kind.equals("voice"))p.getJSONObject("audio").put("bgm",JSONObject.NULL);
      if(kind.equals("bgm")||kind.equals("finite"))p.put("voices",new JSONArray());
      if(kind.equals("finite")){JSONObject m=p.getJSONObject("audio").getJSONObject("bgm");p.put("schemaVersion",2).put("music",new JSONArray().put(new JSONObject(m.toString()).put("musicId","finite").put("startFrame",0).put("endFrame",120).put("offsetSamples",0)));p.getJSONObject("audio").put("bgm",JSONObject.NULL);}
      JSONArray refs=p.getJSONArray("assets");for(int i=refs.length()-1;i>=0;i--){String asset=refs.getJSONObject(i).getString("assetId");if((kind.equals("voice")&&asset.equals("bgm.wav"))||((kind.equals("bgm")||kind.equals("finite"))&&asset.equals("voice.wav")))refs.remove(i);}
      String raw=p.toString();source.envelope=e.put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw)).toString();
      NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
      try{String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,"preview"));JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"tail-"+kind+".mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);}
      finally{main(()->{session.close();return null;});}
    }
  }
}
