package com.deepseekharness.media;

import android.graphics.BitmapFactory;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** 宿主授权读取后复制进私有不可变槽位；页面只能提供ID，不能提供路径或URI。 */
public final class AuthorizedAssets {
    public record Asset(String id,String kind,String sha256,File file,long durationUs,List<Long> pts,int width,int height,int rotation,String mime) {
        public Asset {pts=List.copyOf(pts);}
    }
    private final Path root;
    private final Map<String,Asset> assets=new HashMap<>();
    private final Map<Path,String> ownedFiles=new HashMap<>();private final Set<Path> accounted=new HashSet<>();
    private long bytes;
    public AuthorizedAssets(File trustedDirectory)throws IOException {
        root=trustedDirectory.toPath().toAbsolutePath().normalize();
        for(Path p=root;p!=null;p=p.getParent())if(Files.isSymbolicLink(p))throw new IOException("SYMLINK_ASSET_ROOT");
        Files.createDirectories(root);
    }
    public Asset importAuthorized(String id,String kind,String expectedSha,InputStream authorized)throws Exception {
        // 此方法接管输入流，包括参数拒绝、缓存命中及复制失败路径。
        try(InputStream in=authorized){
        if(!id.matches("[-a-zA-Z0-9_.]{1,80}")||!Set.of("video","audio","image","auto").contains(kind)||!expectedSha.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("INVALID_ASSET_IDENTITY");
        if(assets.containsKey(id))throw new IllegalArgumentException("ASSET_ALREADY_REGISTERED");
        if(assets.size()>=240)throw new IllegalArgumentException("ASSET_COUNT_LIMIT");
        Path target=root.resolve(expectedSha+".asset"),temporary=null;
        try{
            if(Files.exists(target,LinkOption.NOFOLLOW_LINKS)){
                if(!Files.isRegularFile(target,LinkOption.NOFOLLOW_LINKS)||!MediaArtifacts.digest(target.toFile()).equals(expectedSha))throw new IOException("ASSET_CACHE_MISMATCH");
            }else{
                temporary=Files.createTempFile(root,"import-",".part");long size=0;
                try(OutputStream out=Files.newOutputStream(temporary)){byte[] buffer=new byte[65536];int count;while((count=in.read(buffer))!=-1){size+=count;if(size>256L*1024*1024||bytes+size>512L*1024*1024)throw new IOException("ASSET_BYTES_LIMIT");out.write(buffer,0,count);}}
                if(!MediaArtifacts.digest(temporary.toFile()).equals(expectedSha))throw new IOException("ASSET_SHA_MISMATCH");
                Files.move(temporary,target,StandardCopyOption.ATOMIC_MOVE);temporary=null;ownedFiles.put(target,expectedSha);
            }
            long length=Files.size(target);if(length<=0||length>256L*1024*1024||(!accounted.contains(target)&&bytes+length>512L*1024*1024))throw new IOException("ASSET_BYTES_LIMIT");
            // 即使格式检查失败，也计入本会话亲自复制的字节并在关闭时按摘要回收。
            if(accounted.add(target))bytes+=length;Asset asset=inspect(id,kind,expectedSha,target.toFile());assets.put(id,asset);return asset;
        }finally{if(temporary!=null)Files.deleteIfExists(temporary);}
        }
    }
    private Asset inspect(String id,String kind,String sha,File file)throws Exception {
        org.json.JSONObject meta=NativeAssetProbe.inspect(file,sha);String actual=meta.getString("kind");if(!kind.equals("auto")&&!kind.equals(actual))throw new IllegalArgumentException("ASSET_KIND_MISMATCH");
        List<Long> pts=new ArrayList<>();org.json.JSONArray indexed=meta.optJSONArray("ptsUs");if(indexed!=null)for(int i=0;i<indexed.length();i++)pts.add(indexed.getLong(i));
        return new Asset(id,actual,sha,file,meta.optLong(actual.equals("video")?"endUs":"durationUs",0),pts,meta.optInt("width",0),meta.optInt("height",0),meta.optInt("rotation",0),meta.getString("mime"));
    }
    public static org.json.JSONObject metadata(Asset asset)throws org.json.JSONException {
        org.json.JSONObject out=new org.json.JSONObject().put("sha256",asset.sha256()).put("kind",asset.kind()).put("mime",asset.mime());
        if(asset.kind().equals("video"))out.put("ptsUs",new org.json.JSONArray(asset.pts())).put("endUs",asset.durationUs()).put("rotation",asset.rotation());
        if(asset.kind().equals("audio"))out.put("durationUs",asset.durationUs());else out.put("width",asset.width()).put("height",asset.height());return out;
    }
    public Asset resolve(String id,String kind,String sha)throws IOException {
        Asset asset=assets.get(id);
        if(asset==null||!asset.kind().equals(kind)||!asset.sha256().equals(sha))throw new IllegalArgumentException("ASSET_NOT_AUTHORIZED");
        if(!Files.isRegularFile(asset.file().toPath(),LinkOption.NOFOLLOW_LINKS)||!MediaArtifacts.digest(asset.file()).equals(sha))throw new IOException("AUTHORIZED_ASSET_CHANGED");
        return asset;
    }
    public boolean contains(String id){return assets.containsKey(id);}
    public Asset byId(String id,String sha)throws IOException{Asset asset=assets.get(id);if(asset==null)throw new IllegalArgumentException("ASSET_NOT_AUTHORIZED");return resolve(id,asset.kind(),sha);}
    public void clearOwned()throws IOException {
        for(var entry:ownedFiles.entrySet())if(Files.isRegularFile(entry.getKey(),LinkOption.NOFOLLOW_LINKS)&&MediaArtifacts.digest(entry.getKey().toFile()).equals(entry.getValue()))Files.deleteIfExists(entry.getKey());
        assets.clear();ownedFiles.clear();accounted.clear();bytes=0;try{Files.delete(root);}catch(DirectoryNotEmptyException ignored){/* 未知或已变化的文件保留。 */}
    }
}
