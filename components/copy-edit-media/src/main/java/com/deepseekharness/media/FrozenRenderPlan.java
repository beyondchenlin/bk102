package com.deepseekharness.media;

import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** 插件 compilePlan 的只读投影；先校验摘要、授权素材和PTS，再允许创建编解码器。 */
public record FrozenRenderPlan(String projectId,long revision,boolean preview,int expectedFrames,String planHash,
        List<Clip> clips,List<Sticker> stickers,List<Audio> audio,List<Music> music) implements RenderJobSnapshot {
    public record Clip(AuthorizedAssets.Asset asset,long startUs,long endUs,int frames,List<Long> sourceTimes) {
        public Clip { sourceTimes=List.copyOf(sourceTimes); }
    }
    public record Sticker(AuthorizedAssets.Asset asset,int startFrame,int endFrame,int x,int y,int width) {}
    public record Audio(AuthorizedAssets.Asset asset,long inUs,long outUs,int startFrame,float volume,boolean loop) {}
    public record Music(AuthorizedAssets.Asset asset,int startFrame,int endFrame,long offsetSamples,float volume) {}
    public FrozenRenderPlan {clips=List.copyOf(clips);stickers=List.copyOf(stickers);audio=List.copyOf(audio);music=List.copyOf(music);}
    @Override public String key(){return sha("native-plan-v6/media3-1.11.1/"+planHash+"/"+(preview?"preview-360x640":"export-1080x1920"));}
    /** 按同时活跃的音轨统一预留峰值，原声、配音和音乐保持相对音量。 */
    public float mixScale(){
        double peak=0;
        for(int frame=0;frame<expectedFrames;frame++){double sum=0;for(Audio a:audio)if(frame>=a.startFrame()&&(a.loop()||frame<a.startFrame()+audioFrames(a.outUs()-a.inUs())))sum+=a.volume();for(Music m:music)if(frame>=m.startFrame()&&frame<m.endFrame())sum+=m.volume();peak=Math.max(peak,sum);}
        return (float)(peak>.95?.95/peak:1);
    }
    public int videoFrames(){return clips.stream().mapToInt(Clip::frames).sum();}
    public static FrozenRenderPlan parse(String envelope,AuthorizedAssets registry,String expectedProject,long expectedRevision)throws Exception {
        require(envelope!=null&&envelope.getBytes(StandardCharsets.UTF_8).length<=600_000,"PLAN_SIZE_LIMIT");
        JSONObject request=new JSONObject(envelope);require(integer(request,"protocol",1,1)==1,"PROTOCOL_UNSUPPORTED");
        String raw=request.getString("planJson"),hash=request.getString("planHash"),profile=request.getString("profile");
        require(raw.getBytes(StandardCharsets.UTF_8).length<=524_288&&hash.matches("[a-f0-9]{64}")&&sha(raw).equals(hash),"PLAN_SHA_MISMATCH");
        require(Set.of("preview","export").contains(profile),"PROFILE_UNSUPPORTED");JSONObject plan=new JSONObject(raw);
        long schema=integer(plan,"schemaVersion",1,2);String project=plan.getString("projectId");long revision=integer(plan,"revision",1,9_007_199_254_740_991L);
        require(project.matches("[-a-zA-Z0-9_]{1,80}")&&project.equals(expectedProject)&&revision==expectedRevision&&project.equals(request.getString("projectId"))&&revision==integer(request,"revision",1,9_007_199_254_740_991L),"PLAN_IDENTITY_MISMATCH");
        JSONObject canvas=plan.getJSONObject("canvas"),fps=canvas.getJSONObject("fps");integer(canvas,"width",1080,1080);integer(canvas,"height",1920,1920);integer(fps,"numerator",30,30);integer(fps,"denominator",1,1);
        int total=(int)integer(plan,"totalFrames",1,18000),videoFrames=(int)integer(plan,"videoFrames",1,total);
        Map<String,AuthorizedAssets.Asset> assets=new HashMap<>();JSONArray refs=array(plan,"assets",1,240);
        for(int i=0;i<refs.length();i++){JSONObject ref=refs.getJSONObject(i);String id=ref.getString("assetId");require(!assets.containsKey(id),"DUPLICATE_ASSET");assets.put(id,registry.resolve(id,ref.getString("kind"),ref.getString("sha256")));}
        Set<String> used=new HashSet<>(),clipIds=new HashSet<>();List<Clip> clips=new ArrayList<>();List<Audio> sourceAudio=new ArrayList<>();JSONArray source=array(plan,"clips",1,120);int offset=0;
        for(int i=0;i<source.length();i++){
            JSONObject c=source.getJSONObject(i);require(clipIds.add(c.getString("clipId")),"DUPLICATE_CLIP");AuthorizedAssets.Asset a=asset(assets,used,c,"video");
            require(a.sha256().equals(c.getString("sha256")),"CLIP_SHA_MISMATCH");int in=(int)integer(c,"inFrame",0,a.pts().size()-1),out=(int)integer(c,"outFrame",in+1,a.pts().size());
            long start=integer(c,"startUs",0,a.durationUs()-1),end=integer(c,"endUs",start+1,a.durationUs());
            require(Math.abs(start-a.pts().get(in))<=1&&Math.abs(end-(out==a.pts().size()?a.durationUs():a.pts().get(out)))<=1,"CLIP_PTS_MISMATCH");
            // FFprobe四舍五入与MediaExtractor截断可能相差1µs。核验同一源帧后，
            // 交给Media3的边界必须用设备实际PTS，否则会把恰在边界前1µs的帧丢掉。
            start=a.pts().get(in);end=out==a.pts().size()?a.durationUs():a.pts().get(out);
            int frames=(int)integer(c,"frames",1,18000);integer(c,"startFrame",offset,offset);
            int wi=in,wo=out,skip=0;boolean windowed=c.has("window");
            if(windowed){JSONObject w=c.getJSONObject("window");wi=(int)integer(w,"inFrame",0,in);wo=(int)integer(w,"outFrame",out,a.pts().size());skip=(int)integer(w,"offset",0,18000);integer(w,"frames",frames,frames);}
            List<Long> mapping=SourceFrameMapping.create(a.pts(),a.durationUs(),in,out,wi,wo,skip,frames,windowed);
            float volume=c.has("sourceVolume")?gain(c,"sourceVolume"):1;
            // 声音按原始窗口的时间前进，不能使用VFR选帧的前一帧PTS作为分割入点。
            long audioStart=a.pts().get(wi)+Math.round(skip*1_000_000d/30);
            long windowEnd=wo==a.pts().size()?a.durationUs():a.pts().get(wo);
            long audioEnd=Math.min(windowEnd,audioStart+Math.round(frames*1_000_000d/30));
            if(a.hasAudio()&&volume>0&&audioEnd>audioStart)sourceAudio.add(new Audio(a,audioStart,audioEnd,offset,volume,false));
            clips.add(new Clip(a,start,end,frames,mapping));offset+=frames;
        }
        require(offset==videoFrames,"VIDEO_FRAMES_MISMATCH");
        List<Sticker> stickers=new ArrayList<>();Set<String> stickerIds=new HashSet<>();JSONArray images=array(plan,"stickers",0,30);
        for(int i=0;i<images.length();i++){
            JSONObject s=images.getJSONObject(i);require(stickerIds.add(s.getString("stickerId")),"DUPLICATE_STICKER");AuthorizedAssets.Asset a=asset(assets,used,s,"image");int start=(int)integer(s,"startFrame",0,total-1),end=(int)integer(s,"endFrame",start+1,total),width=(int)integer(s,"width",216,1080);
            int x=(int)integer(s,"x",(long)Math.ceil(-width/2d),(long)Math.floor(1080-width/2d)),y=(int)integer(s,"y",(long)Math.ceil(-400d*width/1080/2),(long)Math.floor(1920-400d*width/1080/2));
            stickers.add(new Sticker(a,start,end,x,y,width));
        }
        List<Audio> audio=new ArrayList<>(sourceAudio);JSONObject global=plan.getJSONObject("audio");
        for(String role:List.of("voice","bgm"))if(!global.isNull(role)){
            JSONObject s=global.getJSONObject(role);AuthorizedAssets.Asset a=asset(assets,used,s,"audio");audio.add(new Audio(a,0,Math.min(a.durationUs(),Math.round(total*1_000_000d/30)),0,gain(s),role.equals("bgm")));
        }
        JSONArray voices=array(plan,"voices",0,120);int expectedTotal=videoFrames;Set<String> voiceIds=new HashSet<>();
        for(int i=0;i<voices.length();i++){
            JSONObject s=voices.getJSONObject(i);require(voiceIds.add(s.getString("voiceId")),"DUPLICATE_VOICE");AuthorizedAssets.Asset a=asset(assets,used,s,"audio");long in=integer(s,"inUs",0,a.durationUs()-1),out=integer(s,"outUs",in+1,a.durationUs());int start=(int)integer(s,"startFrame",0,17999);int stop=start+audioFrames(out-in);require(stop<=total,"VOICE_OUTSIDE_PLAN");expectedTotal=Math.max(expectedTotal,stop);audio.add(new Audio(a,in,out,start,gain(s),false));
        }
        List<Music> music=new ArrayList<>();Set<String> musicIds=new HashSet<>();int pieces=0;
        if(plan.has("music")){require(schema==2&&global.isNull("bgm"),"MUSIC_SCHEMA");JSONArray segments=array(plan,"music",0,120);
            for(int i=0;i<segments.length();i++){JSONObject m=segments.getJSONObject(i);require(musicIds.add(m.getString("musicId")),"DUPLICATE_MUSIC");AuthorizedAssets.Asset a=asset(assets,used,m,"audio");int start=(int)integer(m,"startFrame",0,total-1),end=(int)integer(m,"endFrame",start+1,total);long sample=integer(m,"offsetSamples",0,Math.max(1,Math.round(a.durationUs()*48000d/1_000_000))-1);
                pieces+=1+(int)Math.ceil((Math.round((end-start)*1_000_000d/30)+Math.round(sample*1_000_000d/48000))/ (double)a.durationUs());require(pieces<=512,"NATIVE_MUSIC_LOOP_LIMIT");music.add(new Music(a,start,end,sample,gain(m)));}
        }
        require(total==expectedTotal,"TOTAL_FRAMES_MISMATCH");require(used.equals(assets.keySet()),"UNUSED_ASSET_REFERENCE");
        return new FrozenRenderPlan(project,revision,profile.equals("preview"),total,hash,clips,stickers,audio,music);
    }
    private static int audioFrames(long us){return Math.max(1,(int)Math.ceil((us-1)*30d/1_000_000));}
    private static AuthorizedAssets.Asset asset(Map<String,AuthorizedAssets.Asset> assets,Set<String> used,JSONObject o,String kind)throws Exception {String id=o.getString("assetId");AuthorizedAssets.Asset a=assets.get(id);require(a!=null&&a.kind().equals(kind),"ASSET_KIND_MISMATCH");used.add(id);return a;}
    private static float gain(JSONObject o)throws Exception {return gain(o,"volume");}
    private static float gain(JSONObject o,String key)throws Exception {Object value=o.get(key);require(value instanceof Number,"INVALID_GAIN");double n=((Number)value).doubleValue();require(Double.isFinite(n)&&n>=0&&n<=1,"INVALID_GAIN");return (float)n;}
    private static JSONArray array(JSONObject o,String key,int min,int max)throws Exception {JSONArray array=o.getJSONArray(key);require(array.length()>=min&&array.length()<=max,"ARRAY_LIMIT_"+key);return array;}
    private static long integer(JSONObject o,String key,long min,long max)throws Exception {Object v=o.get(key);require(v instanceof Number,"INTEGER_REQUIRED_"+key);double n=((Number)v).doubleValue();require(Double.isFinite(n)&&n==Math.rint(n)&&n>=min&&n<=max,"INTEGER_RANGE_"+key);return ((Number)v).longValue();}
    private static void require(boolean ok,String error){if(!ok)throw new IllegalArgumentException(error);}
    public static String sha(String text){try{return RenderSnapshot.hex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
