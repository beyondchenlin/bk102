package com.deepseekharness.app.ui;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;

/** 关于对话框：GitHub 仓库 / 交流邮箱入口（欢迎页 + 设置页 + 顶栏共用）。 */
public final class AboutDialog {

  public static final String GITHUB_URL = com.deepseekharness.app.util.Constants.REPOSITORY_URL;
  public static final String CONTACT_EMAIL = "beyond.chenlin@gmail.com";

  private AboutDialog() {}

  public static AlertDialog show(Context ctx) {
    String version = "unknown";
    try {
      version = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
    } catch (Exception ignored) {
    }
    android.view.View content =
        android.view.LayoutInflater.from(ctx)
            .inflate(com.deepseekharness.app.R.layout.dialog_about, null);
    ((android.widget.TextView) content.findViewById(com.deepseekharness.app.R.id.about_version))
        .setText(com.deepseekharness.app.util.UiText.format("BK Harenss v%s", version));
    android.widget.TextView repository =
        content.findViewById(com.deepseekharness.app.R.id.about_repository);
    repository.setText(Uri.parse(GITHUB_URL).getPath().substring(1));
    android.widget.TextView community =
        content.findViewById(com.deepseekharness.app.R.id.about_community);
    community.setText(CONTACT_EMAIL);
    AlertDialog dialog = new DshaDialogBuilder(ctx).setView(content).create();
    content
        .findViewById(com.deepseekharness.app.R.id.about_close)
        .setOnClickListener(v -> dialog.dismiss());
    content
        .findViewById(com.deepseekharness.app.R.id.about_github)
        .setOnClickListener(v -> openBrowser(ctx, GITHUB_URL));
    content
        .findViewById(com.deepseekharness.app.R.id.about_qq)
        .setOnClickListener(v -> openContactEmail(ctx));
    dialog.show();
    return dialog;
  }

  public static void openBrowser(Context ctx, String url) {
    try {
      ctx.startActivity(
          new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    } catch (Exception e) {
      Toast.makeText(
              ctx,
              com.deepseekharness.app.util.UiText.format("打不开，请手动访问：%s", url),
              Toast.LENGTH_SHORT)
          .show();
    }
  }

  public static void openContactEmail(Context ctx) {
    try {
      ctx.startActivity(
          new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + CONTACT_EMAIL))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
    } catch (Exception e) {
      Toast.makeText(
              ctx,
              String.format(
                  java.util.Locale.ROOT,
                  com.deepseekharness.app.util.UiText.choose(
                      "未找到邮件应用，请发送邮件至 %s", "No email app found. Email %s"),
                  CONTACT_EMAIL),
              Toast.LENGTH_LONG)
          .show();
    }
  }
}
