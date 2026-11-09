package com.deepseekharness.media;

import android.content.Context;
import android.os.*;
import androidx.media3.transformer.*;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.*;

/** 页面所属的单任务执行器。准备/验证在工作线程，状态转换与编码器在主线程。 */
@androidx.annotation.OptIn(markerClass={androidx.media3.common.util.UnstableApi.class,androidx.media3.common.util.ExperimentalApi.class})
public final class NativeMediaSession implements AutoCloseable {
    private final Context context;private final NativeMediaSource source;private final boolean enabled;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean closed=new AtomicBoolean();
    private final Map<String,Job> jobs=new LinkedHashMap<>();private Job active;
    private final Map<String,File> ready=new ConcurrentHashMap<>();private boolean cleanupFailed;
    private final File directory;private AuthorizedAssets registry;private String blackDigest;
    private final NativeAssetTasks assetTasks;private final java.util.concurrent.atomic.AtomicLong assetEpoch=new java.util.concurrent.atomic.AtomicLong();private int auxiliary;
    private static final class Job {
        final String id,project,profile;final long revision;final AtomicBoolean cancelled=new AtomicBoolean();
        String status="running",error="";FrozenRenderPlan plan;Transformer transformer;MediaArtifacts artifacts;MediaArtifacts.Pending pending;File result;
        Job(String id,String project,long revision,String profile){this.id=id;this.project=project;this.revision=revision;this.profile=profile;}
    }
    public NativeMediaSession(Context context,NativeMediaSource source,boolean enabled)throws IOException {
        this.context=context.getApplicationContext();this.source=source;this.enabled=enabled;
        directory=new File(context.getCacheDir().getCanonicalFile(),"copy-edit-native/"+UUID.randomUUID());
        assetTasks=new NativeAssetTasks(directory,source);
    }
    public JSONObject capabilities()throws JSONException {return new JSONObject().put("protocol",1).put("available",enabled&&!closed.get()&&!cleanupFailed).put("deviceVerified",false).put("executionLocation","android-local").put("reason",cleanupFailed?"清理未完成，请关闭此页面后重新打开":enabled?"CFR30/竖屏，最多30张PNG；后台或页面退出取消任务":"原生媒体尚未完成宿主设备验收").put("assetImport",true).put("exactFrames",true).put("segmentedAudio",true).put("maxSeconds",60).put("maxStickers",30);}
    private static void mainThread(){if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("MEDIA_MAIN_THREAD_REQUIRED");}
    public JSONObject start(String id,String project,long revision,String profile)throws Exception {
        mainThread();if(!enabled||closed.get()||cleanupFailed)throw new IllegalStateException("NATIVE_MEDIA_UNAVAILABLE");
        if(!id.matches("[-a-fA-F0-9]{32,36}")||!project.matches("[-a-zA-Z0-9_]{1,80}")||revision<1||!Set.of("preview","export").contains(profile))throw new IllegalArgumentException("INVALID_MEDIA_REQUEST");
        Job known=jobs.get(id);if(known!=null){if(!known.project.equals(project)||known.revision!=revision||!known.profile.equals(profile))throw new IllegalArgumentException("REQUEST_ID_REUSED");return describe(known);}
        if(active!=null)throw new IllegalStateException("TASK_ALREADY_RUNNING");if(jobs.size()>=20)throw new IllegalStateException("SESSION_RESULTS_FULL_SAVE_AND_REOPEN");
        Job job=new Job(id,project,revision,profile);jobs.put(id,job);active=job;
        worker.execute(()->prepare(job));return describe(job);
    }
    private void prepare(Job job){
        try{
            check(job);String envelope=source.loadPlan(job.project,job.revision,job.profile);check(job);
            if(envelope.length()>600_000)throw new IllegalArgumentException("PLAN_SIZE_LIMIT");JSONObject request=new JSONObject(envelope);String raw=request.getString("planJson");
            if(raw.length()>524_288||!FrozenRenderPlan.sha(raw).equals(request.getString("planHash")))throw new IllegalArgumentException("PLAN_SHA_MISMATCH");
            JSONObject plan=new JSONObject(raw);if(!job.project.equals(plan.getString("projectId"))||job.revision!=plan.getLong("revision")||!job.profile.equals(request.getString("profile")))throw new IllegalArgumentException("PLAN_IDENTITY_MISMATCH");
            if(registry==null)registry=assetTasks.registry();JSONArray refs=plan.getJSONArray("assets");if(refs.length()>240)throw new IllegalArgumentException("ASSET_COUNT_LIMIT");
            for(int i=0;i<refs.length();i++){
                check(job);JSONObject ref=refs.getJSONObject(i);String id=ref.getString("assetId"),kind=ref.getString("kind"),sha=ref.getString("sha256");
                if(!id.matches("[-a-zA-Z0-9_.]{1,80}")||!Set.of("video","audio","image").contains(kind)||!sha.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("INVALID_ASSET_IDENTITY");
                if(registry.contains(id))registry.resolve(id,kind,sha);else registry.importAuthorized(id,kind,sha,new FilterInputStream(source.openAsset(id)){
                    @Override public int read(byte[] b,int off,int len)throws IOException {check(job);return super.read(b,off,len);}
                });
            }
            check(job);FrozenRenderPlan frozen=FrozenRenderPlan.parse(envelope,registry,job.project,job.revision);check(job);
            main.post(()->begin(job,frozen));
        }catch(Exception error){main.post(()->fail(job,error));}
    }
    private boolean current(Job job){return !closed.get()&&!job.cancelled.get()&&active==job;}
    private void check(Job job){if(closed.get()||job.cancelled.get())throw new CancellationException("MEDIA_TASK_RETIRED");}
    private void begin(Job job,FrozenRenderPlan plan){
        if(!current(job))return;
        try{
            job.plan=plan;job.artifacts=new MediaArtifacts(new File(directory,job.id));job.pending=job.artifacts.begin(plan.preview()?"preview.mp4":"export.mp4",plan.key());
            job.transformer=NativeEncoder.create(context,new Transformer.Listener(){
                @Override public void onCompleted(Composition composition,ExportResult result){if(!current(job))return;worker.execute(()->verify(job,result));}
                @Override public void onError(Composition composition,ExportResult result,ExportException error){
                    // 只记录异常类型和代码位置，不写工程正文、素材路径或HTTP凭据。
                    StringBuilder trace=new StringBuilder("export code=").append(error.errorCode);
                    Throwable cause=error;for(int depth=0;cause!=null&&depth<4;depth++,cause=cause.getCause()){
                        trace.append('\n').append(cause.getClass().getName());int count=0;
                        for(StackTraceElement frame:cause.getStackTrace()){if(count++==10)break;trace.append("\n at ").append(frame);}
                    }
                    android.util.Log.w("CopyEditMedia",trace.toString());fail(job,error);
                }
            },SurfacePipeline.affectedEmulator(),plan.expectedFrames(),plan.preview());
            File black=new File(directory,"black.png");Composition composition=NativePlanComposition.create(plan,black);
            if(black.isFile()&&blackDigest==null)blackDigest=MediaArtifacts.digest(black);
            job.transformer.start(composition,job.pending.path().toString());
        }catch(Exception error){fail(job,error);}
    }
    private void verify(Job job,ExportResult result){
        try{
            check(job);if(result.videoFrameCount!=job.plan.expectedFrames())throw new IllegalArgumentException("OUTPUT_FRAME_COUNT");NativeOutputVerifier.verify(job.pending.path().toFile(),job.plan);check(job);
            // 再读宿主当前修订，旧工程完成事件不能发布成新修订的结果。
            JSONObject fresh=new JSONObject(source.loadPlan(job.project,job.revision,job.profile));if(!job.plan.planHash().equals(fresh.getString("planHash")))throw new IllegalStateException("PROJECT_REVISION_CHANGED");check(job);
            main.post(()->{if(!current(job))return;try{job.result=job.artifacts.commit(job.pending);job.pending=null;job.status="complete";ready.put(job.id,job.result);active=null;}catch(Exception error){fail(job,error);}});
        }catch(Exception error){main.post(()->fail(job,error));}
    }
    private void fail(Job job,Exception error){if(!current(job))return;cancel(job,"failed");String code=String.valueOf(error.getMessage());job.error=error instanceof IllegalArgumentException||error instanceof IllegalStateException||code.matches("[A-Z_]{3,80}")?code:error instanceof ExportException export?"MEDIA_EXPORT_"+export.errorCode+"_"+(export.getCause()==null?"UNKNOWN":export.getCause().getClass().getSimpleName()):"MEDIA_IO_FAILED_"+error.getClass().getSimpleName();}
    private void cancel(Job job,String status){
        job.cancelled.set(true);if(active==job)active=null;job.status=status;
        try{if(job.transformer!=null)job.transformer.cancel();if(job.pending!=null){job.artifacts.discard(job.pending);job.pending=null;}}catch(Exception error){cleanupFailed=true;job.status="failed";job.error="MEDIA_CLEANUP_FAILED";}
    }
    public JSONObject cancel(String id)throws Exception {mainThread();Job job=jobs.get(id);if(job!=null&&job.status.equals("running"))cancel(job,"cancelled");return job(id);}
    public void suspend(){mainThread();assetEpoch.incrementAndGet();if(active!=null)cancel(active,"cancelled");}
    public CompletableFuture<JSONObject> assetTask(String action,String id,int frame){
        mainThread();if(!enabled||closed.get()||cleanupFailed||active!=null||auxiliary>=2)throw new IllegalStateException("MEDIA_BUSY_OR_UNAVAILABLE");long epoch=assetEpoch.get();auxiliary++;
        CompletableFuture<JSONObject> result=new CompletableFuture<>();worker.execute(()->{try{java.util.function.BooleanSupplier cancelled=()->closed.get()||assetEpoch.get()!=epoch;result.complete(action.equals("import")?assetTasks.importAsset(id,cancelled):assetTasks.frame(id,frame,cancelled));}catch(Exception error){result.completeExceptionally(error);}finally{main.post(()->auxiliary--);}});return result;
    }
    public File image(String id){return closed.get()?null:assetTasks.image(id);}
    public JSONObject job(String id)throws Exception {mainThread();Job job=jobs.get(id);return job==null?new JSONObject().put("jobId",id).put("status","retired").put("executionLocation","android-local").put("error","任务已随页面或进程退出，未自动重试"):describe(job);}
    private JSONObject describe(Job job)throws JSONException {
        JSONObject out=new JSONObject().put("jobId",job.id).put("projectId",job.project).put("revision",job.revision).put("profile",job.profile).put("status",job.status).put("executionLocation","android-local").put("androidLocal",true);
        if(job.plan!=null)out.put("planHash",job.plan.planHash()).put("totalFrames",job.plan.expectedFrames());if(!job.error.isEmpty())out.put("error",job.error);
        if(job.result!=null)out.put("url","/__dsha_copy_edit__/"+job.id+"/result.mp4?native=1");return out;
    }
    public File result(String id){return closed.get()?null:ready.get(id);}
    public File previewResult(String id){mainThread();Job job=jobs.get(id);return job!=null&&job.profile.equals("preview")?result(id):null;}
    public double previewDuration(String id){mainThread();Job job=jobs.get(id);return previewResult(id)!=null&&job.plan!=null?job.plan.expectedFrames()/30d:0;}
    @Override public void close(){
        mainThread();if(closed.getAndSet(true))return;if(active!=null)cancel(active,"cancelled");ready.clear();List<Job> owned=List.copyOf(jobs.values());
        worker.execute(()->{try{
            for(Job job:owned)if(job.artifacts!=null)job.artifacts.clearOwned();assetTasks.close();
            Path black=new File(directory,"black.png").toPath();if(blackDigest!=null&&Files.isRegularFile(black,LinkOption.NOFOLLOW_LINKS)&&MediaArtifacts.digest(black.toFile()).equals(blackDigest))Files.delete(black);
            Files.deleteIfExists(directory.toPath());
        }catch(IOException ignored){/* 锁定或未知文件不强删；不影响其他页面与用户数据。 */}});worker.shutdown();
    }
}
