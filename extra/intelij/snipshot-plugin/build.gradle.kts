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

// Building against an older platform is the supported direction: the plugin then
// installs on that IDE and every newer one. Override to check the sources against
// a newer SDK, e.g. -PplatformVersion=2025.2.4 (which also needs Kotlin 2.2 and
// jvmToolchain(21) below, since that platform ships Kotlin 2.2 metadata).
val platformVersion = providers.gradleProperty("platformVersion").getOrElse("2024.1.7")

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(platformVersion)
        instrumentationTools()
    }
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "241"
            // No upper bound: the plugin uses long-stable platform APIs, and a
            // stale untilBuild is what blocks installs on newer IDEs.
            untilBuild = provider { null }
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
