pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
    }
}

rootProject.name = "blockbot"

// core: 안드로이드 의존성 없는 순수 Kotlin (솔버·인식·추적). 폰 없이 JVM에서 테스트.
include(":core")

// app: 안드로이드 앱. Android SDK가 있을 때만 포함 (local.properties의 sdk.dir 또는 ANDROID_HOME).
val localProps = file("local.properties")
val hasSdk = System.getenv("ANDROID_HOME") != null || System.getenv("ANDROID_SDK_ROOT") != null ||
    (localProps.exists() && localProps.readText().contains("sdk.dir"))
if (hasSdk) include(":app") else println("[blockbot] Android SDK를 찾지 못해 :app 모듈은 건너뜀 (core만 빌드)")
