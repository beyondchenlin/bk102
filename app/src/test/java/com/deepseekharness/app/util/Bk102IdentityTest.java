package com.deepseekharness.app.util;

import static org.junit.Assert.*;
import org.junit.Test;

public final class Bk102IdentityTest {
  @Test
  public void appHasIndependentIdentity() {
    assertEquals("io.github.beyondchenlin.bk102", AppIdentity.applicationId());
    assertNotEquals("dsh.android.client", AppIdentity.applicationId());
    assertEquals("BK Harenss", AppIdentity.displayName());
  }
}
