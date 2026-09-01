plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "2.2.0"
    id("org.jetbrains.intellij.platform") version "2.18.1"
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
// installs on that IDE and every newer one. Both are overridable, so the sources
// can be checked against a newer SDK without editing anything:
//   ./gradlew buildPlugin -PplatformVersion=2025.2.4 -PjvmTarget=21
// (a newer platform ships Java 21 class files, hence the matching target).
val platformVersion = providers.gradleProperty("platformVersion").getOrElse("2024.1.7")
val jvmTarget = providers.gradleProperty("jvmTarget").getOrElse("17").toInt()

dependencies {
    intellijPlatform {
        intellijIdeaCommunity(platformVersion)
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
    jvmToolchain(jvmTarget)
}

tasks {
    // Launches a headless IDE just to index the settings page; not worth it here.
    buildSearchableOptions {
        enabled = false
    }
}
