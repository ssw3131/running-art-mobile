package com.runningart.commonuiqa;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;

/** Isolated emulator UI inspection. No app data, authentication, network, or file access. */
public class CommonUiAccessibility extends Instrumentation {
  private Bundle args;
  @Override public void onCreate(Bundle value) { super.onCreate(value); args=value; start(); }
  private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String key) {
    if(node==null) return null;
    if(key.equals(node.getViewIdResourceName()) || key.contentEquals(node.getText()==null?"":node.getText()) ||
       key.contentEquals(node.getContentDescription()==null?"":node.getContentDescription())) return node;
    for(int i=0;i<node.getChildCount();i++) { AccessibilityNodeInfo result=find(node.getChild(i),key); if(result!=null)return result; }
    return null;
  }
  @Override public void onStart() {
    Bundle result=new Bundle();
    try {
      UiAutomation automation=getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      Thread.sleep(1000);
      AccessibilityNodeInfo root=automation.getRootInActiveWindow();
      result.putString("rootPackage",root==null?"NONE":String.valueOf(root.getPackageName()));
      if("deny-notifications".equals(args.getString("action"))) {
        if(root==null || !("com.android.permissioncontroller".contentEquals(root.getPackageName()) ||
            "com.google.android.permissioncontroller".contentEquals(root.getPackageName()))) throw new Exception("Not permission dialog");
        AccessibilityNodeInfo node=find(root,"Don’t allow");
        if(node==null || !node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new Exception("Deny unavailable");
        result.putString("notificationPermission","denied");finish(0,result);return;
      }
      if(root==null || !"com.runningart.mobile.dev".contentEquals(root.getPackageName())) throw new Exception("Not RunPen preview");
      String action=args.getString("action","focus");
      if(action.equals("click")) {
        AccessibilityNodeInfo node=find(root,args.getString("key"));
        if(node==null || !node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new Exception("Click unavailable");
        Thread.sleep(1800);
        root=automation.getRootInActiveWindow();
      } else if(!action.equals("focus")) throw new Exception("Unsupported action");
      AccessibilityNodeInfo focus=root==null?null:root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
      result.putString("focusText",focus==null?"NONE":String.valueOf(focus.getText()));
      result.putString("focusLabel",focus==null?"NONE":String.valueOf(focus.getContentDescription()));
      result.putString("focusId",focus==null?"NONE":String.valueOf(focus.getViewIdResourceName()));
      finish(0,result);
    } catch(Exception error) { result.putString("error",error.toString());finish(1,result); }
  }
}
