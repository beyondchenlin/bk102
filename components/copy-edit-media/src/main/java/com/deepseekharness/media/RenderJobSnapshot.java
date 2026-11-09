package com.deepseekharness.media;

/** 任务只持有冻结身份，宿主业务数据库不进入媒体执行器。 */
public interface RenderJobSnapshot {
    String projectId();
    long revision();
    boolean preview();
    int expectedFrames();
    String key();
}
