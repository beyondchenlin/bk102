package dsh.copyedit.spike;

import android.app.Activity;
import android.os.Bundle;
import android.util.Base64;
import androidx.test.runner.AndroidJUnitRunner;
import java.io.*;
import java.nio.file.*;

/** 仅测试APK的有界证据通道：同签名instrumentation，无root、存储广权或生产组件。 */
public final class EvidenceRunner extends AndroidJUnitRunner {
    private Bundle arguments;
    @Override public void onCreate(Bundle args){arguments=args;super.onCreate(args);}
    @Override public void onStart(){
        String input=arguments.getString("importFile"),output=arguments.getString("exportFile");
        if(input==null&&output==null){super.onStart();return;}
        Bundle result=new Bundle();
        try{
            if(input!=null){
                if(!input.matches("web-probe-auth\\.json|native-preview-harness\\.html|playback-harness\\.html|native-client\\.js"))throw new IOException("TEST_INPUT_NAME");
                String encoded=arguments.getString("inputBase64","");if(encoded.length()>1024*1024)throw new IOException("TEST_INPUT_LIMIT");
                byte[] bytes=Base64.decode(encoded,Base64.NO_WRAP);Files.write(new File(getTargetContext().getCacheDir(),input).toPath(),bytes);result.putInt("evidenceBytes",bytes.length);
            }else{
                if(!output.matches("(native-[a-z0-9-]+|web-[a-z0-9-]+|android-[a-z0-9-]+)\\.(json|png|mp4)|media-spike/(evidence\\.json|(?:export|preview)-(?:4|60)s\\.mp4|sticker\\.png|raw-surface\\.json)"))throw new IOException("TEST_EVIDENCE_NAME");
                File file=new File(getTargetContext().getFilesDir(),output);
                if(!Files.isRegularFile(file.toPath(),LinkOption.NOFOLLOW_LINKS)||file.length()>128L*1024*1024)throw new IOException("TEST_EVIDENCE_FILE");
                long size=file.length(),count=0;try(InputStream stream=new FileInputStream(file)){byte[] bytes=new byte[48*1024];int n;while((n=stream.read(bytes))!=-1){count+=n;if(count>size)throw new IOException("TEST_EVIDENCE_CHANGED");Bundle chunk=new Bundle();chunk.putString("evidenceChunk",Base64.encodeToString(bytes,0,n,Base64.NO_WRAP));sendStatus(0,chunk);}}
                if(count!=size)throw new IOException("TEST_EVIDENCE_CHANGED");result.putLong("evidenceBytes",count);
            }
            finish(Activity.RESULT_OK,result);
        }catch(Exception e){result.putString("evidenceError",e.getClass().getSimpleName());finish(Activity.RESULT_CANCELED,result);}
    }
}
