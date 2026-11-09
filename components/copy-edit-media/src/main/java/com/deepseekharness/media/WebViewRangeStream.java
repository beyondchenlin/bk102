package com.deepseekharness.media;

import java.io.*;
import java.util.Objects;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** WebView拦截流：Chromium会根据请求Range再次调用available/skip，不能预先跳读两次。 */
public final class WebViewRangeStream extends InputStream {
    private final RandomAccessFile file;
    private final NativeResultRange range;
    private final long size,end;
    private final BooleanSupplier valid;
    private final Consumer<InputStream> onClose;
    private boolean closed,started;
    public WebViewRangeStream(File source,NativeResultRange range,BooleanSupplier valid,Consumer<InputStream> onClose)throws IOException{
        file=new RandomAccessFile(source,"r");this.range=range;size=file.length();end=range.start()+range.length();this.valid=valid;this.onClose=onClose;
    }
    private boolean current()throws IOException{if(closed)return false;if(!valid.getAsBoolean()){close();return false;}return true;}
    @Override public synchronized int available()throws IOException{
        if(!current())return 0;
        // 首次查询必须报告完整资源长度，Chromium才可正确计算后缀Range。
        return (int)Math.min(Integer.MAX_VALUE,started?Math.max(0,end-file.getFilePointer()):size);
    }
    @Override public synchronized long skip(long count)throws IOException{
        if(!current()||count<=0)return 0;
        long position=file.getFilePointer(),skipped=Math.min(count,Math.max(0,end-position));file.seek(position+skipped);return skipped;
    }
    @Override public int read()throws IOException{byte[] value=new byte[1];return read(value,0,1)<0?-1:value[0]&255;}
    @Override public synchronized int read(byte[] bytes,int offset,int length)throws IOException{
        Objects.checkFromIndexSize(offset,length,bytes.length);if(length==0)return 0;if(!current())return -1;
        // 尚未skip的消费者也只收到响应约定范围；已skip的Chromium不再重复偏移。
        long position=file.getFilePointer();if(position<range.start()){file.seek(range.start());position=range.start();}started=true;
        if(position>=end){close();return -1;}int count=file.read(bytes,offset,(int)Math.min(length,end-position));if(count<0)close();return count;
    }
    @Override public synchronized void close()throws IOException{if(closed)return;closed=true;try{file.close();}finally{onClose.accept(this);}}
}
