import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;

// A ticking stopwatch intentionally never becomes idle for the default dump CLI.
// Use the platform UIAutomator API with zero idle wait; no app test hooks.
public class RunningUiDump extends UiAutomatorTestCase {
  public void testDump() throws Exception {
    Configurator.getInstance().setWaitForIdleTimeout(0);
    // A new accessibility connection can initially have no active root. Never
    // report success while a previous hierarchy file is being read by the host.
    java.io.File target = new java.io.File("/data/local/tmp/running-qa.xml");
    // Some platform runners resolve their relative output through a nested
    // local/tmp directory. Clear both locations before accepting either one.
    java.io.File nested = new java.io.File("/data/local/tmp/local/tmp/running-qa.xml");
    if (target.exists() && !target.delete()) throw new Exception("Cannot replace previous UI dump");
    if (nested.exists() && !nested.delete()) throw new Exception("Cannot replace nested UI dump");
    Thread.sleep(500);
    getUiDevice().dumpWindowHierarchy("running-qa.xml");
    if (!target.isFile() && nested.isFile()) {
      try (java.io.InputStream in = new java.io.FileInputStream(nested);
           java.io.OutputStream out = new java.io.FileOutputStream(target)) {
        byte[] buffer = new byte[8192]; int size;
        while ((size = in.read(buffer)) != -1) out.write(buffer, 0, size);
      }
    }
    if (!target.isFile() || target.length() == 0) throw new Exception("No fresh UI hierarchy");
  }
}
