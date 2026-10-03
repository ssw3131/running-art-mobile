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
    if (target.exists() && !target.delete()) throw new Exception("Cannot replace previous UI dump");
    Thread.sleep(500);
    getUiDevice().dumpWindowHierarchy("running-qa.xml");
    if (!target.isFile() || target.length() == 0) throw new Exception("No fresh UI hierarchy");
  }
}
