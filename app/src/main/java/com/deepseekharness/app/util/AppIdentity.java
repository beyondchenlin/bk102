package com.deepseekharness.app.util;

/** Product identity for the production application. */
public final class AppIdentity {
  private AppIdentity() {}

  public static String applicationId() {
    return "io.github.beyondchenlin.bk102";
  }

  public static String displayName() {
    return "BK Harenss";
  }

  public static String publicDirectoryName() {
    return "BK102";
  }

  public static String defaultUpdateFeed() {
    return "";
  }

  public static boolean isExperimental() {
    return false;
  }
}
