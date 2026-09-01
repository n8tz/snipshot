plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = "com.snipshot"
// CI passes -PpluginVersion=<release version> so the published zip matches the tag.
version = (findProperty("pluginVersion") as String?) ?: "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // Bump this to build against a newer IDE; sinceBuild below must follow.
        intellijIdeaCommunity("2024.1.7")
        instrumentationTools()
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "241"
            untilBuild = "252.*"
        }
    }
}

kotlin {
    jvmToolchain(17)
}

tasks {
    // Launches a headless IDE just to index the settings page; not worth it here.
    buildSearchableOptions {
        enabled = false
    }
}
