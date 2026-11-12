package dsh.copyedit.spike;

import com.deepseekharness.media.*;
import org.junit.Test;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;
import static org.junit.Assert.*;

/** 对真实NativeMediaSession输出逐帧验收，宿主另以FFmpeg读回条码与PTS。 */
public class NativeFrameMappingTest extends NativeSessionTest {
    private interface Condition {boolean ready()throws Exception;}
    private void await(Condition condition)throws Exception {
        long until=android.os.SystemClock.elapsedRealtime()+15_000;
        while(android.os.SystemClock.elapsedRealtime()<until){if(condition.ready())return;Thread.sleep(40);}
        throw new AssertionError("NATIVE_PREVIEW_WAIT");
    }
    private String read(String name)throws Exception {
        try(InputStream in=context.getAssets().open("fixtures/"+name);ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>600_000)throw new IOException("FIXTURE_SIZE_LIMIT");out.write(buffer,0,n);}
            return new String(out.toByteArray(),StandardCharsets.UTF_8);
        }
    }
    @Test public void resamplesSourceFrames()throws Exception {
        JSONArray cases=new JSONArray(read("native-mapping-expectations.json"));
        for(int n=0;n<cases.length();n++){
            JSONObject item=cases.getJSONObject(n);String name=item.getString("name");
            Source source=new Source();source.envelope=read("native-mapping-"+name+".json");
            NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
            try {
                JSONArray profiles=item.getJSONArray("profiles");
                for(int k=0;k<profiles.length();k++){
                    String profile=profiles.getString(k),id=UUID.randomUUID().toString();
                    main(()->session.start(id,"native-fixture-project",1,profile));
                    JSONObject job=done(session,id);assertEquals(name+"/"+profile+": "+job,"complete",job.getString("status"));
                    assertEquals(item.getInt("expectedFrames"),job.getInt("totalFrames"));
                    Files.copy(session.result(id).toPath(),new File(context.getFilesDir(),"native-mapping-"+name+"-"+profile+".mp4").toPath(),StandardCopyOption.REPLACE_EXISTING);
                    android.util.Log.i("FrameMappingTest","PASS "+name+"/"+profile+" "+job);
                }
            } finally { main(()->{session.close();return null;}); }
        }
    }
    @Test public void mappedPreviewPlaysSeeksAndPauses()throws Exception {
        Source source=new Source();source.envelope=read("native-mapping-vfr-split.json");
        NativeMediaSession session=main(()->new NativeMediaSession(context,source,true));
        NativePreview[] preview={null};android.webkit.WebView[] web={null};
        try {
            String id=UUID.randomUUID().toString();main(()->session.start(id,"native-fixture-project",1,"preview"));
            JSONObject job=done(session,id);assertEquals(job.toString(),"complete",job.getString("status"));
            foreground.onActivity(a->{web[0]=new android.webkit.WebView(a);a.setContentView(web[0]);});
            await(()->main(()->web[0].getWidth()>0));
            java.util.concurrent.atomic.AtomicInteger frames=new java.util.concurrent.atomic.AtomicInteger();
            main(()->preview[0]=new NativePreview(web[0],UUID.randomUUID().toString(),session.result(id),67/30d,
                    new JSONObject().put("viewport",390).put("x",0).put("y",0).put("width",390).put("height",600),e->{},
                    new NativePreview.Observer(){public void frame(long pts,long release,boolean playing){frames.incrementAndGet();}public void dropped(int n){}}));
            main(()->preview[0].seek(0,true));await(()->main(()->preview[0].state().getDouble("position")>.3));
            main(()->preview[0].pause());await(()->main(()->!preview[0].state().getBoolean("running")));
            // 音频时钟停止通知异步到达；比较停止后的两次稳定读数，不把命令回执当完成回执。
            Thread.sleep(200);JSONObject paused=main(()->preview[0].state());Thread.sleep(200);assertEquals(paused.getDouble("position"),main(()->preview[0].state()).getDouble("position"),.002);
            main(()->preview[0].seek(17/30d,false));await(()->main(()->!preview[0].state().getBoolean("preparing")));
            JSONObject sought=main(()->preview[0].state());assertEquals(17/30d,sought.getDouble("position"),.0011);assertEquals("",sought.getString("error"));
            main(()->preview[0].seek(0,true));await(()->main(()->preview[0].state().getBoolean("ended")));
            JSONObject ended=main(()->preview[0].state());assertEquals("",ended.getString("error"));assertTrue(frames.get()>30);
            JSONObject receipt=new JSONObject().put("passed",true).put("source","vfr-split").put("pause",paused).put("seek",sought).put("ended",ended).put("frameCallbacks",frames.get());
            Files.write(new File(context.getFilesDir(),"native-mapping-playback.json").toPath(),receipt.toString(2).getBytes(StandardCharsets.UTF_8));
        } finally {main(()->{if(preview[0]!=null)preview[0].close();if(web[0]!=null)web[0].destroy();session.close();return null;});}
    }
}
