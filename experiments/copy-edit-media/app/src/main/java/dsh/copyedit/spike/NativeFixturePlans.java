package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

/** 独立实验入口：输入由真实插件compilePlan生成；资产来源固定在自制夹具。 */
public final class NativeFixturePlans {
    private final Context context;private final AuthorizedAssets registry;private final Map<String,String> plans=new HashMap<>();
    public NativeFixturePlans(Context context)throws Exception {
        this.context=context;registry=new AuthorizedAssets(new File(context.getFilesDir().getCanonicalFile(),"native-authorized"));
        JSONArray assets=new JSONArray(read("native-assets.json"));
        for(int i=0;i<assets.length();i++){JSONObject a=assets.getJSONObject(i);String name=a.getString("assetId");if(!Set.of("a.mp4","b.mp4","voice.wav","bgm.wav","native-sticker.png","native-sticker-alt.png").contains(name))throw new IllegalArgumentException("UNKNOWN_FIXTURE");registry.importAuthorized(name,a.getString("kind"),a.getString("sha256"),context.getAssets().open("fixtures/"+name));}
        for(int seconds:new int[]{4,60})for(int version:new int[]{1,2})plans.put(seconds+"-"+version,read("native-plan-"+seconds+"-"+version+".json"));
    }
    private String read(String name)throws Exception {try(InputStream in=context.getAssets().open("fixtures/"+name);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>600_000)throw new IOException("FIXTURE_SIZE_LIMIT");out.write(buffer,0,n);}return new String(out.toByteArray(),StandardCharsets.UTF_8);}}
    public String envelope(boolean full,boolean alternate){return plans.get((full?60:4)+"-"+(alternate?2:1));}
    public String tailEnvelope()throws Exception{return read("native-plan-tail.json");}
    public String segmentedEnvelope()throws Exception {
        JSONObject e=new JSONObject(envelope(false,false)),p=new JSONObject(e.getString("planJson"));p.put("schemaVersion",2);
        JSONObject voice=p.getJSONArray("voices").getJSONObject(0),right=new JSONObject(voice.toString());voice.put("outUs",1_233_333).put("volume",0);right.put("voiceId","voice-right").put("inUs",1_233_333).put("startFrame",37).put("volume",0);p.getJSONArray("voices").put(right);
        JSONObject sticker=p.getJSONArray("stickers").getJSONObject(0),other=new JSONObject(sticker.toString());sticker.put("endFrame",37);other.put("stickerId","sticker-right").put("startFrame",37);p.getJSONArray("stickers").put(other);
        JSONObject bgm=p.getJSONObject("audio").getJSONObject("bgm");long samples=Math.round(registry.resolve("bgm.wav","audio",findSha(p,"bgm.wav")).durationUs()*48000d/1_000_000);
        JSONArray music=new JSONArray();music.put(new JSONObject(bgm.toString()).put("musicId","music-left").put("startFrame",0).put("endFrame",30).put("offsetSamples",0));music.put(new JSONObject(bgm.toString()).put("musicId","music-right").put("startFrame",60).put("endFrame",120).put("offsetSamples",96000%samples));p.put("music",music);p.getJSONObject("audio").put("bgm",JSONObject.NULL);
        String raw=p.toString();return e.put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw)).toString();
    }
    private String findSha(JSONObject plan,String id)throws Exception{JSONArray refs=plan.getJSONArray("assets");for(int n=0;n<refs.length();n++)if(refs.getJSONObject(n).getString("assetId").equals(id))return refs.getJSONObject(n).getString("sha256");throw new IllegalArgumentException("FIXTURE_ASSET");}
    public FrozenRenderPlan parse(String envelope,String project,long revision)throws Exception {return FrozenRenderPlan.parse(envelope,registry,project,revision);}
    public FrozenRenderPlan snapshot(boolean full,long revision,boolean alternate,boolean preview)throws Exception {
        JSONObject envelope=new JSONObject(envelope(full,alternate)),plan=new JSONObject(envelope.getString("planJson"));
        // 测试中的修订切换只更换身份和已冻结的贴片版本；内容仍经同一校验入口。
        plan.put("revision",revision);String raw=plan.toString();envelope.put("revision",revision).put("planJson",raw).put("planHash",FrozenRenderPlan.sha(raw)).put("profile",preview?"preview":"export");
        return parse(envelope.toString(),"native-fixture-project",revision);
    }
    public void writeStickerEvidence(FrozenRenderPlan snapshot,File target)throws Exception {if(!snapshot.stickers().isEmpty())Files.copy(snapshot.stickers().get(0).asset().file().toPath(),target.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);}
}
