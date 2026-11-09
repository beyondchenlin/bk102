package com.deepseekharness.media;

import android.webkit.CookieManager;
import com.deepseekharness.media.NativeMediaSource;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** 仅请求当前已鉴权DSH服务的固定插件端点；页面无法指定URL或原生文件路径。 */
public final class NativeHttpSource implements NativeMediaSource {
  private final String origin;
  public NativeHttpSource(String base)throws Exception {
    URI uri=new URI(base);String host=uri.getHost();
    if(!"http".equals(uri.getScheme())||!("127.0.0.1".equals(host)||"localhost".equals(host)||"[::1]".equals(host)||"::1".equals(host))||uri.getRawUserInfo()!=null||uri.getPort()<1||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new IllegalArgumentException("MEDIA_ORIGIN");
    origin=base.endsWith("/")?base.substring(0,base.length()-1):base;
  }
  private HttpURLConnection connection(String path)throws IOException {
    HttpURLConnection connection=(HttpURLConnection)new URL(origin+path).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10_000);connection.setReadTimeout(15_000);
    String cookie=CookieManager.getInstance().getCookie(origin);if(cookie!=null)connection.setRequestProperty("Cookie",cookie);return connection;
  }
  @Override public String loadPlan(String project,long revision,String profile)throws Exception {
    return rpc("nativePlan",new JSONObject().put("projectId",project).put("revision",revision).put("profile",profile)).toString();
  }
  @Override public JSONObject asset(String id)throws Exception{return rpc("nativeAsset",new JSONObject().put("assetId",id));}
  @Override public JSONObject pending(String id)throws Exception{return rpc("nativeImport",new JSONObject().put("importId",id));}
  @Override public JSONObject commit(String id,JSONObject metadata)throws Exception{return rpc("nativeImportCommit",new JSONObject().put("importId",id).put("metadata",metadata));}
  private JSONObject rpc(String method,JSONObject args)throws Exception {
    HttpURLConnection connection=connection("/api/copyEdit/"+method);
    try{
      connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
      JSONObject request=new JSONObject().put("type","client-request").put("rpcId",java.util.UUID.randomUUID().toString()).put("method","copyEdit/"+method).put("payload",new JSONObject().put("args",args));
      byte[] body=request.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(body.length);try(OutputStream out=connection.getOutputStream()){out.write(body);}
      if(connection.getResponseCode()!=200)throw new IOException("MEDIA_HOST_AUTH_OR_CONNECTION");
      try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>650_000)throw new IOException("MEDIA_PLAN_SIZE");out.write(buffer,0,n);}JSONObject result=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8)).getJSONObject("result");if(!result.optBoolean("ok"))throw new IllegalStateException("MEDIA_HOST_REQUEST_REJECTED");return result.getJSONObject("value");}
    }finally{connection.disconnect();}
  }
  @Override public InputStream openAsset(String id)throws Exception {
    return open("/api/copy-edit/media?assetId=",id);
  }
  @Override public InputStream openPending(String id)throws Exception{return open("/api/copy-edit/native-import?importId=",id);}
  private InputStream open(String route,String id)throws Exception {
    if(!id.matches("[-a-zA-Z0-9_.]{1,80}"))throw new IllegalArgumentException("MEDIA_ASSET_ID");
    HttpURLConnection connection=connection(route+URLEncoder.encode(id,"UTF-8"));
    try{
      if(connection.getResponseCode()!=200)throw new IOException("MEDIA_ASSET_UNAVAILABLE");long length=connection.getContentLengthLong();if(length==0||length>256L*1024*1024)throw new IOException("MEDIA_ASSET_SIZE");
      // DSH流式响应可无Content-Length；接收器仍按实际字节上限和完整SHA校验。
      return new FilterInputStream(connection.getInputStream()){@Override public void close()throws IOException{try{super.close();}finally{connection.disconnect();}}};
    }catch(Exception error){connection.disconnect();throw error;}
  }
}
