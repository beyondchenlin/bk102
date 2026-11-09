package com.deepseekharness.media;

import androidx.media3.common.*;
import androidx.media3.muxer.*;
import androidx.media3.transformer.InAppMp4Muxer;
import com.google.common.collect.ImmutableList;
import java.nio.ByteBuffer;

/** 保留所有工程内AAC样本；显式结束时间去除编码排空用的保护尾部。 */
@androidx.annotation.OptIn(markerClass=androidx.media3.common.util.UnstableApi.class)
final class ExactDurationMuxer implements Muxer {
    private final Muxer delegate;private final long durationUs;private int audio=-1;
    private ExactDurationMuxer(Muxer delegate,long durationUs){this.delegate=delegate;this.durationUs=durationUs;}
    static Muxer.Factory factory(long durationUs){
        InAppMp4Muxer.Factory factory=new InAppMp4Muxer.Factory().setVideoDurationUs(durationUs);
        return new Muxer.Factory(){
            @Override public Muxer create(String path)throws MuxerException{return new ExactDurationMuxer(factory.create(path),durationUs);}
            @Override public ImmutableList<String> getSupportedSampleMimeTypes(int type){return factory.getSupportedSampleMimeTypes(type);}
            @Override public boolean supportsWritingNegativeTimestampsInEditList(){return true;}
        };
    }
    @Override public int addTrack(Format format)throws MuxerException{int id=delegate.addTrack(format);if(MimeTypes.isAudio(format.sampleMimeType))audio=id;return id;}
    @Override public void writeSampleData(int id,ByteBuffer data,BufferInfo info)throws MuxerException{
        if(id==audio&&info.presentationTimeUs>=durationUs)return;
        delegate.writeSampleData(id,data,info);
    }
    @Override public void addMetadataEntry(Metadata.Entry entry){delegate.addMetadataEntry(entry);}
    @Override public void close()throws MuxerException{
        try{if(audio>=0)delegate.writeSampleData(audio,ByteBuffer.allocateDirect(0),new BufferInfo(durationUs,0,C.BUFFER_FLAG_END_OF_STREAM));}
        finally{delegate.close();}
    }
}
