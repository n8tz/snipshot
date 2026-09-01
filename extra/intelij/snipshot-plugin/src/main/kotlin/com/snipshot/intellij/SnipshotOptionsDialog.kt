package com.snipshot.intellij

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

/**
 * "Snipshot…" — every flag in one place, pre-filled from the selection and the
 * marks, so a shot can be adjusted without redoing the marking.
 */
class SnipshotOptionsDialog(
    project: Project,
    private val initial: SnipshotRequest,
) : DialogWrapper(project) {

    private val linesField = JBTextField(initial.lines)
    private val redField = JBTextField(initial.red)
    private val greenField = JBTextField(initial.green)
    private val foldField = JBTextField(initial.folds)
    private val outputField = JBTextField(initial.outputPath)
    private val themeCombo = ComboBox(arrayOf("dark", "light"))
    private val formatCombo = ComboBox(arrayOf("PNG", "SVG"))
    private val contextSpinner = JSpinner(SpinnerNumberModel(initial.contextLines, 0, 999, 1))
    private val maxWidthSpinner = JSpinner(SpinnerNumberModel(initial.maxWidth, 0, 10_000, 50))
    private val maxLinesSpinner = JSpinner(SpinnerNumberModel(initial.maxLines, 0, 10_000, 10))

    init {
        title = "Snipshot"
        themeCombo.selectedItem = initial.theme
        formatCombo.selectedItem = if (initial.svg) "SVG" else "PNG"
        setOKButtonText("Snipshot")
        init()
    }

    override fun createCenterPanel(): JComponent =
        FormBuilder.createFormBuilder()
            .addLabeledComponent("Lines:", linesField)
            .addTooltip("One or more ranges, e.g. 42-56 or 10-14,42-56. Gaps between ranges are folded.")
            .addLabeledComponent("Highlight red:", redField)
            .addLabeledComponent("Highlight green:", greenField)
            .addTooltip("Lines (47), ranges (47-50) or columns (47:12-38), comma-separated.")
            .addLabeledComponent("Fold:", foldField)
            .addSeparator()
            .addLabeledComponent("Theme:", themeCombo)
            .addLabeledComponent("Format:", formatCombo)
            .addLabeledComponent("Context lines:", contextSpinner)
            .addLabeledComponent("Max width (0 = no wrap):", maxWidthSpinner)
            .addLabeledComponent("Max rows (0 = unlimited):", maxLinesSpinner)
            .addSeparator()
            .addLabeledComponent("Output:", outputField)
            .panel

    override fun doValidate(): ValidationInfo? {
        if (linesField.text.isBlank()) {
            return ValidationInfo("Give at least one line or range.", linesField)
        }
        if (outputField.text.isBlank()) {
            return ValidationInfo("Give an output path.", outputField)
        }
        return null
    }

    /** The edited request. Output extension follows the chosen format. */
    fun editedRequest(): SnipshotRequest {
        val svg = formatCombo.selectedItem == "SVG"
        val output = retarget(outputField.text.trim(), svg)
        return initial.copy(
            lines = linesField.text.trim(),
            red = redField.text.trim(),
            green = greenField.text.trim(),
            folds = foldField.text.trim(),
            theme = themeCombo.selectedItem as String,
            contextLines = contextSpinner.value as Int,
            maxWidth = maxWidthSpinner.value as Int,
            maxLines = maxLinesSpinner.value as Int,
            svg = svg,
            outputPath = output,
        )
    }

    /** Keeps the output extension in sync when the format is switched. */
    private fun retarget(path: String, svg: Boolean): String {
        val wanted = if (svg) "svg" else "png"
        val other = if (svg) "png" else "svg"
        return if (path.endsWith(".$other", ignoreCase = true)) {
            path.dropLast(other.length) + wanted
        } else {
            path
        }
    }
}
