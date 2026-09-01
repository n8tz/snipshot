package com.snipshot.intellij.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project

/** Shared plumbing: every action needs a project, an editor and a file on disk. */
abstract class SnipshotActionBase : AnAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val hasFile = editor != null && filePathOf(editor) != null
        e.presentation.isEnabledAndVisible = e.project != null && hasFile && isEnabled(editor)
    }

    /** Extra per-action gate, evaluated only once a file-backed editor exists. */
    protected open fun isEnabled(editor: Editor?): Boolean = true

    override fun actionPerformed(e: AnActionEvent) {
        val project: Project = e.project ?: return
        val editor: Editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val filePath = filePathOf(editor) ?: return
        perform(project, editor, filePath)
    }

    protected abstract fun perform(project: Project, editor: Editor, filePath: String)

    protected fun filePathOf(editor: Editor): String? =
        FileDocumentManager.getInstance().getFile(editor.document)?.path
}
