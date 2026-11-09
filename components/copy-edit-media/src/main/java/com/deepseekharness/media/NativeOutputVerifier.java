package com.deepseekharness.media;

import android.media.MediaExtractor;
import android.media.MediaFormat;
import java.io.File;
import java.util.*;

/** 发布前读回实际轨道、尺寸及完整PTS序列；失败保留上一份成功成片。 */
public final class NativeOutputVerifier {
    private NativeOutputVerifier() {}
    public static void verify(File file,RenderJobSnapshot snapshot)throws Exception {
        MediaExtractor extractor=new MediaExtractor();
        try{
            extractor.setDataSource(file.toString());int video=-1,audio=0,audioTrack=-1,sampleRate=0;
            for(int i=0;i<extractor.getTrackCount();i++){
                MediaFormat format=extractor.getTrackFormat(i);String mime=format.getString(MediaFormat.KEY_MIME);
                if(mime.startsWith("video/")){
                    if(video>=0||!mime.equals("video/avc"))throw new IllegalArgumentException("OUTPUT_VIDEO_TRACK");video=i;
                    int w=format.getInteger(MediaFormat.KEY_WIDTH),h=format.getInteger(MediaFormat.KEY_HEIGHT),rotation=format.containsKey(MediaFormat.KEY_ROTATION)?format.getInteger(MediaFormat.KEY_ROTATION):0;
                    if(snapshot.preview()&&rotation!=0)throw new IllegalArgumentException("PREVIEW_ROTATION_UNSUPPORTED");
                    if(Math.abs(rotation)%180==90){int swap=w;w=h;h=swap;}
                    if(w!=(snapshot.preview()?360:1080)||h!=(snapshot.preview()?640:1920))throw new IllegalArgumentException("OUTPUT_DIMENSIONS "+w+"x"+h+" rotation="+rotation);
                }else if(mime.startsWith("audio/")){if(!mime.equals("audio/mp4a-latm"))throw new IllegalArgumentException("OUTPUT_AUDIO_CODEC");audio++;audioTrack=i;sampleRate=format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    if(snapshot instanceof FrozenRenderPlan){long expected=Math.round(snapshot.expectedFrames()*1_000_000d/30),delay=format.containsKey(MediaFormat.KEY_ENCODER_DELAY)?Math.round(format.getInteger(MediaFormat.KEY_ENCODER_DELAY)*1_000_000d/sampleRate):0;
                        // MediaExtractor报告含priming的媒体时长；播放edit list会扣除encoder-delay。
                        if(!format.containsKey(MediaFormat.KEY_DURATION)||Math.abs(format.getLong(MediaFormat.KEY_DURATION)-delay-expected)>Math.ceil(1_000_000d/sampleRate))throw new IllegalArgumentException("OUTPUT_AUDIO_DURATION");}}
            }
            boolean expectsAudio=!(snapshot instanceof FrozenRenderPlan p)||!p.audio().isEmpty()||!p.music().isEmpty();
            if(video<0||audio!=(expectsAudio?1:0))throw new IllegalArgumentException("OUTPUT_TRACKS");extractor.selectTrack(video);
            List<Long> pts=new ArrayList<>();while(extractor.getSampleTime()>=0){if(pts.size()>=1801)throw new IllegalArgumentException("OUTPUT_FRAME_LIMIT");pts.add(extractor.getSampleTime());extractor.advance();}
            Collections.sort(pts);if(pts.size()!=snapshot.expectedFrames())throw new IllegalArgumentException("OUTPUT_FRAME_COUNT");
            for(int i=0;i<pts.size();i++)if(Math.abs(pts.get(i)-Math.round(i*1_000_000d/30))>2)throw new IllegalArgumentException("OUTPUT_PTS frame="+i+" actual="+pts.get(i));
            if(audioTrack>=0&&snapshot instanceof FrozenRenderPlan){
                extractor.unselectTrack(video);extractor.selectTrack(audioTrack);extractor.seekTo(0,MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                long last=Long.MIN_VALUE;int count=0;
                while(extractor.getSampleTrackIndex()>=0){long next=extractor.getSampleTime();if(++count>6000||next<=last||extractor.getSampleSize()<=0)throw new IllegalArgumentException("OUTPUT_AUDIO_PTS");last=next;extractor.advance();}
                long expected=Math.round(snapshot.expectedFrames()*1_000_000d/30);
                if(count==0||last+Math.round(1024*1_000_000d/sampleRate)<expected-2)throw new IllegalArgumentException("OUTPUT_AUDIO_TAIL");
            }
        }finally{extractor.release();}
    }
}
