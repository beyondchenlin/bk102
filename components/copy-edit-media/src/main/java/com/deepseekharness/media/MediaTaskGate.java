package com.deepseekharness.media;

/** 单任务票据；由同一调用线程串行使用，取消先退休票据，再停止实际引擎。 */
public final class MediaTaskGate {
    public record Ticket(long id,long revision,String key) {}
    private long nextId;
    private Ticket active;
    public Ticket begin(RenderJobSnapshot snapshot) {
        if(active!=null)throw new IllegalStateException("TASK_ALREADY_RUNNING");
        active=new Ticket(Math.incrementExact(nextId),snapshot.revision(),snapshot.key());nextId=active.id();return active;
    }
    public boolean isCurrent(Ticket ticket,long revision){return ticket!=null&&ticket.equals(active)&&ticket.revision()==revision;}
    public boolean finish(Ticket ticket,long revision){if(!isCurrent(ticket,revision))return false;active=null;return true;}
    public Ticket cancel(){Ticket retired=active;active=null;return retired;}
}
