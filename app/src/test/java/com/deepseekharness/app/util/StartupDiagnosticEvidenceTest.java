package com.deepseekharness.app.util;

import com.deepseekharness.app.backup.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class StartupDiagnosticEvidenceTest {
  @Rule public TemporaryFolder folder = new TemporaryFolder();

  @Test
  public void exportsActualErrorAfterRestartWithoutCredentials() throws Exception {
    var store = new StartupHistoryStore(new JvmBackupFileSystem(), folder.getRoot());
    for (int i = 0; i < 5; i++) {
      var trace = new StartupTrace();
      trace.begin(i + 1, 0, false);
      trace.stage(i + 1, 1, "加载 DSH 和已启用插件");
      trace.add(i + 1, 2, "Error [ERR_MODULE_NOT_FOUND]: missing fixture-" + i + ".mjs");
      trace.add(i + 1, 3, "  at /root/dsha-copy-edit/lib/index.js:12 token=private-token-value");
      store.save(
          UUID.randomUUID().toString(),
          i + 100,
          "failed",
          "proot exit 1",
          trace.snapshot(4),
          trace.snapshot(4));
    }
    // 重新创建读取器，覆盖退出应用后从原生恢复页导出的情况。
    var exported =
        StartupDiagnosticEvidence.starts(
            new StartupHistoryStore(new JvmBackupFileSystem(), folder.getRoot()).list("zh"), null);
    assertEquals(3, exported.size());
    String latest = new String(exported.get("startup-1.json"), StandardCharsets.UTF_8);
    assertTrue(latest.contains("ERR_MODULE_NOT_FOUND"));
    assertTrue(latest.contains("fixture-4.mjs"));
    assertTrue(latest.contains("index.js:12"));
    assertFalse(latest.contains("private-token-value"));
    assertFalse(latest.contains("fixture-0.mjs"));
  }

  private Map<String, Object> descriptor(String hash) throws Exception {
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("version", 1L);
    value.put("baseVersion", "10");
    value.put("dshVersion", "0.2.1-rc.2");
    value.put("launcherContract", "DSHA_ARM64_V2");
    value.put("bridgeProtocol", 2L);
    value.put("dataRead", List.of("dsh-v3"));
    value.put("dataWrite", "dsh-v3");
    value.put("inputs", Map.of("builtin-plugins/dsh-copy-edit/lib/index.js", hash));
    value.put("runtimeId", RuntimeDescriptor.calculateId(value));
    return value;
  }

  private File put(String relative, byte[] bytes) throws Exception {
    File file = new File(folder.getRoot(), relative);
    file.getParentFile().mkdirs();
    Files.write(file.toPath(), bytes);
    return file;
  }

  @Test
  public void distinguishesApkFromOldRuntimeAndChangedManagedCode() throws Exception {
    var expected = descriptor("a".repeat(64));
    var installed = descriptor("b".repeat(64));
    put("linux/.runtime-descriptor.json", BackupJson.write(installed, 65536));
    byte[] code = "old-plugin-entry".getBytes(StandardCharsets.UTF_8);
    File entry = put("linux/ubuntu/root/dsha-copy-edit/lib/index.js", code);
    String exported =
        new String(
            StartupDiagnosticEvidence.runtime(
                new JvmBackupFileSystem(),
                folder.getRoot(),
                expected,
                "runtime:" + expected.get("runtimeId")),
            StandardCharsets.UTF_8);
    var parsed = BackupJson.read(exported.getBytes(StandardCharsets.UTF_8), 32768);
    assertEquals(false, parsed.get("matchesApk"));
    assertTrue(exported.contains((String) installed.get("runtimeId")));
    assertTrue(
        exported.contains(
            FileIntegrity.copy(new ByteArrayInputStream(code), null, code.length).sha256));
    assertFalse(exported.contains("old-plugin-entry"));
    assertArrayEquals(code, Files.readAllBytes(entry.toPath()));
  }

  @Test
  public void missingOrInvalidRuntimeDoesNotPreventTraceExport() throws Exception {
    var expected = descriptor("a".repeat(64));
    put("linux/.runtime-descriptor.json", "invalid json".getBytes(StandardCharsets.UTF_8));
    String data =
        new String(
            StartupDiagnosticEvidence.runtime(
                new JvmBackupFileSystem(), folder.getRoot(), expected, "token=secret-attempt"),
            StandardCharsets.UTF_8);
    assertTrue(data.contains("UNAVAILABLE"));
    assertFalse(data.contains("secret-attempt"));
    var current = new StartupTrace();
    current.begin(1, 0, false);
    current.add(1, 1, "Error: EADDRINUSE 127.0.0.1:43699");
    var traces = StartupDiagnosticEvidence.starts(List.of(), current.snapshot(2));
    assertTrue(
        new String(traces.get("startup-current.json"), StandardCharsets.UTF_8)
            .contains("EADDRINUSE"));
  }

  @Test
  public void refusesManagedFileSymlinkAndNeverReadsBusinessFiles() throws Exception {
    File leaf = put("linux/ubuntu/root/dsha-copy-edit/lib/index.js", new byte[10]);
    var guarded =
        new JvmBackupFileSystem() {
          @Override
          public Node stat(File file) throws IOException {
            if (file.equals(leaf)) return new Node("LINK", "fixture", 10, 0, 0, 0);
            return super.stat(file);
          }

          @Override
          public InputStream read(File file, Node expected) throws IOException {
            if (file.equals(leaf)) throw new AssertionError("followed symlink");
            if (!file.getName().equals(".runtime-descriptor.json"))
              throw new AssertionError("unexpected file read");
            return super.read(file, expected);
          }
        };
    String data =
        new String(
            StartupDiagnosticEvidence.runtime(
                guarded, folder.getRoot(), descriptor("a".repeat(64)), ""),
            StandardCharsets.UTF_8);
    assertTrue(data.contains("LINK"));
  }

  @Test
  public void redactsBeforeTailClippingAndKeepsUnicodeBoundaries() {
    String value = "token=" + "x".repeat(20000) + "\nCaused by: MODULE_MISSING";
    String tail = StartupDiagnosticEvidence.tail(value, 100);
    assertFalse(tail.contains("xxxxxxxx"));
    assertTrue(tail.contains("MODULE_MISSING"));
    assertEquals("[EARLIER_TEXT_OMITTED]\n文", StartupDiagnosticEvidence.tail("中😀文", 2));
  }

  @Test
  public void largeTraceStillFitsBoundedArchiveAndRetainsFinalCause() throws Exception {
    var trace = new StartupTrace();
    trace.begin(1, 0, false);
    for (int i = 0; i < 100; i++) trace.add(1, i, "中".repeat(300));
    trace.add(1, 101, "Caused by: FINAL_ERROR at plugin.mjs:99");
    var entries = StartupDiagnosticEvidence.starts(List.of(), trace.snapshot(102));
    assertTrue(entries.get("startup-current.json").length < StartupDiagnosticEvidence.ENTRY_LIMIT);
    assertTrue(
        new String(entries.get("startup-current.json"), StandardCharsets.UTF_8)
            .contains("FINAL_ERROR"));
    var output = new ByteArrayOutputStream();
    DiagnosticExportArchive.write(
        output, entries, Map.of("startupHistory", "BOUNDED"), new BackupControl(null));
    assertTrue(output.size() > 0);
  }
}
