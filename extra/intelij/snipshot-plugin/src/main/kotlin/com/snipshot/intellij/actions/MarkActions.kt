package com.snipshot.intellij.actions

import com.intellij.notification.NotificationType
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.snipshot.intellij.MarkKind
import com.snipshot.intellij.SnipshotContext
import com.snipshot.intellij.SnipshotMarks
import com.snipshot.intellij.SnipshotRunner

/**
 * Marks the selected lines so the next shot annotates them. The mark is tinted
 * in the editor, so what you see is what the screenshot will carry.
 */
abstract class MarkAction(private val kind: MarkKind) : SnipshotActionBase() {

    override fun isEnabled(editor: Editor?): Boolean = editor?.selectionModel?.hasSelection() == true

    override fun perform(project: Project, editor: Editor, filePath: String) {
        val range = SnipshotContext.selectionRange(editor)
        SnipshotMarks.getInstance(project).add(editor, kind, range)
    }
}

class MarkRedAction : MarkAction(MarkKind.RED)

class MarkGreenAction : MarkAction(MarkKind.GREEN)

class MarkFoldAction : MarkAction(MarkKind.FOLD)

/** Drops every mark on the current file and removes their editor tint. */
class ClearMarksAction : SnipshotActionBase() {

    override fun isEnabled(editor: Editor?): Boolean = true

    override fun perform(project: Project, editor: Editor, filePath: String) {
        val marks = SnipshotMarks.getInstance(project)
        if (!marks.hasMarks(editor)) {
            SnipshotRunner.notify(project, "No snipshot marks on this file.", NotificationType.INFORMATION)
            return
        }
        marks.clear(editor)
    }
}
