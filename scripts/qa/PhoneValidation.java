package com.runningart.authdigest;

import android.app.Instrumentation;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.content.ContentValues;
import java.io.*;
import java.security.MessageDigest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** Explicit phone QA: on-device backups, synthetic fixtures, counts/hashes only. No auth access. */
public class PhoneValidation extends Instrumentation {
  private String action;
  private static final String[] FILES={"running-art.db","running-art.db-wal","running-art.db-shm"};
  @Override public void onCreate(Bundle args){super.onCreate(args);action=args.getString("action","inspect");start();}
  private String hash(byte[] bytes)throws Exception{StringBuilder s=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))s.append(String.format("%02x",b&255));return s.toString();}
  private byte[] read(File f)throws Exception{try(InputStream in=new FileInputStream(f);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return out.toByteArray();}}
  private void copy(File a,File b)throws Exception{byte[] bytes=read(a);try(FileOutputStream out=new FileOutputStream(b)){out.write(bytes);out.getFD().sync();}if(!hash(bytes).equals(hash(read(b))))throw new Exception("Copy mismatch");}
  private File folder(){return new File(getTargetContext().getFilesDir(),"SQLite");}
  private void backup(String name,boolean isolate)throws Exception{
    File dir=new File(folder(),name);if(dir.exists()||!dir.mkdir())throw new Exception("Backup exists");
    for(String n:FILES){File f=new File(folder(),n);if(f.exists())copy(f,new File(dir,n));}
    if(!new File(dir,FILES[0]).isFile())throw new Exception("No database");
    if(!new File(dir,"READY").createNewFile())throw new Exception("No backup marker");
    if(isolate)for(String n:FILES){File f=new File(folder(),n);if(f.exists()&&!f.delete())throw new Exception("Cannot isolate");}
  }
  private void restore()throws Exception{
    File dir=new File(folder(),"phone-validation-synced");
    if(!new File(dir,"READY").isFile())throw new Exception("No backup");
    for(String n:FILES){File from=new File(dir,n),to=new File(folder(),n);if(from.exists())copy(from,to);else if(to.exists()&&!to.delete())throw new Exception("Sidecar removal failed");}
  }
  private String digest(SQLiteDatabase db,String table,String where)throws Exception{
    MessageDigest d=MessageDigest.getInstance("SHA-256");int count=0;
    String order=table.equals("running_points")?"run_id,sequence":"id";
    // Sync metadata can change legitimately; verify all stored user content and guidance fields.
    String cols=table.equals("saved_courses")?"id,name,source,shape,target_km,length_km,score,snapshot_json,snapshot_hash,created_at,updated_at,owner_id":table.equals("running_sessions")?"id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count,rejected_count,last_timestamp,segment,break_pending,reason,owner_id,course_id,course_name,course_outcome,course_snapshot_json,course_snapshot_hash":"*";
    try(Cursor c=db.rawQuery("SELECT "+cols+" FROM "+table+where+" ORDER BY "+order,null)){
      while(c.moveToNext()){count++;for(int i=0;i<c.getColumnCount();i++){d.update((byte)c.getType(i));if(c.isNull(i))continue;byte[] b=c.getString(i).getBytes(StandardCharsets.UTF_8);d.update(ByteBuffer.allocate(4).putInt(b.length).array());d.update(b);}}
    }
    StringBuilder hex=new StringBuilder();for(byte b:d.digest())hex.append(String.format("%02x",b&255));return count+":"+hex;
  }
  private JSONObject inspect(SQLiteDatabase db)throws Exception{
    JSONObject out=new JSONObject();
    for(String t:new String[]{"saved_courses","running_sessions","running_points","storage_test_notes"})out.put(t,digest(db,t,""));
    JSONArray tests=new JSONArray();
    try(Cursor c=db.rawQuery("SELECT id,name,snapshot_json,remote_version,dirty,snapshot_hash FROM saved_courses WHERE name LIKE 'QA phone %' ORDER BY id",null)){
      while(c.moveToNext()){JSONObject s=new JSONObject(c.getString(2));tests.put(new JSONObject().put("kind","course").put("id",c.getString(0)).put("name",c.getString(1)).put("schema",s.getInt("schemaVersion")).put("remoteVersion",c.getInt(3)).put("dirty",c.getInt(4)).put("snapshotHash",c.getString(5)));}
    }
    try(Cursor c=db.rawQuery("SELECT id,course_name,remote_version,dirty,point_count,course_snapshot_hash FROM running_sessions WHERE course_name LIKE 'QA phone %' ORDER BY id",null)){
      while(c.moveToNext())tests.put(new JSONObject().put("kind","run").put("id",c.getString(0)).put("name",c.getString(1)).put("remoteVersion",c.getInt(2)).put("dirty",c.getInt(3)).put("points",c.getInt(4)).put("courseHash",c.getString(5)));
    }
    out.put("tests",tests);
    // Additional explicitly synthetic 2026-10-05 fixtures; report content hashes
    // without account ownership so withdrawal's intended guest conversion can
    // be verified independently from preservation of the original user records.
    JSONObject remaining=new JSONObject();
    for(String table:new String[]{"saved_courses","running_sessions","running_points"}) {
      String where=table.equals("saved_courses")?" WHERE name LIKE 'QA remaining %'":table.equals("running_sessions")?" WHERE course_name LIKE 'QA remaining %'":" WHERE run_id IN (SELECT id FROM running_sessions WHERE course_name LIKE 'QA remaining %')";
      String order=table.equals("running_points")?"run_id,sequence":"id";
      MessageDigest digest=MessageDigest.getInstance("SHA-256");int count=0,guests=0;
      try(Cursor c=db.rawQuery("SELECT * FROM "+table+where+" ORDER BY "+order,null)) {
        while(c.moveToNext()){count++;for(int i=0;i<c.getColumnCount();i++) {
          String col=c.getColumnName(i);
          if(col.equals("owner_id")){if(c.getString(i).isEmpty())guests++;continue;}
          if(col.equals("remote_version")||col.equals("dirty")||col.equals("mutation_id"))continue;
          digest.update((byte)c.getType(i));if(c.isNull(i))continue;
          byte[] bytes=c.getString(i).getBytes(StandardCharsets.UTF_8);digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());digest.update(bytes);
        }}
      }
      StringBuilder hex=new StringBuilder();for(byte b:digest.digest())hex.append(String.format("%02x",b&255));
      remaining.put(table,new JSONObject().put("count",count).put("guests",guests).put("contentHash",hex.toString()));
    }
    out.put("remainingSynthetic",remaining);
    for(String t:new String[]{"sync_deletions","sync_conflicts"})try(Cursor c=db.rawQuery("SELECT count(*) FROM "+t,null)){c.moveToFirst();out.put(t,c.getInt(0));}
    return out;
  }
  private void exportCustom(SQLiteDatabase db,Bundle out)throws Exception{
    try(Cursor c=db.rawQuery("SELECT id,snapshot_json FROM saved_courses WHERE name='QA phone v3'",null)){
      if(c.getCount()!=1||!c.moveToFirst())throw new Exception("Ambiguous fixture");
      JSONObject s=new JSONObject(c.getString(1));if(s.getInt("schemaVersion")!=3)throw new Exception("Wrong schema");
      JSONArray route=s.getJSONArray("route");for(int i=0;i<route.length();i++){JSONArray p=route.getJSONArray(i);if(p.getDouble(0)<126.9||p.getDouble(0)>127.2||p.getDouble(1)<37.4||p.getDouble(1)>37.6)throw new Exception("Not public Seoul fixture");}
      out.putString("fixture",new JSONObject().put("id",c.getString(0)).put("snapshot",s).toString());
    }
  }
  private void seed(SQLiteDatabase db)throws Exception{
    JSONObject input;
    try(ParcelFileDescriptor p=getUiAutomation().executeShellCommand("cat /data/local/tmp/runpen-phone-fixture.json");InputStream in=new FileInputStream(p.getFileDescriptor());ByteArrayOutputStream out=new ByteArrayOutputStream()){
      byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);input=new JSONObject(out.toString("UTF-8"));
    }
    String owner;try(Cursor c=db.rawQuery("SELECT owner_id FROM sync_accounts WHERE enabled=1",null)){if(c.getCount()!=1||!c.moveToFirst())throw new Exception("Ambiguous owner");owner=c.getString(0);}
    db.beginTransaction();try{
      for(String table:new String[]{"saved_courses","running_sessions","running_points"}){
        JSONArray rows=input.getJSONArray(table);
        for(int i=0;i<rows.length();i++){
          JSONObject row=rows.getJSONObject(i);String id=row.getString(table.equals("running_points")?"run_id":"id");
          if(!id.matches("0505[a-f0-9]{28}"))throw new Exception("Non-fixture id");
          if(table.equals("saved_courses")&&!row.getString("name").startsWith("QA phone "))throw new Exception("Non-fixture course");
          if(table.equals("running_sessions")&&!row.getString("course_name").startsWith("QA phone "))throw new Exception("Non-fixture run");
          ContentValues values=new ContentValues();java.util.Iterator<String> keys=row.keys();
          while(keys.hasNext()){String key=keys.next();Object v=row.get(key);if(key.equals("owner_id"))values.put(key,owner);else if(v==JSONObject.NULL)values.putNull(key);else if(v instanceof Number){if(v instanceof Double||v instanceof Float)values.put(key,((Number)v).doubleValue());else values.put(key,((Number)v).longValue());}else values.put(key,v.toString());}
          db.insertOrThrow(table,null,values);
        }
      }db.setTransactionSuccessful();
    }finally{db.endTransaction();}
  }
  private void cleanupBackups()throws Exception{
    for(String name:new String[]{"phone-validation-original","phone-validation-synced"}){
      File dir=new File(folder(),name);if(!dir.exists())continue;
      if(!dir.getCanonicalFile().getParentFile().equals(folder().getCanonicalFile()))throw new Exception("Invalid backup root");
      for(String n:FILES){File f=new File(dir,n);if(f.exists()&&!f.delete())throw new Exception("Backup cleanup failed");}
      File marker=new File(dir,"READY");if(marker.exists()&&!marker.delete())throw new Exception("Marker cleanup failed");
      if(!dir.delete())throw new Exception("Unexpected backup files");
    }
  }
  @Override public void onStart(){Bundle result=new Bundle();try{
    if(action.equals("backup")){backup("phone-validation-original",false);result.putString("result","Original backup retained on device; fsync/hash verified");}
    else if(action.equals("isolate")){backup("phone-validation-synced",true);result.putString("result","Synced backup retained on device; empty store ready");}
    else if(action.equals("restore")){restore();result.putString("result","Synced database restored; fsync/hash verified");}
    else if(action.equals("cleanup-backups")){cleanupBackups();result.putString("result","Backup directories removed");}
    else{
      SQLiteDatabase db=SQLiteDatabase.openDatabase(new File(folder(),FILES[0]).getPath(),null,action.equals("seed")?SQLiteDatabase.OPEN_READWRITE:SQLiteDatabase.OPEN_READONLY);
      try{if(action.equals("seed")){seed(db);result.putString("result","Synthetic fixtures added");}else if(action.equals("export-custom"))exportCustom(db,result);else if(action.equals("inspect"))result.putString("report",inspect(db).toString());else throw new Exception("Unknown action");}finally{db.close();}
    }finish(0,result);
  }catch(Exception e){result.putString("error",e.getClass().getSimpleName()+": "+e.getMessage());finish(1,result);}}
}
