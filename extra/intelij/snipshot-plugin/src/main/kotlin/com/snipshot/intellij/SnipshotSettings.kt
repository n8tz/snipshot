package com.snipshot.intellij

import com.intellij.execution.configurations.PathEnvironmentVariableUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import java.io.File

/** Persisted, application-wide plugin settings. */
@Service(Service.Level.APP)
@State(name = "SnipshotSettings", storages = [Storage("snipshot.xml")])
class SnipshotSettings : PersistentStateComponent<SnipshotSettings.State> {

    data class State(
        /** Empty = look the binary up on PATH. */
        var executablePath: String = "",
        /** Where images go: see the OUTPUT_* constants. */
        var outputMode: String = OUTPUT_CLIPBOARD,
        /** Only used when outputMode is OUTPUT_CUSTOM. */
        var outputDirectory: String = "",
        /** Folder the last image was saved into, reused by the save dialog. */
        var lastSaveDirectory: String = "",
        /** Default format of the plain "Snipshot" actions: "png" or "svg". */
        var defaultFormat: String = FORMAT_PNG,
        /** "auto" follows the IDE look and feel. */
        var theme: String = THEME_AUTO,
        var contextLines: Int = 3,
        /** 0 disables word wrap (--no-max-width). */
        var maxWidth: Int = 800,
        /** 0 disables the row limit (--no-max-lines). */
        var maxLines: Int = 70,
        var openAfterSave: Boolean = true,
    )

    private var state = State()

    override fun getState(): State = state

    override fun loadState(newState: State) {
        state = newState
    }

    val isSvgByDefault: Boolean
        get() = state.defaultFormat == FORMAT_SVG

    companion object {
        const val THEME_AUTO = "auto"

        const val FORMAT_PNG = "png"
        const val FORMAT_SVG = "svg"

        /** Straight onto the clipboard, no file. PNG only. */
        const val OUTPUT_CLIPBOARD = "clipboard"
        /** Show a save dialog, starting where the last image was saved. */
        const val OUTPUT_ASK = "ask"
        /** A .snipshot directory inside the project. */
        const val OUTPUT_PROJECT_SNIPSHOT = "projectSnipshot"
        const val OUTPUT_PROJECT_ROOT = "projectRoot"
        const val OUTPUT_CUSTOM = "custom"

        fun getInstance(): SnipshotSettings =
            ApplicationManager.getApplication().getService(SnipshotSettings::class.java)

        /** npm installs a shim whose name differs per OS, so try every spelling. */
        private val CANDIDATES = listOf("snipshot", "snipshot.cmd", "snipshot.exe", "snipshot.bat")

        /**
         * The binary to run: whatever was configured, else one downloaded by
         * the plugin, else the first `snipshot` found on PATH. Null when
         * snipshot cannot be located at all.
         */
        fun resolveExecutable(): File? {
            val configured = getInstance().state.executablePath.trim()
            if (configured.isNotEmpty()) {
                val file = File(configured)
                return if (file.canExecute()) file else null
            }
            SnipshotDownloader.downloadedBinary()?.let { return it }
            return CANDIDATES.firstNotNullOfOrNull { PathEnvironmentVariableUtil.findInPath(it) }
        }
    }
}
