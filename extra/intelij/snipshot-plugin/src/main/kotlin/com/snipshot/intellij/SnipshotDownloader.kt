package com.snipshot.intellij

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.io.Decompressor
import com.intellij.util.io.HttpRequests
import com.intellij.util.system.CpuArch
import java.io.File

/**
 * Fetches the standalone snipshot binary from the project's GitHub releases,
 * so the plugin works without installing anything by hand. The release assets
 * are deliberately named without a version, which keeps these URLs stable.
 */
object SnipshotDownloader {

    private const val LATEST_DOWNLOAD = "https://github.com/9pings/snipshot/releases/latest/download"

    /** Where a downloaded binary lives: IDE-managed, survives plugin updates. */
    private val installDirectory: File
        get() = File(PathManager.getSystemPath(), "snipshot")

    data class Target(val asset: String, val binaryName: String)

    /** The release asset for this machine, or null when we do not ship one. */
    fun targetForCurrentPlatform(): Target? = when {
        SystemInfo.isWindows -> Target("snipshot-windows-x64.zip", "snipshot.exe")
        SystemInfo.isMac && CpuArch.isArm64() -> Target("snipshot-macos-arm64.tar.gz", "snipshot")
        SystemInfo.isMac -> Target("snipshot-macos-x64.tar.gz", "snipshot")
        SystemInfo.isLinux && !CpuArch.isArm64() -> Target("snipshot-linux-x64.tar.gz", "snipshot")
        else -> null
    }

    /** An already-downloaded binary, if there is one. */
    fun downloadedBinary(): File? {
        val target = targetForCurrentPlatform() ?: return null
        val file = File(installDirectory, target.binaryName)
        return if (file.isFile) file else null
    }

    /**
     * Downloads and unpacks the binary in the background. [onFinished] runs on
     * the EDT with the installed binary, or null plus the reason on failure.
     */
    fun download(onFinished: (File?, String?) -> Unit) {
        val target = targetForCurrentPlatform()
        if (target == null) {
            onFinished(null, "No prebuilt binary for ${SystemInfo.OS_NAME} ${CpuArch.CURRENT}. Install it with \"npm install -g snipshot\".")
            return
        }

        ProgressManager.getInstance().run(object : Task.Backgroundable(null, "Downloading snipshot", true) {
            override fun run(indicator: ProgressIndicator) {
                indicator.text = "Downloading ${target.asset}"
                val directory = installDirectory
                directory.mkdirs()
                val archive = File(directory, target.asset)

                val binary = try {
                    HttpRequests.request("$LATEST_DOWNLOAD/${target.asset}")
                        .productNameAsUserAgent()
                        .saveToFile(archive, indicator)

                    indicator.text = "Unpacking"
                    if (target.asset.endsWith(".zip")) {
                        Decompressor.Zip(archive).overwrite(true).extract(directory)
                    } else {
                        Decompressor.Tar(archive).overwrite(true).extract(directory)
                    }
                    archive.delete()

                    File(directory, target.binaryName).also { it.setExecutable(true) }
                } catch (e: Exception) {
                    archive.delete()
                    finish(null, "Download failed: ${e.message}", onFinished)
                    return
                }

                if (!binary.isFile) {
                    finish(null, "The archive did not contain ${target.binaryName}.", onFinished)
                    return
                }
                finish(binary, null, onFinished)
            }
        })
    }

    /** Runs `<binary> --version`; returns the version, or null if it does not run. */
    fun probeVersion(binary: File): String? {
        if (!binary.isFile) return null
        return try {
            val output = CapturingProcessHandler(
                GeneralCommandLine(binary.path, "--version").withCharset(Charsets.UTF_8)
            ).runProcess(10_000)
            if (output.exitCode == 0) output.stdout.trim().ifEmpty { null } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun finish(binary: File?, error: String?, onFinished: (File?, String?) -> Unit) {
        ApplicationManager.getApplication().invokeLater { onFinished(binary, error) }
    }
}
