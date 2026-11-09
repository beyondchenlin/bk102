package com.deepseekharness.media;
import org.junit.Test;
import static org.junit.Assert.*;
public class NativeResultRangeTest {
    @Test public void exactOpenAndSuffixRanges(){assertEquals(new NativeResultRange(0,100,false),NativeResultRange.parse(null,100));assertEquals(new NativeResultRange(10,20,true),NativeResultRange.parse("bytes=10-29",100));assertEquals(new NativeResultRange(90,10,true),NativeResultRange.parse("bytes=90-",100));assertEquals(new NativeResultRange(90,10,true),NativeResultRange.parse("bytes=-10",100));assertEquals(new NativeResultRange(90,10,true),NativeResultRange.parse("bytes=90-999",100));}
    @Test public void invalidRangesFailClosed(){for(String bad:new String[]{"bytes=-","bytes=-0","bytes=100-","bytes=40-3","bytes=1-2,4-5","items=0-1","bytes=999999999999999999999999-","bytes=1--2"})assertThrows(IllegalArgumentException.class,()->NativeResultRange.parse(bad,100));}
}
