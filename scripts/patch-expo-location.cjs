const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// expo-location 57.0.20 retains BIND_AUTO_CREATE connections after unregister,
// and a delayed onServiceConnected can resurrect a stopped notification.
// Keep this narrow patch reproducible after npm ci and fail on upstream changes.
const relative = 'android/src/main/java/expo/modules/location/taskConsumers/LocationTaskConsumer.kt';
const originalHash = '4ed55ae2a285ffc3add788266ad997808754d82b09559d0d03237ffdc218acb4';
const patchedHash = '6bcc51b6b0a00a212c658ff5626529617be3e95dc7b7c6c1d490e66aba67e47a';
const hash = text => createHash('sha256').update(text).digest('hex');
const replacement = `  // RunPen: serialize binding/unregister and release the native service connection.
  @Synchronized
  private fun maybeStartForegroundService() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val task = mTask ?: return
    if (!shouldUseForegroundService(task.options)) {
      stopForegroundService()
      return
    }
    if (!AppForegroundedSingleton.isForegrounded) return
    val context = context ?: return
    val serviceOptions = MapArguments(task.options).getArguments(FOREGROUND_SERVICE_KEY).toBundle()
    mService?.let {
      it.startForeground(serviceOptions)
      return
    }
    // An in-flight bind already owns the service; never create a second binding.
    if (mServiceConnection != null) return
    val serviceIntent = Intent(context, LocationTaskService::class.java).apply {
      putExtra("appId", task.appScopeKey)
      putExtra("taskName", task.name)
      putExtra("killService", serviceOptions.getBoolean("killServiceOnDestroy", false))
    }
    val connection = object : ServiceConnection {
      override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        synchronized(this@LocationTaskConsumer) {
          // Unregister or a replacement binding may have won while we waited.
          if (mServiceConnection !== this || mTask !== task) return
          val service = (binder as? ServiceBinder)?.service ?: return
          mService = service
          service.setParentContext(context)
          service.startForeground(MapArguments(task.options).getArguments(FOREGROUND_SERVICE_KEY).toBundle())
        }
      }
      override fun onServiceDisconnected(name: ComponentName) {
        synchronized(this@LocationTaskConsumer) {
          if (mServiceConnection === this) mService = null
        }
      }
    }
    mServiceConnection = connection
    try {
      context.startForegroundService(serviceIntent)
      check(context.bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE)) {
        "Could not bind the foreground location service"
      }
    } catch (error: Exception) {
      stopForegroundService()
      throw error
    }
  }

  @Synchronized
  private fun stopForegroundService() {
    val connection = mServiceConnection
    mServiceConnection = null
    mService?.stop()
    mService = null
    val context = context ?: return
    try {
      if (connection != null) context.unbindService(connection)
    } catch (_: IllegalArgumentException) {
      // bindService may have failed before registering the connection.
    } finally {
      // Also cancel a redelivered start with no binder in this consumer/process.
      context.stopService(Intent(context, LocationTaskService::class.java))
    }
  }

`;

function patchSource(source) {
  source = source.replace(/\r\n/g, '\n');
  const digest = hash(source);
  if (digest === patchedHash) return source;
  if (digest !== originalHash) throw new Error('expo-location source changed; review the foreground-service lifecycle patch before building.');
  const begin = source.indexOf('  private fun maybeStartForegroundService() {');
  const end = source.indexOf('  /**\n   * Reports locations immediately', begin);
  if (begin < 0 || end < 0) throw new Error('expo-location patch boundaries missing');
  source = source.slice(0, begin) + replacement + source.slice(end);
  source = source.replace('  private var mService: LocationTaskService? = null',
    '  private var mService: LocationTaskService? = null\n  private var mServiceConnection: ServiceConnection? = null');
  for (const method of ['didRegister', 'didUnregister', 'setOptions']) {
    source = source.replace('  override fun ' + method + '(', '  @Synchronized\n  override fun ' + method + '(');
  }
  source = source.replace('  override fun didUnregister() {\n    stopLocationUpdates()\n    stopForegroundService()\n    mTask = null',
    '  override fun didUnregister() {\n    mTask = null\n    stopLocationUpdates()\n    stopForegroundService()');
  if (hash(source) !== patchedHash) throw new Error('Unexpected location lifecycle patch output');
  return source;
}

function apply(root = path.resolve(__dirname, '..')) {
  const project = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!project.expo?.autolinking?.android?.buildFromSource?.includes('expo-location')) {
    throw new Error('The location patch requires expo.autolinking.android.buildFromSource: ["expo-location"]; prebuilt AARs do not contain it.');
  }
  const packageRoot = path.join(root, 'node_modules/expo-location');
  const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
  if (version !== '57.0.20') throw new Error('Review the location lifecycle patch for expo-location ' + version);
  const file = path.join(packageRoot, relative);
  const source = fs.readFileSync(file, 'utf8');
  const result = patchSource(source);
  if (source !== result) fs.writeFileSync(file, result);
  return hash(result);
}

module.exports = { patchSource, apply, relative, originalHash, patchedHash };
if (require.main === module) console.log('expo-location lifecycle patch:', apply());
