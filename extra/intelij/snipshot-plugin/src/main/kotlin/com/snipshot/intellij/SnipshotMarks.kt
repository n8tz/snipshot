package com.snipshot.intellij

import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.MarkupModel
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import java.awt.Color
import java.awt.Font

/** A 1-based, inclusive line range, spelled the way the snipshot CLI expects. */
data class LineRange(val start: Int, val end: Int) {
    override fun toString(): String = if (start == end) "$start" else "$start-$end"
}

enum class MarkKind {
    RED,
    GREEN,
    FOLD,
}

/**
 * Remembers which lines the user marked red / green / folded, per file, and
 * tints them in the editor so the marks stay visible until they are shot or
 * cleared. Marks are session-only on purpose: they describe one screenshot in
 * progress, not a property of the file.
 */
@Service(Service.Level.PROJECT)
class SnipshotMarks {

    private data class Entry(
        val kind: MarkKind,
        val range: LineRange,
        val markup: MarkupModel,
        val highlighter: RangeHighlighter,
    )

    private val byFile = mutableMapOf<String, MutableList<Entry>>()

    fun add(editor: Editor, kind: MarkKind, range: LineRange) {
        val path = filePath(editor) ?: return
        val document = editor.document
        val lastLine = (document.lineCount - 1).coerceAtLeast(0)
        val startLine = (range.start - 1).coerceIn(0, lastLine)
        val endLine = (range.end - 1).coerceIn(startLine, lastLine)

        val highlighter = editor.markupModel.addRangeHighlighter(
            document.getLineStartOffset(startLine),
            document.getLineEndOffset(endLine),
            HighlighterLayer.SELECTION - 1,
            attributesFor(kind),
            HighlighterTargetArea.LINES_IN_RANGE,
        )
        byFile.getOrPut(path) { mutableListOf() }
            .add(Entry(kind, range, editor.markupModel, highlighter))
    }

    /** Marked ranges of one kind, sorted by start line. */
    fun ranges(editor: Editor, kind: MarkKind): List<LineRange> {
        val path = filePath(editor) ?: return emptyList()
        return byFile[path].orEmpty()
            .filter { it.kind == kind }
            .map { it.range }
            .sortedBy { it.start }
    }

    /** The same ranges as a comma-separated CLI spec, e.g. "13,15-18". */
    fun spec(editor: Editor, kind: MarkKind): String =
        ranges(editor, kind).joinToString(",") { it.toString() }

    fun hasMarks(editor: Editor): Boolean = !byFile[filePath(editor)].isNullOrEmpty()

    fun clear(editor: Editor) {
        val path = filePath(editor) ?: return
        byFile.remove(path)?.forEach { entry ->
            runCatching { entry.markup.removeHighlighter(entry.highlighter) }
        }
    }

    private fun filePath(editor: Editor): String? =
        FileDocumentManager.getInstance().getFile(editor.document)?.path

    private fun attributesFor(kind: MarkKind): TextAttributes {
        val background: Color = when (kind) {
            MarkKind.RED -> JBColor(Color(0xFF, 0xDC, 0xDC), Color(0x5A, 0x2D, 0x30))
            MarkKind.GREEN -> JBColor(Color(0xD8, 0xF3, 0xD8), Color(0x28, 0x50, 0x2D))
            MarkKind.FOLD -> JBColor(Color(0xE8, 0xE8, 0xEA), Color(0x37, 0x3C, 0x44))
        }
        return TextAttributes(null, background, null, null, Font.PLAIN)
    }

    companion object {
        fun getInstance(project: Project): SnipshotMarks =
            project.getService(SnipshotMarks::class.java)
    }
}
