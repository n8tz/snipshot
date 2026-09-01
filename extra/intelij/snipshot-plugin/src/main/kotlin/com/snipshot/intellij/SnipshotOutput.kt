package com.snipshot.intellij

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.awt.Image
import java.awt.Toolkit
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException
import java.io.ByteArrayInputStream
import java.io.File
import javax.imageio.ImageIO

/** Sends a rendered snippet wherever the destination setting says. */
object SnipshotOutput {

    /**
     * Renders [request] and delivers it: onto the clipboard by default, or into
     * a file — silently, or through a save dialog that opens on the folder the
     * last image went to. SVG never goes to the clipboard, so a clipboard
     * default falls back to asking for a path.
     */
    fun send(project: Project, request: SnipshotRequest) {
        val mode = SnipshotSettings.getInstance().state.outputMode

        if (mode == SnipshotSettings.OUTPUT_CLIPBOARD && !request.svg) {
            sendToClipboard(project, request)
            return
        }

        val resolved = when (mode) {
            // A clipboard default with an SVG shot has nowhere to go: ask.
            SnipshotSettings.OUTPUT_ASK, SnipshotSettings.OUTPUT_CLIPBOARD -> askWhereToSave(project, request)
            else -> request
        } ?: return

        SnipshotRunner.run(project, resolved)
    }

    /** Renders to a temp file and puts the image on the clipboard. */
    fun sendToClipboard(project: Project, request: SnipshotRequest) {
        val temp = File.createTempFile("snipshot-", ".png").apply { deleteOnExit() }
        SnipshotRunner.run(project, request.copy(svg = false, outputPath = temp.path)) { file ->
            deliver(project, request, file)
        }
    }

    /** Runs on a background thread: it may start a process. */
    private fun deliver(project: Project, request: SnipshotRequest, file: File) {
        val bytes = runCatching { file.readBytes() }.getOrNull()
        val image = runCatching { ImageIO.read(file) }.getOrNull()
        if (bytes == null || image == null) {
            SnipshotRunner.notify(
                project,
                "Could not read the generated image (${file.length()} bytes at ${file.path}).",
                NotificationType.ERROR,
            )
            return
        }

        // Under WSL the Java clipboard never reaches Windows applications, so the
        // image is handed to the Windows side as well. Done here rather than on
        // the EDT because it spawns PowerShell.
        val windowsFailure = if (WindowsClipboard.isWsl) WindowsClipboard.copyImage(file) else null

        // A clipboard-only result that no Windows application can read is no
        // result at all, so the shot is kept as a file instead of being lost.
        val kept = if (windowsFailure != null) keepAsFile(project, request, file) else null

        ApplicationManager.getApplication().invokeLater {
            val localFailure = putOnClipboard(ImageTransferable(image, bytes))
            report(project, localFailure, windowsFailure, kept)
        }
    }

    /** Copies the rendered image into the project, under .snipshot/. */
    private fun keepAsFile(project: Project, request: SnipshotRequest, rendered: File): File? {
        val base = project.basePath ?: return null
        val directory = File(base, ".snipshot")
        val target = File(directory, File(request.outputPath).name)
        return try {
            directory.mkdirs()
            rendered.copyTo(target, overwrite = true)
            LocalFileSystem.getInstance().refreshAndFindFileByIoFile(target)
            target
        } catch (e: Exception) {
            null
        }
    }

    private fun report(project: Project, localFailure: String?, windowsFailure: String?, kept: File?) {
        when {
            kept != null -> SnipshotRunner.notifySaved(
                project,
                kept,
                "The Windows clipboard is out of reach ($windowsFailure) — saved to ${kept.name} instead. " +
                    "Set Destination in Settings | Tools | Snipshot to choose where these go.",
                NotificationType.WARNING,
            )

            WindowsClipboard.isWsl && windowsFailure != null -> SnipshotRunner.notify(
                project,
                "Copied inside the IDE only — the Windows clipboard could not be reached " +
                    "($windowsFailure), and the image could not be saved either.",
                NotificationType.ERROR,
            )

            localFailure != null && !WindowsClipboard.isWsl ->
                SnipshotRunner.notify(project, localFailure, NotificationType.ERROR)

            else ->
                SnipshotRunner.notify(project, "Snipshot copied to the clipboard.", NotificationType.INFORMATION)
        }
    }

    /**
     * Puts the image on the clipboard and checks it actually landed. Some
     * desktops accept the call and keep nothing, so success is verified rather
     * than assumed. Returns null on success, or a message.
     */
    private fun putOnClipboard(transferable: Transferable): String? {
        val hint = "Set Destination to a folder in Settings | Tools | Snipshot to save images instead."
        return try {
            CopyPasteManager.getInstance().setContents(transferable)

            val clipboard = Toolkit.getDefaultToolkit().systemClipboard
            if (!clipboard.isDataFlavorAvailable(DataFlavor.imageFlavor)) {
                // Second attempt, straight through AWT.
                clipboard.setContents(transferable, null)
            }
            if (clipboard.isDataFlavorAvailable(DataFlavor.imageFlavor)) {
                null
            } else {
                "The clipboard did not accept an image. $hint"
            }
        } catch (e: Exception) {
            "Clipboard error: ${e.javaClass.simpleName}: ${e.message}. $hint"
        }
    }

    /**
     * Save dialog, opened on the last folder used and pre-filled with the
     * generated name. Remembers the folder. Null when the user cancels.
     */
    private fun askWhereToSave(project: Project, request: SnipshotRequest): SnipshotRequest? {
        val settings = SnipshotSettings.getInstance().state
        val suggested = File(request.outputPath)
        val extension = if (request.svg) "svg" else "png"

        val descriptor = FileSaverDescriptor(
            "Save Snipshot",
            "Choose where to write the ${extension.uppercase()}",
            extension,
        )
        val startIn = suggested.parentFile?.path
            ?.let { LocalFileSystem.getInstance().refreshAndFindFileByPath(it) }
        val chosen = FileChooserFactory.getInstance()
            .createSaveFileDialog(descriptor, project)
            .save(startIn, suggested.name)
            ?: return null

        val file = chosen.file
        file.parentFile?.let { settings.lastSaveDirectory = it.path }
        return request.copy(outputPath = file.path)
    }

    /**
     * Offers the image both as an AWT image and as raw PNG bytes: applications
     * differ on which one they ask for, and offering only the first leaves some
     * of them with nothing to paste.
     */
    private class ImageTransferable(
        private val image: Image,
        private val pngBytes: ByteArray,
    ) : Transferable {

        private val pngFlavor = DataFlavor("image/png", "PNG image")

        override fun getTransferDataFlavors(): Array<DataFlavor> =
            arrayOf(DataFlavor.imageFlavor, pngFlavor)

        override fun isDataFlavorSupported(flavor: DataFlavor): Boolean =
            DataFlavor.imageFlavor == flavor || pngFlavor.isMimeTypeEqual(flavor)

        override fun getTransferData(flavor: DataFlavor): Any = when {
            DataFlavor.imageFlavor == flavor -> image
            pngFlavor.isMimeTypeEqual(flavor) -> ByteArrayInputStream(pngBytes)
            else -> throw UnsupportedFlavorException(flavor)
        }
    }
}
