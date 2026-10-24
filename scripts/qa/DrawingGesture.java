import android.graphics.Point;
import com.android.uiautomator.core.Configurator;
import com.android.uiautomator.testrunner.UiAutomatorTestCase;

// Physical touch sequence on an explicitly selected device, no app test entry point.
public class DrawingGesture extends UiAutomatorTestCase {
  public void testStroke() throws Exception {
    Configurator.getInstance().setWaitForIdleTimeout(0);
    String input = getParams().getString("input");
    if (input != null) {
      // Legacy UiObject.setText injects key events and silently drops Hangul.
      // Use the visible accessibility node, without app hooks or clipboard state.
      com.android.uiautomator.core.UiObject field = new com.android.uiautomator.core.UiObject(new com.android.uiautomator.core.UiSelector().resourceId(input));
      java.lang.reflect.Method lookup = field.getClass().getDeclaredMethod("findAccessibilityNodeInfo", long.class);
      lookup.setAccessible(true);
      android.view.accessibility.AccessibilityNodeInfo node = (android.view.accessibility.AccessibilityNodeInfo) lookup.invoke(field, 5000L);
      assertNotNull(node);
      assertEquals("com.runningart.mobile.dev", node.getPackageName().toString());
      assertTrue(node.isEditable() && node.isVisibleToUser());
      String value = new String(android.util.Base64.decode(getParams().getString("utf8"), android.util.Base64.NO_WRAP), "UTF-8");
      android.os.Bundle action = new android.os.Bundle();
      action.putCharSequence(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
      assertTrue(node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_SET_TEXT, action));
      Thread.sleep(500);
      assertTrue(node.refresh());
      assertEquals(value, node.getText().toString());
      return;
    }
    String click = getParams().getString("click");
    if (click != null) {
      assertTrue(new com.android.uiautomator.core.UiObject(new com.android.uiautomator.core.UiSelector().resourceId(click)).click());
      return;
    }
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
