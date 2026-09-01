package com.snipshot.intellij

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import java.awt.Point
import java.io.File

/** Everything one snipshot invocation needs. Mirrors the CLI flags one-for-one. */
data class SnipshotRequest(
    val filePath: String,
    /** `--lines` spec: one or more comma-separated ranges. */
    val lines: String,
    val red: String = "",
    val green: String = "",
    val folds: String = "",
    val theme: String = "dark",
    val contextLines: Int = 3,
    /** 0 = --no-max-width. */
    val maxWidth: Int = 800,
    /** 0 = --no-max-lines. */
    val maxLines: Int = 70,
    val svg: Boolean = false,
    val outputPath: String,
    val rootPath: String? = null,
) {
    fun toCommandArgs(): List<String> = buildList {
        add(filePath)
        add("--lines"); add(lines)
        if (red.isNotBlank()) { add("--highlight-red"); add(red) }
        if (green.isNotBlank()) { add("--highlight-green"); add(green) }
        if (folds.isNotBlank()) { add("--fold"); add(folds) }
        add("--theme"); add(theme)
        add("--context"); add(contextLines.toString())
        if (maxWidth <= 0) add("--no-max-width") else { add("--max-width"); add(maxWidth.toString()) }
        if (maxLines <= 0) add("--no-max-lines") else { add("--max-lines"); add(maxLines.toString()) }
        if (svg) add("--svg")
        rootPath?.let { add("--root"); add(it) }
        add("--output"); add(outputPath)
    }
}

/** Turns the state of an editor into a [SnipshotRequest]. */
object SnipshotContext {

    /**
     * The lines to capture: one range per selection (multiple carets give
     * multiple ranges, which snipshot folds the gaps between). With no
     * selection at all, capture what is currently visible on screen.
     */
    fun captureRanges(editor: Editor): List<LineRange> {
        val document = editor.document
        val selections = editor.caretModel.allCarets
            .filter { it.hasSelection() }
            .map { caret ->
                val start = document.getLineNumber(caret.selectionStart) + 1
                // A selection ending at column 0 stops on the previous line:
                // stepping back one character keeps the trailing line out.
                val endOffset = (caret.selectionEnd - 1).coerceAtLeast(caret.selectionStart)
                val end = document.getLineNumber(endOffset) + 1
                LineRange(start, maxOf(start, end))
            }
        if (selections.isNotEmpty()) return selections.sortedBy { it.start }
        return listOf(visibleRange(editor))
    }

    /** The first and last line currently scrolled into view. */
    fun visibleRange(editor: Editor): LineRange {
        val area = editor.scrollingModel.visibleArea
        val lastLine = (editor.document.lineCount - 1).coerceAtLeast(0)
        val first = editor.xyToLogicalPosition(Point(0, area.y)).line.coerceIn(0, lastLine)
        val last = editor.xyToLogicalPosition(Point(0, area.y + area.height)).line.coerceIn(first, lastLine)
        return LineRange(first + 1, last + 1)
    }

    /** The range covered by the current selection, or the caret line. */
    fun selectionRange(editor: Editor): LineRange {
        val document = editor.document
        val model = editor.selectionModel
        if (!model.hasSelection()) {
            val line = document.getLineNumber(editor.caretModel.offset) + 1
            return LineRange(line, line)
        }
        val start = document.getLineNumber(model.selectionStart) + 1
        val endOffset = (model.selectionEnd - 1).coerceAtLeast(model.selectionStart)
        val end = document.getLineNumber(endOffset) + 1
        return LineRange(start, maxOf(start, end))
    }

    /**
     * The visible area, widened if needed so [selection] is inside the shot.
     * Keeps "shoot the window, point at this" from producing an image whose
     * annotation is off-screen.
     */
    fun windowRangeCovering(editor: Editor, selection: LineRange): LineRange {
        val visible = visibleRange(editor)
        return LineRange(minOf(visible.start, selection.start), maxOf(visible.end, selection.end))
    }

