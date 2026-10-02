package com.runningart.hermesprobe;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;

/** Same-signature, removable QA instrumentation. Never changes user database rows. */
public class ProfileInstrumentation extends Instrumentation {
  private Bundle args;
  @Override public void onCreate(Bundle values) { super.onCreate(values); args = values == null ? new Bundle() : values; start(); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      File out = new File(getTargetContext().getExternalFilesDir(null), "hermes-probe");
      if (!out.exists() && !out.mkdirs()) throw new Exception("Cannot create QA folder");
      if ("profile".equals(args.getString("mode"))) {
        File stop = new File(out, "stop");
        Files.deleteIfExists(stop.toPath());
        Intent launch = getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivitySync(launch);
        Thread.sleep(6000);
        Class<?> profiler = getTargetContext().getClassLoader().loadClass("com.facebook.hermes.instrumentation.HermesSamplingProfiler");
        profiler.getMethod("enable").invoke(null);
        Bundle ready = new Bundle(); ready.putString("ready", "Hermes sampling enabled"); sendStatus(1, ready);
        try {
          long deadline = android.os.SystemClock.elapsedRealtime() + 180000;
          while (!stop.exists() && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(250);
          profiler.getMethod("dumpSampledTraceToFile", String.class).invoke(null, new File(out, "profile.json").getAbsolutePath());
        } finally { profiler.getMethod("disable").invoke(null); }
      } else if ("snapshot".equals(args.getString("mode"))) {
        File dbFile = new File(getTargetContext().getFilesDir(), "SQLite/running-art.db");
        SQLiteDatabase db = SQLiteDatabase.openDatabase(dbFile.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
        JSONObject tables = new JSONObject();
        try {
          for (String table : new String[]{"saved_courses", "storage_test_notes", "running_sessions", "running_points"}) {
            JSONArray rows = new JSONArray();
            try (Cursor cursor = db.rawQuery("SELECT * FROM " + table + " ORDER BY rowid", null)) {
              while (cursor.moveToNext()) {
                JSONArray row = new JSONArray();
                for (int i = 0; i < cursor.getColumnCount(); i++) row.put(cursor.isNull(i) ? JSONObject.NULL : cursor.getString(i));
                rows.put(row);
              }
            }
            tables.put(table, rows);
          }
        } finally { db.close(); }
        try (FileOutputStream stream = new FileOutputStream(new File(out, "user-records.json"))) { stream.write(tables.toString().getBytes("UTF-8")); }
      } else { throw new IllegalArgumentException("Expected -e mode profile or -e mode snapshot"); }
      result.putString("output", out.getAbsolutePath()); finish(0, result);
    } catch (Throwable error) { result.putString("error", android.util.Log.getStackTraceString(error)); finish(1, result); }
  }
}
