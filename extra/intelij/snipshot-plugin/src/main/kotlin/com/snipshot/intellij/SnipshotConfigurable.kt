package com.snipshot.intellij

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

/** Settings | Tools | Snipshot */
class SnipshotConfigurable : Configurable {

    private val executableField = JBTextField()
    private val outputDirField = JBTextField()
    private val themeCombo = ComboBox(arrayOf(SnipshotSettings.THEME_AUTO, "dark", "light"))
    private val contextSpinner = JSpinner(SpinnerNumberModel(3, 0, 999, 1))
    private val maxWidthSpinner = JSpinner(SpinnerNumberModel(800, 0, 10_000, 50))
    private val maxLinesSpinner = JSpinner(SpinnerNumberModel(70, 0, 10_000, 10))
    private val openAfterSaveBox = JBCheckBox("Open the image after saving")

    private var panel: JComponent? = null

    override fun getDisplayName(): String = "Snipshot"

    override fun createComponent(): JComponent {
        val built = FormBuilder.createFormBuilder()
            .addLabeledComponent("snipshot binary:", executableField)
            .addTooltip("Leave empty to use the snipshot found on your PATH.")
            .addLabeledComponent("Output directory:", outputDirField)
            .addTooltip("Leave empty to write into the project root.")
            .addSeparator()
            .addLabeledComponent("Theme:", themeCombo)
            .addTooltip("\"auto\" follows the IDE theme.")
            .addLabeledComponent("Context lines:", contextSpinner)
            .addLabeledComponent("Max width (0 = no wrap):", maxWidthSpinner)
            .addLabeledComponent("Max rows (0 = unlimited):", maxLinesSpinner)
            .addComponent(openAfterSaveBox)
            .addComponentFillVertically(javax.swing.JPanel(), 0)
            .panel
        panel = built
        reset()
        return built
    }

    override fun isModified(): Boolean {
        val state = SnipshotSettings.getInstance().state
        return executableField.text != state.executablePath ||
            outputDirField.text != state.outputDirectory ||
            themeCombo.selectedItem != state.theme ||
            contextSpinner.value != state.contextLines ||
            maxWidthSpinner.value != state.maxWidth ||
            maxLinesSpinner.value != state.maxLines ||
            openAfterSaveBox.isSelected != state.openAfterSave
    }

    override fun apply() {
        val state = SnipshotSettings.getInstance().state
        state.executablePath = executableField.text.trim()
        state.outputDirectory = outputDirField.text.trim()
        state.theme = themeCombo.selectedItem as String
        state.contextLines = contextSpinner.value as Int
        state.maxWidth = maxWidthSpinner.value as Int
        state.maxLines = maxLinesSpinner.value as Int
        state.openAfterSave = openAfterSaveBox.isSelected
    }

    override fun reset() {
        val state = SnipshotSettings.getInstance().state
        executableField.text = state.executablePath
        outputDirField.text = state.outputDirectory
        themeCombo.selectedItem = state.theme
        contextSpinner.value = state.contextLines
        maxWidthSpinner.value = state.maxWidth
        maxLinesSpinner.value = state.maxLines
        openAfterSaveBox.isSelected = state.openAfterSave
    }

    override fun disposeUIResources() {
        panel = null
    }
}
