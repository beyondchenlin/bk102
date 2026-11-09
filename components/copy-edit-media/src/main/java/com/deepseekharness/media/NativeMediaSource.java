package com.deepseekharness.media;
import java.io.InputStream;

/** 业务修订与文件授权由宿主提供；媒体模块不接收页面传来的路径/URL/命令。 */
public interface NativeMediaSource {
    String loadPlan(String projectId,long revision,String profile)throws Exception;
    InputStream openAsset(String assetId)throws Exception;
    default org.json.JSONObject asset(String id)throws Exception{throw new UnsupportedOperationException("NATIVE_IMPORT_UNAVAILABLE");}
    default org.json.JSONObject pending(String id)throws Exception{throw new UnsupportedOperationException("NATIVE_IMPORT_UNAVAILABLE");}
    default InputStream openPending(String id)throws Exception{throw new UnsupportedOperationException("NATIVE_IMPORT_UNAVAILABLE");}
    default org.json.JSONObject commit(String id,org.json.JSONObject metadata)throws Exception{throw new UnsupportedOperationException("NATIVE_IMPORT_UNAVAILABLE");}
}
