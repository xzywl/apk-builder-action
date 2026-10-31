package com.huangguo.tv

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.widget.FrameLayout

abstract class Screen(protected val activity: MainActivity) {
    abstract val view: View
    open fun onResume() {}
    open fun onPause() {}
    open fun onDestroy() {}
    /** true = 屏幕自行处理返回，不再弹栈 */
    open fun onBack(): Boolean = false
    /** true = 屏幕自行处理该按键（先于焦点 View 的默认处理） */
    open fun onKey(keyCode: Int, event: KeyEvent?): Boolean = false
}

class MainActivity : Activity() {
    private lateinit var root: FrameLayout
    private val stack = ArrayList<Screen>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        root.setBackgroundColor(Ui.BG)
        setContentView(root)
        push(HomeScreen(this))
    }

    fun push(screen: Screen) {
        stack.lastOrNull()?.onPause()
        stack.add(screen)
        root.addView(screen.view, FrameLayout.LayoutParams(-1, -1))
        screen.onResume()
    }

    /** 替换栈顶（不保留当前屏幕） */
    fun replaceTop(screen: Screen) {
        val top = stack.removeAt(stack.size - 1)
        root.removeView(top.view)
        top.onDestroy()
        stack.add(screen)
        root.addView(screen.view, FrameLayout.LayoutParams(-1, -1))
        screen.onResume()
    }

    fun popTop() {
        if (stack.size <= 1) return
        val top = stack.removeAt(stack.size - 1)
        root.removeView(top.view)
        top.onDestroy()
        stack.last().onResume()
    }

    override fun onBackPressed() {
        val top = stack.lastOrNull() ?: return
        if (top.onBack()) return
        if (stack.size == 1) {
            super.onBackPressed()
            return
        }
        popTop()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (stack.lastOrNull()?.onKey(event.keyCode, event) == true) return true
        return super.dispatchKeyEvent(event)
    }

    override fun onResume() {
        super.onResume()
        stack.lastOrNull()?.onResume()
    }

    override fun onPause() {
        super.onPause()
        stack.lastOrNull()?.onPause()
    }
}
