package com.deepseekharness.media;
import android.graphics.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.json.*;

/** 串行索引/精确帧协作者；与编码任务共用授权资产，不把视频经JS桥传输。 */
final class NativeAssetTasks {
  private final File directory;private final NativeMediaSource source;private AuthorizedAssets assets;
  private record Image(File file,String sha){}
  private final Map<String,Image> images=new ConcurrentHashMap<>();private final LinkedHashMap<String,String> keys=new LinkedHashMap<>();
  NativeAssetTasks(File directory,NativeMediaSource source){this.directory=directory;this.source=source;}
  AuthorizedAssets registry()throws IOException{if(assets==null)assets=new AuthorizedAssets(new File(directory,"assets"));return assets;}
  private void check(BooleanSupplier cancelled){if(cancelled.getAsBoolean())throw new CancellationException("MEDIA_TASK_RETIRED");}
  private InputStream bounded(InputStream in,BooleanSupplier cancelled){return new FilterInputStream(in){@Override public int read(byte[] b,int off,int len)throws IOException{check(cancelled);return super.read(b,off,len);}};}
  JSONObject importAsset(String id,BooleanSupplier cancelled)throws Exception{
    long started=android.os.SystemClock.elapsedRealtime();check(cancelled);JSONObject pending=source.pending(id);String sha=pending.getString("sha256");if(!pending.getString("assetId").equals(id))throw new IllegalArgumentException("IMPORT_IDENTITY");
    AuthorizedAssets.Asset asset=registry().contains(id)?registry().byId(id,sha):registry().importAuthorized(id,"auto",sha,bounded(source.openPending(id),cancelled));check(cancelled);
    JSONObject metadata=AuthorizedAssets.metadata(asset);check(cancelled);return source.commit(id,metadata).put("nativeImportMs",android.os.SystemClock.elapsedRealtime()-started);
  }
  JSONObject frame(String id,int frame,BooleanSupplier cancelled)throws Exception{
    long started=android.os.SystemClock.elapsedRealtime();check(cancelled);JSONObject meta=source.asset(id);String sha=meta.getString("sha256");if(!id.equals(meta.getString("assetId"))||!meta.getString("kind").equals("video"))throw new IllegalArgumentException("FRAME_ASSET_IDENTITY");
    AuthorizedAssets.Asset asset=registry().contains(id)?registry().resolve(id,"video",sha):registry().importAuthorized(id,"video",sha,bounded(source.openAsset(id),cancelled));check(cancelled);
    if(frame<0||frame>=asset.pts().size())throw new IllegalArgumentException("FRAME_INDEX");String key=sha+":"+frame,token=keys.get(key);
    if(token!=null&&images.containsKey(token))return result(token,asset.pts().get(frame)).put("cacheHit",true).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-started);
    ExactFrames.Frame decoded=ExactFrames.decodeAsset(asset.file(),asset.pts().get(frame),cancelled);Bitmap bitmap=decoded.bitmap();File file=null;boolean kept=false;
    try{
      int rotation=asset.rotation();if(rotation!=0){Matrix m=new Matrix();m.postRotate(rotation);Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),m,true);if(rotated!=bitmap){bitmap.recycle();bitmap=rotated;}}
      check(cancelled);token=UUID.randomUUID().toString();file=new File(directory,"frame-"+token+".png");try(OutputStream out=Files.newOutputStream(file.toPath(),StandardOpenOption.CREATE_NEW)){if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,out))throw new IOException("FRAME_PNG_FAILED");}
      check(cancelled);images.put(token,new Image(file,MediaArtifacts.digest(file)));keys.put(key,token);kept=true;
      while(keys.size()>64||images.values().stream().mapToLong(i->i.file().length()).sum()>32L*1024*1024){String first=keys.keySet().iterator().next();String retired=keys.remove(first);removeImage(retired);}return result(token,decoded.ptsUs()).put("cacheHit",false).put("decodeMs",decoded.elapsedMs()).put("elapsedMs",android.os.SystemClock.elapsedRealtime()-started);
    }finally{bitmap.recycle();if(!kept&&file!=null)Files.deleteIfExists(file.toPath());}
  }
  private JSONObject result(String id,long pts)throws JSONException{return new JSONObject().put("url","/__dsha_copy_edit__/"+id+"/frame.png").put("ptsUs",pts).put("executionLocation","android-local");}
  File image(String id){Image value=images.get(id);return value==null?null:value.file();}
  private void removeImage(String id)throws IOException{Image value=images.remove(id);if(value!=null&&Files.isRegularFile(value.file().toPath(),LinkOption.NOFOLLOW_LINKS)&&MediaArtifacts.digest(value.file()).equals(value.sha()))Files.delete(value.file().toPath());}
  void close()throws IOException{for(String id:new ArrayList<>(images.keySet()))removeImage(id);keys.clear();if(assets!=null)assets.clearOwned();}
}
