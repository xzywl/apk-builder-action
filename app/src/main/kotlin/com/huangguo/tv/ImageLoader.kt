package com.huangguo.tv

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.util.LruCache
import android.widget.ImageView
import java.util.concurrent.Executors

object ImageLoader {
    private val main = Handler(Looper.getMainLooper())
    private val pool = Executors.newFixedThreadPool(3)
    private val mem = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory().toInt() / 4)) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    fun load(view: ImageView, url: String, reqWidth: Int) {
        view.tag = url
        if (url.isEmpty()) {
            view.setImageResource(R.drawable.poster_placeholder)
            return
        }
        val key = "$url@$reqWidth"
        mem.get(key)?.let {
            view.setImageBitmap(it)
            return
        }
        view.setImageResource(R.drawable.poster_placeholder)
        pool.execute {
            try {
                val bytes = HuangguoApi.fetchImageBytes(url) ?: return@execute
                val img = CoverCipher.decryptToBytes(bytes) ?: return@execute
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(img, 0, img.size, bounds)
                var sample = 1
                while (bounds.outWidth > 0 && bounds.outWidth / sample > reqWidth * 2) sample *= 2
                val bmp = BitmapFactory.decodeByteArray(
                    img, 0, img.size,
                    BitmapFactory.Options().apply { inSampleSize = sample }
                ) ?: return@execute
                mem.put(key, bmp)
                main.post { if (view.tag == url) view.setImageBitmap(bmp) }
            } catch (_: Exception) {
            }
        }
    }
}
