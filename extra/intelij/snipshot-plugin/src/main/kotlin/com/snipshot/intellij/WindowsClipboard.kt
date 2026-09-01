package com.snipshot.intellij

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.util.SystemInfo
import java.io.File

/**
 * Puts an image on the *Windows* clipboard from inside WSL.
 *
 * Under WSLg the Java clipboard is the Linux one: an image copied there can be
 * pasted inside the IDE, but never reaches Windows applications, because WSLg
 * only bridges text. Handing the file to PowerShell on the Windows side is the
 * way around it.
 */
object WindowsClipboard {

    private val POWERSHELL_FALLBACKS = listOf(
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "/mnt/c/Windows/system32/WindowsPowerShell/v1.0/powershell.exe",
    )

    private const val TIMEOUT_MS = 20_000

    /** True when running inside WSL, where the Java clipboard stops at Linux. */
    val isWsl: Boolean by lazy {
        if (!SystemInfo.isLinux) {
            false
        } else {
            System.getenv("WSL_DISTRO_NAME") != null ||
                runCatching { File("/proc/version").readText() }
                    .getOrDefault("")
                    .contains("microsoft", ignoreCase = true)
        }
    }

    /** Copies [file] to the Windows clipboard. Returns null on success. */
    fun copyImage(file: File): String? {
        val powershell = findPowershell()
            ?: return "powershell.exe not found — WSL interop looks disabled."

        val windowsPath = toWindowsPath(file)
            ?: return "could not translate ${file.path} to a Windows path."

        // One line on purpose: multi-line arguments do not survive the WSL
        // interop layer intact. SetDataObject(.., $true) is what keeps the image
        // on the clipboard once this PowerShell process exits — SetImage alone
        // would lose it. ErrorActionPreference plus the catch turn a .NET
        // exception into a non-zero exit code, which would otherwise stay 0.
        val d = '$'
        val script = listOf(
            "${d}ErrorActionPreference='Stop';",
            "try {",
            "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;",
            "${d}img=[System.Drawing.Image]::FromFile('${windowsPath.replace("'", "''")}');",
            "[System.Windows.Forms.Clipboard]::SetDataObject(${d}img,${d}true);",
            "${d}img.Dispose()",
            "} catch { Write-Error ${d}_; exit 1 }",
        ).joinToString(" ")

        return runProcess(powershell, "-NoProfile", "-NonInteractive", "-STA", "-Command", script)
    }

    private fun findPowershell(): String? {
        // runProcess returns null when the command succeeded.
        if (runProcess("powershell.exe", "-NoProfile", "-Command", "exit 0") == null) {
            return "powershell.exe"
        }
        return POWERSHELL_FALLBACKS.firstOrNull { File(it).canExecute() }
    }

    private fun toWindowsPath(file: File): String? {
        val output = capture("wslpath", "-w", file.path) ?: return null
        return output.trim().ifEmpty { null }
    }

    /** Runs a command; returns null on success, or a message describing the failure. */
    private fun runProcess(vararg command: String): String? {
        return try {
            val output = CapturingProcessHandler(
                GeneralCommandLine(*command).withCharset(Charsets.UTF_8)
            ).runProcess(TIMEOUT_MS)
            if (output.exitCode == 0) {
                null
            } else {
                output.stderr.trim().ifEmpty { "exit code ${output.exitCode}" }
            }
        } catch (e: Exception) {
            "${e.javaClass.simpleName}: ${e.message}"
        }
    }

    private fun capture(vararg command: String): String? {
        return try {
            val output = CapturingProcessHandler(
                GeneralCommandLine(*command).withCharset(Charsets.UTF_8)
            ).runProcess(TIMEOUT_MS)
            if (output.exitCode == 0) output.stdout else null
        } catch (e: Exception) {
            null
        }
    }
}
