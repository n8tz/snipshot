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
        /** Empty = write into the project root. */
        var outputDirectory: String = "",
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

    companion object {
        const val THEME_AUTO = "auto"

        fun getInstance(): SnipshotSettings =
            ApplicationManager.getApplication().getService(SnipshotSettings::class.java)

        /** npm installs a shim whose name differs per OS, so try every spelling. */
        private val CANDIDATES = listOf("snipshot", "snipshot.cmd", "snipshot.exe", "snipshot.bat")

        /**
         * The configured binary, or the first `snipshot` found on PATH.
         * Returns null when snipshot cannot be located.
         */
        fun resolveExecutable(): File? {
            val configured = getInstance().state.executablePath.trim()
            if (configured.isNotEmpty()) {
                val file = File(configured)
                return if (file.canExecute()) file else null
            }
            return CANDIDATES.firstNotNullOfOrNull { PathEnvironmentVariableUtil.findInPath(it) }
        }
    }
}
