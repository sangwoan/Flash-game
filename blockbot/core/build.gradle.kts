import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
}

// 정책 비교 시뮬레이션: ./gradlew :core:simulate -PsimArgs="게임수 최대라운드 시드 콤보모드"
tasks.register<JavaExec>("simulate") {
    group = "verification"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.blockbot.core.SimulatorKt")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8")
    args = (project.findProperty("simArgs") as String?)?.split(" ")?.filter { it.isNotBlank() } ?: emptyList()
}

// 폰 로그에서 블록 분포 학습: ./gradlew :core:learn -PlearnArgs="로그폴더 출력폴더"
tasks.register<JavaExec>("learn") {
    group = "blockbot"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.blockbot.core.LogLearnerKt")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8")
    workingDir = rootProject.projectDir
    args = (project.findProperty("learnArgs") as String?)?.split(" ")?.filter { it.isNotBlank() } ?: emptyList()
}

// 가중치 자가대국 튜닝: ./gradlew :core:tune -PtuneArgs="분포파일|- 출력폴더 분"
tasks.register<JavaExec>("tune") {
    group = "blockbot"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.blockbot.core.TunerKt")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8", "-Xmx2g")
    workingDir = rootProject.projectDir
    args = (project.findProperty("tuneArgs") as String?)?.split(" ")?.filter { it.isNotBlank() } ?: emptyList()
}

// 개선 루프 한 번 (학습→분석→튜닝→검증→리포트): ./gradlew :core:improve -PimproveArgs="로그폴더 출력폴더 튜닝분"
tasks.register<JavaExec>("improve") {
    group = "blockbot"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.blockbot.core.LogAnalyzerKt")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8", "-Xmx2g")
    workingDir = rootProject.projectDir
    args = (project.findProperty("improveArgs") as String?)?.split(" ")?.filter { it.isNotBlank() } ?: emptyList()
}

// 로그 재생 비교: ./gradlew :core:replay -PreplayArgs="로그폴더 시작점개수 정책1 정책2 ..."
tasks.register<JavaExec>("replay") {
    group = "blockbot"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.blockbot.core.LogReplayKt")
    jvmArgs("-Dstdout.encoding=UTF-8", "-Dfile.encoding=UTF-8", "-Xmx2g")
    workingDir = rootProject.projectDir
    args = (project.findProperty("replayArgs") as String?)?.split(" ")?.filter { it.isNotBlank() } ?: emptyList()
}
