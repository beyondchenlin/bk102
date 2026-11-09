package dsh.copyedit.spike;

import android.content.Context;
import androidx.media3.exoplayer.audio.*;
import org.json.*;
import java.lang.reflect.*;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;

/** 仅实验诊断：默认透传；naturalDrain为根因对照原型，正式验收走共享NativePreviewAudio。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class AudioClockTrace {
    private final JSONArray events=new JSONArray();
    private long lastSampleNs;private int outputId;
    private synchronized void event(String name,int id,long position){
        long now=System.nanoTime();if(name.equals("position")&&now-lastSampleNs<10_000_000)return;
        if(name.equals("position"))lastSampleNs=now;
        if(events.length()>=5000)return;
        try{events.put(new JSONObject().put("name",name).put("output",id).put("timeNs",now).put("positionUs",position));}catch(JSONException e){throw new IllegalStateException(e);}
    }
    AudioOutputProvider provider(Context context,boolean naturalDrain){
        AudioOutputProvider delegate=new AudioTrackAudioOutputProvider.Builder(context).build();
        return (AudioOutputProvider)Proxy.newProxyInstance(AudioOutputProvider.class.getClassLoader(),new Class<?>[]{AudioOutputProvider.class},(proxy,method,args)->{
            Object value=invoke(method,delegate,args);
            return method.getName().equals("getAudioOutput")?wrap((AudioOutput)value,++outputId,(AudioOutputProvider.OutputConfig)args[0],naturalDrain):value;
        });
    }
    private AudioOutput wrap(AudioOutput delegate,int id,AudioOutputProvider.OutputConfig config,boolean naturalDrain){
        int frameBytes=androidx.media3.common.util.Util.isEncodingLinearPcm(config.encoding)?androidx.media3.common.util.Util.getPcmFrameSize(config.encoding,Integer.bitCount(config.channelMask)):0;
        long[] written={0};boolean[] draining={false},drained={false};
        return (AudioOutput)Proxy.newProxyInstance(AudioOutput.class.getClassLoader(),new Class<?>[]{AudioOutput.class},(proxy,method,args)->{
            String name=method.getName();
            if(naturalDrain&&frameBytes>0&&!delegate.isOffloadedPlayback()){
                if(name.equals("flush")){written[0]=0;draining[0]=false;drained[0]=false;}
                if(name.equals("stop")){draining[0]=true;event("defer-stop",id,delegate.getPositionUs());return null;}
                if(name.equals("write")){
                    java.nio.ByteBuffer buffer=(java.nio.ByteBuffer)args[0];int before=buffer.position();Object result=invoke(method,delegate,args);written[0]+=buffer.position()-before;return result;
                }
                if(name.equals("getPositionUs")){
                    long end=androidx.media3.common.util.Util.sampleCountToDurationUs(written[0]/frameBytes,config.sampleRate);
                    long position=drained[0]?end:delegate.getPositionUs();
                    if(draining[0]&&!drained[0]&&position>=end){event("drained-stop",id,position);delegate.stop();drained[0]=true;position=end;}
                    event("position",id,position);return position;
                }
            }
            if(name.equals("stop"))event("before-stop",id,delegate.getPositionUs());
            Object value=invoke(method,delegate,args);
            if(name.equals("getPositionUs"))event("position",id,(Long)value);
            else if(name.equals("play")||name.equals("pause")||name.equals("stop"))event(name,id,delegate.getPositionUs());
            return value;
        });
    }
    private static Object invoke(Method method,Object target,Object[] args)throws Throwable{
        try{return method.invoke(target,args);}catch(InvocationTargetException e){throw e.getCause();}
    }
    synchronized void save(File file){try{Files.write(file.toPath(),events.toString(2).getBytes(StandardCharsets.UTF_8));}catch(Exception e){throw new IllegalStateException(e);}}
}
