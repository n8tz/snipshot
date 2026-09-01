package com.snipshot.intellij.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.snipshot.intellij.MarkKind
import com.snipshot.intellij.SnipshotContext
import com.snipshot.intellij.SnipshotOptionsDialog
import com.snipshot.intellij.SnipshotOutput
import com.snipshot.intellij.SnipshotRunner
import com.snipshot.intellij.SnipshotSettings

/**
 * "Snipshot this" — shoot the visible window and outline the selection in it.
 * The selection is not the subject of the image, it is what the image points
 * at, so the surrounding code stays visible. A selection inside a single line
 * is outlined character-precisely; anything wider is highlighted line by line.
 */
abstract class SnipshotThisAction(private val kind: MarkKind) : SnipshotActionBase() {

    override fun isEnabled(editor: Editor?): Boolean = editor?.selectionModel?.hasSelection() == true

    override fun perform(project: Project, editor: Editor, filePath: String) {
        val selection = SnipshotContext.selectionRange(editor)
        val window = SnipshotContext.windowRangeCovering(editor, selection)
        val spec = SnipshotContext.selectionHighlightSpec(editor)
        val request = SnipshotContext.buildRequest(
            project = project,
            editor = editor,
            filePath = filePath,
            svg = SnipshotSettings.getInstance().isSvgByDefault,
            lines = window.toString(),
            extraRed = if (kind == MarkKind.RED) spec else "",
            extraGreen = if (kind == MarkKind.GREEN) spec else "",
        )
        SnipshotOutput.send(project, request)
    }
}

class SnipshotThisRedAction : SnipshotThisAction(MarkKind.RED)

class SnipshotThisGreenAction : SnipshotThisAction(MarkKind.GREEN)

/** Shoots the current selection (or the visible area) to the default destination. */
class SnipshotSaveAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val svg = SnipshotSettings.getInstance().isSvgByDefault
        SnipshotOutput.send(project, SnipshotContext.buildRequest(project, editor, filePath, svg = svg))
    }
}

/** Same, forced to SVG. */
class SnipshotSvgAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        SnipshotOutput.send(project, SnipshotContext.buildRequest(project, editor, filePath, svg = true))
    }
}

/** Straight onto the clipboard, whatever the configured destination is. */
class SnipshotCopyAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        SnipshotOutput.sendToClipboard(project, SnipshotContext.buildRequest(project, editor, filePath, svg = false))
    }
}

/** Opens the full options dialog, pre-filled from the selection and the marks. */
class SnipshotOptionsAction : SnipshotActionBase() {
    override fun perform(project: Project, editor: Editor, filePath: String) {
        val svg = SnipshotSettings.getInstance().isSvgByDefault
        val request = SnipshotContext.buildRequest(project, editor, filePath, svg = svg)
        val dialog = SnipshotOptionsDialog(project, request)
        if (dialog.showAndGet()) {
            SnipshotRunner.run(project, dialog.editedRequest())
        }
    }
}
