package com.snipshot.intellij

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.TitledSeparator
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.FlowLayout
import java.io.File
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JSpinner
import javax.swing.SpinnerNumberModel

/** Settings | Tools | Snipshot */
class SnipshotConfigurable : Configurable {

    /** Destination values, paired with what the combo shows for them. */
    private val destinations = listOf(
        SnipshotSettings.OUTPUT_CLIPBOARD to "Clipboard (PNG)",
        SnipshotSettings.OUTPUT_ASK to "Ask every time (save dialog)",
        SnipshotSettings.OUTPUT_PROJECT_SNIPSHOT to ".snipshot directory in the project",
        SnipshotSettings.OUTPUT_PROJECT_ROOT to "Project root",
        SnipshotSettings.OUTPUT_CUSTOM to "Custom directory",
    )

    // --- Binary
    private val executableField = TextFieldWithBrowseButton().apply {
        addActionListener {
            FileChooser.chooseFile(FileChooserDescriptorFactory.createSingleFileDescriptor(), null, null)
                ?.let { text = it.path }
        }
    }
    private val downloadButton = JButton("Download binary")
    private val checkButton = JButton("Check")
    private val executableStatus = JBLabel()

    // --- Output
    private val destinationCombo = ComboBox(destinations.map { it.second }.toTypedArray())
    private val customDirField = TextFieldWithBrowseButton().apply {
        addActionListener {
            FileChooser.chooseFile(FileChooserDescriptorFactory.createSingleFolderDescriptor(), null, null)
                ?.let { text = it.path }
        }
    }
    private val formatCombo = ComboBox(arrayOf(SnipshotSettings.FORMAT_PNG, SnipshotSettings.FORMAT_SVG))
    private val openAfterSaveBox = JBCheckBox("Open the image after saving")

    // --- Rendering
    private val themeCombo = ComboBox(arrayOf(SnipshotSettings.THEME_AUTO, "dark", "light"))
    private val contextSpinner = JSpinner(SpinnerNumberModel(3, 0, 999, 1))
    private val maxWidthSpinner = JSpinner(SpinnerNumberModel(800, 0, 10_000, 50))
    private val maxLinesSpinner = JSpinner(SpinnerNumberModel(70, 0, 10_000, 10))

    override fun getDisplayName(): String = "Snipshot"

