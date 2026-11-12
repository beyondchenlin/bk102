package dsh.copyedit.spike;

import com.deepseekharness.media.*;
import org.junit.Test;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

/** 完整长素材与真实原声；导出字节另在宿主解码检查声音和时长。 */
public class NativeSourceAudioTest extends NativeSessionTest {
    private String read(String name)throws Exception {try(InputStream in=context.getAssets().open("fixtures/"+name);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>600000)throw new IOException("TEST_LIMIT");out.write(b,0,n);}return out.toString("UTF-8");}}
    @Override JSONObject done(NativeMediaSession session,String id)throws Exception {long deadline=System.nanoTime()+240_000_000_000L;while(System.nanoTime()<deadline){JSONObject value=main(()->session.job(id));if(!value.getString("status").equals("running"))return value;Thread.sleep(80);}throw new AssertionError("LONG_RENDER_DEADLINE");}
    @Test public void fullImportAndSourceAudio()throws Exception {
        JSONArray cases=new JSONArray(read("native-source-expectations.json")),receipts=new JSONArray();
        for(int n=0;n<cases.length();n++){
            JSONObject item=cases.getJSONObject(n);String name=item.getString("name");Source source=new Source();source.envelope=read("native-source-"+name+".json");
            NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
            try {JSONArray profiles=item.getJSONArray("profiles");for(int k=0;k<profiles.length();k++){
                String profile=profiles.getString(k),id=UUID.randomUUID().toString();long start=System.nanoTime();main(()->session.start(id,"native-fixture-project",1,profile));
                JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));assertEquals(item.getInt("frames"),result.getInt("totalFrames"));
                String file="native-source-"+name+"-"+profile+".mp4";Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),file).toPath(),StandardCopyOption.REPLACE_EXISTING);
                receipts.put(new JSONObject().put("file",file).put("renderMs",(System.nanoTime()-start)/1_000_000).put("job",result));
                android.util.Log.i("SourceAudioTest","PASS "+file+" "+result);
            }}finally{main(()->{session.close();return null;});}
        }
        Files.write(new File(context.getFilesDir(),"native-source-results.json").toPath(),receipts.toString(2).getBytes(StandardCharsets.UTF_8));
    }
    private interface Check{boolean get()throws Exception;}
    @Test public void stickerPreviewAndExport()throws Exception {
        Source source=new Source();source.envelope=new NativeFixturePlans(context).segmentedEnvelope();NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
        try{for(String profile:new String[]{"preview","export"}){String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,profile));JSONObject result=done(session,id);assertEquals(result.toString(),"complete",result.getString("status"));Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"native-source-sticker-"+profile+".mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);}}
        finally{main(()->{session.close();return null;});}
    }
    private void await(Check condition,int seconds)throws Exception{long end=System.nanoTime()+seconds*1_000_000_000L;while(System.nanoTime()<end){if(condition.get())return;Thread.sleep(40);}throw new AssertionError("PLAYBACK_DEADLINE");}
    @Test public void longPreviewPlaysAudioAndSeeksTail()throws Exception {
        File file=new File(context.getFilesDir(),"native-source-long-preview.mp4");assertTrue(file.exists());
        android.webkit.WebView[] web={null};NativePreview[] player={null};AtomicInteger frames=new AtomicInteger(),dropped=new AtomicInteger(),audio=new AtomicInteger();java.util.List<Long> rendered=java.util.Collections.synchronizedList(new java.util.ArrayList<>());
        foreground.onActivity(a->{web[0]=new android.webkit.WebView(a);a.setContentView(web[0]);});await(()->main(()->web[0].getWidth()>0),10);
        try{
            main(()->player[0]=new NativePreview(web[0],UUID.randomUUID().toString(),file,97.1,new JSONObject().put("viewport",390).put("x",0).put("y",0).put("width",390).put("height",600),e->{},new NativePreview.Observer(){
                public void frame(long pts,long at,boolean running){if(running)frames.incrementAndGet();}public void dropped(int n){dropped.addAndGet(n);}public void audio(long position,long at){audio.incrementAndGet();}public void displayed(long pts,long at,boolean running){if(running)rendered.add(at);}
            }));
            main(()->player[0].seek(0,true));await(()->main(()->player[0].state().getDouble("position")>10),25);assertTrue(frames.get()>240);assertTrue(audio.get()>10);
            JSONObject played=main(()->player[0].pause());Thread.sleep(250);double paused=main(()->player[0].state().getDouble("position"));Thread.sleep(250);assertEquals(paused,main(()->player[0].state().getDouble("position")),.003);
            main(()->player[0].seek(96,true));await(()->main(()->player[0].state().getBoolean("ended")),15);JSONObject end=main(()->player[0].state());assertEquals("",end.getString("error"));assertEquals(97.1,end.getDouble("position"),.04);
            long maxGap=0;int over150=0;synchronized(rendered){for(int i=1;i<rendered.size();i++){long gap=rendered.get(i)-rendered.get(i-1);maxGap=Math.max(maxGap,gap);if(gap>150_000_000L)over150++;}}
            JSONObject receipt=new JSONObject().put("played",played).put("ended",end).put("videoCallbacks",frames.get()).put("audioCallbacks",audio.get()).put("dropped",dropped.get()).put("displayedCallbacks",rendered.size()).put("maxCallbackGapMsIncludingPauseSeek",maxGap/1e6).put("over150msIncludingPauseSeek",over150);
            Files.write(new File(context.getFilesDir(),"native-source-playback.json").toPath(),receipt.toString(2).getBytes(StandardCharsets.UTF_8));
        }finally{main(()->{if(player[0]!=null)player[0].close();web[0].destroy();return null;});}
    }
}
