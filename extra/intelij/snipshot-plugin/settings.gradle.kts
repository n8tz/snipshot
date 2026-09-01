plugins {
    // Lets Gradle download a matching JDK when the local one is not suitable.
    id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"
}

rootProject.name = "snipshot-plugin"
