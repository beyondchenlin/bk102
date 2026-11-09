package com.deepseekharness.media;

/** 固定30fps/1倍速预览时钟；PCM块计数之间插值，物理排空后才交出结束位置。 */
final class PcmPlaybackClock {
    private static final long MAX_HEAD_LEAD_US=33_333;
    private long timeUs=Long.MIN_VALUE,positionUs,headOffsetUs;
    private boolean started,paused;

    long update(long estimate,long head,long nowUs,long endUs,boolean ending){
        // 还未物理排空时保留最后一个样本的pending，不能让上层提前认为音频结束。
        long limit=head<endUs?Math.max(0,endUs-1):endUs;
        long elapsed=timeUs==Long.MIN_VALUE?0:Math.max(0,nowUs-timeUs);timeUs=nowUs;
        if(paused)return positionUs;
        if(!started){
            if(estimate<=0||head<=0)return 0;
            // 第一次有效计数也不得跳过两次查询间实际经过的时间，否则冷起播会挤掉前几帧。
            positionUs=Math.min(Math.min(Math.min(estimate,head),limit),elapsed);headOffsetUs=positionUs-head;started=true;return positionUs;
        }
        // 不逐次取min(估计,单步1倍速)：估计的小幅噪声会不断扣掉时间，形成累计声画漂移。
        // 初次有效样本校准相位后，以1倍速插值；真实计数不动时最多提前一个视频帧便停止。
        long target=head+headOffsetUs+MAX_HEAD_LEAD_US;
        // 实际PCM已经排空时允许以正常速度走完剩余视频时间，不能一跃跳至片尾。
        if(ending&&head>=endUs)target=endUs;
        positionUs=Math.max(positionUs,Math.min(Math.min(target,limit),positionUs+elapsed));
        return positionUs;
    }
    void resume(long nowUs){if(timeUs!=Long.MIN_VALUE)timeUs=nowUs;paused=false;}
    void pause(){paused=true;}
    void reset(){timeUs=Long.MIN_VALUE;positionUs=headOffsetUs=0;started=false;}
}
