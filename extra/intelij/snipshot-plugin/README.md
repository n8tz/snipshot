# Snipshot — IntelliJ plugin (development)

Sources of the IntelliJ plugin. **For what it does and how to use it, see
[PLUGIN.md](../../../PLUGIN.md)**; this file covers building and maintaining it.

## Build

From the repository root:

```bash
npm run build:plugin
```

The installable zip lands in `standalone/intellij/snipshot-intellij-plugin.zip`,
next to the standalone CLI binaries, versioned from `package.json` so a local build
matches the release of the same version. This is the command CI runs too.

Needs a **JDK 17 or newer** on `PATH` or in `JAVA_HOME` — the script checks and says
so before Gradle gets a chance to fail obscurely. Gradle comes from the committed
wrapper and the compile toolchain is downloaded if missing, so there is nothing else
to install.

Calling Gradle directly works as well:

```bash
cd extra/intelij/snipshot-plugin
./gradlew buildPlugin
./gradlew runIde        # try it in a sandbox IDE
```

## Toolchain

Gradle 9.7.1 (from the committed wrapper), the IntelliJ Platform Gradle Plugin
2.18.1 and Kotlin 2.2.0. **Any JDK 17 or newer** runs the build, including 25 — the
plugin itself is compiled for Java 17 through a Gradle toolchain, which Gradle
downloads on the first build if your JDK is not one. That is also why the first
build is slow: it pulls the IDE SDK and possibly a JDK.

## Compatibility

The plugin declares `since-build="241"` and **no upper bound**, so it installs on
IntelliJ 2024.1 and everything newer, in any JetBrains IDE, since it only depends on
`com.intellij.modules.platform`. A stale `untilBuild` is what makes a plugin refuse
to install on a fresh IDE, so there deliberately is none.

It compiles against the 2024.1 SDK. Building against an older platform than you run
is the supported direction: the risk is calling an API that was later removed, so
the sources are also checked against a newer SDK from time to time — they compile
clean against **2025.2.4** (build 252), which is the evidence behind dropping the
upper bound.

Redoing that check takes one command; a newer platform ships Java 21 class files,
hence the matching target:

```bash
./gradlew buildPlugin -PplatformVersion=2025.2.4 -PjvmTarget=21
```

Anything past 2025.2 is not resolvable through the IDE repositories yet, so that is
as far forward as the check reaches.

## Layout

| File | Role |
|---|---|
| `SnipshotSettings.kt` | Persisted settings, and resolving which binary to run |
| `SnipshotMarks.kt` | Per-file red/green/fold marks and their editor tint |
| `SnipshotRequest.kt` | The CLI invocation model, and reading the editor into one |
| `SnipshotRunner.kt` | Runs the CLI off the UI thread, reports success or failure |
| `SnipshotOutput.kt` | Delivers the result: clipboard, save dialog, or a folder |
| `WindowsClipboard.kt` | Reaches the Windows clipboard when the IDE runs under WSL |
| `SnipshotDownloader.kt` | Fetches the standalone binary from GitHub releases |
| `SnipshotOptionsDialog.kt` | The "Snipshot…" dialog |
| `SnipshotConfigurable.kt` | The settings page |
| `actions/` | The right-click actions |

The plugin shells out to the CLI rather than bundling a 147 MB binary per platform.
Everything the actions send is a plain `snipshot` command line, so anything the
plugin can produce can be reproduced from a terminal.
