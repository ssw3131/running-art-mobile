import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;

// A ticking stopwatch intentionally never becomes idle for the default dump CLI.
// Use the platform UIAutomator API with zero idle wait; no app test hooks.
public class RunningUiDump extends UiAutomatorTestCase {
  public void testDump() throws Exception {
    Configurator.getInstance().setWaitForIdleTimeout(0);
    getUiDevice().dumpWindowHierarchy("running-qa.xml");
  }
}
