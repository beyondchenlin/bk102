package com.deepseekharness.media;

import java.io.File;
import java.io.InputStream;
import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

/** 会话内的有界成片槽位；只删除本实例亲自创建的临时文件，不扫描旧缓存。 */
public final class MediaArtifacts {
    private static final Set<String> SLOTS=Set.of("preview.mp4","export.mp4","preview-4s.mp4","preview-60s.mp4","export-4s.mp4","export-60s.mp4");
    private static final long MAX_ARTIFACT_BYTES=512L*1024*1024;
    public record Pending(Path path,String slot,String key) {}
    private record Ready(String key,long bytes,String sha256) {}
    private final Path directory;
    private final Map<Path,Pending> pending=new HashMap<>();
    private final Map<String,Ready> ready=new HashMap<>();
    public MediaArtifacts(File directory)throws IOException {
        this.directory=directory.toPath().toAbsolutePath().normalize();
        for(Path parent=this.directory;parent!=null;parent=parent.getParent())if(Files.isSymbolicLink(parent))throw new IOException("SYMLINK_ARTIFACT_DIRECTORY");
        Files.createDirectories(this.directory);
    }
    public Pending begin(String slot,String key)throws IOException {
        checkSlot(slot);if(!key.matches("[a-f0-9]{64}"))throw new IOException("INVALID_ARTIFACT_KEY");
        Path path=Files.createTempFile(directory,"job-",".part.mp4");Pending value=new Pending(path,slot,key);pending.put(path,value);return value;
    }
    public File lookup(String slot,String key)throws IOException {
        checkSlot(slot);Ready known=ready.get(slot);if(known==null||!known.key().equals(key))return null;
        Path file=directory.resolve(slot);
        if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.size(file)!=known.bytes()||!digest(file.toFile()).equals(known.sha256())){ready.remove(slot);return null;}
        return file.toFile();
    }
    public File commit(Pending value)throws IOException {
        owned(value);Path file=value.path();long size=Files.size(file);
        if(size==0||size>MAX_ARTIFACT_BYTES)throw new IOException("ARTIFACT_SIZE_LIMIT");
        String sha=digest(file.toFile());Path target=directory.resolve(value.slot());
        if(Files.exists(target,LinkOption.NOFOLLOW_LINKS)&&!Files.isRegularFile(target,LinkOption.NOFOLLOW_LINKS))throw new IOException("INVALID_ARTIFACT_TARGET");
        // 不支持原子替换时失败，保留旧成片；不能退化为先删旧文件。
        Files.move(file,target,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        pending.remove(file);ready.put(value.slot(),new Ready(value.key(),size,sha));return target.toFile();
    }
    public void discard(Pending value)throws IOException {owned(value);Files.deleteIfExists(value.path());pending.remove(value.path());}
    public int pendingCount(){return pending.size();}
    public void clearOwned()throws IOException {
        for(Pending p:new ArrayList<>(pending.values()))discard(p);
        for(Map.Entry<String,Ready> item:new HashMap<>(ready).entrySet()){
            File verified=lookup(item.getKey(),item.getValue().key());if(verified!=null)Files.delete(verified.toPath());
        }
        ready.clear();try{Files.delete(directory);}catch(DirectoryNotEmptyException ignored){/* 不删除未知或被修改的文件。 */}
    }
    private void owned(Pending value)throws IOException {
        if(value==null||!value.equals(pending.get(value.path()))||!directory.equals(value.path().getParent())||!Files.isRegularFile(value.path(),LinkOption.NOFOLLOW_LINKS))throw new IOException("UNOWNED_ARTIFACT");
    }
    private static void checkSlot(String slot){if(!SLOTS.contains(slot))throw new IllegalArgumentException("UNKNOWN_SLOT");}
    public static String digest(File file)throws IOException {
        try{MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=Files.newInputStream(file.toPath())){byte[] buffer=new byte[65536];int count;while((count=in.read(buffer))!=-1)digest.update(buffer,0,count);}return RenderSnapshot.hex(digest.digest());}
        catch(java.security.NoSuchAlgorithmException error){throw new IOException(error);}
    }
}
