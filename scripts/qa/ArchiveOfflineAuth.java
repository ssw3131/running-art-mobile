package com.runningart.archiveoffline;

import android.app.Instrumentation;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Offline UI fixture only. This is NOT a real Auth, consent or API test.
 * Installed only on new RunPen_Archive emulators with networking disabled.
 * Never built into the product, never reads/copies an existing user session.
 */
public class ArchiveOfflineAuth extends Instrumentation {
  private static final String OWNER="10000000-0000-4000-8000-000000000001",SERVICE="key_v1";
  @Override public void onCreate(Bundle args){super.onCreate(args);start();}
  private String encrypt(String value,SecretKey key)throws Exception{
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key);
    GCMParameterSpec spec=c.getParameters().getParameterSpec(GCMParameterSpec.class);
    return new JSONObject().put("scheme","aes").put("ct",Base64.encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP))
      .put("iv",Base64.encodeToString(spec.getIV(),Base64.NO_WRAP)).put("tlen",spec.getTLen())
      .put("usesKeystoreSuffix",true).put("keystoreAlias",SERVICE).put("requireAuthentication",false).toString();
  }
  private void store(SharedPreferences.Editor editor,String name,String value,SecretKey key)throws Exception{
    int[] chars=value.codePoints().toArray();int count=(chars.length+399)/400;
    for(int i=0;i<count;i++)editor.putString(SERVICE+"-"+name+".archivefixture."+i,encrypt(new String(chars,i*400,Math.min(400,chars.length-i*400)),key));
    editor.putString(SERVICE+"-"+name,encrypt(new JSONObject().put("generation","archivefixture").put("count",count).toString(),key));
  }
  @Override public void onStart(){Bundle out=new Bundle();try{
    boolean emulator=(android.os.Build.HARDWARE.equals("ranchu")||android.os.Build.HARDWARE.equals("goldfish"))&&android.os.Build.PRODUCT.startsWith("sdk_");
    if(!emulator||!getTargetContext().getPackageName().equals("com.runningart.mobile.dev"))throw new Exception("Emulator only");
    if(android.provider.Settings.Global.getInt(getTargetContext().getContentResolver(),"airplane_mode_on",0)!=1)throw new Exception("Offline required");
    SharedPreferences prefs=getTargetContext().getSharedPreferences("SecureStore",0);
    if(prefs.contains(SERVICE+"-running-art-auth-v1"))throw new Exception("Existing session forbidden");
    String alias="AES/GCM/NoPadding:"+SERVICE+":keystoreUnauthenticated";
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(!ks.containsAlias(alias)){KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();}
    SecretKey key=((KeyStore.SecretKeyEntry)ks.getEntry(alias,null)).getSecretKey();
    long expiry=System.currentTimeMillis()/1000+3600;
    String claims=new JSONObject().put("sub",OWNER).put("exp",expiry).put("iss","offline-ui-fixture").toString();
    String jwt="eyJhbGciOiJub25lIn0."+Base64.encodeToString(claims.getBytes(StandardCharsets.UTF_8),Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING)+".offline-fixture";
    JSONObject user=new JSONObject().put("id",OWNER).put("email","qa-archive@example.invalid").put("aud","authenticated").put("role","authenticated")
      .put("user_metadata",new JSONObject().put("runpen_nickname","러너")).put("app_metadata",new JSONObject()).put("identities",new JSONArray().put(new JSONObject().put("provider","google")));
    JSONObject session=new JSONObject().put("access_token",jwt).put("refresh_token","offline-fixture-invalid").put("expires_at",expiry).put("expires_in",3600).put("token_type","bearer").put("user",user);
    JSONObject receipt=new JSONObject().put("owner",OWNER).put("policyId","offline-ui-fixture").put("completedAt","2026-10-24T00:00:00Z").put("consentedAt","2026-10-24T00:00:00Z");
    SharedPreferences.Editor editor=prefs.edit();store(editor,"running-art-auth-v1",session.toString(),key);store(editor,"runpen.membership.receipt."+OWNER,receipt.toString(),key);
    if(!editor.commit())throw new Exception("write failed");out.putString("report","OFFLINE SYNTHETIC UI FIXTURE ONLY");finish(0,out);
  }catch(Exception e){out.putString("failure",e.getMessage());finish(1,out);}}
}
