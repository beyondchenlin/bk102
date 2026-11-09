package com.deepseekharness.media;

import org.junit.Test;
import java.io.*;
import java.nio.file.*;
import java.util.Arrays;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

public class WebViewRangeStreamTest {
    @Test public void chromiumSkipAndDirectReadersReceiveSameBoundedBytes()throws Exception{
        Path path=Files.createTempFile("copy-edit-range-",".bin");byte[] bytes=new byte[262144];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)(i*37+i/251);
        try{Files.write(path,bytes);for(String header:new String[]{null,"bytes=0-31","bytes=131071-131583","bytes=262112-","bytes=-32"})for(boolean skip:new boolean[]{false,true}){
            NativeResultRange range=NativeResultRange.parse(header,bytes.length);AtomicInteger closed=new AtomicInteger();
            try(WebViewRangeStream stream=new WebViewRangeStream(path.toFile(),range,()->true,s->closed.incrementAndGet())){
                assertEquals(bytes.length,stream.available());if(skip){long half=range.start()/2;assertEquals(half,stream.skip(half));assertEquals(range.start()-half,stream.skip(range.start()-half));}
                assertArrayEquals(Arrays.copyOfRange(bytes,(int)range.start(),(int)(range.start()+range.length())),stream.readAllBytes());assertEquals(-1,stream.read());
            }assertEquals(1,closed.get());
        }}finally{Files.deleteIfExists(path);}
    }
    @Test public void retiredStreamClosesBeforeFurtherReadOrSkip()throws Exception{
        Path path=Files.createTempFile("copy-edit-retired-",".bin");AtomicBoolean valid=new AtomicBoolean(true);AtomicInteger closed=new AtomicInteger();
        try{Files.write(path,new byte[64]);try(WebViewRangeStream stream=new WebViewRangeStream(path.toFile(),NativeResultRange.parse("bytes=16-31",64),valid::get,s->closed.incrementAndGet())){
            assertEquals(16,stream.skip(16));valid.set(false);assertEquals(-1,stream.read());assertEquals(0,stream.available());assertEquals(0,stream.skip(2));
        }assertEquals(1,closed.get());}finally{Files.deleteIfExists(path);}
    }
}
