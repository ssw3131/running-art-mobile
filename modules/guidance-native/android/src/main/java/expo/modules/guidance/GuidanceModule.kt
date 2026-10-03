package expo.modules.guidance

import android.content.Intent
import android.os.Build
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GuidanceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RunPenGuidance")
    AsyncFunction("start") { token: String ->
      val context = appContext.reactContext ?: error("앱 실행 환경을 확인할 수 없어요.")
      check(appContext.currentActivity != null) { "앱 화면에서 모의 주행을 시작해 주세요." }
      val intent = Intent(context, GuidanceService::class.java).putExtra("token", token)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      Unit
    }
    Function("stop") {
      appContext.reactContext?.stopService(Intent(appContext.reactContext, GuidanceService::class.java))
    }
    Function("clock") { SystemClock.elapsedRealtime().toDouble() }
    Function("commands") { GuidanceService.drainCommands() }
    Function("status") { GuidanceService.status() }
    Function("publish") { text: String, diagnostic: String -> GuidanceService.instance?.publish(text, diagnostic) }
    Function("feedback") { id: String, text: String, vibrate: Boolean -> GuidanceService.instance?.feedback(id, text, vibrate) }
    Function("silence") { GuidanceService.instance?.silence() }
  }
}
