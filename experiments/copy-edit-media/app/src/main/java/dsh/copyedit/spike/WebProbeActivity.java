package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.view.WindowManager;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** 仅独立验收包使用：访问已有隔离工作台，或验证共享媒体桥的最小页面。 */
public final class WebProbeActivity extends Activity {
    String ORIGIN="http://127.0.0.1:61328";
    WebView web;
    String lastConsoleError="";
    NativeWebMediaBridge.Handle media;
    int rendererExits;
    boolean rendererFailed;
    final java.util.concurrent.BlockingQueue<String> playbackEvents=new java.util.concurrent.LinkedBlockingQueue<>(16);
    final org.json.JSONArray nativeFrames=new org.json.JSONArray(),nativeDisplayed=new org.json.JSONArray(),nativeAudio=new org.json.JSONArray();int nativeDropped;long lastAudioNs;
    private final java.util.Set<java.io.InputStream> fixtureReaders=java.util.concurrent.ConcurrentHashMap.newKeySet();
    private volatile int fixtureEpoch;
    private void closeFixtures(){fixtureEpoch++;for(java.io.InputStream reader:fixtureReaders)try{reader.close();}catch(java.io.IOException ignored){}}
    private Runnable unregisterBack=()->{};
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if(getIntent().getBooleanExtra("nativeHarness",false))ORIGIN="http://127.0.0.1:61329";
        if(android.os.Build.VERSION.SDK_INT>=33)unregisterBack=Api33.register(this);
        createWeb();
        authenticate();
    }
    private void createWeb(){
        rendererFailed=false;
        web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMediaPlaybackRequiresUserGesture(true);web.getSettings().setTextZoom(Math.round(getResources().getConfiguration().fontScale*100));
        if(getIntent().getBooleanExtra("playbackHarness",false)||getIntent().getBooleanExtra("nativeHarness",false)){
            playbackEvents.clear();
            androidx.webkit.WebViewCompat.addWebMessageListener(web,"PlaybackProbe",java.util.Set.of(ORIGIN),(view,message,origin,main,reply)->{
                if(view==web&&main&&ORIGIN.equals(origin.toString())){String value=message.getData();if(value!=null&&value.matches("started|failed|ended:[1-3]"))playbackEvents.offer(value);}
            });
        }
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onConsoleMessage(ConsoleMessage m){if(m.messageLevel()==ConsoleMessage.MessageLevel.ERROR)lastConsoleError=android.net.Uri.parse(m.sourceId()).getPath()+":"+m.lineNumber()+" "+m.message().substring(0,Math.min(m.message().length(),500));return true;}});
        media=NativeWebMediaBridge.attach(web,ORIGIN,()->!isFinishing()&&!isDestroyed(),true,getIntent().getBooleanExtra("nativeHarness",false)?new NativePreview.Observer(){
            public void frame(long pts,long release,boolean playing){synchronized(nativeFrames){if(nativeFrames.length()>=6000)throw new IllegalStateException("FRAME_EVIDENCE_LIMIT");try{nativeFrames.put(new JSONObject().put("ptsUs",pts).put("releaseNs",release).put("submittedNs",System.nanoTime()).put("playing",playing));}catch(Exception e){throw new IllegalStateException(e);}}}
            public void dropped(int count){nativeDropped+=count;}
            public void audio(long position,long at){synchronized(nativeAudio){if(at-lastAudioNs<10_000_000||nativeAudio.length()>=20000)return;lastAudioNs=at;try{nativeAudio.put(new JSONObject().put("positionUs",position).put("atNs",at));}catch(Exception e){throw new IllegalStateException(e);}}}
            public void displayed(long timestamp,long callback,boolean playing){try{if(nativeDisplayed.length()>=6000)throw new IllegalStateException("DISPLAY_EVIDENCE_LIMIT");nativeDisplayed.put(new JSONObject().put("ptsUs",timestamp).put("renderNs",callback).put("playing",playing));}catch(Exception e){throw new IllegalStateException(e);}}
        }:null);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !local(request.getUrl().toString());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                // 仅允许原生验收入口自己加载的内联主文档；普通工作台仍仅访问回环来源。
                if(request.isForMainFrame()&&"data".equals(request.getUrl().getScheme())&&(getIntent().getBooleanExtra("playbackHarness",false)||getIntent().getBooleanExtra("bridgeHarness",false)||getIntent().getBooleanExtra("nativeHarness",false)))return null;
                if(getIntent().getBooleanExtra("playbackHarness",false)&&local(request.getUrl().toString())&&"/stability-proxy.mp4".equals(request.getUrl().getPath()))return fixtureVideo(request);
                WebResourceResponse response=media==null?null:media.intercept(request);return response!=null?response:local(request.getUrl().toString())?null:new WebResourceResponse("text/plain","UTF-8",403,"Local test only",java.util.Map.of(),new java.io.ByteArrayInputStream(new byte[0]));}
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(media!=null)media.reset();}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){
                if(view==web){rendererExits++;rendererFailed=true;closeFixtures();if(media!=null){media.close();media=null;}web=null;
                    android.widget.Button retry=new android.widget.Button(WebProbeActivity.this);retry.setText("重新打开");retry.setOnClickListener(v->{createWeb();load();});setContentView(retry);view.destroy();}
                return true;
            }
        });setContentView(web);
    }
    private void authenticate(){
        if(getIntent().getBooleanExtra("nativeHarness",false)){load();return;}
        try{
            File auth=new File(getCacheDir(),"web-probe-auth.json");
            if(auth.isFile()){
                if(auth.length()>4096)throw new IllegalArgumentException("AUTH_SIZE_LIMIT");JSONObject value=new JSONObject(new String(Files.readAllBytes(auth.toPath()),StandardCharsets.UTF_8));
                if(!ORIGIN.equals(value.getString("origin")))throw new IllegalArgumentException("TEST_ORIGIN_MISMATCH");
                WebView target=web;CookieManager.getInstance().setCookie(ORIGIN,value.getString("cookie"),ok->{if(web!=target||isDestroyed())return;if(ok){CookieManager.getInstance().flush();load();}else lastConsoleError="AUTH_COOKIE_REJECTED";});
            }else load();
        }catch(Exception error){lastConsoleError=error.getClass().getSimpleName();}
    }
    private void load(){
        if(getIntent().getBooleanExtra("nativeHarness",false)){try{int seconds=getIntent().getIntExtra("seconds",4);if(seconds!=4&&seconds!=60)throw new IllegalArgumentException();web.loadDataWithBaseURL(ORIGIN+"/",new String(Files.readAllBytes(new File(getCacheDir(),"native-preview-harness.html").toPath()),StandardCharsets.UTF_8).replace("__SECONDS__",Integer.toString(seconds)),"text/html","UTF-8",ORIGIN+"/");}catch(Exception e){lastConsoleError="NATIVE_PREVIEW_HARNESS_FAILED";}return;}
        if(getIntent().getBooleanExtra("playbackHarness",false)){try{web.loadDataWithBaseURL(ORIGIN+"/",new String(Files.readAllBytes(new File(getCacheDir(),"playback-harness.html").toPath()),StandardCharsets.UTF_8),"text/html","UTF-8",ORIGIN+"/");}catch(Exception e){lastConsoleError="PLAYBACK_HARNESS_FAILED";}return;}
        if(!getIntent().getBooleanExtra("bridgeHarness",false)){web.loadUrl(ORIGIN+"/");return;}try{String client=new String(Files.readAllBytes(new File(getCacheDir(),"native-client.js").toPath()),StandardCharsets.UTF_8);web.loadDataWithBaseURL(ORIGIN+"/","<!doctype html><meta name=viewport content='width=device-width'><title>原生媒体桥验收</title><p>独立自制工程桥验收</p><script>"+client+"\nvar serial=0;var nextId=()=> (++serial).toString(16).padStart(32,'0');var client=createNativeMediaClient(window.DshaCopyEdit,{newId:nextId});window.ready=true;</script>","text/html","UTF-8",ORIGIN+"/");}catch(Exception error){lastConsoleError="HARNESS_LOAD_FAILED";}}
    private WebResourceResponse fixtureVideo(WebResourceRequest request){
        try{File file=new File(getFilesDir(),"stability-proxy.mp4");String header=null;for(var entry:request.getRequestHeaders().entrySet())if(entry.getKey().equalsIgnoreCase("Range"))header=entry.getValue();NativeResultRange range=NativeResultRange.parse(header,file.length());
            int expected=fixtureEpoch;java.io.InputStream stream=new WebViewRangeStream(file,range,()->expected==fixtureEpoch,fixtureReaders::remove);fixtureReaders.add(stream);
            if(expected!=fixtureEpoch){stream.close();throw new java.io.IOException("RETIRED_FIXTURE");}
            java.util.Map<String,String> headers=new java.util.HashMap<>();headers.put("Cache-Control","private, no-store");headers.put("Content-Length",Long.toString(range.length()));headers.put("Accept-Ranges","bytes");if(range.partial())headers.put("Content-Range","bytes "+range.start()+"-"+(range.start()+range.length()-1)+"/"+file.length());return new WebResourceResponse("video/mp4",null,range.partial()?206:200,range.partial()?"Partial Content":"OK",headers,stream);
        }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",java.util.Map.of(),new java.io.ByteArrayInputStream(new byte[0]));}
    }
    private boolean local(String url){return url.equals(ORIGIN)||url.startsWith(ORIGIN+"/");}
    private void back(){if(web!=null&&web.canGoBack())web.goBack();else finish();}
    // API30–32沿用旧回调；API33+在上方注册系统预测返回，二者共用同一层级。
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed(){back();}
    @androidx.annotation.RequiresApi(33)
    private static final class Api33 {
        static Runnable register(WebProbeActivity a){android.window.OnBackInvokedCallback callback=a::back;a.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,callback);return ()->a.getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(callback);}
    }
    @Override protected void onStop(){if(media!=null)media.suspend();super.onStop();}
    @Override protected void onStart(){super.onStart();if(media!=null)media.resume();}
    @Override protected void onDestroy(){unregisterBack.run();closeFixtures();if(media!=null)media.close();if(web!=null)web.destroy();super.onDestroy();}
}
