package com.huangguo.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object Storage {
    data class Resume(val epIndex: Int, val positionMs: Long)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("huangguo_tv", Context.MODE_PRIVATE)

    fun favorites(ctx: Context): MutableList<VideoCard> {
        val raw = prefs(ctx).getString("favorites", "[]") ?: "[]"
        val out = ArrayList<VideoCard>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                out.add(VideoCard(o.getString("id"), o.getString("title"), o.optString("pic"), o.optString("remarks")))
            }
        } catch (_: Exception) {
        }
        return out
    }

    private fun saveFavorites(ctx: Context, list: List<VideoCard>) {
        val arr = JSONArray()
        for (c in list) {
            arr.put(JSONObject().put("id", c.id).put("title", c.title).put("pic", c.pic).put("remarks", c.remarks))
        }
        prefs(ctx).edit().putString("favorites", arr.toString()).apply()
    }

    fun isFavorite(ctx: Context, id: String): Boolean = favorites(ctx).any { it.id == id }

    /** 返回切换后是否为收藏 */
    fun toggleFavorite(ctx: Context, card: VideoCard): Boolean {
        val list = favorites(ctx)
        val idx = list.indexOfFirst { it.id == card.id }
        if (idx >= 0) {
            list.removeAt(idx)
            saveFavorites(ctx, list)
            return false
        }
        list.add(0, card)
        saveFavorites(ctx, list)
        return true
    }

    fun saveResume(ctx: Context, id: String, epIndex: Int, positionMs: Long) {
        prefs(ctx).edit()
            .putInt("resume_${id}_ep", epIndex)
            .putLong("resume_${id}_pos", positionMs)
            .apply()
    }

    fun getResume(ctx: Context, id: String): Resume? {
        val p = prefs(ctx)
        if (!p.contains("resume_${id}_ep")) return null
        return Resume(p.getInt("resume_${id}_ep", 0), p.getLong("resume_${id}_pos", 0))
    }
}
