plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.tagme.gateway"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.tagme.gateway"
        minSdk = 26
        // 35 는 dataSync 포그라운드 서비스 6시간 제한이 걸려 34 로 둔다
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// AndroidX 등 외부 라이브러리 없이 Android 기본 API 만 사용 (Kotlin 표준 라이브러리는 플러그인이 추가)
dependencies {}
