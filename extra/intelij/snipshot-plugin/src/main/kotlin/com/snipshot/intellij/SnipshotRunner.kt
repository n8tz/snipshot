package com.snipshot.intellij

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.ide.actions.RevealFileAction
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File

/** Runs the snipshot CLI off the UI thread and reports the result. */
object SnipshotRunner {

    private const val NOTIFICATION_GROUP = "Snipshot"
    private const val TIMEOUT_MS = 60_000

    /**
     * Runs [request] in the background. On success [onSuccess] is called on a
     * background thread with the file that was written; failures surface as an
     * error balloon carrying the CLI's own message, which already explains how
     * to recover (narrow the range, fold, raise the limit).
     */
    fun run(project: Project, request: SnipshotRequest, onSuccess: (File) -> Unit = { notifySaved(project, it) }) {
        val executable = SnipshotSettings.resolveExecutable()
        if (executable == null) {
            notifyMissingExecutable(project)
            return
        }

        object : Task.Backgroundable(project, "Running snipshot", true) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true

                val commandLine = GeneralCommandLine(executable.path)
                    .withParameters(request.toCommandArgs())
                    .withWorkDirectory(project.basePath)
                    .withCharset(Charsets.UTF_8)

                val output = try {
                    CapturingProcessHandler(commandLine).runProcess(TIMEOUT_MS)
                } catch (e: Exception) {
                    notify(project, "snipshot failed to start: ${e.message}", NotificationType.ERROR)
                    return
                }

                if (output.exitCode != 0) {
                    val message = listOf(output.stderr, output.stdout)
                        .firstOrNull { it.isNotBlank() }
                        ?.trim()
                        ?: "snipshot exited with code ${output.exitCode}"
                    notify(project, message, NotificationType.ERROR)
                    return
                }

                val file = File(request.outputPath)
                if (!file.exists()) {
                    notify(project, "snipshot reported success but ${file.path} is missing", NotificationType.ERROR)
                    return
                }
                LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
                onSuccess(file)
            }
        }.queue()
    }

    fun notifySaved(project: Project, file: File) {
        val notification = NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification("Snipshot saved to ${file.name}", NotificationType.INFORMATION)
            .addAction(NotificationAction.createSimple("Open") { openInIde(project, file) })
            .addAction(NotificationAction.createSimple("Show in files") { RevealFileAction.openFile(file) })
        notification.notify(project)

        if (SnipshotSettings.getInstance().state.openAfterSave) {
            openInIde(project, file)
        }
    }

    fun notify(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification(message, type)
            .notify(project)
    }

    private fun notifyMissingExecutable(project: Project) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification(
                "snipshot was not found on your PATH. Install it with \"npm install -g snipshot\", " +
                    "or set the binary path in Settings | Tools | Snipshot.",
                NotificationType.ERROR,
            )
            .notify(project)
    }

    private fun openInIde(project: Project, file: File) {
        ApplicationManager.getApplication().invokeLater {
            val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file) ?: return@invokeLater
            FileEditorManager.getInstance(project).openFile(virtualFile, true)
        }
    }
}
