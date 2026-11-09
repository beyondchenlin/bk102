package com.deepseekharness.media;

/** 未来宿主适配器的边界草案；不暴露路径、Shell、Token 或业务模型。 */
public interface MediaProvider {
    record Capabilities(int protocol, boolean available, boolean deviceVerified, String reason) {}
    record Clip(String assetId, long inUs, long outUs) {
        public Clip { if (assetId == null || assetId.isEmpty() || inUs < 0 || outUs <= inUs) throw new IllegalArgumentException("INVALID_CLIP"); }
    }
    record RenderPlan(int schemaVersion, int width, int height, int fps, java.util.List<Clip> clips) {
        public RenderPlan {
            if(schemaVersion != 1 || width != 1080 || height != 1920 || fps != 30 || clips == null || clips.isEmpty()) throw new IllegalArgumentException("UNSUPPORTED_PLAN");
            clips = java.util.List.copyOf(clips);
            long total = 0;
            for(Clip clip:clips) total = Math.addExact(total, clip.outUs()-clip.inUs());
            if(total > 60_000_000) throw new IllegalArgumentException("DURATION_LIMIT");
        }
    }
    Capabilities capabilities();
}
