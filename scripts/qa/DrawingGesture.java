import android.graphics.Point;
import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;

// Physical touch sequence on an emulator, with no application test entry point.
public class DrawingGesture extends UiAutomatorTestCase {
  public void testStroke() throws Exception {
    Configurator.getInstance().setWaitForIdleTimeout(0);
    String[] coordinates = getParams().getString("points").split(";");
    Point[] points = new Point[coordinates.length];
    for (int i = 0; i < coordinates.length; i++) {
      String[] pair = coordinates[i].split(",");
      points[i] = new Point(Integer.parseInt(pair[0]), Integer.parseInt(pair[1]));
    }
    assertTrue(getUiDevice().swipe(points, 20));
    Thread.sleep(700);
  }
}
