package com.deepseekharness.app.ui;

import android.webkit.*;
import com.deepseekharness.media.NativeWebMediaBridge;
import java.util.function.BooleanSupplier;

final class CopyEditMediaFactory {
  // 独立模拟器门禁不代表生产宿主/ARM64认证；验收前默认关闭。
  private static final boolean HOST_DEVICE_VERIFIED = false;

  private CopyEditMediaFactory() {}

  static CopyEditMediaBridge attach(WebView view, String base, BooleanSupplier current) {
    NativeWebMediaBridge.Handle handle =
        NativeWebMediaBridge.attach(view, base, current, HOST_DEVICE_VERIFIED);
    if (handle == null) return null;
    return new CopyEditMediaBridge() {
      @Override
      public WebResourceResponse intercept(WebResourceRequest request) {
        return handle.intercept(request);
      }

      @Override
      public void suspend() {
        handle.suspend();
      }

      @Override
      public void resume() {
        handle.resume();
      }

      @Override
      public void reset() {
        handle.reset();
      }

      @Override
      public void close() {
        handle.close();
      }
    };
  }
}
