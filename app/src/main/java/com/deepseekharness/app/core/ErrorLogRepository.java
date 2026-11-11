package com.deepseekharness.app.core;

import android.app.Application;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.MutableLiveData;
import com.deepseekharness.app.BuildConfig;
import com.deepseekharness.app.data.DownloadsExport;
import com.deepseekharness.app.util.SensitiveData;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** 错误日志下载独立于环境探针：Web 无法启动、环境维护中也能生成文件。 */
public final class ErrorLogRepository extends AndroidViewModel {
  private static final java.util.concurrent.ExecutorService IO =
      Executors.newSingleThreadExecutor();

  public static final class State {
    public final boolean busy;
    public final String message;
    public final Uri uri;
    public final boolean exported;

    State(boolean busy, String message, Uri uri) {
      this(busy, message, uri, false);
    }

    State(boolean busy, String message, Uri uri, boolean exported) {
      this.busy = busy;
      this.message = message;
      this.uri = uri;
      this.exported = exported;
    }
  }

  public final MutableLiveData<State> state = new MutableLiveData<>();
  private final AtomicBoolean working = new AtomicBoolean();

  public ErrorLogRepository(@NonNull Application app) {
    super(app);
    android.content.SharedPreferences saved = app.getSharedPreferences("dsha_log_exports", 0);
    String uri = saved.getString("last_uri", ""), name = saved.getString("last_name", "");
    state.setValue(
        new State(
            false,
            uri.isEmpty()
                ? com.deepseekharness.app.util.UiText.choose(
                    "导出最近三次启动的脱敏错误、当前启动记录和运行时版本校验。无需复制报错文字；不主动读取对话、工程或密钥配置。",
                    "Export redacted errors from the last three starts, the current trace and runtime identity checks. No error transcription needed; conversation, project and credential files are not read.")
                : com.deepseekharness.app.util.UiText.format("上次保存：%s（点按查看）", name),
            uri.isEmpty() ? null : Uri.parse(uri)));
  }

