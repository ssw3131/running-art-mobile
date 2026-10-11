import java.io.File;
import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;

/** Android 10 runner resolves its data directory differently; report the actual fresh path. */
public class PerformanceUiDump extends UiAutomatorTestCase {
  public void testDump() throws Exception {
    Configurator.getInstance().setWaitForIdleTimeout(0);
    File output = new File(new File(android.os.Environment.getDataDirectory(), "local/tmp"), "route-performance-live.xml");
    output.getParentFile().mkdirs();
    if (output.exists() && !output.delete()) throw new Exception("Cannot remove previous dump");
    for (int i = 0; i < 15 && !output.exists(); i++) {
      Thread.sleep(100);
      getUiDevice().dumpWindowHierarchy("route-performance-live.xml");
    }
    assertTrue("A new UI snapshot must exist", output.exists() && output.length() > 0);
    System.out.println("PERFORMANCE_UI_PATH=" + output.getAbsolutePath());
  }
}