    /**
     * The selection as a snipshot highlight spec. A selection sitting inside a
     * single line becomes a column box ("47:12-38") so only those characters
     * are outlined; anything else becomes a line range.
     */
    fun selectionHighlightSpec(editor: Editor): String {
        val model = editor.selectionModel
        if (!model.hasSelection()) return ""

        val range = selectionRange(editor)
        val start = editor.offsetToLogicalPosition(model.selectionStart)
        val end = editor.offsetToLogicalPosition(model.selectionEnd)
        if (start.line != end.line || end.column <= start.column) return range.toString()

        val document = editor.document
        val coversWholeLine = model.selectionStart <= document.getLineStartOffset(start.line) &&
            model.selectionEnd >= document.getLineEndOffset(start.line)
        if (coversWholeLine) return range.toString()

        // snipshot columns are 1-based and inclusive; the selection end is exclusive.
        return "${range.start}:${start.column + 1}-${end.column}"
    }

    /**
     * Builds a request from the editor, the stored marks and the settings.
     * [lines] defaults to the selections (or the visible area), and the extra
     * specs are merged on top of the marks for one-shot annotations.
     */
    fun buildRequest(
        project: Project,
        editor: Editor,
        filePath: String,
        svg: Boolean,
        lines: String = captureRanges(editor).joinToString(",") { it.toString() },
        extraRed: String = "",
        extraGreen: String = "",
    ): SnipshotRequest {
        val settings = SnipshotSettings.getInstance().state
        val marks = SnipshotMarks.getInstance(project)
        return SnipshotRequest(
            filePath = filePath,
            lines = lines,
            red = mergeSpecs(marks.spec(editor, MarkKind.RED), extraRed),
            green = mergeSpecs(marks.spec(editor, MarkKind.GREEN), extraGreen),
            folds = marks.spec(editor, MarkKind.FOLD),
            theme = resolveTheme(settings.theme),
            contextLines = settings.contextLines,
            maxWidth = settings.maxWidth,
            maxLines = settings.maxLines,
            svg = svg,
            outputPath = defaultOutput(project, filePath, lines, svg).path,
            rootPath = project.basePath,
        )
    }

    /** Joins non-empty CLI specs, e.g. marks plus a one-shot selection. */
    private fun mergeSpecs(vararg specs: String): String =
        specs.filter { it.isNotBlank() }.joinToString(",")

    /** "auto" resolves against the current IDE look and feel. */
    fun resolveTheme(configured: String): String = when (configured) {
        SnipshotSettings.THEME_AUTO -> if (JBColor.isBright()) "light" else "dark"
        else -> configured
    }

    /** Where images are written, per the output-mode setting. */
    fun outputDirectory(project: Project): File {
        val settings = SnipshotSettings.getInstance().state
        val base = project.basePath ?: System.getProperty("user.home")
        return when (settings.outputMode) {
            SnipshotSettings.OUTPUT_CUSTOM ->
                File(settings.outputDirectory.trim().ifEmpty { base })
            SnipshotSettings.OUTPUT_PROJECT_ROOT -> File(base)
            SnipshotSettings.OUTPUT_PROJECT_SNIPSHOT -> File(base, ".snipshot")
            // Ask mode: where the dialog will open, and what the options
            // dialog pre-fills.
            else -> File(settings.lastSaveDirectory.trim().ifEmpty { base })
        }
    }

    /** `<outputDir>/<name>_L<ranges>.<ext>`, with "+" between ranges like the CLI. */
    fun defaultOutput(project: Project, filePath: String, lines: String, svg: Boolean): File {
        val baseName = File(filePath).nameWithoutExtension
        val label = lines.replace(",", "+")
        val extension = if (svg) "svg" else "png"
        return File(outputDirectory(project), "${baseName}_L$label.$extension")
    }
}
