package com.runningart.emulatorauth;

import android.app.Instrumentation;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Seed only an approved synthetic session into an already signed-out app.
 * No user session is read, copied or replaced. OAuth UI itself is not tested here.
 * APK is a temporary same-signature instrumentation helper, never product code.
 */
public class EmulatorAuth extends Instrumentation {
  private static final String AUTH="running-art-auth-v1", SERVICE="key_v1";
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  private String fixture() throws Exception {
    try(ParcelFileDescriptor p=getUiAutomation().executeShellCommand("cat /data/local/tmp/runpen-emulator-session.json");
        InputStream in=new FileInputStream(p.getFileDescriptor());ByteArrayOutputStream out=new ByteArrayOutputStream()) {
      byte[] bytes=new byte[4096];int n;
      while((n=in.read(bytes))!=-1){out.write(bytes,0,n);if(out.size()>100000)throw new Exception("Fixture too large");}
      return new String(out.toByteArray(),StandardCharsets.UTF_8);
    }
  }
  private String encrypted(String value,SecretKey key) throws Exception {
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);
    GCMParameterSpec spec=c.getParameters().getParameterSpec(GCMParameterSpec.class);
    return new JSONObject().put("scheme","aes").put("ct",Base64.encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP))
      .put("iv",Base64.encodeToString(spec.getIV(),Base64.NO_WRAP)).put("tlen",spec.getTLen())
      .put("usesKeystoreSuffix",true).put("keystoreAlias",SERVICE).put("requireAuthentication",false).toString();
  }
  @Override public void onStart(){
    Bundle result=new Bundle();
    try {
      if(!getTargetContext().getPackageName().equals("com.runningart.mobile.dev"))throw new Exception("Wrong app");
      if(!android.os.Build.FINGERPRINT.contains("generic") && !android.os.Build.MODEL.contains("sdk_gphone"))throw new Exception("Emulator only");
      JSONObject f=new JSONObject(fixture());
      if(!f.getString("fixture").equals("runpen-isolated-membership-v1") || !f.getString("projectUrl").equals("https://localhost:54431"))throw new Exception("Wrong fixture");
      if(!f.getString("role").equals("signup") && !f.getString("role").equals("service"))throw new Exception("Wrong fixture role");
      java.net.URI issuer=new java.net.URI(f.getString("issuer"));
      if(!issuer.getScheme().equals("http") || !(issuer.getHost().equals("127.0.0.1") || issuer.getHost().equals("localhost")) || issuer.getPort()!=54321 || !issuer.getPath().equals("/auth/v1"))throw new Exception("Not a loopback issuer");
      JSONObject s=f.getJSONObject("session"),u=s.getJSONObject("user");
      if(!u.getString("email").matches("qa-android-[a-f0-9-]+@example\\.invalid"))throw new Exception("Only disposable fixture identities are allowed");
      if(!u.getJSONObject("app_metadata").getString("runpen_qa_run").equals(f.getString("run")))throw new Exception("Wrong fixture run");
      JSONArray identities=u.getJSONArray("identities");
      if(identities.length()!=2)throw new Exception("Wrong fixture identities");
      boolean emailIdentity=false,socialIdentity=false;
      for(int i=0;i<identities.length();i++) {
        JSONObject identity=identities.getJSONObject(i),data=identity.getJSONObject("identity_data");
        if(identity.getString("provider").equals("email") && data.getString("email").equals(u.getString("email")))emailIdentity=true;
        else if(identity.getString("provider").equals("google") && data.getString("sub").equals("android-"+f.getString("run")+"-"+f.getString("role")) && data.getString("email").equals(u.getString("email")))socialIdentity=true;
        else throw new Exception("Not this run's synthetic identity");
      }
      if(!emailIdentity || !socialIdentity)throw new Exception("Missing synthetic identities");
      long expiry=s.getLong("expires_at")*1000,now=System.currentTimeMillis();
      if(expiry<=now || expiry>now+7200000)throw new Exception("Invalid fixture expiry");
      String[] jwt=s.getString("access_token").split("\\.");
      if(jwt.length!=3)throw new Exception("Invalid token format");
      JSONObject claims=new JSONObject(new String(Base64.decode(jwt[1],Base64.URL_SAFE|Base64.NO_WRAP),StandardCharsets.UTF_8));
      if(!claims.getString("sub").equals(u.getString("id")) || !claims.getString("iss").equals(f.getString("issuer")))throw new Exception("Fixture token mismatch");
      SharedPreferences prefs=getTargetContext().getSharedPreferences("SecureStore",0);
      for(String name:new String[]{AUTH,"running-art-auth-pending-v1"})
        if(prefs.contains(SERVICE+"-"+name)||prefs.contains(name))throw new Exception("Sign out first; existing authentication is never overwritten");
      String alias="AES/GCM/NoPadding:"+SERVICE+":keystoreUnauthenticated";
      KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
      if(!ks.containsAlias(alias)) {
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
          .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUserAuthenticationRequired(false).build());
        generator.generateKey();
      }
      SecretKey key=((KeyStore.SecretKeyEntry)ks.getEntry(alias,null)).getSecretKey();
      int[] chars=s.toString().codePoints().toArray();int count=(chars.length+399)/400;
      String generation="qa-"+UUID.randomUUID();SharedPreferences.Editor editor=prefs.edit();
      for(int i=0;i<count;i++)editor.putString(SERVICE+"-"+AUTH+"."+generation+"."+i,encrypted(new String(chars,i*400,Math.min(400,chars.length-i*400)),key));
      editor.putString(SERVICE+"-"+AUTH,encrypted(new JSONObject().put("generation",generation).put("count",count).toString(),key));
      if(!editor.commit())throw new Exception("SecureStore write failed");
      result.putString("report","Approved fixture session stored; no prior authentication read or replaced");finish(0,result);
    } catch(Exception e){result.putString("failure","Fixture/session validation or write failed: "+e.getClass().getSimpleName());finish(1,result);}
  }
}
