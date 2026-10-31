package com.huangguo.tv

import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class CardAdapter(
    private val items: MutableList<VideoCard>,
    private val onClick: (VideoCard) -> Unit
) : RecyclerView.Adapter<CardAdapter.Holder>() {

    class Holder(val root: LinearLayout, val poster: ImageView, val title: TextView, val remarks: TextView) :
        RecyclerView.ViewHolder(root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val ctx = parent.context
        val w = Ui.dp(ctx, 168f)
        val posterH = Ui.dp(ctx, 224f)

        val poster = ImageView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(w, posterH)
            scaleType = ImageView.ScaleType.CENTER_CROP
            setImageResource(R.drawable.poster_placeholder)
        }
        val title = Ui.text(ctx, 15f).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(Ui.dp(ctx, 10f), Ui.dp(ctx, 8f), Ui.dp(ctx, 10f), 0)
        }
        val remarks = Ui.text(ctx, 12f, Ui.TEXT_SUB).apply {
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            setPadding(Ui.dp(ctx, 10f), 0, Ui.dp(ctx, 10f), Ui.dp(ctx, 10f))
        }
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = RecyclerView.LayoutParams(w, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(Ui.dp(ctx, 8f), Ui.dp(ctx, 8f), Ui.dp(ctx, 8f), Ui.dp(ctx, 8f))
            }
            background = ctx.getDrawable(R.drawable.card_bg)
            isFocusable = true
            isFocusableInTouchMode = true
            addView(poster)
            addView(title)
            addView(remarks)
        }
        return Holder(root, poster, title, remarks)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        holder.title.text = item.title
        holder.remarks.text = item.remarks
        holder.remarks.visibility = if (item.remarks.isEmpty()) View.GONE else View.VISIBLE
        ImageLoader.load(holder.poster, item.pic, 320)
        Ui.focusScale(holder.root)
        holder.root.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size

    fun setAll(list: List<VideoCard>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    fun append(list: List<VideoCard>) {
        val start = items.size
        items.addAll(list)
        notifyItemRangeInserted(start, list.size)
    }
}
