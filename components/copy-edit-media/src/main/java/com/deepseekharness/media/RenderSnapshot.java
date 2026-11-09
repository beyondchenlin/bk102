package com.deepseekharness.media;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** 冻结单次媒体请求；它不是插件的第二份工程数据库。 */
public record RenderSnapshot(String projectId,long revision,MediaProvider.RenderPlan plan,
        List<String> stickerLines,Map<String,String> assetDigests,boolean preview) implements RenderJobSnapshot {
    // 固定的颜色、描边、音量、输出配置或渲染器变化时递增，避免跨实现复用缓存。
    public static final String PIPELINE="media3-1.11.1/copy-edit-render-v1";
    public RenderSnapshot {
        if(projectId==null||!projectId.matches("[a-zA-Z0-9_-]{1,64}")||revision<1||plan==null)
            throw new IllegalArgumentException("INVALID_SNAPSHOT");
        stickerLines=List.copyOf(stickerLines);assetDigests=Map.copyOf(assetDigests);
        if(stickerLines.size()!=2||stickerLines.stream().anyMatch(s->s.trim().isEmpty()||s.length()>64))
            throw new IllegalArgumentException("UNSUPPORTED_STICKER");
        for(Map.Entry<String,String> entry:assetDigests.entrySet())
            if(!entry.getValue().matches("[a-f0-9]{64}"))throw new IllegalArgumentException("INVALID_ASSET_DIGEST");
        for(MediaProvider.Clip clip:plan.clips())if(!assetDigests.containsKey(clip.assetId()))throw new IllegalArgumentException("MISSING_ASSET_DIGEST");
        if(!assetDigests.containsKey("voice.wav")||!assetDigests.containsKey("bgm.wav"))throw new IllegalArgumentException("MISSING_AUDIO_DIGEST");
    }
    public long durationUs(){long total=0;for(MediaProvider.Clip clip:plan.clips())total=Math.addExact(total,clip.outUs()-clip.inUs());return total;}
    public int expectedFrames(){return Math.toIntExact(Math.multiplyExact(durationUs(),plan.fps())/1_000_000);}
    public String key() {
        try {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try(DataOutputStream out=new DataOutputStream(bytes)) {
                write(out,PIPELINE);write(out,projectId);out.writeLong(revision);out.writeBoolean(preview);
                out.writeInt(plan.schemaVersion());out.writeInt(plan.width());out.writeInt(plan.height());out.writeInt(plan.fps());
                out.writeInt(plan.clips().size());
                for(MediaProvider.Clip clip:plan.clips()){write(out,clip.assetId());out.writeLong(clip.inUs());out.writeLong(clip.outUs());}
                out.writeInt(stickerLines.size());for(String line:stickerLines)write(out,line);
                out.writeInt(assetDigests.size());for(Map.Entry<String,String> entry:new TreeMap<>(assetDigests).entrySet()){write(out,entry.getKey());write(out,entry.getValue());}
            }
            return hex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        }catch(Exception error){throw new IllegalStateException("SNAPSHOT_HASH_FAILED",error);}
    }
    static String hex(byte[] bytes){StringBuilder out=new StringBuilder();for(byte value:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",value&255));return out.toString();}
    private static void write(DataOutputStream out,String text)throws java.io.IOException{byte[] bytes=text.getBytes(StandardCharsets.UTF_8);out.writeInt(bytes.length);out.write(bytes);}
}
