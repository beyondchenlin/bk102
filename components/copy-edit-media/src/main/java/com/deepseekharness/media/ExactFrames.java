package com.deepseekharness.media;

import android.graphics.Bitmap;
import android.graphics.Rect;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.SystemClock;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.TreeSet;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;

/** 定向软件读回：从前一同步样本解码到精确输出 PTS，不把 seek 请求当已呈现。 */
public final class ExactFrames {
    public record Frame(long ptsUs, long elapsedMs, int barcode, Bitmap bitmap) {}
    public static long[] index(File file) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath()); selectVideo(extractor);
            TreeSet<Long> result = new TreeSet<>();
            while (extractor.getSampleTime() >= 0) {
                if(result.size() >= 20_000) throw new IllegalArgumentException("INDEX_LIMIT");
                result.add(extractor.getSampleTime()); extractor.advance();
            }
            return result.stream().mapToLong(Long::longValue).toArray();
        } finally { extractor.release(); }
    }
    private static MediaFormat selectVideo(MediaExtractor extractor) {
        for(int i=0;i<extractor.getTrackCount();i++) {
            MediaFormat format=extractor.getTrackFormat(i);
            if(format.getString(MediaFormat.KEY_MIME).startsWith("video/")) { extractor.selectTrack(i); return format; }
        }
        throw new IllegalArgumentException("NO_VIDEO");
    }
    public static Frame decode(File file, long targetUs, BooleanSupplier cancelled) throws Exception {
        return decode(file,targetUs,cancelled,true);
    }
    public static Frame decodeAsset(File file,long targetUs,BooleanSupplier cancelled)throws Exception{return decode(file,targetUs,cancelled,false);}
    private static Frame decode(File file, long targetUs, BooleanSupplier cancelled,boolean fixtureBarcode) throws Exception {
        MediaExtractor extractor=new MediaExtractor(); MediaCodec codec=null;
        long started=SystemClock.elapsedRealtime();
        try {
            extractor.setDataSource(file.getAbsolutePath()); MediaFormat format=selectVideo(extractor);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible);
            codec=MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
            codec.configure(format,null,null,0); codec.start(); extractor.seekTo(targetUs,MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            boolean inputEnded=false; MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            while(SystemClock.elapsedRealtime()-started<15_000) {
                if(cancelled.getAsBoolean())throw new CancellationException();
                if(!inputEnded) {
                    int input=codec.dequeueInputBuffer(10_000);
                    if(input>=0) {
                        ByteBuffer buffer=codec.getInputBuffer(input);int size=extractor.readSampleData(buffer,0);
                        if(size<0) {codec.queueInputBuffer(input,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputEnded=true;}
                        else {codec.queueInputBuffer(input,0,size,extractor.getSampleTime(),0);extractor.advance();}
                    }
                }
                int output=codec.dequeueOutputBuffer(info,10_000);
                if(output>=0) {
                    try {
                        if(info.size>0 && info.presentationTimeUs==targetUs) {
                            try(Image image=codec.getOutputImage(output)) {
                                if(image==null)throw new IllegalStateException("NO_READABLE_FRAME");
                                int code=fixtureBarcode?barcode(image):-1;
                                return new Frame(info.presentationTimeUs,SystemClock.elapsedRealtime()-started,code,toBitmap(image));
                            }
                        }
                        if((info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0)break;
                    } finally {codec.releaseOutputBuffer(output,false);}
                }
            }
            throw new IllegalStateException("EXACT_FRAME_NOT_PRODUCED: "+targetUs);
        } finally {if(codec!=null){try{codec.stop();}finally{codec.release();}}extractor.release();}
    }
    private static int plane(Image.Plane plane,int x,int y) {
        ByteBuffer bytes=plane.getBuffer();return bytes.get(bytes.position()+y*plane.getRowStride()+x*plane.getPixelStride())&255;
    }
    private static int barcode(Image image) {
        Image.Plane y=image.getPlanes()[0];Rect crop=image.getCropRect();int code=0;
        for(int i=0;i<8;i++)if(plane(y,crop.left+40+i*24,crop.top+48)>180)code|=1<<i;
        return code;
    }
    private static Bitmap toBitmap(Image image) {
        Rect crop=image.getCropRect();int width=Math.min(360,crop.width()),height=width*crop.height()/crop.width();
        int[] pixels=new int[width*height];Image.Plane[] p=image.getPlanes();
        for(int y=0;y<height;y++)for(int x=0;x<width;x++) {
            int sx=crop.left+x*crop.width()/width,sy=crop.top+y*crop.height()/height;
            int yy=plane(p[0],sx,sy)-16,u=plane(p[1],sx/2,sy/2)-128,v=plane(p[2],sx/2,sy/2)-128;
            int r=clamp((298*yy+409*v+128)>>8),g=clamp((298*yy-100*u-208*v+128)>>8),b=clamp((298*yy+516*u+128)>>8);
            pixels[y*width+x]=0xff000000|(r<<16)|(g<<8)|b;
        }
        return Bitmap.createBitmap(pixels,width,height,Bitmap.Config.ARGB_8888);
    }
    private static int clamp(int value){return Math.max(0,Math.min(255,value));}
}
