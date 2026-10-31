import java.util.Properties

plugins {
    id("com.android.application")
    kotlin("android")
}

val signingProperties = Properties().apply {
    val config = rootProject.file("keystore.properties")
    if (config.exists()) config.inputStream().use { load(it) }
}
fun signingValue(env: String, key: String): String? =
    System.getenv(env) ?: signingProperties.getProperty(key)

android {
    namespace = "com.huangguo.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.huangguo.tv"
        minSdk = 26
        targetSdk = 34
        versionCode = 4
        versionName = "1.0.3"
    }

    signingConfigs {
        create("delivery") {
            storeFile = signingValue("HUANGGUO_KEYSTORE", "storeFile")?.let { file(it) }
            storePassword = signingValue("HUANGGUO_STORE_PASSWORD", "storePassword")
            keyAlias = signingValue("HUANGGUO_KEY_ALIAS", "keyAlias")
            keyPassword = signingValue("HUANGGUO_KEY_PASSWORD", "keyPassword")
        }
    }

    buildTypes {
        getByName("release") {
            val cfg = signingConfigs.getByName("delivery")
            if (cfg.storeFile != null) signingConfig = cfg
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