    override fun createComponent(): JComponent {
        downloadButton.addActionListener { downloadBinary() }
        checkButton.addActionListener { refreshExecutableStatus() }
        destinationCombo.addActionListener { syncOutputFields() }

        val binaryButtons = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(4), 0)).apply {
            add(downloadButton)
            add(checkButton)
        }

        val panel = FormBuilder.createFormBuilder()
            .addComponent(TitledSeparator("snipshot binary"))
            .addLabeledComponent("Binary:", executableField)
            .addTooltip("Leave empty to use a downloaded binary, or the snipshot found on your PATH.")
            .addComponentToRightColumn(binaryButtons)
            .addComponentToRightColumn(executableStatus)

            .addComponent(TitledSeparator("Output"))
            .addLabeledComponent("Destination:", destinationCombo)
            .addTooltip("SVG cannot go on the clipboard: an SVG shot asks for a path instead.")
            .addLabeledComponent("Custom directory:", customDirField)
            .addLabeledComponent("Format:", formatCombo)
            .addTooltip("Used by the plain Snipshot actions; \"as SVG\" always wins.")
            .addComponentToRightColumn(openAfterSaveBox)

            .addComponent(TitledSeparator("Rendering"))
            .addLabeledComponent("Theme:", themeCombo)
            .addTooltip("\"auto\" follows the IDE theme.")
            .addLabeledComponent("Context lines:", contextSpinner)
            .addLabeledComponent("Max width:", maxWidthSpinner)
            .addTooltip("Pixels. 0 turns word wrap off and lets the image grow to the longest line.")
            .addLabeledComponent("Max rows:", maxLinesSpinner)
            .addTooltip("Refuse to render taller than this, so images fit a page. 0 lifts the limit.")

            .addComponentFillVertically(JPanel(), 0)
            .panel

        reset()
        refreshExecutableStatus()
        return panel
    }

    override fun isModified(): Boolean {
        val state = SnipshotSettings.getInstance().state
        return executableField.text != state.executablePath ||
            selectedDestination() != state.outputMode ||
            customDirField.text != state.outputDirectory ||
            formatCombo.selectedItem != state.defaultFormat ||
            themeCombo.selectedItem != state.theme ||
            contextSpinner.value != state.contextLines ||
            maxWidthSpinner.value != state.maxWidth ||
            maxLinesSpinner.value != state.maxLines ||
            openAfterSaveBox.isSelected != state.openAfterSave
    }

    override fun apply() {
        val state = SnipshotSettings.getInstance().state
        state.executablePath = executableField.text.trim()
        state.outputMode = selectedDestination()
        state.outputDirectory = customDirField.text.trim()
        state.defaultFormat = formatCombo.selectedItem as String
        state.theme = themeCombo.selectedItem as String
        state.contextLines = contextSpinner.value as Int
        state.maxWidth = maxWidthSpinner.value as Int
        state.maxLines = maxLinesSpinner.value as Int
        state.openAfterSave = openAfterSaveBox.isSelected
    }

    override fun reset() {
        val state = SnipshotSettings.getInstance().state
        executableField.text = state.executablePath
        destinationCombo.selectedItem = destinations
            .firstOrNull { it.first == state.outputMode }?.second
            ?: destinations.first().second
        customDirField.text = state.outputDirectory
        formatCombo.selectedItem = state.defaultFormat
        themeCombo.selectedItem = state.theme
        contextSpinner.value = state.contextLines
        maxWidthSpinner.value = state.maxWidth
        maxLinesSpinner.value = state.maxLines
        openAfterSaveBox.isSelected = state.openAfterSave
        syncOutputFields()
    }

    private fun selectedDestination(): String {
        val label = destinationCombo.selectedItem as? String
        return destinations.firstOrNull { it.second == label }?.first ?: destinations.first().first
    }

    /** Only a custom directory needs a path; the clipboard has nothing to open. */
    private fun syncOutputFields() {
        val destination = selectedDestination()
        customDirField.isEnabled = destination == SnipshotSettings.OUTPUT_CUSTOM
        openAfterSaveBox.isEnabled = destination != SnipshotSettings.OUTPUT_CLIPBOARD
    }

    private fun downloadBinary() {
        downloadButton.isEnabled = false
        showStatus("Downloading...", problem = false)
        SnipshotDownloader.download { binary, error ->
            downloadButton.isEnabled = true
            if (binary == null) {
                showStatus(error ?: "Download failed.", problem = true)
            } else {
                // Leave the field empty so the downloaded binary keeps being
                // picked up automatically, including after a re-download.
                executableField.text = ""
                refreshExecutableStatus()
            }
        }
    }

    /** Resolves the binary the way the actions will, then asks it for its version. */
    private fun refreshExecutableStatus() {
        val configured = executableField.text.trim()
        val binary = if (configured.isNotEmpty()) File(configured) else SnipshotSettings.resolveExecutable()
        if (binary == null || !binary.isFile) {
            showStatus("Not found. Download it, pick it above, or run \"npm install -g snipshot\".", problem = true)
            return
        }

        showStatus("Checking ${binary.path}...", problem = false)
        checkButton.isEnabled = false
        val application = ApplicationManager.getApplication()
        application.executeOnPooledThread {
            val version = SnipshotDownloader.probeVersion(binary)
            application.invokeLater {
                checkButton.isEnabled = true
                if (version == null) {
                    showStatus("${binary.path} did not answer --version.", problem = true)
                } else {
                    showStatus("snipshot $version — ${binary.path}", problem = false)
                }
            }
        }
    }

    private fun showStatus(message: String, problem: Boolean) {
        executableStatus.text = message
        executableStatus.foreground = if (problem) UIUtil.getErrorForeground() else UIUtil.getLabelInfoForeground()
    }
}
