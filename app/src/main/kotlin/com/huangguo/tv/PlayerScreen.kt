package com.huangguo.tv

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.AlignmentSpan
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import android.view.animation.DecelerateInterpolator
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(UnstableApi::class)
class PlayerScreen(
    activity: MainActivity,
    private val detail: VideoDetail,
    private var epIndex: Int
) : Screen(activity) {

    private val playerView: PlayerView
    private val overlay: TextView
    private val toastView: TextView
    private val player: ExoPlayer
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var pendingSeek = -1L
    private var loadingUrl = false

    /* 方向键：→ 按住/连点倍速快进(2..6)松开恢复 ← 按住连续后退10秒 ↑ 上一集 ↓ 下一集 */
    private val speeds = floatArrayOf(1f, 2f, 3f, 4f, 5f, 6f)
    private var speedIdx = 0
    private var lastBumpAt = 0L
    private var lastRewindAt = 0L
    private val uiHandler = Handler(Looper.getMainLooper())
    private val hideToast = Runnable {
        toastView.animate().alpha(0f).scaleX(0.92f).scaleY(0.92f).setDuration(180)
            .withEndAction { toastView.visibility = View.GONE }.start()
    }
    private val revertSpeed = Runnable {
        speedIdx = 0
        player.setPlaybackSpeed(1f)
        updateOverlay()
        uiHandler.removeCallbacks(hideToast)
        hideToast.run()
    }

    override val view: View

    init {
        val ctx = activity
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(HuangguoApi.UA)
            .setDefaultRequestProperties(mapOf("Referer" to "${HuangguoApi.SITE}/"))
            .setAllowCrossProtocolRedirects(true)
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(15_000, 60_000, 3_000, 3_000)
            .build()
        player = ExoPlayer.Builder(ctx)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setLoadControl(loadControl)
            .build()

        playerView = PlayerView(ctx).apply {
            player = this@PlayerScreen.player
            useController = true
            setControllerShowTimeoutMs(4000)
        }
        overlay = Ui.text(ctx, 18f).apply {
            setPadding(Ui.dp(ctx, 28f), Ui.dp(ctx, 18f), Ui.dp(ctx, 28f), Ui.dp(ctx, 6f))
            setBackgroundColor(0x99000000.toInt())
        }
        toastView = Ui.text(ctx, 22f).apply {
            setPadding(Ui.dp(ctx, 34f), Ui.dp(ctx, 20f), Ui.dp(ctx, 34f), Ui.dp(ctx, 20f))
            setBackgroundColor(0xAA000000.toInt())
            visibility = View.GONE
        }
        val root = FrameLayout(ctx)
        root.addView(playerView, FrameLayout.LayoutParams(-1, -1))
        root.addView(
            overlay,
            FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.TOP or Gravity.START }
        )
        root.addView(
            toastView,
            FrameLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER }
        )
        view = root

        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) nextEpisode()
            }

            override fun onPlayerError(error: PlaybackException) {
                overlay.text = "${detail.title}  播放失败：${error.errorCodeName}"
            }
        })
    }

    override fun onResume() {
        playCurrent()
    }

    override fun onPause() {
        saveResume()
        player.pause()
    }

    override fun onDestroy() {
        saveResume()
        scope.cancel()
        uiHandler.removeCallbacksAndMessages(null)
        playerView.player = null
        player.release()
    }

    override fun onKey(keyCode: Int, event: KeyEvent?): Boolean {
        if (event == null) return false
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_RIGHT -> when (event.action) {
                KeyEvent.ACTION_DOWN ->
                    if (event.repeatCount == 0) bumpSpeed()
                    else if (SystemClock.elapsedRealtime() - lastBumpAt >= 380) bumpSpeed()
                KeyEvent.ACTION_UP -> if (speedIdx > 0) armRevert(450)
            }
            KeyEvent.KEYCODE_DPAD_LEFT -> if (event.action == KeyEvent.ACTION_DOWN) {
                val now = SystemClock.elapsedRealtime()
                if (event.repeatCount == 0 || now - lastRewindAt >= 300) {
                    lastRewindAt = now
                    rewind10s()
                }
            }
            KeyEvent.KEYCODE_DPAD_UP ->
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) prevEpisode()
            KeyEvent.KEYCODE_DPAD_DOWN ->
                if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) manualNextEpisode()
            else -> return false
        }
        if (event.action == KeyEvent.ACTION_DOWN) playerView.showController()
        return true
    }

    private fun bumpSpeed() {
        val now = SystemClock.elapsedRealtime()
        speedIdx = if (now - lastBumpAt <= 600 && speedIdx >= 1)
            (speedIdx + 1).coerceAtMost(speeds.lastIndex) else 1
        lastBumpAt = now
        player.setPlaybackSpeed(speeds[speedIdx])
        speedToast(speedIdx + 1)
        updateOverlay()
        armRevert(900)
    }

    /* 倍速大字提示：黄色大号"N倍" + 小字"快进中"，按住期间持续显示 */
    private fun speedToast(level: Int) {
        val sp = SpannableStringBuilder()
        sp.append("${level}倍")
        sp.setSpan(AbsoluteSizeSpan(34, true), 0, sp.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sp.setSpan(ForegroundColorSpan(0xFFFFD21C.toInt()), 0, sp.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        val sub = sp.length
        sp.append("\n快进中")
        sp.setSpan(AbsoluteSizeSpan(14, true), sub, sp.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sp.setSpan(ForegroundColorSpan(0xFFDDDDDD.toInt()), sub, sp.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        sp.setSpan(AlignmentSpan.Standard(Layout.Alignment.ALIGN_CENTER), 0, sp.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        toast(sp, hold = true)
    }

    private fun armRevert(delayMs: Long) {
        uiHandler.removeCallbacks(revertSpeed)
        uiHandler.postDelayed(revertSpeed, delayMs)
    }

    private fun rewind10s() {
        player.seekTo((player.currentPosition - 10_000).coerceAtLeast(0))
        toast("≪ 后退10秒")
    }

    private fun prevEpisode() {
        if (epIndex > 0) {
            saveResume()
            epIndex -= 1
            playCurrent()
        } else toast("已是第一集")
    }

    private fun manualNextEpisode() {
        if (epIndex + 1 < detail.episodes.size) nextEpisode()
        else toast("已是最后一集")
    }

    private fun toast(text: CharSequence, hold: Boolean = false) {
        toastView.text = text
        toastView.animate().cancel()
        toastView.alpha = 0f
        toastView.scaleX = 0.9f
        toastView.scaleY = 0.9f
        toastView.visibility = View.VISIBLE
        toastView.animate().alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(150).setInterpolator(DecelerateInterpolator()).start()
        uiHandler.removeCallbacks(hideToast)
        /* 倍速提示按住期间持续显示（5 秒保底），恢复原速时随速度一起淡出 */
        uiHandler.postDelayed(hideToast, if (hold) 5000 else 1200)
    }

    private fun updateOverlay() {
        val ep = detail.episodes.getOrNull(epIndex) ?: return
        val speed = if (speedIdx > 0) "  ${speedIdx + 1}倍速" else ""
        overlay.text = "${detail.title}  第${ep.ep}集$speed"
    }

    private fun saveResume() {
        val pos = player.currentPosition
        if (pos > 0) Storage.saveResume(activity, detail.id, epIndex, pos)
    }

    private fun playCurrent() {
        if (epIndex !in detail.episodes.indices) return
        val ep = detail.episodes[epIndex]
        speedIdx = 0
        uiHandler.removeCallbacks(revertSpeed)
        player.setPlaybackSpeed(1f)
        updateOverlay()
        saveResume()
        loadingUrl = true
        scope.launch {
            val url = try {
                withContext(Dispatchers.IO) { HuangguoApi.play(ep.pageUrl, ep.ep) }
            } catch (e: Exception) {
                ""
            }
            loadingUrl = false
            if (url.isEmpty()) {
                overlay.text = "${detail.title}  第${ep.ep}集  取不到播放地址"
                return@launch
            }
            val resume = Storage.getResume(activity, detail.id)
            pendingSeek = if (resume != null && resume.epIndex == epIndex && resume.positionMs > 3000)
                resume.positionMs else -1L
            player.setMediaItem(MediaItem.fromUri(url))
            player.prepare()
            if (pendingSeek >= 0) player.seekTo(pendingSeek)
            player.playWhenReady = true
            playerView.requestFocus()
        }
    }

    private fun nextEpisode() {
        saveResume()
        if (epIndex + 1 < detail.episodes.size) {
            epIndex += 1
            playCurrent()
        } else {
            activity.popTop()
        }
    }
}
