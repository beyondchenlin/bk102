package com.deepseekharness.app.ui;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

/** WebView只持有生命周期接口；Low不加载媒体实现及Media3依赖。 */
interface CopyEditMediaBridge extends AutoCloseable {
  WebResourceResponse intercept(WebResourceRequest request);

  void suspend();

  void resume();

  void reset();

  @Override
  void close();
}
