package com.snipshot.intellij.actions

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.Project
import com.snipshot.intellij.SnipshotContext
import com.snipshot.intellij.SnipshotOptionsDialog
import com.snipshot.intellij.SnipshotRunner
import java.awt.Image
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException
import java.io.File
import javax.imageio.ImageIO

/** Shoots the current selection (or the visible area) straight to a PNG. */
class SnipshotSaveAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val request = SnipshotContext.buildRequest(project, editor, filePath, svg = false)
        SnipshotRunner.run(project, request)
    }
}

/** Same, as an SVG document. */
class SnipshotSvgAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val request = SnipshotContext.buildRequest(project, editor, filePath, svg = true)
        SnipshotRunner.run(project, request)
    }
}

/** Renders to a temp file and puts the image on the clipboard, ready to paste. */
class SnipshotCopyAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val temp = File.createTempFile("snipshot-", ".png").apply { deleteOnExit() }
        val request = SnipshotContext
            .buildRequest(project, editor, filePath, svg = false)
            .copy(outputPath = temp.path)

        SnipshotRunner.run(project, request) { file ->
            val image = runCatching { ImageIO.read(file) }.getOrNull()
            if (image == null) {
                SnipshotRunner.notify(project, "Could not read the generated image.", NotificationType.ERROR)
                return@run
            }
            ApplicationManager.getApplication().invokeLater {
                CopyPasteManager.getInstance().setContents(ImageTransferable(image))
                SnipshotRunner.notify(project, "Snipshot copied to the clipboard.", NotificationType.INFORMATION)
            }
        }
    }
}

/** Opens the full options dialog, pre-filled from the selection and the marks. */
class SnipshotOptionsAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val request = SnipshotContext.buildRequest(project, editor, filePath, svg = false)
        val dialog = SnipshotOptionsDialog(project, request)
        if (dialog.showAndGet()) {
            SnipshotRunner.run(project, dialog.editedRequest())
        }
    }
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
