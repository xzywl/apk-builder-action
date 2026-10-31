package com.huangguo.tv

import android.content.Context
import android.graphics.Color
import android.util.TypedValue
import android.view.View
import android.widget.TextView

object Ui {
    val BG = Color.parseColor("#0B0E14")
    val TEXT = Color.parseColor("#E8EAF0")
    val TEXT_SUB = Color.parseColor("#93A0B4")
    val ACCENT = Color.parseColor("#FFB300")

    fun dp(ctx: Context, v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()

    fun text(ctx: Context, sizeSp: Float, color: Int = TEXT): TextView = TextView(ctx).apply {
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    }

    /** 遥控器焦点放大效果 */
    fun focusScale(view: View, scale: Float = 1.06f) {
        view.setOnFocusChangeListener { v, has ->
            v.animate().scaleX(if (has) scale else 1f).scaleY(if (has) scale else 1f).setDuration(120).start()
            if (!has) v.bringToFront()
        }
        view.setOnClickListener { view.bringToFront() }
    }
}