  public static String filename() {
    return "DSHA-diagnostics-"
        + BuildConfig.VERSION_CODE
        + "-"
        + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.ROOT)
            .format(new java.util.Date())
        + "-"
        + java.util.UUID.randomUUID()
        + ".tar.gz";
  }

  public String savedMimeType() {
    String name =
        getApplication().getSharedPreferences("dsha_log_exports", 0).getString("last_name", "");
    return name != null && name.endsWith(".txt") ? "text/plain" : "application/gzip";
  }

  public void download() {
    export(null);
  }

  public void export(Uri destination) {
    export(destination, false, "");
  }

  /** This choice belongs only to the current export; it is never saved or restored. */
  public void export(Uri destination, boolean includeAdditionalContext, String additionalContext) {
    if (!working.compareAndSet(false, true)) return;
    final String selectedContext =
        includeAdditionalContext && additionalContext != null ? additionalContext : "";
    final long receivedAt = System.currentTimeMillis();
    State previous = state.getValue();
    state.setValue(
        new State(
            true,
            com.deepseekharness.app.util.UiText.text("正在收集并保存错误日志…"),
            previous == null ? null : previous.uri));
    IO.execute(
        () -> {
          File staged = null;
          com.deepseekharness.app.backup.BackupFileSystem.Node stagedIdentity = null;
          try {
            String name = filename();
            staged =
                stageArchive(
                    getApplication(), includeAdditionalContext, selectedContext, receivedAt);
            var fs = new com.deepseekharness.app.backup.AndroidBackupFileSystem();
            stagedIdentity = fs.stat(staged);
            var control = new com.deepseekharness.app.backup.BackupControl(null);
            Uri uri;
            if (destination == null) {
              DownloadsExport.Result written =
                  DownloadsExport.write(getApplication(), staged, name);
              uri = written.uri;
              name = written.displayName;
            } else {
              com.deepseekharness.app.util.FileIntegrity.Result written;
              try (InputStream in = fs.read(staged, stagedIdentity);
                  OutputStream out =
                      com.deepseekharness.app.backup.DocumentStreams.output(
                          getApplication().getContentResolver(), destination, control)) {
                if (out == null)
                  throw new java.io.IOException(
                      com.deepseekharness.app.util.UiText.text("无法写入所选位置"));
                written =
                    com.deepseekharness.app.util.FileIntegrity.copy(
                        in, out, stagedIdentity.size, control::check);
              }
              try (InputStream in =
                  com.deepseekharness.app.backup.DocumentStreams.input(
                      getApplication().getContentResolver(), destination, control)) {
                if (!written.matches(
                    com.deepseekharness.app.util.FileIntegrity.copy(
                        in, null, stagedIdentity.size, control::check)))
                  throw new java.io.IOException(
                      com.deepseekharness.app.util.UiText.text("保存后的日志校验失败"));
              }
              uri = destination;
              try (android.database.Cursor cursor =
                  com.deepseekharness.app.backup.DocumentStreams.optionalQuery(
                      getApplication().getContentResolver(),
                      uri,
                      new String[] {android.provider.OpenableColumns.DISPLAY_NAME},
                      control)) {
                if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
              }
              try {
                getApplication()
                    .getContentResolver()
                    .takePersistableUriPermission(
                        uri,
                        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
              } catch (SecurityException ignored) {
              }
            }
            getApplication()
                .getSharedPreferences("dsha_log_exports", 0)
                .edit()
                .putString("last_uri", uri.toString())
                .putString("last_name", name)
                .apply();
            state.postValue(
                new State(
                    false,
                    com.deepseekharness.app.util.UiText.format(
                        destination == null
                            ? "已保存：Download/DSHA/%s\n点按此处查看日志"
                            : "已保存到所选位置：%s\n点按此处查看日志",
                        name),
                    uri,
                    true));
          } catch (Exception error) {
            state.postValue(
                new State(
                    false,
                    com.deepseekharness.app.util.UiText.format(
                        "保存失败：%s\n可点「另存为」选择位置后重试。",
                        SensitiveData.redact(String.valueOf(error.getMessage()))),
                    previous == null ? null : previous.uri));
          } finally {
            if (staged != null && stagedIdentity != null)
              try {
                var fs = new com.deepseekharness.app.backup.AndroidBackupFileSystem();
                if (stagedIdentity.same(fs.stat(staged))) fs.delete(staged);
              } catch (java.io.IOException | RuntimeException retained) {
                // A changed or unreadable staged export is retained rather than guessed disposable.
              }
            working.set(false);
          }
        });
  }

  /** Numbered private output, independent of guest readiness, Python, or model credentials. */
  private static File stageArchive(
      android.content.Context context, boolean include, String note, long receivedAt)
      throws java.io.IOException {
    if (note.length() > 32768) throw new java.io.IOException("ADDITIONAL_CONTEXT_LIMIT");
    var fs = new com.deepseekharness.app.backup.AndroidBackupFileSystem();
    File root = context.getFilesDir().getCanonicalFile();
    File folder = fs.child(root, "diagnostic-exports");
    if (fs.stat(folder).type.equals("MISSING")) fs.directory(folder);
    File archive = fs.child(folder, java.util.UUID.randomUUID() + ".tar.gz");
    java.util.Map<String, byte[]> entries = new java.util.LinkedHashMap<>();
    entries.put("summary.txt", collect(context).getBytes(StandardCharsets.UTF_8));
    entries.put(
        "status.json", com.deepseekharness.app.backup.BackupJson.write(status(context), 65536));
    entries.put(
        "operations-tail.jsonl",
        com.deepseekharness.app.backup.DiagnosticExportArchive.operationEvents(
            DiagnosticLog.read(context)));
    var startup = HarnessController.get(context).startupDiagnostics();
    entries.putAll(
        com.deepseekharness.app.util.StartupDiagnosticEvidence.starts(
            startup.history(), startup.snapshot()));
    try (InputStream descriptor = context.getAssets().open("runtime-descriptor.json")) {
      var bytes = new java.io.ByteArrayOutputStream();
      com.deepseekharness.app.util.FileIntegrity.copy(descriptor, bytes, 2 * 1024 * 1024);
      var expected =
          com.deepseekharness.app.backup.BackupJson.read(bytes.toByteArray(), 2 * 1024 * 1024);
      entries.put(
          "runtime-evidence.json",
          com.deepseekharness.app.util.StartupDiagnosticEvidence.runtime(
              fs,
              root,
              expected,
              context
                  .getSharedPreferences("dsha_environment_upgrade", 0)
                  .getString("attempted_identity", "")));
    } catch (java.io.IOException | RuntimeException unavailable) {
      // 缺少运行时证据不应丢弃已经捕获的启动异常。
      entries.put(
          "runtime-evidence.json",
          com.deepseekharness.app.backup.BackupJson.write(
              java.util.Map.of(
                  "state", "UNAVAILABLE", "error", unavailable.getClass().getSimpleName()),
              4096));
    }
    if (include)
      entries.put(
          "additional-context.txt", SensitiveData.redact(note).getBytes(StandardCharsets.UTF_8));
    entries.put(
        "additional-context.json",
        com.deepseekharness.app.backup.BackupJson.write(
            java.util.Map.of(
                "source",
                "USER_PROVIDED_ADDITIONAL_CONTEXT",
                "included",
                include,
                "windowStartMillis",
                receivedAt,
                "windowEndMillis",
                System.currentTimeMillis(),
                "automaticBusinessCapture",
                false),
            4096));
    entries.put(
        "README.txt",
        ("DSHA diagnostics, not a data backup.\n"
                + "manifest.json lists capture limits and the checksum of every included file.\n"
                + "Existing operation messages are a bounded, possibly compacted tail; prior rotated records cannot be reconstructed.\n"
                + "startup-*.json contain bounded redacted startup trace tails, including errors and exception chains only as originally recorded.\n"
                + "runtime-evidence.json compares APK and installed runtime identities and fixed managed file hashes. This is not a complete runtime health check.\n"
                + "Conversation, project and credential files are not read. Third-party startup output may include content printed by plugins; review before sharing.\n"
                + "Additional context, when selected, is only the text entered for this action. Review before sharing.\n")
            .getBytes(StandardCharsets.UTF_8));
    try (OutputStream output = fs.create(archive)) {
      com.deepseekharness.app.backup.DiagnosticExportArchive.write(
          output,
          entries,
          java.util.Map.of(
              "operationHistory",
              "BOUNDED_COMPACTED_TAIL",
              "rawProcessOutput",
              "REDACTED_STARTUP_TRACE_TAIL_ONLY",
              "fullExceptionChains",
              "ONLY_AS_RECORDED_NOT_RECONSTRUCTED",
              "startupHistory",
              "LATEST_THREE_PLUS_CURRENT_TRACE",
              "runtimeEvidence",
              "APK_AND_INSTALLED_IDENTITY_WITH_FIXED_FILE_HASHES",
              "businessBodies",
              "NOT_COLLECTED",
              "additionalContextIncluded",
              include,
              "missingHistory",
              "NOT_RECONSTRUCTED"),
          new com.deepseekharness.app.backup.BackupControl(null));
    }
    fs.syncDirectory(folder);
    return archive;
  }

  private static java.util.Map<String, Object> status(android.content.Context context) {
    var config = new ConfigStore(context);
    var startup = HarnessController.get(context).startupDiagnostics().snapshot();
    var emergency = com.deepseekharness.app.recovery.RecoveryController.get(context).snapshot();
    java.util.Map<String, Object> value = new java.util.LinkedHashMap<>();
    value.put("schema", 1L);
    value.put("capturedAtMillis", System.currentTimeMillis());
    value.put("versionCode", (long) BuildConfig.VERSION_CODE);
    value.put("versionName", BuildConfig.VERSION_NAME);
    value.put("flavor", BuildConfig.LOW_ANDROID ? "low" : "standard");
    value.put("diagnosticFormat", 2L);
    value.put("androidSdk", (long) android.os.Build.VERSION.SDK_INT);
    value.put(
        "supported64BitAbis", java.util.Arrays.asList(android.os.Build.SUPPORTED_64_BIT_ABIS));
    value.put("configuredRuntime", config.isProroot() ? "proroot" : "proot");
    value.put("failureStage", category(config.getDiagnosticFailureStage()));
    value.put("failureRecorded", !config.getDiagnosticFailureReason().isEmpty());
    value.put(
        "startup",
        java.util.Map.of(
            "stage",
            category(startup.stage),
            "browserReady",
            startup.browserReady,
            "safe",
            startup.safe,
            "issueCount",
            (long) startup.issues.size()));
    value.put(
        "emergency",
        java.util.Map.of(
            "state",
            emergency.state.toString(),
            "generation",
            emergency.generation,
            "errorCode",
            category(emergency.errorCode)));
    return value;
  }

  public static String collect(android.content.Context context) {
    StringBuilder text = new StringBuilder(com.deepseekharness.app.util.UiText.text("DSHA 错误日志\n"));
    text.append(com.deepseekharness.app.util.UiText.text("生成时间："))
        .append(
            new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", java.util.Locale.ROOT)
                .format(new java.util.Date()))
        .append('\n');
    text.append(com.deepseekharness.app.util.UiText.text("版本："))
        .append(BuildConfig.VERSION_NAME)
        .append(" / ")
        .append(BuildConfig.VERSION_CODE)
        .append(
            BuildConfig.LOW_ANDROID
                ? com.deepseekharness.app.util.UiText.text(" / 兼容版\n")
                : com.deepseekharness.app.util.UiText.text(" / 标准版\n"));
    text.append(com.deepseekharness.app.util.UiText.text("设备："))
        .append(android.os.Build.MANUFACTURER)
        .append(' ')
        .append(android.os.Build.MODEL)
        .append(" / Android ")
        .append(android.os.Build.VERSION.RELEASE)
        .append('\n');
    ConfigStore config = new ConfigStore(context);
    text.append("failureStage=").append(category(config.getDiagnosticFailureStage())).append('\n');
    text.append("failureRecorded=")
        .append(!config.getDiagnosticFailureReason().isEmpty())
        .append('\n');
    text.append("installFailureRecorded=")
        .append(ColdInstallDiagnostics.read(context).contains("FAILED"))
        .append('\n');
    text.append("runtimeTrialFailureRecorded=")
        .append(!com.deepseekharness.app.runtime.RuntimeTrial.latestFailure(context).isEmpty())
        .append('\n');
    var emergency = com.deepseekharness.app.recovery.RecoveryController.get(context).snapshot();
    text.append(
            com.deepseekharness.app.util.UiText.choose(
                "\n=== 独立应急 DSH ===\n", "\n=== Independent emergency DSH ===\n"))
        .append("state=")
        .append(emergency.state)
        .append(" generation=")
        .append(emergency.generation)
        .append(" errorCode=")
        .append(category(emergency.errorCode))
        .append("\n");
    var current = HarnessController.get(context).startupDiagnostics().snapshot();
    text.append("currentStartup: stage=")
        .append(category(current.stage))
        .append(" browserReady=")
        .append(current.browserReady)
        .append(" safe=")
        .append(current.safe)
        .append(" issueCount=")
        .append(current.issues.size())
        .append('\n');
    text.append(
        com.deepseekharness.app.util.UiText.choose(
            "\n=== 最近五次启动 ===\n", "\n=== Last five starts ===\n"));
    for (com.deepseekharness.app.util.StartupHistoryStore.Entry entry :
        HarnessController.get(context).startupDiagnostics().history())
      text.append(entry.started)
          .append(" / ")
          .append(category(entry.status))
          .append(" / ")
          .append(category(entry.stage))
          .append(" / safe=")
          .append(entry.safe)
          .append('\n');
    text.append(
        com.deepseekharness.app.util.UiText.choose(
            "\n故障包包含最近三次及当前启动的脱敏日志尾部，以及 APK/实际运行时校验。已轮换的历史无法补回；分享前可检查内容。\n",
            "\nThe bundle includes redacted trace tails from the last three starts and current startup, plus APK/installed runtime checks. Rotated history cannot be reconstructed; review before sharing.\n"));
    return SensitiveData.redact(text.toString());
  }

  private static String category(String value) {
    if (value == null || value.isEmpty()) return "none";
    switch (value) {
      case "starting":
      case "ready":
      case "failed":
      case "stopped":
      case "interrupted":
        return value;
      default:
        return "recorded";
    }
  }
}
