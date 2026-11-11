package com.deepseekharness.app.util;

import com.deepseekharness.app.backup.BackupFileSystem;
import com.deepseekharness.app.backup.BackupJson;
import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 只读导出已有启动证据；不执行 guest、不读取会话或凭据，不替代运行时就绪证明。 */
public final class StartupDiagnosticEvidence {
  private StartupDiagnosticEvidence() {}

  public static final int ENTRY_LIMIT = 96 * 1024;

  /** 先脱敏再截断，避免截断密钥标识后泄露尾部；保留最接近退出的日志。 */
  public static String tail(String value, int max) {
    String safe = SensitiveData.redact(value == null ? "" : value);
    if (safe.length() <= max) return safe;
    int begin = safe.length() - max;
    if (Character.isLowSurrogate(safe.charAt(begin))) begin++;
    return "[EARLIER_TEXT_OMITTED]\n" + safe.substring(begin);
  }

  public static Map<String, byte[]> starts(
      List<StartupHistoryStore.Entry> history, StartupTrace.Snapshot current) throws IOException {
    Map<String, byte[]> result = new LinkedHashMap<>();
    for (int i = 0; i < Math.min(3, history.size()); i++) {
      var entry = history.get(i);
      Map<String, Object> row = trace(entry.stage, entry.reason, entry.log);
      row.put("source", "PERSISTED_STARTUP_HISTORY");
      row.put("id", entry.id);
      row.put("startedAtMillis", entry.started);
      row.put("elapsedMillis", entry.elapsed);
      row.put("status", tail(entry.status, 64));
      row.put("safe", entry.safe);
      result.put("startup-" + (i + 1) + ".json", BackupJson.write(row, ENTRY_LIMIT));
    }
    if (current != null) {
      Map<String, Object> row = trace(current.stage, "", current.log);
      row.put("source", "CURRENT_IN_MEMORY_STARTUP");
      row.put("generation", current.generation);
      row.put("elapsedMillis", current.elapsedMs);
      row.put("browserReady", current.browserReady);
      row.put("safe", current.safe);
      row.put("issueCount", (long) current.issues.size());
      result.put("startup-current.json", BackupJson.write(row, ENTRY_LIMIT));
    }
    return result;
  }

  private static Map<String, Object> trace(String stage, String reason, String log) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("schema", 1L);
    row.put("capture", "BOUNDED_REDACTED_TRACE_TAIL");
    row.put("stage", tail(stage, 512));
    row.put("reason", tail(reason, 2048));
    row.put("log", tail(log, 12 * 1024));
    row.put("exceptionChains", "ONLY_AS_RECORDED_NOT_RECONSTRUCTED");
    return row;
  }

  public static byte[] runtime(
      BackupFileSystem fs, File files, Map<String, Object> expected, String attempted)
      throws IOException {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("schema", 1L);
    result.put("capturedAtMillis", System.currentTimeMillis());
    result.put("expected", identity(expected));
    result.put(
        "attemptedRuntime",
        attempted != null && attempted.matches("runtime:[a-f0-9]{64}") ? attempted : "UNKNOWN");
    try {
      var installed =
          BackupJson.read(
              fs.small(fs.child(files, "linux/.runtime-descriptor.json"), 2 * 1024 * 1024),
              2 * 1024 * 1024);
      // 只导出身份字段；完整描述符或未知字段不进入故障包。
      var descriptor = new com.deepseekharness.app.backup.RuntimeDescriptor(installed);
      result.put("installed", identity(descriptor.json()));
      result.put("matchesApk", descriptor.id().equals(expected.get("runtimeId")));
    } catch (IOException | RuntimeException unavailable) {
      result.put(
          "installed",
          Map.of("state", "UNAVAILABLE", "error", unavailable.getClass().getSimpleName()));
    }
    Map<String, Object> checks = new LinkedHashMap<>();
    Map<?, ?> inputs =
        expected.get("inputs") instanceof Map ? (Map<?, ?>) expected.get("inputs") : Map.of();
    for (String name :
        List.of("package.json", "lib/index.js", "lib/store.mjs", "lib/draft-import.mjs")) {
      String asset = "builtin-plugins/dsh-copy-edit/" + name;
      checks.put(
          "copy-edit/" + name,
          file(fs, files, "linux/ubuntu/root/dsha-copy-edit/" + name, inputs.get(asset)));
    }
    checks.put(
        "startup-observer.cjs",
        file(
            fs,
            files,
            "linux/ubuntu/root/.dsh/startup-observer.cjs",
            inputs.get("startup-observer.cjs")));
    result.put("managedFileChecks", checks);
    result.put("scope", "FIXED_MANAGED_FILES_ONLY_NOT_FULL_RUNTIME_HEALTH");
    return BackupJson.write(result, 32 * 1024);
  }

  private static Map<String, Object> identity(Map<String, Object> descriptor) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (String key : List.of("runtimeId", "baseVersion", "dshVersion", "launcherContract")) {
      Object value = descriptor.get(key);
      if (value instanceof String && ((String) value).matches("[A-Za-z0-9._+-]{1,100}"))
        result.put(key, value);
    }
    return result;
  }

  private static Map<String, Object> file(
      BackupFileSystem fs, File files, String relative, Object expected) {
    Map<String, Object> result = new LinkedHashMap<>();
    if (expected instanceof String && ((String) expected).matches("[a-f0-9]{64}"))
      result.put("expectedSha256", expected);
    try {
      File target = fs.child(files, relative);
      var before = fs.stat(target);
      result.put("type", before.type);
      result.put("bytes", before.size);
      if (!"FILE".equals(before.type)) return result;
      if (before.size > 2 * 1024 * 1024) {
        result.put("state", "TOO_LARGE");
        return result;
      }
      try (var stream = fs.read(target, before)) {
        String hash = FileIntegrity.copy(stream, null, before.size).sha256;
        if (!before.same(fs.stat(target))) throw new IOException("FILE_CHANGED");
        result.put("sha256", hash);
        if (result.containsKey("expectedSha256")) result.put("matchesApk", hash.equals(expected));
      }
    } catch (IOException | RuntimeException unavailable) {
      result.put("state", "UNAVAILABLE");
      result.put("error", unavailable.getClass().getSimpleName());
    }
    return result;
  }
}
