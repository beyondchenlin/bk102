package com.deepseekharness.media;

/** 原生视频响应仅接受单个有界字节范围；拒绝复合Range和溢出。 */
public record NativeResultRange(long start,long length,boolean partial) {
    public static NativeResultRange parse(String header,long size){
        if(size<=0)throw new IllegalArgumentException("EMPTY_RESULT");if(header==null)return new NativeResultRange(0,size,false);
        if(header.length()>100||!header.matches("bytes=[0-9]*-[0-9]*"))throw new IllegalArgumentException("INVALID_RANGE");
        String[] parts=header.substring(6).split("-",-1);long start,end;
        try{if(parts[0].isEmpty()){long suffix=Long.parseLong(parts[1]);if(suffix<=0)throw new IllegalArgumentException("INVALID_RANGE");start=Math.max(0,size-suffix);end=size-1;}
            else{start=Long.parseLong(parts[0]);end=parts[1].isEmpty()?size-1:Math.min(size-1,Long.parseLong(parts[1]));}
        }catch(NumberFormatException error){throw new IllegalArgumentException("INVALID_RANGE");}
        if(start<0||start>=size||end<start)throw new IllegalArgumentException("UNSATISFIABLE_RANGE");return new NativeResultRange(start,end-start+1,true);
    }
}
