package com.huangguo.tv

import android.view.Gravity
import android.view.View
import android.widget.HorizontalScrollView
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

class HomeScreen(activity: MainActivity) : Screen(activity) {

    private data class Tab(val name: String, val id: String) // id: ""=首页, fav=收藏, search=搜索, 其余为分类

    private val tabs = ArrayList<Pair<Tab, TextView>>()
    private val grid: RecyclerView
    private val status: TextView
    private val adapter = CardAdapter(ArrayList()) { openDetail(it) }
    private var currentTab = 0
    private var page = 1
    private var loading = false
    private var hasMore = true
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val tabDefs = buildList {
        add(Tab("首页", ""))
        HuangguoApi.categories.forEach { add(Tab(it.name, it.id)) }
        add(Tab("收藏", "fav"))
        add(Tab("搜索", "search"))
    }

    override val view: View

    init {
        val ctx = activity
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Ui.BG)
        }

        val strip = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(Ui.dp(ctx, 24f), Ui.dp(ctx, 18f), Ui.dp(ctx, 24f), Ui.dp(ctx, 10f))
        }
        tabDefs.forEachIndexed { i, tab ->
            val tv = Ui.text(ctx, 16f).apply {
                text = tab.name
                setBackgroundResource(R.drawable.tab_bg)
                setPadding(Ui.dp(ctx, 22f), Ui.dp(ctx, 10f), Ui.dp(ctx, 22f), Ui.dp(ctx, 10f))
                isFocusable = true
                isFocusableInTouchMode = true
                isSelected = i == 0
                setOnClickListener { selectTab(i) }
            }
            val lp = LinearLayout.LayoutParams(-2, -2)
            lp.rightMargin = Ui.dp(ctx, 10f)
            strip.addView(tv, lp)
            tabs.add(tab to tv)
        }
        val scroll = HorizontalScrollView(ctx).apply {
            addView(strip)
            isHorizontalScrollBarEnabled = false
        }
        root.addView(scroll, LinearLayout.LayoutParams(-1, -2))

        status = Ui.text(ctx, 14f, Ui.TEXT_SUB).apply {
            gravity = Gravity.CENTER
            setPadding(0, Ui.dp(ctx, 40f), 0, Ui.dp(ctx, 40f))
            visibility = View.GONE
        }
        root.addView(status, LinearLayout.LayoutParams(-1, -2))

        grid = RecyclerView(ctx).apply {
            clipToPadding = false
            setPadding(Ui.dp(ctx, 16f), Ui.dp(ctx, 6f), Ui.dp(ctx, 16f), Ui.dp(ctx, 24f))
            layoutManager = GridLayoutManager(ctx, spanCount(ctx))
            adapter = this@HomeScreen.adapter
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                    if (dy <= 0) return
                    val lm = rv.layoutManager as? LinearLayoutManager ?: return
                    if (lm.findLastVisibleItemPosition() >= (rv.adapter?.itemCount ?: 0) - 6) loadMore()
                }
            })
        }
        root.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))
        view = root
    }

    private fun spanCount(ctx: android.content.Context): Int {
        val w = ctx.resources.displayMetrics.widthPixels
        return (w / Ui.dp(ctx, 190f)).coerceIn(2, 8)
    }

    override fun onResume() {
        if (adapter.itemCount == 0 && !loading) selectTab(currentTab)
    }

    override fun onDestroy() {
        scope.cancel()
    }

    private fun selectTab(index: Int) {
        if (tabDefs[index].id == "search") {
            activity.push(SearchScreen(activity))
            return
        }
        currentTab = index
        tabs.forEachIndexed { i, (_, tv) -> tv.isSelected = i == index }
        page = 1
        hasMore = true
        adapter.setAll(emptyList())
        loadPage(reset = true)
    }

    private fun loadMore() {
        if (loading || !hasMore) return
        page += 1
        loadPage(reset = false)
    }

    private fun loadPage(reset: Boolean) {
        val tab = tabDefs[currentTab]
        if (tab.id == "fav") {
            adapter.setAll(Storage.favorites(activity))
            showStatus(if (adapter.itemCount == 0) "还没有收藏，去详情页按 OK 收藏" else null)
            hasMore = false
            return
        }
        loading = true
        showStatus(if (reset) "加载中…" else null)
        scope.launch {
            val list = try {
                withContext(Dispatchers.IO) {
                    when (tab.id) {
                        "" -> if (page == 1) HuangguoApi.homeVod() else emptyList()
                        else -> HuangguoApi.category(tab.id, page)
                    }
                }
            } catch (e: Exception) {
                null
            }
            loading = false
            if (list == null) {
                showStatus("加载失败，请检查网络后重试")
                if (page > 1) page -= 1
                return@launch
            }
            hasMore = list.isNotEmpty() && tab.id.isNotEmpty()
            if (reset) adapter.setAll(list) else adapter.append(list)
            showStatus(if (list.isEmpty() && reset) "没有内容" else null)
        }
    }

    private fun showStatus(msg: String?) {
        if (msg == null) status.visibility = View.GONE
        else {
            status.text = msg
            status.visibility = View.VISIBLE
        }
    }

    private fun openDetail(card: VideoCard) {
        activity.push(DetailScreen(activity, card))
    }
}
