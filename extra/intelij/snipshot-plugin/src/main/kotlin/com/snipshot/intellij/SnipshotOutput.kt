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
            copyImageToClipboard(project, file)
        }
    }

    private fun copyImageToClipboard(project: Project, file: File) {
        val image = runCatching { ImageIO.read(file) }.getOrNull()
        if (image == null) {
            SnipshotRunner.notify(
                project,
                "Could not read the generated image (${file.length()} bytes at ${file.path}).",
                NotificationType.ERROR,
            )
            return
        }

        ApplicationManager.getApplication().invokeLater {
            val failure = putOnClipboard(ImageTransferable(image))
            if (failure == null) {
                SnipshotRunner.notify(project, "Snipshot copied to the clipboard.", NotificationType.INFORMATION)
            } else {
                SnipshotRunner.notify(project, failure, NotificationType.ERROR)
            }
        }
    }

    /**
     * Puts the image on the clipboard and checks it actually landed. Some
     * desktops — WSLg and a few Wayland setups in particular — accept the call
     * and keep nothing, so success is verified rather than assumed. Returns null
     * on success, or a message explaining what went wrong.
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

    /** Minimal image clipboard payload — Swing only needs the image flavor. */
    private class ImageTransferable(private val image: Image) : Transferable {
        override fun getTransferDataFlavors(): Array<DataFlavor> = arrayOf(DataFlavor.imageFlavor)

        override fun isDataFlavorSupported(flavor: DataFlavor): Boolean = DataFlavor.imageFlavor == flavor

        override fun getTransferData(flavor: DataFlavor): Any {
            if (!isDataFlavorSupported(flavor)) throw UnsupportedFlavorException(flavor)
            return image
        }
    }
}
