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
  private long photoSince;
  private String photoPaths;
  private static final String[] FILES={"running-art.db","running-art.db-wal","running-art.db-shm"};
  @Override public void onCreate(Bundle args){super.onCreate(args);action=args.getString("action","inspect");photoSince=Long.parseLong(args.getString("since","0"));photoPaths=args.getString("paths","");start();}
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
  private void photoFiles(File dir,JSONArray output,int depth)throws Exception {
    if(depth>4||!dir.isDirectory())return;
    File[] files=dir.listFiles();if(files==null)return;
    for(File f:files){
      if(f.isDirectory()){photoFiles(f,output,depth+1);continue;}
      String relative=f.getCanonicalPath().substring(getTargetContext().getCacheDir().getCanonicalPath().length()+1);
      if(f.lastModified()<photoSince||(!relative.startsWith("ImageManipulator/")&&!relative.startsWith("ImagePicker/")))continue;
      if(f.length()>20_000_000)throw new Exception("Unexpected photo cache size");
      byte[] bytes=read(f);boolean metadata=false;
      if(bytes.length>4&&(bytes[0]&255)==255&&(bytes[1]&255)==216){
        int offset=2;
        while(offset+4<=bytes.length){
          if((bytes[offset]&255)!=255)throw new Exception("Invalid JPEG marker");
          int marker=bytes[offset+1]&255;if(marker==218||marker==217)break;
          if(marker>=224&&marker<=239||marker==254)metadata=true;
          int length=((bytes[offset+2]&255)<<8)|(bytes[offset+3]&255);
          if(length<2||offset+2+length>bytes.length)throw new Exception("Invalid JPEG segment");
          offset+=2+length;
        }
      }
      android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options();
      options.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(f.getPath(),options);
      output.put(new JSONObject().put("path",relative).put("bytes",bytes.length).put("sha256",hash(bytes))
        .put("width",options.outWidth).put("height",options.outHeight).put("mime",options.outMimeType)
        .put("hasAppOrCommentMetadata",metadata));
    }
  }
  private JSONArray recentRuns(SQLiteDatabase db)throws Exception {
    if(photoSince<=0)throw new Exception("Explicit test start time required");
    JSONArray runs=new JSONArray();
    try(Cursor c=db.rawQuery("SELECT id,status,started_at,ended_at,active_ms,checkpoint_at,resumed_at,distance_m,point_count,rejected_count,last_timestamp,segment,reason FROM running_sessions WHERE started_at>=? ORDER BY started_at",new String[]{Long.toString(photoSince)})){
      while(c.moveToNext()){
        JSONObject run=new JSONObject();
        for(int i=0;i<c.getColumnCount();i++)run.put(c.getColumnName(i),c.isNull(i)?JSONObject.NULL:c.getType(i)==Cursor.FIELD_TYPE_INTEGER?c.getLong(i):c.getType(i)==Cursor.FIELD_TYPE_FLOAT?c.getDouble(i):c.getString(i));
        JSONArray times=new JSONArray();
        try(Cursor points=db.rawQuery("SELECT sequence,segment,timestamp,accuracy FROM running_points WHERE run_id=? ORDER BY sequence",new String[]{c.getString(0)})){
          while(points.moveToNext())times.put(new JSONObject().put("sequence",points.getInt(0)).put("segment",points.getInt(1)).put("timestamp",points.getLong(2)).put("accuracy",points.getDouble(3)));
        }
        run.put("pointTiming",times);runs.put(run);
      }
    }
    return runs;
  }
  @Override public void onStart(){Bundle result=new Bundle();try{
    if(action.equals("photo-cleanup")){
      if(photoSince<=0||photoPaths.isEmpty())throw new Exception("Explicit fixture time and paths required");
      File cache=getTargetContext().getCacheDir().getCanonicalFile();int removed=0;
      String[] paths=photoPaths.split(",");if(paths.length>50)throw new Exception("Too many photo paths");
      for(String relative:paths){
        if(!relative.matches("(?:ImagePicker|ImageManipulator)/[a-f0-9-]+\\.(?:jpg|jpeg|heic)"))throw new Exception("Not a photo fixture cache path");
        File f=new File(cache,relative).getCanonicalFile();
        if(!f.getParentFile().getParentFile().equals(cache))throw new Exception("Invalid cache root");
        if(f.exists()){
          if(f.lastModified()<photoSince)throw new Exception("Pre-existing cache file");
          if(!f.delete())throw new Exception("Photo cleanup failed");removed++;
        }
      }
      result.putInt("removed",removed);
    }
    else if(action.equals("photo-report")){
      if(photoSince<=0)throw new Exception("Explicit fixture start time required");
      JSONArray files=new JSONArray();photoFiles(getTargetContext().getCacheDir(),files,0);result.putString("photos",files.toString());
    }
    else if(action.equals("backup")){backup("phone-validation-original",false);result.putString("result","Original backup retained on device; fsync/hash verified");}
    else if(action.equals("isolate")){backup("phone-validation-synced",true);result.putString("result","Synced backup retained on device; empty store ready");}
    else if(action.equals("restore")){restore();result.putString("result","Synced database restored; fsync/hash verified");}
    else if(action.equals("cleanup-backups")){cleanupBackups();result.putString("result","Backup directories removed");}
    else{
      SQLiteDatabase db=SQLiteDatabase.openDatabase(new File(folder(),FILES[0]).getPath(),null,action.equals("seed")?SQLiteDatabase.OPEN_READWRITE:SQLiteDatabase.OPEN_READONLY);
      try{if(action.equals("seed")){seed(db);result.putString("result","Synthetic fixtures added");}else if(action.equals("export-custom"))exportCustom(db,result);else if(action.equals("inspect"))result.putString("report",inspect(db).toString());else if(action.equals("recent-runs"))result.putString("runs",recentRuns(db).toString());else throw new Exception("Unknown action");}finally{db.close();}
    }finish(0,result);
  }catch(Exception e){result.putString("error",e.getClass().getSimpleName()+": "+e.getMessage());finish(1,result);}}
}
