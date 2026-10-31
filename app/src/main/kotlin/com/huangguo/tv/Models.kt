package com.huangguo.tv

data class Category(val id: String, val name: String)

data class VideoCard(
    val id: String,
    val title: String,
    val pic: String,
    val remarks: String
)

data class Episode(val ep: String, val pageUrl: String)

data class VideoDetail(
    val id: String,
    val title: String,
    val pic: String,
    val episodes: List<Episode>
)
