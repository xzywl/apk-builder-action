package com.huangguo.tv

import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class DetailScreen(activity: MainActivity, private val card: VideoCard) : Screen(activity) {

    private var detail: VideoDetail? = null
    private val poster: ImageView
    private val titleView: TextView
    private val remarksView: TextView
    private val favBtn: TextView
    private val playBtn: TextView
    private val epGrid: RecyclerView
    private val epAdapter = EpisodeAdapter() { idx -> startPlay(idx) }
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override val view: View

    init {
        val ctx = activity
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Ui.BG)
            setPadding(Ui.dp(ctx, 32f), Ui.dp(ctx, 24f), Ui.dp(ctx, 32f), Ui.dp(ctx, 24f))
        }

        poster = ImageView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(Ui.dp(ctx, 230f), Ui.dp(ctx, 310f)).apply {
                rightMargin = Ui.dp(ctx, 28f)
            }
            scaleType = ImageView.ScaleType.CENTER_CROP
            setImageResource(R.drawable.poster_placeholder)
        }
        root.addView(poster)

        val right = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, -1, 1f)
        }
        titleView = Ui.text(ctx, 26f).apply { text = card.title; maxLines = 2 }
        right.addView(titleView)
        remarksView = Ui.text(ctx, 14f, Ui.TEXT_SUB).apply {
            text = card.remarks
            setPadding(0, Ui.dp(ctx, 6f), 0, Ui.dp(ctx, 14f))
        }
        right.addView(remarksView)

        val btnRow = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
        playBtn = Ui.text(ctx, 16f).apply {
            text = "播放"
            setBackgroundResource(R.drawable.btn_bg)
            setPadding(Ui.dp(ctx, 28f), Ui.dp(ctx, 12f), Ui.dp(ctx, 28f), Ui.dp(ctx, 12f))
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener {
                val d = detail ?: return@setOnClickListener
                val resume = Storage.getResume(ctx, d.id)
                startPlay((resume?.epIndex ?: 0).coerceIn(0, d.episodes.size - 1))
            }
        }
        favBtn = Ui.text(ctx, 16f).apply {
            setPadding(Ui.dp(ctx, 28f), Ui.dp(ctx, 12f), Ui.dp(ctx, 28f), Ui.dp(ctx, 12f))
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener {
                val added = Storage.toggleFavorite(ctx, card)
                favBtn.text = if (added) "已收藏" else "收藏"
            }
        }
        btnRow.addView(playBtn, LinearLayout.LayoutParams(-2, -2).apply { rightMargin = Ui.dp(ctx, 12f) })
        btnRow.addView(favBtn, LinearLayout.LayoutParams(-2, -2))
        right.addView(btnRow, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = Ui.dp(ctx, 16f) })

        epGrid = RecyclerView(ctx).apply {
            clipToPadding = false
            layoutManager = GridLayoutManager(ctx, 6)
            adapter = epAdapter
        }
        right.addView(epGrid, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(right)
        view = root

        favBtn.text = if (Storage.isFavorite(ctx, card.id)) "已收藏" else "收藏"
        ImageLoader.load(poster, card.pic, 460)
        loadDetail()
    }

    override fun onDestroy() {
        scope.cancel()
    }

    private fun loadDetail() {
        scope.launch {
            val d = try {
                withContext(Dispatchers.IO) { HuangguoApi.detail(card.id) }
            } catch (e: Exception) {
                null
            }
            if (d == null || d.episodes.isEmpty()) {
                remarksView.text = (if (card.remarks.isEmpty()) "" else card.remarks + "  ") + "（选集加载失败）"
                return@launch
            }
            detail = d
            titleView.text = d.title
            if (d.pic.isNotEmpty()) ImageLoader.load(poster, d.pic, 460)
            epAdapter.setEpisodes(d.episodes)
            val resume = Storage.getResume(activity, d.id)
            if (resume != null && resume.epIndex < d.episodes.size) {
                playBtn.text = "继续播放 第${d.episodes[resume.epIndex].ep}集"
            }
        }
    }

    private fun startPlay(epIndex: Int) {
        val d = detail ?: return
        activity.push(PlayerScreen(activity, d, epIndex))
    }

    // ---- 选集按钮 ----

    private class EpisodeAdapter(private val onClick: (Int) -> Unit) : RecyclerView.Adapter<EpisodeAdapter.Holder>() {
        private val eps = ArrayList<Episode>()
        class Holder(val tv: TextView) : RecyclerView.ViewHolder(tv)

        fun setEpisodes(list: List<Episode>) {
            eps.clear(); eps.addAll(list); notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): Holder {
            val ctx = parent.context
            val tv = Ui.text(ctx, 15f).apply {
                gravity = Gravity.CENTER
                setBackgroundResource(R.drawable.btn_bg)
                isFocusable = true
                isFocusableInTouchMode = true
                setPadding(0, Ui.dp(ctx, 14f), 0, Ui.dp(ctx, 14f))
            }
            return Holder(tv)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) {
            holder.tv.text = "第${eps[position].ep}集"
            holder.tv.setOnClickListener { onClick(holder.bindingAdapterPosition) }
            Ui.focusScale(holder.tv, 1.1f)
        }

        override fun getItemCount(): Int = eps.size
    }
}
