package dsh.copyedit.spike;

import android.content.Intent;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

public class PlaybackProbeTest {
  @Test public void sameProxyAudioAndQueueControls()throws Exception {
    var context=InstrumentationRegistry.getInstrumentation().getTargetContext();String sha=InstrumentationRegistry.getArguments().getString("proxySha");assertNotNull(sha);
    // ABCA/CBAB顺序使重复基线分散；每次仅一个播放器，全部使用相同字节。
    String[] cases={"audio-async","silent-async","audio-sync","audio-async","audio-sync","silent-async","audio-async","silent-async"};
    for(int n=0;n<cases.length;n++){
      String name=cases[n];Intent intent=new Intent(context,PlaybackProbeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("disableAudio",name.startsWith("silent")).putExtra("async",!name.endsWith("-sync")).putExtra("sha256",sha).putExtra("output","playback-probe-"+n+"-"+name+".json");
      try(ActivityScenario<PlaybackProbeActivity> s=ActivityScenario.launch(intent)){AtomicBoolean ended=new AtomicBoolean();long deadline=SystemClock.elapsedRealtime()+20_000;while(!ended.get()&&SystemClock.elapsedRealtime()<deadline){s.onActivity(a->ended.set(a.ended));Thread.sleep(100);}AtomicReference<String> error=new AtomicReference<>();s.onActivity(a->error.set(a.failure));assertTrue(name+" did not end",ended.get());assertEquals(name,"",error.get());}
      Thread.sleep(300);
    }
  }
}
