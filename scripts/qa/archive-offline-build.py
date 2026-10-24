"""Build a disposable offline UI fixture instrumentation, never product code."""
import os
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
folder = root / '.cache/archive-offline-auth'
sdk = root / '.tools/android-sdk'
for name in ['classes', 'dex']:
    (folder / name).mkdir(parents=True, exist_ok=True)
tools = sdk / 'build-tools/36.0.0'
api = sdk / 'platforms/android-36/android.jar'
package = 'com.runningart.archiveoffline'
def tool(name):
    return tools / (name + ('.bat' if name in ['d8', 'apksigner'] else '.exe'))
def run(*args):
    subprocess.run(list(map(str, args)), cwd=root, check=True, timeout=120, capture_output=True)
(folder/'AndroidManifest.xml').write_text(f'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{package}"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:label="Archive offline UI fixture"/><instrumentation android:name="{package}.ArchiveOfflineAuth" android:targetPackage="com.runningart.mobile.dev"/></manifest>', encoding='utf8')
run(root/'.tools/java/bin/javac.exe', '-source','8','-target','8','-encoding','UTF-8','-bootclasspath',api,'-d',folder/'classes',root/'scripts/qa/ArchiveOfflineAuth.java')
run(tool('d8'),'--lib',api,'--output',folder/'dex',folder/'classes/com/runningart/archiveoffline/ArchiveOfflineAuth.class')
run(tool('aapt2'),'link','-I',api,'--manifest',folder/'AndroidManifest.xml','-o',folder/'unsigned.apk')
run(root/'.tools/java/bin/jar.exe','uf',folder/'unsigned.apk','-C',folder/'dex','classes.dex')
run(tool('zipalign'),'-f','4',folder/'unsigned.apk',folder/'aligned.apk')
run(tool('apksigner'),'sign','--ks',root/'android/app/debug.keystore','--ks-pass','pass:android','--key-pass','pass:android','--out',folder/'auth.apk',folder/'aligned.apk')
print('Offline instrumentation built')
