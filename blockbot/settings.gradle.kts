pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

rootProject.name = "blockbot"

// core: 안드로이드 의존성 없는 순수 Kotlin (솔버·인식). 폰 없이 JVM에서 테스트.
include(":core")
// app: 안드로이드 앱 (오버레이·접근성 서비스) — 3단계에서 추가
