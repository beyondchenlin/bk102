package dsh.copyedit.spike;

import com.deepseekharness.media.*;
import org.junit.Test;
import static org.junit.Assert.*;
public class FrameMathTest {
    @Test public void rationalTime(){assertEquals(1_001_000_000L,FrameMath.toUs(30000,30000,1001));assertEquals(59966666,FrameMath.toUs(1799,30,1));}
    @Test public void vfrBoundaries(){long[] pts={0,16667,50000,100000};assertEquals(1,FrameMath.containing(pts,49999));assertEquals(2,FrameMath.containing(pts,50000));assertEquals(3,FrameMath.containing(pts,100000));}
    @Test public void rejectInvalid(){assertThrows(IllegalArgumentException.class,()->FrameMath.toUs(-1,30,1));assertThrows(ArithmeticException.class,()->FrameMath.toUs(Long.MAX_VALUE,1,1));assertThrows(IllegalArgumentException.class,()->new MediaProvider.Clip("x",10,10));}
}
