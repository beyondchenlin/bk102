package com.deepseekharness.media;

import java.math.BigInteger;

/** 项目时间的唯一换算；源素材由 PTS 索引单独管理。 */
public final class FrameMath {
    private FrameMath() {}
    public static long toUs(long frame, long numerator, long denominator) {
        if (frame < 0 || numerator <= 0 || denominator <= 0) throw new IllegalArgumentException("INVALID_TIME");
        BigInteger value=BigInteger.valueOf(frame).multiply(BigInteger.valueOf(1_000_000L))
                .multiply(BigInteger.valueOf(denominator)).divide(BigInteger.valueOf(numerator));
        if(value.compareTo(BigInteger.valueOf(Long.MAX_VALUE))>0)throw new ArithmeticException("TIME_OVERFLOW");
        return value.longValue();
    }
    public static int containing(long[] pts, long timeUs) {
        if (pts.length == 0 || timeUs < pts[0]) throw new IllegalArgumentException("BEFORE_FIRST_FRAME");
        int low = 0, high = pts.length;
        while (low < high) { int mid = (low + high) >>> 1; if (pts[mid] <= timeUs) low = mid + 1; else high = mid; }
        return low - 1;
    }
}
