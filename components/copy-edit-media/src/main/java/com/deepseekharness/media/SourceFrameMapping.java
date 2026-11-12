package com.deepseekharness.media;

import java.util.ArrayList;
import java.util.List;

/** 与 timeline.sourceFrameAt 相同：每个30fps工程帧取该时刻之前最近的源帧。 */
public final class SourceFrameMapping {
    private SourceFrameMapping() {}

    public static int framesFor(long durationUs) {
        return Math.max(1, (int) Math.ceil((durationUs - 1) * 30d / 1_000_000));
    }

    public static long timeUs(int frame) { return Math.round(frame * 1_000_000d / 30); }

    public static List<Long> create(List<Long> pts, long durationUs, int in, int out,
            int windowIn, int windowOut, int offset, int frames, boolean windowed) {
        require(in >= 0 && out > in && out <= pts.size());
        require(windowIn >= 0 && windowIn <= in && windowOut >= out && windowOut <= pts.size());
        long origin = pts.get(windowIn);
        long end = windowOut == pts.size() ? durationUs : pts.get(windowOut);
        int available = framesFor(end - origin);
        require(offset >= 0 && frames > 0 && frames <= 1800 && (long) offset + frames <= available);
        if (!windowed) require(windowIn == in && windowOut == out && offset == 0 && frames == available);
        List<Long> selected = new ArrayList<>(frames);
        int source = windowIn;
        for (int n = 0; n < frames; n++) {
            // 交叉相乘保留1µs容差，不把29.97/VFR时间戳先舍入为帧号。
            long target30 = origin * 30 + (long) (offset + n) * 1_000_000 + 30;
            while (source + 1 < windowOut && pts.get(source + 1) * 30 <= target30) source++;
            require(source >= in && source < out);
            selected.add(pts.get(source));
        }
        if (windowed) require(selected.get(0).equals(pts.get(in)) && selected.get(frames - 1).equals(pts.get(out - 1)));
        return List.copyOf(selected);
    }

    private static void require(boolean valid) {
        if (!valid) throw new IllegalArgumentException("NATIVE_FRAME_WINDOW_MISMATCH");
    }
}
