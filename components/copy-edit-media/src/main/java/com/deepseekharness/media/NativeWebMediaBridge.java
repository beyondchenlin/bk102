package com.deepseekharness.media;

import android.content.*;
import android.net.Uri;
import android.webkit.*;
import androidx.webkit.*;
import com.deepseekharness.media.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;

/** 可选、默认关闭的媒体协作者；不参与DSH启动/安装/备份编排。 */
public final class NativeWebMediaBridge {
  public interface Handle extends AutoCloseable {WebResourceResponse intercept(WebResourceRequest request);void suspend();void resume();void reset();@Override void close();}
  private NativeWebMediaBridge() {}
  public static Handle attach(WebView view,String base,BooleanSupplier current,boolean enabled){
    return attach(view,base,current,enabled,null);
  }
  public static Handle attach(WebView view,String base,BooleanSupplier current,boolean enabled,NativePreview.Observer observer){
    if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return null;
    try{return new Bridge(view,base,current,enabled,observer);}catch(Exception ignored){return null;}
  }
  private static final class Bridge implements Handle {
    final WebView view;final String base,origin;final BooleanSupplier current;final boolean enabled;final NativeHttpSource source;
    final AtomicBoolean closed=new AtomicBoolean();volatile NativeMediaSession session;volatile long epoch;boolean sharing;
    final Map<String,JSONObject> shares=new HashMap<>();boolean foreground=true;
    final Set<InputStream> readers=java.util.concurrent.ConcurrentHashMap.newKeySet();
    NativePreview preview;final NativePreview.Observer observer;
    Bridge(WebView view,String base,BooleanSupplier current,boolean enabled,NativePreview.Observer observer)throws Exception{
      this.observer=observer;
      this.view=view;this.base=base;this.origin=base.endsWith("/")?base.substring(0,base.length()-1):base;this.current=current;this.enabled=enabled;source=new NativeHttpSource(base);
      WebViewCompat.removeWebMessageListener(view,"DshaCopyEdit");
      WebViewCompat.addWebMessageListener(view,"DshaCopyEdit",Collections.singleton(origin),(web,message,from,mainFrame,reply)->{
        if(closed.get()||!mainFrame||web!=view||!current.getAsBoolean()||!sameOrigin(from.toString())||!sameOrigin(view.getUrl()))return;
        String id="";
        try{
          String text=message.getData();if(text==null||text.length()>4096)throw new IllegalArgumentException("MEDIA_REQUEST_SIZE");JSONObject request=new JSONObject(text);id=request.getString("id");if(!id.matches("[-a-fA-F0-9]{32,36}"))throw new IllegalArgumentException("MEDIA_REQUEST_ID");
          String action=request.getString("action");JSONObject args=request.optJSONObject("args");if(args==null)args=new JSONObject();JSONObject value;
          NativeMediaSession local=session;if(local==null){local=new NativeMediaSession(view.getContext(),source,enabled);session=local;}
          if(action.equals("import")||action.equals("frame")){
            if(!foreground)throw new IllegalStateException("MEDIA_BACKGROUND");String responseId=id;long expected=epoch;
            local.assetTask(action,args.getString(action.equals("import")?"importId":"assetId"),args.optInt("frame",0)).whenComplete((result,error)->view.post(()->{if(closed.get()||epoch!=expected||!current.getAsBoolean())return;try{JSONObject response=new JSONObject().put("id",responseId).put("ok",error==null);if(error==null)response.put("value",result);else response.put("error",error instanceof IllegalArgumentException||error instanceof IllegalStateException?String.valueOf(error.getMessage()):"原生素材读取失败或任务已退出");reply.postMessage(response.toString());}catch(Exception ignored){}}));return;
          }
          switch(action){
            case "capabilities":value=local.capabilities().put("nativePreview",true);if(!foreground)value.put("available",false);break;
            case "previewOpen":{
              if(!foreground)throw new IllegalStateException("MEDIA_BACKGROUND");
              String jobId=args.getString("jobId"),playbackId=args.getString("playbackId");File file=local.previewResult(jobId);if(file==null)throw new IllegalArgumentException("PREVIEW_RESULT_UNAVAILABLE");
              if(preview!=null)preview.close();preview=null;long expected=epoch;
              preview=new NativePreview(view,playbackId,file,local.previewDuration(jobId),args.getJSONObject("bounds"),state->{if(closed.get()||epoch!=expected||!current.getAsBoolean())return;try{reply.postMessage(new JSONObject().put("event","preview").put("value",state).toString());}catch(Exception ignored){}},observer);
              value=preview.state();break;
            }
            case "preview":{
              if(preview==null||!preview.id().equals(args.getString("playbackId")))throw new IllegalArgumentException("PREVIEW_RETIRED");
              switch(args.getString("command")){
                case "seek":if(!foreground)throw new IllegalStateException("MEDIA_BACKGROUND");value=preview.seek(args.getDouble("position"),args.optBoolean("resume",false));break;
                case "pause":value=preview.pause();break;
                case "layout":value=preview.layout(args.getJSONObject("bounds"));break;
                case "close":preview.close();value=preview.state();preview=null;break;
                case "state":value=preview.state();break;
                default:throw new IllegalArgumentException("PREVIEW_COMMAND");
              }break;
            }
            case "start":if(!foreground)throw new IllegalStateException("MEDIA_BACKGROUND");value=local.start(id,args.getString("projectId"),args.getLong("revision"),args.getString("profile"));break;
            case "job":value=local.job(args.getString("jobId"));break;
            case "cancel":value=local.cancel(args.getString("jobId"));break;
            case "share":if(!foreground)throw new IllegalStateException("MEDIA_BACKGROUND");share(local,args.getString("jobId"));value=new JSONObject().put("accepted",true).put("status","pending");break;
            case "shareStatus":value=shares.getOrDefault(args.getString("jobId"),new JSONObject().put("status","retired"));break;
            case "release":reset();value=new JSONObject().put("released",true);break;
            default:throw new IllegalArgumentException("MEDIA_ACTION");
          }
          reply.postMessage(new JSONObject().put("id",id).put("ok",true).put("value",value).toString());
        }catch(Exception error){try{reply.postMessage(new JSONObject().put("id",id).put("ok",false).put("error",error instanceof IllegalArgumentException||error instanceof IllegalStateException?String.valueOf(error.getMessage()):"NATIVE_MEDIA_FAILED").toString());}catch(Exception ignored){}}
      });
    }
    @Override public WebResourceResponse intercept(WebResourceRequest request){
      String path=request.getUrl().getPath();if(path==null||!path.startsWith("/__dsha_copy_edit__/"))return null;
      if(closed.get()||!sameOrigin(request.getUrl().toString())||!Set.of("GET","HEAD").contains(request.getMethod())||!path.matches("/__dsha_copy_edit__/[-a-fA-F0-9]{32,36}/(result\\.mp4|frame\\.png)"))return empty(403,"Forbidden");
      long requestEpoch=epoch;
      boolean png=path.endsWith("/frame.png");NativeMediaSession local=session;File file=local==null?null:png?local.image(path.split("/")[2]):local.result(path.split("/")[2]);if(file==null)return empty(404,"Not Found");
      try{
        if(!Files.isRegularFile(file.toPath(),LinkOption.NOFOLLOW_LINKS))return empty(404,"Not Found");long size=file.length();String rangeHeader=null;for(var header:request.getRequestHeaders().entrySet())if(header.getKey().equalsIgnoreCase("Range"))rangeHeader=header.getValue();
        NativeResultRange range=NativeResultRange.parse(rangeHeader,size);Map<String,String> headers=new HashMap<>();headers.put("Accept-Ranges","bytes");headers.put("Content-Length",String.valueOf(range.length()));headers.put("Cache-Control","private, no-store");if(range.partial())headers.put("Content-Range","bytes "+range.start()+"-"+(range.start()+range.length()-1)+"/"+size);
        InputStream body=new ByteArrayInputStream(new byte[0]);
        if(!request.getMethod().equals("HEAD")){
          body=new WebViewRangeStream(file,range,()->!closed.get()&&epoch==requestEpoch,readers::remove);readers.add(body);
          if(closed.get()||epoch!=requestEpoch){body.close();return empty(404,"Not Found");}
        }
        return new WebResourceResponse(png?"image/png":"video/mp4",null,range.partial()?206:200,range.partial()?"Partial Content":"OK",headers,body);
      }catch(IllegalArgumentException error){return empty(416,"Range Not Satisfiable");}catch(IOException error){return empty(404,"Not Found");}
    }
    private WebResourceResponse empty(int code,String reason){return new WebResourceResponse("text/plain","UTF-8",code,reason,Map.of("Cache-Control","no-store"),new ByteArrayInputStream(new byte[0]));}
    private boolean sameOrigin(String url){try{java.net.URI expected=new java.net.URI(origin),actual=new java.net.URI(url);return actual.getRawUserInfo()==null&&Objects.equals(expected.getScheme(),actual.getScheme())&&Objects.equals(expected.getHost(),actual.getHost())&&expected.getPort()==actual.getPort();}catch(Exception error){return false;}}
    private void share(NativeMediaSession local,String id)throws Exception{
      File sourceFile=local.result(id);if(sourceFile==null)throw new IllegalArgumentException("MEDIA_RESULT_UNAVAILABLE");if(sharing)throw new IllegalStateException("SHARE_PENDING");sharing=true;long expected=epoch;shareState(id,"pending",null);
      Context app=view.getContext().getApplicationContext();File root=new File(app.getCacheDir().getCanonicalFile(),"copy-edit-shared");
      new Thread(()->{File copy=null;try{
        if(Files.isSymbolicLink(root.toPath()))throw new IOException("SHARE_DIRECTORY");Files.createDirectories(root.toPath());long total=0;try(var entries=Files.newDirectoryStream(root.toPath())){for(Path file:entries){if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS))throw new IOException("SHARE_DIRECTORY");total+=Files.size(file);}}
        if(total+sourceFile.length()>256L*1024*1024)throw new IOException("SHARE_CACHE_FULL");copy=Files.createTempFile(root.toPath(),"copy-edit-",".mp4").toFile();
        try(InputStream in=new FileInputStream(sourceFile);OutputStream out=new FileOutputStream(copy)){byte[] buffer=new byte[65536];long count=0;int n;while((n=in.read(buffer))!=-1){if(closed.get()||epoch!=expected||count+n>128L*1024*1024)throw new IOException("SHARE_CANCELLED");out.write(buffer,0,n);count+=n;}}
        final File ready=copy;view.post(()->{
          sharing=false;if(closed.get()||epoch!=expected||!current.getAsBoolean()){ready.delete();return;}
          try{Uri uri=androidx.core.content.FileProvider.getUriForFile(app,app.getPackageName()+".copy-edit-media",ready);Intent send=new Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);send.setClipData(ClipData.newRawUri("文案剪辑成片",uri));view.getContext().startActivity(Intent.createChooser(send,"分享或保存成片"));shareState(id,"opened",null);}
          catch(Exception error){ready.delete();shareState(id,"failed","无法打开系统分享，请重试");}
        });
      }catch(Exception error){if(copy!=null)copy.delete();view.post(()->{sharing=false;if(!closed.get()&&epoch==expected)shareState(id,"failed","成片分享失败，请重试或检查缓存空间");});}},"copy-edit-share").start();
    }
    private void shareState(String id,String status,String error){try{JSONObject state=new JSONObject().put("status",status);if(error!=null)state.put("error",error);shares.put(id,state);}catch(org.json.JSONException ignored){}}
    @Override public void suspend(){foreground=false;if(preview!=null)preview.pause();NativeMediaSession local=session;if(local!=null)local.suspend();}
    @Override public void resume(){foreground=true;}
    @Override public void reset(){epoch++;if(preview!=null){preview.close();preview=null;}shares.clear();for(InputStream input:readers)try{input.close();}catch(IOException ignored){}NativeMediaSession old=session;session=null;if(old!=null)old.close();}
    @Override public void close(){if(!closed.compareAndSet(false,true))return;reset();WebViewCompat.removeWebMessageListener(view,"DshaCopyEdit");}
  }
}
