package com.runningart.accountqa;

import android.app.Instrumentation;
import android.os.Bundle;
import android.util.Base64;
import android.view.accessibility.AccessibilityNodeInfo;
import java.nio.charset.StandardCharsets;

/** Removable UI input helper. Only edits the visible RunPen nickname field;
 * never reads app files, credentials or databases and never presses Save. */
public class NicknameInput extends Instrumentation {
  private Bundle arguments;
  @Override public void onCreate(Bundle values) { super.onCreate(values); arguments = values; start(); }
  private AccessibilityNodeInfo find(AccessibilityNodeInfo node) {
    if (node == null) return null;
    if ("com.runningart.mobile.dev".contentEquals(node.getPackageName()) &&
        "profile-nickname".equals(node.getViewIdResourceName()) && node.isEditable() && node.isVisibleToUser()) return node;
    for (int i = 0; i < node.getChildCount(); i++) {
      AccessibilityNodeInfo found = find(node.getChild(i)); if (found != null) return found;
    }
    return null;
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      String value = new String(Base64.decode(arguments.getString("utf8"), Base64.NO_WRAP), StandardCharsets.UTF_8);
      if (value.codePointCount(0, value.length()) > 80) throw new IllegalArgumentException("Input too long");
      AccessibilityNodeInfo input = null;
      for (int i = 0; i < 10 && input == null; i++) { input = find(getUiAutomation().getRootInActiveWindow()); if (input == null) Thread.sleep(300); }
      if (input == null) throw new IllegalStateException("Visible nickname input not found");
      Bundle action = new Bundle(); action.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
      if (!input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, action)) throw new IllegalStateException("Nickname input rejected");
      result.putString("result", "Nickname field changed; Save was not pressed"); finish(0, result);
    } catch (Throwable error) { result.putString("error", error.getClass().getSimpleName()); finish(1, result); }
  }
}
