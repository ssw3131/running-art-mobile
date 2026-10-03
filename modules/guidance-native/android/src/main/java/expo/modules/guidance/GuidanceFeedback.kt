package expo.modules.guidance

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

// Speech belongs to the GPS session, not an Activity or the simulation service.
// Expo Location already owns the location foreground service and wake lifetime.
class GuidanceFeedback(private val context: Context) : TextToSpeech.OnInitListener {
  private val handler = Handler(Looper.getMainLooper())
  private var tts: TextToSpeech? = null
  @Volatile private var ready = false
  @Volatile private var error = "한국어 음성을 준비하고 있어요."
  @Volatile private var spoken = 0
  @Volatile private var utterances = 0
  @Volatile private var vibrations = 0
  private var pending: Pair<String, String>? = null
  private var closed = false

  init { handler.post { if (!closed) tts = TextToSpeech(context.applicationContext, this) } }
  override fun onInit(status: Int) {
    handler.post {
      val engine = tts ?: return@post
      if (closed) return@post
      val offline = engine.voices?.firstOrNull { it.locale.language == "ko" && !it.isNetworkConnectionRequired }
      if (status != TextToSpeech.SUCCESS || engine.setLanguage(Locale.KOREAN) < TextToSpeech.LANG_AVAILABLE || offline == null) {
        error = "오프라인 한국어 음성이 없어요. Android 음성 출력 설정에서 한국어를 설치해 주세요."
        Log.w(TAG, "tts_unavailable")
        return@post
      }
      engine.voice = offline
      engine.setSpeechRate(1f)
      engine.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) { Log.i(TAG, "tts_start id=$id") }
        override fun onDone(id: String?) { spoken++; Log.i(TAG, "tts_done id=$id") }
        @Deprecated("Deprecated in Java") override fun onError(id: String?) { error = "음성을 재생하지 못했어요. 문자 안내를 확인해 주세요."; Log.e(TAG, "tts_error id=$id") }
      })
      ready = true; error = ""
      Log.i(TAG, "tts_ready offline=true")
      pending?.let { speak(it.first, it.second) }; pending = null
    }
  }
  fun feedback(id: String, text: String, vibrate: Boolean) {
    handler.post {
      if (closed) return@post
      if (text.isNotBlank()) { if (ready) speak(id, text) else pending = id to text }
      if (vibrate) {
        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 180, 120, 180), -1))
        else @Suppress("DEPRECATION") vibrator.vibrate(longArrayOf(0, 180, 120, 180), -1)
        vibrations++; Log.i(TAG, "vibration id=$id supported=${vibrator.hasVibrator()}")
      }
    }
  }
  private fun speak(id: String, text: String) {
    utterances++
    if (tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.ERROR) error = "음성을 재생하지 못했어요. 문자 안내를 확인해 주세요."
  }
  fun silence() { handler.post { pending = null; tts?.stop(); (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() } }
  fun shutdown() { handler.post { closed = true; pending = null; tts?.stop(); tts?.shutdown(); tts = null } }
  fun status(): Map<String, Any> = mapOf("voiceReady" to ready, "voiceError" to error, "utterances" to utterances, "spoken" to spoken, "vibrations" to vibrations)
  companion object { const val TAG = "RunPenGpsGuidance" }
}
