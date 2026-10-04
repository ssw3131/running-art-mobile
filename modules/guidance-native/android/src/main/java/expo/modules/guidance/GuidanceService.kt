package expo.modules.guidance

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import expo.modules.kotlin.Promise
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue

class GuidanceService : HeadlessJsTaskService(), TextToSpeech.OnInitListener {
  private val handler = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  private var voiceReady = false
  private var voiceError = "한국어 음성을 준비하고 있어요."
  private var pending: Pair<String, String>? = null
  private var utterances = 0
  private var spoken = 0
  private var vibrations = 0
  private var activeToken: String? = null
  private var pendingTick: Promise? = null
  private var notificationText = "모의 주행 준비 중 · 실제 GPS를 사용하지 않아요"
  private var lastDiagnostic = 0L
  private var lastState = ""
  private var lastPublish = 0L
  private val watchdog = object : Runnable {
    override fun run() {
      if (SystemClock.elapsedRealtime() - lastPublish > 15000) {
        Log.e(TAG, "heartbeat_timeout")
        commands.add("error")
        stopSelf()
      } else handler.postDelayed(this, 5000)
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    commands.clear()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "RunPen 모의 주행", NotificationManager.IMPORTANCE_LOW))
    lastPublish = SystemClock.elapsedRealtime()
    if (Build.VERSION.SDK_INT >= 34) startForeground(ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(ID, notification())
    tts = TextToSpeech(this, this)
    handler.postDelayed(watchdog, 5000)
    Log.i(TAG, "service_created")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action
    val tokenPresent = intent?.hasExtra("token")
    Log.i(TAG, "service_command action=$action tokenPresent=$tokenPresent")
    // A start request can arrive after onCreate; satisfy its foreground requirement here too.
    if (Build.VERSION.SDK_INT >= 34) startForeground(ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(ID, notification())
    if (action == "pause" || action == "stop") {
      silence()
      commands.add(action)
      handler.postDelayed({ if (instance === this) stopSelf() }, 2500)
      return START_NOT_STICKY
    }
    val token = intent?.getStringExtra("token")
    if (token == null) { stopSelf(); return START_NOT_STICKY }
    if (activeToken == null) {
      activeToken = token
      val data = Arguments.createMap().apply { putString("token", token) }
      startTask(HeadlessJsTaskConfig("runpen-guidance-simulation", data, 0, true))
    }
    return START_NOT_STICKY
  }

  override fun onInit(status: Int) {
    handler.post {
      val engine = tts ?: return@post
      if (status != TextToSpeech.SUCCESS || engine.setLanguage(Locale.KOREAN) < TextToSpeech.LANG_AVAILABLE) {
        voiceError = "한국어 음성이 없어요. Android 음성 출력 설정에서 한국어를 설치해 주세요."
        Log.w(TAG, "tts_korean_unavailable")
        return@post
      }
      val offline = engine.voices?.firstOrNull { it.locale.language == "ko" && !it.isNetworkConnectionRequired }
      if (offline == null) {
        voiceError = "오프라인 한국어 음성이 없어요. 음성 데이터를 설치해 주세요."
        Log.w(TAG, "tts_offline_unavailable")
        return@post
      }
      engine.voice = offline
      engine.setSpeechRate(1f)
      engine.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) { Log.i(TAG, "tts_start id=$id") }
        override fun onDone(id: String?) { spoken++; Log.i(TAG, "tts_done id=$id") }
        @Deprecated("Deprecated in Java") override fun onError(id: String?) { voiceError = "음성을 재생하지 못했어요. 문자 안내를 확인해 주세요."; Log.e(TAG, "tts_error id=$id") }
      })
      voiceReady = true
      voiceError = ""
      Log.i(TAG, "tts_ready locale=ko offline=true")
      pending?.let { speak(it.first, it.second) }
      pending = null
    }
  }

  fun nextTick(token: String, promise: Promise) {
    // Invoked on the main queue, serialized with onDestroy so no wait is lost.
    if (instance !== this || token != activeToken) {
      promise.resolve(false)
      return
    }
    pendingTick?.resolve(false)
    pendingTick = promise
    handler.postDelayed({
      if (pendingTick === promise) {
        pendingTick = null
        promise.resolve(instance === this && token == activeToken)
      }
    }, 250)
  }

  fun feedback(id: String, text: String, vibrate: Boolean) {
    handler.post {
      if (instance !== this) return@post
      if (text.isNotBlank()) {
        if (voiceReady) speak(id, text) else pending = id to text
      }
      if (vibrate) {
        val vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 180, 120, 180), -1))
        else @Suppress("DEPRECATION") vibrator.vibrate(longArrayOf(0, 180, 120, 180), -1)
        vibrations++
        Log.i(TAG, "vibration id=$id supported=${vibrator.hasVibrator()}")
      }
    }
  }
  private fun speak(id: String, text: String) {
    utterances++
    val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
    if (result == TextToSpeech.ERROR) voiceError = "음성 재생에 실패했어요. 문자 안내를 확인해 주세요."
  }
  fun silence() { handler.post { pending = null; tts?.stop(); (getSystemService(VIBRATOR_SERVICE) as Vibrator).cancel() } }
  fun publish(text: String, diagnostic: String) {
    handler.post {
      if (instance !== this) return@post
      lastPublish = SystemClock.elapsedRealtime()
      if (notificationText != text) {
        notificationText = text
        getSystemService(NotificationManager::class.java).notify(ID, notification())
      }
      val state = diagnostic.substringBefore('|')
      if (state != lastState || lastPublish - lastDiagnostic >= 30000) {
        Log.i(TAG, "checkpoint $diagnostic")
        lastState = state; lastDiagnostic = lastPublish
      }
    }
  }
  private fun notification(): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)!!.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP }
    val content = PendingIntent.getActivity(this, 410, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun action(name: String, code: Int) = PendingIntent.getService(this, code, Intent(this, GuidanceService::class.java).setAction(name), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    return builder.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("RunPen · 모의 주행")
      .setContentText(notificationText).setContentIntent(content).setOngoing(true).setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(null, "일시정지", action("pause", 411)).build())
      .addAction(Notification.Action.Builder(null, "시험 종료", action("stop", 412)).build()).build()
  }
  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf(); super.onTaskRemoved(rootIntent) }
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    pendingTick?.resolve(false); pendingTick = null
    pending = null
    tts?.stop(); tts?.shutdown(); tts = null
    (getSystemService(VIBRATOR_SERVICE) as Vibrator).cancel()
    if (instance === this) instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    Log.i(TAG, "service_destroyed utterances=$utterances completed=$spoken vibrations=$vibrations")
    super.onDestroy()
  }
  companion object {
    const val TAG = "RunPenGuidance"
    const val CHANNEL = "runpen-guidance-simulation"
    const val ID = 7410
    @Volatile var instance: GuidanceService? = null
    private val commands = ConcurrentLinkedQueue<String>()
    fun drainCommands(): List<String> { val result = mutableListOf<String>(); while (true) { result.add(commands.poll() ?: break) }; return result }
    fun status(): Map<String, Any> = instance?.let { mapOf("running" to true, "voiceReady" to it.voiceReady, "voiceError" to it.voiceError, "utterances" to it.utterances, "spoken" to it.spoken, "vibrations" to it.vibrations) }
      ?: mapOf("running" to false, "voiceReady" to false, "voiceError" to "", "utterances" to 0, "spoken" to 0, "vibrations" to 0)
  }
}
