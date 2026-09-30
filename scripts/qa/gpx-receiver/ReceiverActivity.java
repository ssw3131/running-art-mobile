package com.runningart.gpxreceiver;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

/** Local emulator-only recipient. No network or storage permissions; reads only the granted URI. */
public class ReceiverActivity extends Activity {
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    String status;
    try {
      Uri uri = getIntent().getParcelableExtra(Intent.EXTRA_STREAM);
      if (uri == null || !"content".equals(uri.getScheme())) throw new Exception("No content URI grant");
      String name = "";
      try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
        if (cursor != null && cursor.moveToFirst()) name = cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME));
      }
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long size = 0;
      try (InputStream input = getContentResolver().openInputStream(uri);
           OutputStream output = openFileOutput("received.gpx", MODE_PRIVATE)) {
        byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) { output.write(buffer, 0, count); digest.update(buffer, 0, count); size += count; }
      }
      StringBuilder hash = new StringBuilder();
      for (byte value : digest.digest()) hash.append(String.format("%02x", value & 0xff));
      JSONObject report = new JSONObject();
      report.put("name", name); report.put("mimeType", getIntent().getType());
      report.put("bytes", size); report.put("sha256", hash.toString());
      try (OutputStream output = openFileOutput("received.json", MODE_PRIVATE)) {
        output.write(report.toString(2).getBytes(StandardCharsets.UTF_8));
      }
      status = "GPX received\n" + report.toString(2);
    } catch (Exception error) { status = "GPX read failed: " + error.toString(); }
    TextView text = new TextView(this); text.setText(status); text.setTextSize(18); text.setPadding(32, 64, 32, 32);
    setContentView(text);
  }
}
