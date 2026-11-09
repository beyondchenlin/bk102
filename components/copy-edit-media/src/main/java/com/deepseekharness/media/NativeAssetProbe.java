package com.deepseekharness.media;
import android.graphics.BitmapFactory;
import android.media.*;
import org.json.*;
import java.io.*;

/** 实际Android解复用索引；不调用FFmpeg、不信任文件扩展名。 */
public final class NativeAssetProbe {
  private NativeAssetProbe(){}
  public static JSONObject inspect(File file,String sha)throws Exception{
    byte[] header=new byte[12];try(InputStream in=new FileInputStream(file)){int n=in.read(header);if(n<8)throw new IllegalArgumentException("ASSET_EMPTY");}
    if(header[0]==(byte)137&&header[1]==80&&header[2]==78&&header[3]==71){BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(file.toString(),o);if(o.outWidth!=1080||o.outHeight!=400)throw new IllegalArgumentException("STICKER_FORMAT_UNSUPPORTED");return new JSONObject().put("sha256",sha).put("kind","image").put("width",1080).put("height",400).put("mime","image/png");}
    MediaExtractor e=new MediaExtractor();try{e.setDataSource(file.toString());MediaFormat selected=null;String kind=null;
      for(int i=0;i<e.getTrackCount();i++){MediaFormat f=e.getTrackFormat(i);String mime=f.getString(MediaFormat.KEY_MIME);if(mime.startsWith("video/")){selected=f;kind="video";break;}if(selected==null&&mime.startsWith("audio/")){selected=f;kind="audio";}}
      if(selected==null)throw new IllegalArgumentException("MEDIA_FORMAT_UNSUPPORTED");long duration=selected.getLong(MediaFormat.KEY_DURATION);if(duration<1||duration>600000000)throw new IllegalArgumentException("SOURCE_DURATION_LIMIT");
      JSONObject result=new JSONObject().put("sha256",sha).put("kind",kind);
      if(kind.equals("audio")){String mime=header[0]=='R'&&header[1]=='I'&&header[2]=='F'&&header[3]=='F'?"audio/wav":header[4]=='f'&&header[5]=='t'&&header[6]=='y'&&header[7]=='p'?"audio/mp4":"audio/mpeg";return result.put("durationUs",duration).put("mime",mime);}
      int width=selected.getInteger(MediaFormat.KEY_WIDTH),height=selected.getInteger(MediaFormat.KEY_HEIGHT);if(width<1||height<1||width>4096||height>4096)throw new IllegalArgumentException("SOURCE_DIMENSIONS_LIMIT");JSONArray pts=new JSONArray();for(long p:ExactFrames.index(file)){if(p<0||p>=duration)throw new IllegalArgumentException("SOURCE_PTS_LIMIT");pts.put(p);}if(pts.length()==0)throw new IllegalArgumentException("NO_VIDEO_FRAMES");
      return result.put("width",width).put("height",height).put("rotation",selected.containsKey(MediaFormat.KEY_ROTATION)?selected.getInteger(MediaFormat.KEY_ROTATION):0).put("endUs",duration).put("ptsUs",pts).put("mime","video/mp4");
    }finally{e.release();}
  }
}
