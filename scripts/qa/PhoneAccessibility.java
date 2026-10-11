package com.runningart.authdigest;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.view.accessibility.AccessibilityNodeInfo;

/** Operates only the visible RunPen terrain graph. No app storage access. */
public class PhoneAccessibility extends Instrumentation {
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  private AccessibilityNodeInfo find(AccessibilityNodeInfo node,String key){
    if(node==null)return null;
    if(key.equals(node.getViewIdResourceName()))return node;
    for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo match=find(node.getChild(i),key);if(match!=null)return match;}
    return null;
  }
  private AccessibilityNodeInfo chart(UiAutomation automation)throws Exception{
    AccessibilityNodeInfo root=automation.getRootInActiveWindow();
    if(root==null||!"com.runningart.mobile.dev".contentEquals(root.getPackageName()))throw new Exception("Not RunPen");
    AccessibilityNodeInfo node=find(root,"terrain-chart");
    if(node==null||!node.isVisibleToUser())throw new Exception("Terrain graph not visible");
    return node;
  }
  @Override public void onStart(){Bundle result=new Bundle();try{
    UiAutomation automation=getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
    Thread.sleep(1200);
    AccessibilityNodeInfo node=chart(automation);
    String before=String.valueOf(node.getContentDescription());
    // RN's adjustable delegate dispatches the event but returns the base View's
    // boolean, which can be false. Verify the observed value, not that boolean.
    result.putBoolean("incrementReturn",node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD));
    Thread.sleep(600);node=chart(automation);
    String incremented=String.valueOf(node.getContentDescription());
    if(before.equals(incremented))throw new Exception("Increment did not change selection");
    result.putBoolean("decrementReturn",node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD));
    Thread.sleep(600);String restored=String.valueOf(chart(automation).getContentDescription());
    if(!before.equals(restored))throw new Exception("Decrement did not restore selection");
    result.putString("before",before);result.putString("incremented",incremented);result.putString("restored",restored);finish(0,result);
  }catch(Exception e){result.putString("error",e.toString());finish(1,result);}}
}
