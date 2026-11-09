package dsh.copyedit.spike;

import com.deepseekharness.media.*;

import android.graphics.SurfaceTexture;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.opengl.*;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.view.Surface;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.concurrent.atomic.AtomicInteger;

/** 不经 Media3 的 Surface 投递对照；只使用 Android EGL / MediaCodec。 */
final class RawSurfaceProbe {
    static JSONObject run(File file,int batch) throws Exception {
        HandlerThread callbacks=new HandlerThread("spike-raw-surface");callbacks.start();
        EGLDisplay display=EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);int[] version=new int[2];
        if(!EGL14.eglInitialize(display,version,0,version,1))throw new IllegalStateException("EGL_INIT");
        EGLConfig[] configs=new EGLConfig[1];int[] count=new int[1];
        EGL14.eglChooseConfig(display,new int[]{EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT,EGL14.EGL_SURFACE_TYPE,EGL14.EGL_PBUFFER_BIT,EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,EGL14.EGL_NONE},0,configs,0,1,count,0);
        EGLContext gl=EGL14.eglCreateContext(display,configs[0],EGL14.EGL_NO_CONTEXT,new int[]{EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE},0);
        EGLSurface pbuffer=EGL14.eglCreatePbufferSurface(display,configs[0],new int[]{EGL14.EGL_WIDTH,1,EGL14.EGL_HEIGHT,1,EGL14.EGL_NONE},0);
        EGL14.eglMakeCurrent(display,pbuffer,pbuffer,gl);int[] textures=new int[1];GLES20.glGenTextures(1,textures,0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,textures[0]);
        SurfaceTexture texture=new SurfaceTexture(textures[0]);Surface surface=new Surface(texture);
        AtomicInteger available=new AtomicInteger();texture.setOnFrameAvailableListener(t->available.incrementAndGet(),new Handler(callbacks.getLooper()));
        MediaExtractor extractor=new MediaExtractor();MediaCodec codec=null;JSONArray timestamps=new JSONArray();int rendered=0,consumed=0,pending=0;
        try {
            extractor.setDataSource(file.getAbsolutePath());int track=-1;
            for(int i=0;i<extractor.getTrackCount();i++)if(extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME).startsWith("video/")){track=i;break;}
            extractor.selectTrack(track);MediaFormat format=extractor.getTrackFormat(track);format.setInteger(MediaFormat.KEY_ALLOW_FRAME_DROP,0);
            codec=MediaCodec.createDecoderByType("video/avc");String name=codec.getName();codec.configure(format,surface,null,0);codec.start();
            boolean inputEnded=false,done=false;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();long deadline=SystemClock.elapsedRealtime()+30_000;
            while(!done && SystemClock.elapsedRealtime()<deadline) {
                if(!inputEnded){int in=codec.dequeueInputBuffer(0);if(in>=0){int size=extractor.readSampleData(codec.getInputBuffer(in),0);if(size<0){codec.queueInputBuffer(in,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputEnded=true;}else{codec.queueInputBuffer(in,0,size,extractor.getSampleTime(),0);extractor.advance();}}}
                int out=codec.dequeueOutputBuffer(info,1000);
                if(out>=0){
                    long pts=info.presentationTimeUs;boolean selected=info.size>0&&pts>=566666&&pts<2566666;
                    if(selected){codec.releaseOutputBuffer(out,pts*1000);rendered++;pending++;}else codec.releaseOutputBuffer(out,false);
                    done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;
                }
                if(pending>=batch || (done&&pending>0)) {
                    // 模拟消费者暂时繁忙；批量模式与单帧模式只改变准入量。
                    Thread.sleep(30);long wait=SystemClock.elapsedRealtime()+150;
                    while(consumed<rendered && SystemClock.elapsedRealtime()<wait){
                        if(available.get()>consumed){texture.updateTexImage();timestamps.put(texture.getTimestamp()/1000);consumed++;}else Thread.sleep(1);
                    }
                    pending=0;
                }
            }
            if(!done)throw new IllegalStateException("RAW_SURFACE_TIMEOUT");
            return new JSONObject().put("batch",batch).put("codec",name).put("allowFrameDrop",0).put("rendered",rendered).put("callbacks",available.get()).put("receivedPtsUs",timestamps);
        } finally {
            if(codec!=null){try{codec.stop();}finally{codec.release();}}extractor.release();surface.release();texture.release();
            GLES20.glDeleteTextures(1,textures,0);EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT);EGL14.eglDestroySurface(display,pbuffer);EGL14.eglDestroyContext(display,gl);EGL14.eglTerminate(display);callbacks.quitSafely();callbacks.join(2000);
        }
    }
}
