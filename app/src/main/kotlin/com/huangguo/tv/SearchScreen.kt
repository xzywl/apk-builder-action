package com.huangguo.tv

import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.content.Context
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SearchScreen(activity: MainActivity) : Screen(activity) {

    private val edit: EditText
    private val status: TextView
    private val grid: RecyclerView
    private val adapter = CardAdapter(ArrayList()) { activity.push(DetailScreen(activity, it)) }
    private var query = ""
    private var page = 1
    private var loading = false
    private var hasMore = false
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val view: View

    init {
        val ctx = activity
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Ui.BG)
        }
        edit = EditText(ctx).apply {
            hint = "搜索剧名，按遥控器输入后按搜索键"
            setTextColor(Ui.TEXT)
            setHintTextColor(Ui.TEXT_SUB)
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18f)
            maxLines = 1
            imeOptions = EditorInfo.IME_ACTION_SEARCH
            setBackgroundResource(R.drawable.btn_bg)
            setPadding(Ui.dp(ctx, 16f), Ui.dp(ctx, 10f), Ui.dp(ctx, 16f), Ui.dp(ctx, 10f))
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE) {
                    doSearch(); true
                } else false
            }
        }
        val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(edit, LinearLayout.LayoutParams(0, -2, 1f).apply {
            setMargins(Ui.dp(ctx, 24f), Ui.dp(ctx, 16f), Ui.dp(ctx, 12f), Ui.dp(ctx, 8f))
        })
        val goBtn = Ui.text(ctx, 16f).apply {
            text = "搜索"
            setBackgroundResource(R.drawable.btn_bg)
            setPadding(Ui.dp(ctx, 24f), Ui.dp(ctx, 12f), Ui.dp(ctx, 24f), Ui.dp(ctx, 12f))
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener { doSearch() }
        }
        row.addView(goBtn, LinearLayout.LayoutParams(-2, -2).apply {
            setMargins(0, Ui.dp(ctx, 16f), Ui.dp(ctx, 24f), Ui.dp(ctx, 8f))
        })
        root.addView(row, LinearLayout.LayoutParams(-1, -2))

        status = Ui.text(ctx, 14f, Ui.TEXT_SUB).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 30f), 0, Ui.dp(ctx, 30f))
            text = "输入关键词开始搜索"
        }
        root.addView(status, LinearLayout.LayoutParams(-1, -2))

        grid = RecyclerView(ctx).apply {
            clipToPadding = false
            setPadding(Ui.dp(ctx, 16f), 0, Ui.dp(ctx, 16f), Ui.dp(ctx, 24f))
            val w = ctx.resources.displayMetrics.widthPixels
            layoutManager = GridLayoutManager(ctx, (w / Ui.dp(ctx, 190f)).coerceIn(2, 8))
            adapter = this@SearchScreen.adapter
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                    if (dy <= 0) return
                    val lm = rv.layoutManager as? LinearLayoutManager ?: return
                    if (lm.findLastVisibleItemPosition() >= (rv.adapter?.itemCount ?: 0) - 6) {
                        if (!loading && hasMore) { page += 1; loadPage(false) }
                    }
                }
            })
        }
        root.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        view = root
    }

    override fun onResume() {
        edit.requestFocus()
        val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(edit, InputMethodManager.SHOW_IMPLICIT)
    }

    override fun onDestroy() {
        scope.cancel()
    }

    private fun doSearch() {
        query = edit.text.toString().trim()
        if (query.isEmpty()) return
        val imm = activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(edit.windowToken, 0)
        page = 1
        hasMore = false
        adapter.setAll(emptyList())
        loadPage(true)
    }

    private fun loadPage(reset: Boolean) {
        if (query.isEmpty()) return
        loading = true
        showStatus(if (reset) "搜索中…" else null)
        scope.launch {
            val list = try {
                withContext(Dispatchers.IO) { HuangguoApi.search(query, page) }
            } catch (e: Exception) {
                null
            }
            loading = false
            if (list == null) {
                showStatus("搜索失败，请重试")
                if (page > 1) page -= 1
                return@launch
            }
            hasMore = list.isNotEmpty()
            if (reset) adapter.setAll(list) else adapter.append(list)
            showStatus(if (list.isEmpty() && reset) "没有找到「$query」" else null)
        }
    }

    private fun showStatus(msg: String?) {
        if (msg == null) status.visibility = View.GONE
        else {
            status.text = msg
            status.visibility = View.VISIBLE
        }
    }
}
