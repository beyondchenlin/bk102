package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.inputmethod.InputMethodManager;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.*;
import org.junit.Test;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** 真实WebView/软键盘与重开进程测试；只操作本任务的验收工程。 */
public class MobileWebTest {
    private String evidenceProfile;
    private void publishEvidence(String name,File file)throws Exception {
        if(evidenceProfile==null)return;
        assertTrue(file.length()>0&&file.length()<8L*1024*1024);
        try(java.io.InputStream stream=new java.io.FileInputStream(file)){
            byte[] bytes=new byte[24*1024];int n,index=0;
            while((n=stream.read(bytes))!=-1){
                android.os.Bundle status=new android.os.Bundle();status.putString("phoneEvidence",evidenceProfile+"/"+name);
                status.putInt("phoneChunkIndex",index++);status.putString("phoneChunk",android.util.Base64.encodeToString(bytes,0,n,android.util.Base64.NO_WRAP));
                InstrumentationRegistry.getInstrumentation().sendStatus(0,status);
            }
        }
    }
    private static final String PROJECT="project-82fd2b85de95e46f74eba680f41b5253";
    private static final String DRAFT="Android WebView 未保存草稿\n重开进程仍可恢复。";
    private static final String DIRECTORY="button[aria-label=\"打开目录\"],button[aria-label=\"Open directory\"]";
    private ActivityScenario<WebProbeActivity> evidenceScenario;
    private ActivityScenario<WebProbeActivity> open(){evidenceScenario=ActivityScenario.launch(new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),WebProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return evidenceScenario;}
    private String eval(ActivityScenario<WebProbeActivity> scenario,String expression)throws Exception {
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        scenario.onActivity(a->a.web.evaluateJavascript("JSON.stringify("+expression+")",result->{value.set(result);done.countDown();}));
        assertTrue("WebView JS timeout",done.await(10,TimeUnit.SECONDS));Object decoded=new JSONTokener(value.get()).nextValue();return decoded==JSONObject.NULL?"null":decoded.toString();
    }
    private void waitFor(ActivityScenario<WebProbeActivity> scenario,String expression)throws Exception {
        long until=SystemClock.elapsedRealtime()+30_000;String last="";
        while(SystemClock.elapsedRealtime()<until){last=eval(scenario,expression);if("true".equals(last))return;Thread.sleep(100);}
        AtomicReference<String> error=new AtomicReference<>();scenario.onActivity(a->error.set(a.lastConsoleError));throw new AssertionError("WebView condition failed: "+expression+"; result="+last+"; console="+error.get());
    }
    private void click(ActivityScenario<WebProbeActivity> scenario,String selector)throws Exception {waitFor(scenario,"!!document.querySelector("+JSONObject.quote(selector)+")");eval(scenario,"(()=>{document.querySelector("+JSONObject.quote(selector)+").click();return true})()");}
    private void showPanel(ActivityScenario<WebProbeActivity> scenario)throws Exception {
        waitFor(scenario,"!!document.querySelector("+JSONObject.quote(DIRECTORY)+")");click(scenario,DIRECTORY);click(scenario,"button[aria-label=\"文案剪辑\"]");waitFor(scenario,"!!document.querySelector('.dce')");waitFor(scenario,"getComputedStyle(document.querySelector('.dce')).transform==='none'");
    }
    private void seedRoute(ActivityScenario<WebProbeActivity> scenario)throws Exception {
        waitFor(scenario,"!!document.querySelector("+JSONObject.quote(DIRECTORY)+")");
        eval(scenario,"(()=>{fetch('/api/copyEdit/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'android-web-read',method:'copyEdit/workspace',payload:{args:{}}})}).then(r=>r.json()).then(b=>{const w=b.result.value;if(!w.projects.some(p=>p.projectId==='"+PROJECT+"'))throw Error('OWN_PROJECT_MISSING');sessionStorage.setItem('dsh-copy-edit.session.v1',JSON.stringify({format:1,scope:w.workspaceId,route:{page:'copy',projectId:'"+PROJECT+"'},trail:[{page:'home',projectId:null}],drafts:{},editors:{}}));window.__probeReady=true}).catch(()=>{window.__probeReady=false});return true})()");
        waitFor(scenario,"window.__probeReady===true");
    }
    private JSONObject metrics(ActivityScenario<WebProbeActivity> s)throws Exception {return new JSONObject(eval(s,"(()=>{const e=document.querySelector('.dce'),b=document.querySelector('.copy-text').getBoundingClientRect();return {width:innerWidth,height:innerHeight,viewportHeight:visualViewport.height,overflow:e.scrollWidth>e.clientWidth+1,bodyWidth:b.width,font:getComputedStyle(document.querySelector('.copy-text')).fontSize,text:document.querySelector('.copy-text').value,version:document.querySelector('.dce-copy-version').value,projectId:JSON.parse(sessionStorage.getItem('dsh-copy-edit.session.v1')).route.projectId}})()"));}
    private void save(String name,JSONObject value)throws Exception {
        File file=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),name);Files.write(file.toPath(),value.toString(2).getBytes(StandardCharsets.UTF_8));
        publishEvidence(name,file);
    }
    private void screenshot(String name)throws Exception {
        Thread.sleep(400);
        // DOM 已改变并不保证上一帧已提交；等 WebView 的真实绘制栅栏后取系统截图。
        if(evidenceProfile!=null){CountDownLatch painted=new CountDownLatch(1);evidenceScenario.onActivity(a->a.web.postVisualStateCallback(SystemClock.uptimeMillis(),new android.webkit.WebView.VisualStateCallback(){@Override public void onComplete(long id){painted.countDown();}}));assertTrue("截图绘制未完成",painted.await(10,TimeUnit.SECONDS));Thread.sleep(100);}
        android.graphics.Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("SCREENSHOT_FAILED",bitmap);
        File file=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),name);
        try(java.io.FileOutputStream stream=new java.io.FileOutputStream(file)){assertTrue(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,stream));}finally{bitmap.recycle();}
        publishEvidence(name,file);
    }
    @Test public void repeatedReadOnlyWorkbenchOpen()throws Exception{
        for(int i=0;i<8;i++)try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);showPanel(scenario);waitFor(scenario,"!!document.querySelector('.copy-text')");
            scenario.onActivity(a->{assertEquals(0,a.rendererExits);assertFalse(a.rendererFailed);});
        }
        save("web-repeated-open.json",new JSONObject().put("opens",8).put("rendererExits",0).put("readOnly",true));
    }
    @Test public void layoutAndDraft()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);showPanel(scenario);JSONObject initial=metrics(scenario);assertFalse(initial.getBoolean("overflow"));assertEquals(PROJECT,initial.getString("projectId"));
            screenshot("android-copy.png");
            eval(scenario,"(()=>{const e=document.querySelector('.copy-text');e.scrollIntoView({block:'center'});return true})()");
            JSONObject point=new JSONObject(eval(scenario,"(()=>{const b=document.querySelector('.copy-text').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+Math.min(30,b.height/2)}})()"));
            scenario.onActivity(a->{float scale=a.web.getScale(),x=(float)point.optDouble("x")*scale,y=(float)point.optDouble("y")*scale;long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+40,MotionEvent.ACTION_UP,x,y,0);try{a.web.dispatchTouchEvent(down);a.web.dispatchTouchEvent(up);((InputMethodManager)a.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(a.web,InputMethodManager.SHOW_IMPLICIT);}finally{down.recycle();up.recycle();}});
            waitFor(scenario,"document.activeElement===document.querySelector('.copy-text')");waitFor(scenario,"visualViewport.height<"+(initial.getDouble("viewportHeight")-80));
            JSONObject keyboard=metrics(scenario);assertFalse(keyboard.getBoolean("overflow"));
            screenshot("android-keyboard.png");
            eval(scenario,"(()=>{const e=document.querySelector('.copy-text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSONObject.quote(DRAFT)+");e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
            waitFor(scenario,"JSON.parse(sessionStorage.getItem('dsh-copy-edit.session.v1')).drafts['"+PROJECT+"'].text==="+JSONObject.quote(DRAFT));
            scenario.onActivity(a->{((InputMethodManager)a.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(a.web.getWindowToken(),0);a.web.getSettings().setTextZoom(130);});
            Thread.sleep(300);JSONObject large=metrics(scenario);assertFalse(large.getBoolean("overflow"));
            screenshot("android-textzoom130.png");
            save("web-layout.json",new JSONObject().put("initial",initial).put("keyboard",keyboard).put("textZoom130",large).put("userAgent",eval(scenario,"navigator.userAgent")));
            scenario.onActivity(a->android.webkit.CookieManager.getInstance().flush());
        }
    }
    @Test public void reopenedProcess()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            showPanel(scenario);JSONObject restored=metrics(scenario);assertEquals(PROJECT,restored.getString("projectId"));assertEquals(DRAFT,restored.getString("text"));assertEquals("draft",restored.getString("version"));save("web-reopen.json",restored);
        }
    }
    @Test public void editorAppearance()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);
            eval(scenario,"(()=>{const key='dsh-copy-edit.session.v1',s=JSON.parse(sessionStorage.getItem(key));s.route={page:'edit',projectId:'34974946-7ee4-47b6-b8f0-920cedfebabc'};sessionStorage.setItem(key,JSON.stringify(s));return true})()");
            showPanel(scenario);waitFor(scenario,"!!document.querySelector('.dce-editor')");Thread.sleep(1200);
            JSONObject layout=new JSONObject(eval(scenario,"(()=>{const root=document.querySelector('.dce'),rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}},clip=rect('.dce-clip'),footer=rect('.dce-mobile-tools');return {width:innerWidth,height:innerHeight,overflow:root.scrollWidth>root.clientWidth+1,header:rect('.dce-editor-topline'),preview:rect('.dce-preview-stage'),timeline:rect('.dce-timeline-body'),footer,mainTrackVisible:clip.y>=0&&clip.bottom<=footer.y,projectSelectorVisible:rect('select[aria-label=\"选择工程\"]').width>0}})()"));
            assertFalse("编辑页横向溢出",layout.getBoolean("overflow"));assertTrue("工程切换入口丢失",layout.getBoolean("projectSelectorVisible"));
            if(layout.getInt("height")>550)assertTrue("主轨不在首屏",layout.getBoolean("mainTrackVisible"));
            screenshot("android-editor.png");
            click(scenario,".dce-mobile-tools button:first-child");waitFor(scenario,"!!document.querySelector('[data-mobile-pane=library][data-open=true]')");screenshot("android-library.png");
            click(scenario,"button[aria-label=\"关闭素材库\"]");click(scenario,".dce-mobile-tools button[aria-label=\"属性与声音\"]");waitFor(scenario,"!!document.querySelector('[data-mobile-pane=properties][data-open=true]')");screenshot("android-properties.png");
            JSONObject drawer=new JSONObject(eval(scenario,"(()=>{const e=document.querySelector('[data-mobile-pane=properties]'),r=e.getBoundingClientRect();return {width:r.width,x:r.x,right:r.right,root:document.querySelector('.dce').clientWidth,overflow:e.scrollWidth>e.clientWidth+1}})()"));
            assertFalse("抽屉横向溢出",drawer.getBoolean("overflow"));assertEquals(drawer.getDouble("root"),drawer.getDouble("width"),1);
            save("web-editor.json",new JSONObject().put("layout",layout).put("drawer",drawer).put("configurationFontScale",InstrumentationRegistry.getInstrumentation().getTargetContext().getResources().getConfiguration().fontScale));
        }
    }
    @Test public void nativeWorkbenchPlayback()throws Exception {
        long began=System.currentTimeMillis();
        try(ActivityScenario<WebProbeActivity> s=open()){
            seedRoute(s);eval(s,"(()=>{const key='dsh-copy-edit.session.v1',m=JSON.parse(sessionStorage.getItem(key));m.route={page:'edit',projectId:'34974946-7ee4-47b6-b8f0-920cedfebabc'};sessionStorage.setItem(key,JSON.stringify(m));return true})()");
            showPanel(s);waitFor(s,"document.querySelectorAll('.dce-clip').length===2");click(s,".dce-play");
            long until=SystemClock.elapsedRealtime()+150000;boolean running=false;
            while(SystemClock.elapsedRealtime()<until){if("true".equals(eval(s,"document.querySelector('.dce-play')?.textContent==='暂停'"))){running=true;break;}String error=eval(s,"document.querySelector('.dce-error')?.textContent||''");assertEquals("",new JSONTokener(error).nextValue());Thread.sleep(150);}
            assertTrue("工作台原生播放未启动",running);
            assertEquals("网页不应重新下载成片交给HTML解码","false",eval(s,"document.querySelector('video[aria-label=\"工程连续预览\"]').hasAttribute('src')"));
            File cache=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"copy-edit-native");
            try(var paths=Files.walk(cache.toPath(),4)){
                var results=paths.filter(p->p.getFileName().toString().equals("preview.mp4")&&p.toFile().lastModified()>=began).toList();assertEquals(1,results.size());
                Files.copy(results.get(0),new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"native-workbench-preview.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            s.onActivity(a->assertTrue(a.web.getKeepScreenOn()));
            screenshot("android-native-playback.png");click(s,".dce-play");waitFor(s,"document.querySelector('.dce-play')?.textContent==='从此处预览'");
            Thread.sleep(300);double paused=Double.parseDouble(eval(s,"Number(document.querySelector('[aria-label=\"工程播放位置\"]').value)"));Thread.sleep(300);
            assertEquals(paused,Double.parseDouble(eval(s,"Number(document.querySelector('[aria-label=\"工程播放位置\"]').value)")),.0011);
            click(s,".dce-play");waitFor(s,"document.querySelector('.dce-play')?.textContent==='暂停'");screenshot("android-native-resume.png");click(s,".dce-play");
            save("web-native-workbench.json",new JSONObject().put("nativeSurface",true).put("htmlSourceAbsent",true).put("pausedPosition",paused).put("cacheResume",true).put("rendererExits",0));
            s.onActivity(a->assertEquals(0,a.rendererExits));
        }
    }
    @Test public void copyAppearance()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);showPanel(scenario);waitFor(scenario,"!!document.querySelector('.copy-text')");
            assertEquals("独立标题输入仍存在","false",eval(scenario,"!!document.querySelector('.copy-title,.dce-title-row,.dce-draft-recovery-menu,.dce-draft-recovery')"));
            String original=eval(scenario,"({text:document.querySelector('.copy-text').value})");
            try{
                String example=new JSONObject().put("text","慢一点，也没关系。\n\n把清晨留给阳光，把傍晚留给散步。\n认真吃饭，好好生活。").toString();
                setDraft(scenario,example);Thread.sleep(400);assertFalse("文案页横向溢出",metrics(scenario).getBoolean("overflow"));screenshot("android-copy-review.png");
                            click(scenario,"button[aria-label=\"配音设置\"]");waitFor(scenario,"document.querySelector('.dce-document').dataset.mobileTool==='voice'");screenshot("android-voice-review.png");
                save("web-copy-review.json",new JSONObject().put("configurationFontScale",InstrumentationRegistry.getInstrumentation().getTargetContext().getResources().getConfiguration().fontScale).put("metrics",metrics(scenario)).put("fixture","仅自制工程的未保存草稿，截图后恢复"));
            }finally{setDraft(scenario,original);}
        }
    }
    private void setDraft(ActivityScenario<WebProbeActivity> scenario,String json)throws Exception {
        eval(scenario,"(()=>{const d="+json+",e=document.querySelector('.copy-text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,d.text);e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
    }
    @Test public void titlelessDraftMenu()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);showPanel(scenario);waitFor(scenario,"!!document.querySelector('.copy-text')");
            assertEquals("旧标题或草稿行仍存在","false",eval(scenario,"!!document.querySelector('.copy-title,.dce-title-row,.dce-draft-recovery-menu,.dce-draft-recovery')"));
            String original=eval(scenario,"({text:document.querySelector('.copy-text').value})");
            try{
                setDraft(scenario,new JSONObject().put("text","慢一点，也没关系。\n\n把清晨留给阳光，把傍晚留给散步。\n认真吃饭，好好生活。").toString());
                waitFor(scenario,"document.querySelector('[data-project-id=\""+PROJECT+"\"] strong').textContent==='慢一点，也没关系。'");
                assertEquals("修改后的正文仍显示旧版本号","true",eval(scenario,"document.querySelector('.dce-copy-version').value==='draft'"));
                eval(scenario,"(()=>{const e=document.querySelector('.dce-copy-version');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
                waitFor(scenario,"document.querySelector('.copy-text').value==='手机验收草稿\\n保持自己的节奏。'");
                assertEquals("已保存版本被误标为草稿","true",eval(scenario,"document.querySelector('.dce-mobile-copy-meta span').textContent==='已保存版本'"));
                waitFor(scenario,"!!document.querySelector('.dce-copy-version option[value^=\"recover:\"]')");
                JSONObject candidate=new JSONObject(eval(scenario,"(()=>{for(const o of document.querySelectorAll('.dce-copy-version option[value^=\"recover:\"]')){const raw=JSON.parse(localStorage.getItem(o.value.slice(8))),text=(raw.draft||raw).text;if(text.startsWith('慢一点，也没关系。'))return {value:o.value,text}}throw Error('VERSION_SWITCH_LOST_DRAFT')})()"));
                eval(scenario,"(()=>{const e=document.querySelector('.dce-copy-version');e.value="+JSONObject.quote(candidate.getString("value"))+";e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
                waitFor(scenario,"document.querySelector('.copy-text').value==="+JSONObject.quote(candidate.getString("text")));
                assertEquals("原恢复副本被移除","true",eval(scenario,"localStorage.getItem("+JSONObject.quote(candidate.getString("value").substring(8))+")!==null"));
                JSONObject layout=new JSONObject(eval(scenario,"(()=>{const root=document.querySelector('.dce'),v=document.querySelector('.dce-copy-version').getBoundingClientRect();return {width:innerWidth,height:innerHeight,overflow:root.scrollWidth>root.clientWidth+1,versionWidth:v.width,groups:[...document.querySelectorAll('.dce-copy-version optgroup')].map(e=>e.label),recovered:true}})()"));
                assertFalse("正文横向溢出",layout.getBoolean("overflow"));assertTrue("版本菜单被草稿名称撑宽",layout.getDouble("versionWidth")<=72);
                save("web-titleless.json",layout);
            }finally{setDraft(scenario,original);}
        }
    }
    /** 同一独立模拟器按两种手机尺寸运行，截图对应真实 WebView，工程只读。 */
    private void tapNearTop(ActivityScenario<WebProbeActivity> scenario,String selector)throws Exception {
        JSONObject point=new JSONObject(eval(scenario,"(()=>{const r=document.querySelector("+JSONObject.quote(selector)+").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+3,width:innerWidth}})()"));
        scenario.onActivity(a->{try{float scale=(float)(a.web.getWidth()/point.getDouble("width")),x=(float)point.getDouble("x")*scale,y=(float)point.getDouble("y")*scale;long now=SystemClock.uptimeMillis();MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(now,now+60,MotionEvent.ACTION_UP,x,y,0);try{a.web.dispatchTouchEvent(down);a.web.dispatchTouchEvent(up);}finally{down.recycle();up.recycle();}}catch(JSONException e){throw new AssertionError(e);}});
    }
    @Test public void phoneLayout()throws Exception {
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            seedRoute(scenario);
            eval(scenario,"(()=>{const key='dsh-copy-edit.session.v1',s=JSON.parse(sessionStorage.getItem(key));s.route={page:'home',projectId:null};s.trail=[];s.home={query:'手机验收草稿',scrollTop:0};sessionStorage.setItem(key,JSON.stringify(s));localStorage.setItem('dsh-copy-edit.home.views.v1',JSON.stringify({copy:'cards',edit:'cards'}));return true})()");
            showPanel(scenario);waitFor(scenario,"!!document.querySelector('.dce-home-create-short')");
            JSONObject home=phoneHomeMetrics(scenario);assertTrue("首页操作未在同一行或发生溢出",home.getBoolean("fits"));
            assertEquals("新建视觉权重仍高于两个主要分区","true",eval(scenario,"(()=>{const titles=[...document.querySelectorAll('.dce-home-section-heading h2')],actions=[...document.querySelectorAll('.dce-home-create')];return titles.every(e=>getComputedStyle(e).fontSize==='16px'&&Number(getComputedStyle(e).fontWeight)>=600)&&actions.every(e=>{const s=getComputedStyle(e),i=e.querySelector('svg').getBoundingClientRect();return s.fontSize==='13px'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&Math.abs(i.width-18)<.1&&Math.abs(i.height-18)<.1})})()"));
            screenshot("android-home.png");
            tapNearTop(scenario,"button[aria-label=\"文案列表视图\"]");waitFor(scenario,"document.querySelector('[data-kind=copy]').dataset.view==='list'");
            tapNearTop(scenario,"button[aria-label=\"文案卡片视图\"]");waitFor(scenario,"document.querySelector('[data-kind=copy]').dataset.view==='cards'");
            assertEquals("选中按钮底色仍覆盖整个点击范围","true",eval(scenario,"getComputedStyle(document.querySelector('[aria-label=\"文案卡片视图\"]')).backgroundClip==='padding-box'"));
            click(scenario,"button[aria-label=\"多选文案\"]");waitFor(scenario,"!!document.querySelector('.dce-home-bulk')");
            click(scenario,"button[aria-label=\"取消文案多选\"]");waitFor(scenario,"!document.querySelector('.dce-home-bulk')");
            click(scenario,"button[aria-label=\"管理文案分类\"]");waitFor(scenario,"!!document.querySelector('.dce-category-dialog[open]')");screenshot("android-categories.png");click(scenario,".dce-category-dialog-heading button");
            scenario.onActivity(a->a.web.getSettings().setTextZoom(130));Thread.sleep(200);
            JSONObject enlargedHome=phoneHomeMetrics(scenario);assertTrue("130% 文字下首页操作溢出",enlargedHome.getBoolean("fits"));
            scenario.onActivity(a->a.web.getSettings().setTextZoom(100));Thread.sleep(200);
            click(scenario,"[data-kind=copy] .dce-home-open");waitFor(scenario,"!!document.querySelector('.copy-text')");
            JSONObject copy=phoneCopyMetrics(scenario);screenshot("android-copy.png");assertTrue("文案控件溢出或过大: "+copy,copy.getBoolean("fits"));
            double beforeKeyboard=Double.parseDouble(eval(scenario,"visualViewport.height"));
            tapNearTop(scenario,".copy-text");scenario.onActivity(a->((InputMethodManager)a.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(a.web,InputMethodManager.SHOW_IMPLICIT));
            waitFor(scenario,"visualViewport.height<"+(beforeKeyboard-80));
            assertEquals("键盘弹出时底部操作未隐藏","true",eval(scenario,"document.querySelector('.dce-copy-next').getBoundingClientRect().height===0"));screenshot("android-keyboard.png");
            scenario.onActivity(a->((InputMethodManager)a.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(a.web.getWindowToken(),0));eval(scenario,"(()=>{document.activeElement.blur();return true})()");waitFor(scenario,"visualViewport.height>="+(beforeKeyboard-1));
            click(scenario,"button[aria-label=\"配音设置\"]");waitFor(scenario,"document.querySelector('.dce-document').dataset.mobileTool==='voice'");screenshot("android-copy-voice.png");
            assertEquals("配音内容未紧跟配音入口","true",eval(scenario,"(()=>{const e=document.querySelector('[data-tool=voice]'),v=document.querySelector('.dce-copy-voice'),m=document.querySelector('[data-tool=music]');return e.nextElementSibling===v&&v.getBoundingClientRect().bottom<=m.getBoundingClientRect().top+1})()"));
            click(scenario,"button[aria-label=\"配音设置\"]");
            click(scenario,"button[aria-label=\"背景音乐设置\"]");waitFor(scenario,"document.querySelector('.dce-document').dataset.mobileTool==='music'");screenshot("android-copy-music.png");click(scenario,"button[aria-label=\"背景音乐设置\"]");
            click(scenario,"button[aria-label=\"画面与贴片设置\"]");waitFor(scenario,"document.querySelector('.dce-document').dataset.mobileTool==='composition'");
            assertEquals("展开预览挤走操作或改变画幅","true",eval(scenario,"(()=>{const r=document.querySelector('.dce-composition-stage').getBoundingClientRect();return r.height<=280.1&&Math.abs(r.width/r.height-9/16)<.01})()"));
            screenshot("android-composition.png");click(scenario,"button[aria-label=\"画面与贴片设置\"]");
            scenario.onActivity(a->a.web.getSettings().setTextZoom(130));Thread.sleep(200);
            JSONObject enlargedCopy=phoneCopyMetrics(scenario);assertTrue("130% 文字下文案页溢出",enlargedCopy.getBoolean("fits"));
            scenario.onActivity(a->a.web.getSettings().setTextZoom(100));Thread.sleep(200);
            click(scenario,"button[aria-label=\"返回上一级\"]");waitFor(scenario,"!!document.querySelector('.dce-home')");
            click(scenario,"[data-kind=edit] .dce-home-open");waitFor(scenario,"!!document.querySelector('.dce-editor')");
            JSONObject empty=phoneEditorMetrics(scenario);assertPhoneEditor(empty);screenshot("android-editor-empty.png");
            eval(scenario,"(()=>{const e=document.querySelector('select[aria-label=\"选择工程\"]');e.value='34974946-7ee4-47b6-b8f0-920cedfebabc';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
            waitFor(scenario,"document.querySelectorAll('.dce-clip').length===2");
            waitFor(scenario,"!!document.querySelector('.dce-source-frame')");
            waitFor(scenario,"(()=>{const i=document.querySelector('.dce-source-frame');return !!i&&i.complete&&i.naturalWidth>0})()");
            JSONObject editor=phoneEditorMetrics(scenario);assertPhoneEditor(editor);screenshot("android-editor.png");
            tapNearTop(scenario,".dce-mobile-tools button[aria-label=\"素材\"]");waitFor(scenario,"!!document.querySelector('[data-mobile-pane=library][data-open=true]')");
            assertEquals("手机素材卡片仍有重复操作","true",eval(scenario,"[...document.querySelectorAll('.dce-media-desktop-actions')].every(e=>e.getBoundingClientRect().height===0)"));
            assertEquals("素材底部操作栏不可见","true",eval(scenario,"(()=>{const b=document.querySelector('.dce-library-selection').getBoundingClientRect();return b.height>=48&&b.bottom<=innerHeight+1&&b.top>0&&document.elementFromPoint(b.x+8,b.y+8)?.closest('.dce-library-selection')!==null})()"));
            tapNearTop(scenario,".dce-media-choice");waitFor(scenario,"!!document.querySelector('.dce-media-choice[aria-pressed=true]')");
            assertEquals("选择素材未启用上下文操作","true",eval(scenario,"[...document.querySelectorAll('.dce-library-selection button')].every(e=>!e.disabled)"));screenshot("android-library.png");
            tapNearTop(scenario,"button[aria-label=\"关闭素材库\"]");
            tapNearTop(scenario,".dce-mobile-tools button[aria-label=\"属性与声音\"]");waitFor(scenario,"!!document.querySelector('[data-mobile-pane=properties][data-open=true]')");screenshot("android-properties.png");
            assertEquals("首末帧标签不应竖排","true",eval(scenario,"[...document.querySelectorAll('.dce-trim-fields .dce-field>span')].every(e=>getComputedStyle(e).whiteSpace==='nowrap'&&e.getBoundingClientRect().height<30)"));
            assertEquals("首末帧未并排","true",eval(scenario,"(()=>{const a=document.querySelector('[aria-label=\"首帧\"]').getBoundingClientRect(),b=document.querySelector('[aria-label=\"末帧\"]').getBoundingClientRect();return Math.abs(a.y-b.y)<1&&a.right<b.x})()"));
            tapNearTop(scenario,"button[aria-label=\"关闭属性与声音\"]");
            tapNearTop(scenario,"button[aria-label=\"更多剪辑操作\"]");waitFor(scenario,"!!document.querySelector('.dce-editor-more-panel')");screenshot("android-editor-more.png");
            assertEquals("更多遗漏已有功能","true",eval(scenario,"['调序','设为首帧','设为末帧','添加文字'].every(label=>[...document.querySelectorAll('.dce-editor-more-panel button')].some(b=>b.textContent===label))"));tapNearTop(scenario,"button[aria-label=\"更多剪辑操作\"]");
            scenario.onActivity(a->a.web.getSettings().setTextZoom(130));Thread.sleep(200);
            JSONObject enlargedEditor=phoneEditorMetrics(scenario);assertPhoneEditor(enlargedEditor);
            scenario.onActivity(a->a.web.getSettings().setTextZoom(100));Thread.sleep(200);
            tapNearTop(scenario,"button[aria-label=\"更多剪辑操作\"]");
            waitFor(scenario,"!!document.querySelector('.dce-editor-more-panel')");
            eval(scenario,"(()=>{[...document.querySelectorAll('.dce-editor-more-panel button')].find(b=>b.textContent==='添加文字').click();return true})()");
            waitFor(scenario,"!!document.querySelector('[data-mobile-pane=properties][data-open=true] .dce-sticker-properties[open]')");
            tapNearTop(scenario,"button[aria-label=\"关闭属性与声音\"]");click(scenario,".dce-clip-body");
            tapNearTop(scenario,"button[aria-label=\"导出 1080P\"]");waitFor(scenario,"!!document.querySelector('.dce-pending progress')");screenshot("android-export-progress.png");
            long exportUntil=SystemClock.elapsedRealtime()+150000;boolean exported=false;
            while(SystemClock.elapsedRealtime()<exportUntil){if("true".equals(eval(scenario,"!!document.querySelector('button[aria-label=\"分享或保存成片\"]:not(:disabled)')"))){exported=true;break;}assertEquals("导出失败","true",eval(scenario,"!(document.querySelector('.dce-error')?.textContent)"));Thread.sleep(200);}
            assertTrue("原生导出未完成",exported);screenshot("android-export-complete.png");scenario.onActivity(a->{assertEquals(0,a.rendererExits);assertFalse(a.rendererFailed);});
            save("web-phone-layout.json",new JSONObject().put("profile",evidenceProfile!=null?evidenceProfile:InstrumentationRegistry.getArguments().getString("phoneProfile","unknown")).put("home",home).put("home130",enlargedHome).put("copy",copy).put("copy130",enlargedCopy).put("emptyEditor",empty).put("editor",editor).put("editor130",enlargedEditor));
        }
    }
    /** 两种尺寸在同一测试会话取证，避免模拟器退出测试后再启动证据导出进程。 */
    @Test public void twoPhoneLayouts()throws Exception {
        try{
            for(String[] profile:new String[][]{{"narrow","1080x2400","480"},{"large","1440x3200","560"}}){
                evidenceProfile=profile[0];testDisplay("size "+profile[1]);testDisplay("density "+profile[2]);Thread.sleep(400);phoneLayout();
            }
        }finally{evidenceProfile=null;testDisplay("size reset");testDisplay("density reset");}
    }
    private void testDisplay(String option)throws Exception {
        assertTrue(option.matches("size (1080x2400|1440x3200|reset)|density (480|560|reset)"));
        try(android.os.ParcelFileDescriptor descriptor=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("wm "+option);
            java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor)){
            assertEquals("显示配置命令不应返回错误输出",-1,input.read());
        }
    }
    @Test public void splitSelectedTracks()throws Exception {
        try(ActivityScenario<WebProbeActivity> s=open()){
            seedRoute(s);eval(s,"(()=>{const key='dsh-copy-edit.session.v1',m=JSON.parse(sessionStorage.getItem(key));m.route={page:'edit',projectId:'ui-track-split-20261109'};sessionStorage.setItem(key,JSON.stringify(m));return true})()");showPanel(s);
            for(String selector:new String[]{".dce-audio-clip.bgm",".dce-audio-clip.voice",".dce-sticker-body"}){
                click(s,selector);eval(s,"(()=>{const e=document.querySelector('[aria-label=\"工程播放位置\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,37/30);e.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
                waitFor(s,"Math.abs(Number(document.querySelector('[aria-label=\"工程播放位置\"]').value)-37/30)<.001");
                eval(s,"(()=>{[...document.querySelectorAll('.dce-timeline-tools button')].find(b=>b.textContent==='分割').click();return true})()");
                waitFor(s,"document.querySelectorAll("+JSONObject.quote(selector)+").length===2");
                eval(s,"(()=>{[...document.querySelectorAll('.dce-timeline-tools button')].find(b=>b.textContent==='撤销').click();return true})()");waitFor(s,"document.querySelectorAll("+JSONObject.quote(selector)+").length===1");
                eval(s,"(()=>{[...document.querySelectorAll('.dce-timeline-tools button')].find(b=>b.textContent==='重做').click();return true})()");waitFor(s,"document.querySelectorAll("+JSONObject.quote(selector)+").length===2");
            }
            screenshot("android-split-tracks.png");save("web-track-split.json",new JSONObject(eval(s,"(()=>({projectId:JSON.parse(sessionStorage.getItem('dsh-copy-edit.session.v1')).route.projectId,music:document.querySelectorAll('.dce-audio-clip.bgm').length,voices:document.querySelectorAll('.dce-audio-clip.voice').length,stickers:document.querySelectorAll('.dce-sticker-body').length,error:document.querySelector('.dce-error')?.textContent||''}))()")));
        }
    }
    private JSONObject phoneHomeMetrics(ActivityScenario<WebProbeActivity> scenario)throws Exception {
        return new JSONObject(eval(scenario,"(()=>{const root=document.querySelector('.dce'),sections=[...document.querySelectorAll('.dce-home-section')].map(e=>{const h=e.querySelector('h2').getBoundingClientRect(),buttons=[...e.querySelectorAll('.dce-home-create,.dce-home-select-mode,.dce-home-view-switch button')].map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,center:b.y+b.height/2,right:b.right}});const categories=[...e.querySelectorAll('.dce-home-categories button')].map(n=>{const b=n.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(n);const lines=[...range.getClientRects()];return {text:n.textContent,x:b.x,y:b.y,right:b.right,height:b.height,clipped:n.scrollWidth>n.clientWidth+1||lines.some(r=>r.left<b.left-1||r.right>b.right+1)}}),cards=[...e.querySelectorAll('.dce-home-item')].map(n=>({height:n.getBoundingClientRect().height}));return {headingCenter:h.y+h.height/2,buttons,categories,cards,fits:buttons.every(b=>Math.abs(b.center-h.y-h.height/2)<2&&b.x>=0&&b.right<=innerWidth+1&&b.height>=48)&&categories.every(b=>!b.clipped&&b.x>=0&&b.right<=innerWidth+1&&b.height>=48)}});return {width:innerWidth,height:innerHeight,sections,fits:root.scrollWidth<=root.clientWidth+1&&sections.every(s=>s.fits)}})()"));
    }
    private JSONObject phoneCopyMetrics(ActivityScenario<WebProbeActivity> scenario)throws Exception {
        return new JSONObject(eval(scenario,"(()=>{const root=document.querySelector('.dce'),r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right}},header=r('.dce-header'),footer=r('.dce-copy-next'),next=r('.dce-copy-next button'),buttons=[...document.querySelectorAll('.dce-copy-tools button,.dce-copy-tool-entry,.dce-copy-version')].filter(n=>n.getBoundingClientRect().width).map(n=>{const b=n.getBoundingClientRect();return {text:n.textContent.trim(),height:b.height,right:b.right,x:b.x,font:getComputedStyle(n).fontSize}});return {width:innerWidth,header,footer,next,buttons,fits:root.scrollWidth<=root.clientWidth+1&&header.height<=49&&footer.height<=49&&next.width<innerWidth*.6&&buttons.every(b=>b.x>=0&&b.right<=innerWidth+1&&b.height>=48&&b.height<=49)}})()"));
    }
    private JSONObject phoneEditorMetrics(ActivityScenario<WebProbeActivity> scenario)throws Exception {
        return new JSONObject(eval(scenario,"(()=>{const r=s=>{const b=(typeof s==='string'?document.querySelector(s):s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,right:b.right}},footer=r('.dce-mobile-tools'),bgm=r([...document.querySelectorAll('.dce-lane')].at(-1)),labels=[...document.querySelectorAll('.dce-ruler>span')].filter(e=>getComputedStyle(e).display!=='none').map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,text:e.textContent}});return {width:innerWidth,height:innerHeight,preview:r('.dce-preview-stage'),timeline:r('.dce-timeline'),footer,bgm,bottomGap:footer.y-bgm.bottom,labels,labelsOverlap:labels.some((b,i)=>i>0&&b.left<labels[i-1].right),overflow:document.querySelector('.dce').scrollWidth>innerWidth+1}})()"));
    }
    private void assertPhoneEditor(JSONObject metrics)throws Exception {
        assertFalse("编辑器横向溢出",metrics.getBoolean("overflow"));assertFalse("时间刻度重叠",metrics.getBoolean("labelsOverlap"));
        assertTrue("BGM 下方仍有多余空白",metrics.getDouble("bottomGap")<=12);assertTrue("轨道被底部导航遮挡",metrics.getDouble("bottomGap")>=0);
        assertTrue("预览未利用剩余空间",metrics.getJSONObject("preview").getDouble("height")>230);
        assertTrue("底部工具栏未收紧",metrics.getJSONObject("footer").getDouble("height")<=49);
    }
    @Test public void compatibilityCapabilities()throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        try(ActivityScenario<WebProbeActivity> scenario=open()){
            // 单独记录现有内核能力；不把测试页当完整工作台已加载。
            Thread.sleep(1200);
            String compat=new String(Files.readAllBytes(new File(context.getCacheDir(),"web-compat-probe.js").toPath()),StandardCharsets.UTF_8);
            String client=new String(Files.readAllBytes(new File(context.getCacheDir(),"copy-edit-client-probe.js").toPath()),StandardCharsets.UTF_8);
            eval(scenario,"(()=>{"+compat+";return true})()");
            JSONObject result=new JSONObject(eval(scenario,"(()=>{const parse=s=>{try{new Function(s);return true}catch(e){return e.name+': '+e.message}};return {userAgent:navigator.userAgent,logicalAssignment:parse('let a;a??=1'),staticBlock:parse('class A { static {} }'),weakRef:typeof WeakRef,abortTimeout:typeof AbortSignal.timeout,randomUUID:typeof crypto.randomUUID,pluginParse:parse("+JSONObject.quote(client)+")}})()"));
            assertEquals(true,result.get("pluginParse"));assertEquals("function",result.getString("abortTimeout"));assertEquals("function",result.getString("randomUUID"));
            save("web-compatibility.json",result);
        }
    }
}
