"use strict";

const CONFIG = {
    maxFileSize: 50 * 1024 * 1024,
    acceptedTypes: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/bmp"
    ],
    acceptedExtensions: [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".bmp"
    ]
};

let selectedFile = null;
let selectedFormat = "svg";
let originalImage = null;
let generatedBlob = null;
let generatedURL = null;
let potrace = null;
let wasmReady = false;
let wasmLoading = false;

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const browseButton = document.getElementById("browseButton");
const workspace = document.getElementById("workspace");
const result = document.getElementById("result");
const imagePreview = document.getElementById("imagePreview");
const svgPreview = document.getElementById("svgPreview");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const fileTypeIcon = document.getElementById("fileTypeIcon");
const removeFile = document.getElementById("removeFile");
const formatOptions = document.querySelectorAll(".format-option");
const svgSettings = document.getElementById("svgSettings");
const traceMode = document.getElementById("traceMode");
const colorCount = document.getElementById("colorCount");
const colorCountValue = document.getElementById("colorCountValue");
const detailLevel = document.getElementById("detailLevel");
const detailValue = document.getElementById("detailValue");
const smoothLevel = document.getElementById("smoothLevel");
const smoothValue = document.getElementById("smoothValue");
const colorCountSetting = document.getElementById("colorCountSetting");
const convertButton = document.getElementById("convertButton");
const buttonLabel = document.querySelector(".button-label");
const buttonLoading = document.querySelector(".button-loading");
const buttonArrow = document.querySelector(".button-arrow");
const conversionStatus = document.getElementById("conversionStatus");
const resultFileName = document.getElementById("resultFileName");
const downloadButton = document.getElementById("downloadButton");
const themeToggle = document.getElementById("themeToggle");

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
    initializeInterface();
    setupFileUpload();
    setupFormats();
    setupSVGControls();
    setupRemoveFile();
    setupTheme();
    updateSvgSettings();
    updateSliderLabels();
    setLoadingState(false);
    setConvertButtonState();

    if (window.VetraPotrace) {
        initializePotrace();
    } else {
        window.addEventListener(
            "vetra:potrace-ready",
            initializePotrace,
            { once: true }
        );

        window.addEventListener(
            "vetra:potrace-error",
            handlePotraceLoadError,
            { once: true }
        );
    }
}

function initializeInterface() {
    if (workspace) {
        workspace.classList.add("hidden");
        workspace.classList.remove("active");
    }

    if (result) {
        result.classList.add("hidden");
        result.classList.remove("visible");
    }

    if (svgSettings) {
        svgSettings.classList.remove("hidden");
    }

    if (buttonLoading) {
        buttonLoading.classList.add("hidden");
    }

    if (buttonLabel) {
        buttonLabel.classList.remove("hidden");
    }

    if (buttonArrow) {
        buttonArrow.classList.remove("hidden");
    }

    if (dropzone) {
        dropzone.classList.remove("hidden");
        dropzone.style.display = "";
    }
}

async function initializePotrace() {
    if (wasmLoading || wasmReady) {
        return;
    }

    wasmLoading = true;
    updateConversionStatus("Preparing vector engine...");
    setConvertButtonState();

    try {
        const module = window.VetraPotrace;

        if (!module || typeof module.potrace !== "function") {
            throw new Error("Vector engine is unavailable.");
        }

        if (typeof module.init === "function") {
            await module.init();
        }

        potrace = module.potrace;
        wasmReady = true;
        wasmLoading = false;

        updateSvgSettings();
        setConvertButtonState();
    } catch (error) {
        wasmLoading = false;
        wasmReady = false;

        console.error(
            "[NOMO] Potrace initialization failed:",
            error
        );

        handlePotraceLoadError(error);
    }
}

function handlePotraceLoadError(error) {
    wasmReady = false;
    wasmLoading = false;

    const message =
        error?.message ||
        "The vector engine could not be loaded. Please refresh the page and try again.";

    updateConversionStatus(message);
    setConvertButtonState();

    showToast(
        "Vector engine error",
        "The SVG conversion engine could not be loaded.",
        true
    );
}

function setConvertButtonState() {
    if (!convertButton) {
        return;
    }

    const canConvert =
        Boolean(selectedFile) &&
        Boolean(selectedFormat) &&
        (selectedFormat !== "svg" || wasmReady) &&
        !wasmLoading;

    convertButton.disabled = !canConvert;
}

function setupFileUpload() {
    if (!dropzone || !fileInput) {
        return;
    }

    if (browseButton) {
        browseButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            fileInput.click();
        });
    }

    dropzone.addEventListener("click", event => {
        if (
            event.target === browseButton ||
            event.target.closest("#browseButton")
        ) {
            return;
        }

        fileInput.click();
    });

    dropzone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", event => {
        const file = event.target.files?.[0];

        if (file) {
            handleFile(file);
        }
    });

    dropzone.addEventListener("dragenter", handleDragOver);
    dropzone.addEventListener("dragover", handleDragOver);
    dropzone.addEventListener("dragleave", handleDragLeave);
    dropzone.addEventListener("drop", handleDrop);

    window.addEventListener("dragover", event => {
        event.preventDefault();
    });

    window.addEventListener("drop", event => {
        if (!dropzone.contains(event.target)) {
            event.preventDefault();
        }
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();

    if (dropzone) {
        dropzone.classList.add("drag-over");
    }
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();

    if (
        dropzone &&
        !dropzone.contains(event.relatedTarget)
    ) {
        dropzone.classList.remove("drag-over");
    }
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    if (dropzone) {
        dropzone.classList.remove("drag-over");
    }

    const file = event.dataTransfer?.files?.[0];

    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    const validation = validateFile(file);

    if (!validation.valid) {
        showToast(
            "Invalid file",
            validation.message,
            true
        );
        return;
    }

    loadImage(file);
}

function validateFile(file) {
    if (!file) {
        return {
            valid: false,
            message: "No file was selected."
        };
    }

    if (file.size > CONFIG.maxFileSize) {
        return {
            valid: false,
            message: "The file is too large. The maximum size is 50 MB."
        };
    }

    const extension = getExtension(file.name).toLowerCase();

    const validType =
        CONFIG.acceptedTypes.includes(file.type) ||
        CONFIG.acceptedExtensions.includes(extension);

    if (!validType) {
        return {
            valid: false,
            message: "This file type is not supported."
        };
    }

    return {
        valid: true
    };
}

function loadImage(file) {
    const reader = new FileReader();

    reader.onload = event => {
        const image = new Image();

        image.onload = () => {
            selectedFile = file;
            originalImage = image;
            generatedBlob = null;

            if (generatedURL) {
                URL.revokeObjectURL(generatedURL);
                generatedURL = null;
            }

            if (imagePreview) {
                imagePreview.src = event.target.result;
            }

            if (fileName) {
                fileName.textContent = file.name;
            }

            if (fileSize) {
                fileSize.textContent = formatFileSize(file.size);
            }

            if (fileTypeIcon) {
                fileTypeIcon.textContent = getFileTypeIcon(file);
            }

            if (workspace) {
                workspace.classList.remove("hidden");
                workspace.classList.add("active");
            }

            if (result) {
                result.classList.add("hidden");
                result.classList.remove("visible");
            }

            if (dropzone) {
                dropzone.classList.add("hidden");
                dropzone.classList.remove("drag-over");
                dropzone.style.display = "";
            }

            if (svgPreview) {
                svgPreview.innerHTML = "";
                svgPreview.classList.add("hidden");
            }

            updateSvgSettings();
            setConvertButtonState();

            showToast(
                "File loaded",
                `${file.name} is ready to convert.`
            );
        };

        image.onerror = () => {
            showToast(
                "Image error",
                "The selected file could not be loaded.",
                true
            );
        };

        image.src = event.target.result;
    };

    reader.onerror = () => {
        showToast(
            "File error",
            "The selected file could not be read.",
            true
        );
    };

    reader.readAsDataURL(file);
}

function setupFormats() {
    formatOptions.forEach(option => {
        const format = option.dataset.format;

        option.classList.toggle(
            "selected",
            format === selectedFormat
        );

        option.classList.toggle(
            "active",
            format === selectedFormat
        );

        option.addEventListener("click", () => {
            selectedFormat = format;

            formatOptions.forEach(item => {
                const isSelected =
                    item.dataset.format === selectedFormat;

                item.classList.toggle(
                    "selected",
                    isSelected
                );

                item.classList.toggle(
                    "active",
                    isSelected
                );
            });

            if (generatedURL) {
                URL.revokeObjectURL(generatedURL);
                generatedURL = null;
            }

            generatedBlob = null;

            if (result) {
                result.classList.add("hidden");
                result.classList.remove("visible");
            }

            updateSvgSettings();
            setConvertButtonState();
        });
    });
}

function updateSvgSettings() {
    if (!svgSettings) {
        return;
    }

    const isSVG = selectedFormat === "svg";

    svgSettings.classList.toggle(
        "hidden",
        !isSVG
    );

    svgSettings.classList.toggle(
        "visible",
        isSVG
    );

    if (colorCountSetting) {
        colorCountSetting.style.display =
            traceMode?.value === "color" && isSVG
                ? ""
                : "none";
    }

    if (isSVG && !wasmReady) {
        updateConversionStatus(
            wasmLoading
                ? "Preparing the SVG vector engine..."
                : "Loading the SVG vector engine..."
        );
    } else if (isSVG && wasmReady) {
        updateConversionStatus(
            selectedFile
                ? "Ready to convert to SVG."
                : "Ready"
        );
    } else {
        updateConversionStatus(
            selectedFile
                ? "Ready to convert."
                : "Ready"
        );
    }
}

function setupSVGControls() {
    if (traceMode) {
        traceMode.addEventListener("change", () => {
            if (colorCountSetting) {
                colorCountSetting.style.display =
                    traceMode.value === "color" &&
                    selectedFormat === "svg"
                        ? ""
                        : "none";
            }
        });
    }

    if (colorCount) {
        colorCount.addEventListener(
            "input",
            updateSliderLabels
        );
    }

    if (detailLevel) {
        detailLevel.addEventListener(
            "input",
            updateSliderLabels
        );
    }

    if (smoothLevel) {
        smoothLevel.addEventListener(
            "input",
            updateSliderLabels
        );
    }

    if (convertButton) {
        convertButton.addEventListener(
            "click",
            convertFile
        );
    }

    if (downloadButton) {
        downloadButton.addEventListener(
            "click",
            event => {
                event.preventDefault();
                downloadResult();
            }
        );
    }
}

function updateSliderLabels() {
    if (colorCount && colorCountValue) {
        colorCountValue.textContent =
            colorCount.value;
    }

    if (detailLevel && detailValue) {
        detailValue.textContent =
            getDetailLabel(
                Number(detailLevel.value)
            );
    }

    if (smoothLevel && smoothValue) {
        smoothValue.textContent =
            smoothLevel.value;
    }
}

function getDetailLabel(value) {
    if (value <= 1) {
        return "Very low";
    }

    if (value === 2) {
        return "Low";
    }

    if (value === 3) {
        return "Medium";
    }

    if (value === 4) {
        return "High";
    }

    return "Very high";
}

async function convertFile() {
    if (!selectedFile) {
        showToast(
            "No file selected",
            "Please select an image first.",
            true
        );
        return;
    }

    if (
        selectedFormat === "svg" &&
        !wasmReady
    ) {
        showToast(
            "SVG engine not ready",
            "Please wait a moment and try again.",
            true
        );
        return;
    }

    setLoadingState(true);

    try {
        if (selectedFormat === "svg") {
            await convertToSVG();
        } else {
            await convertToRaster(
                selectedFormat
            );
        }

        showToast(
            "Conversion complete",
            "Your file is ready to download."
        );
    } catch (error) {
        console.error(
            "[NOMO] Conversion failed:",
            error
        );

        showToast(
            "Conversion failed",
            getReadableError(error),
            true
        );
    } finally {
        setLoadingState(false);
        setConvertButtonState();
    }
}

async function convertToSVG() {
    if (!originalImage) {
        throw new Error(
            "The source image is not available."
        );
    }

    if (
        !potrace ||
        typeof potrace !== "function"
    ) {
        throw new Error(
            "The SVG vector engine is unavailable."
        );
    }

    const canvas = createVectorCanvas(
        originalImage
    );

    const options =
        createPotraceOptions();

    const svgData = await potrace(
        canvas,
        options
    );

    if (!svgData) {
        throw new Error(
            "No SVG data was generated."
        );
    }

    const svgString =
        typeof svgData === "string"
            ? svgData
            : svgData.svg ||
              svgData.data;

    if (!svgString) {
        throw new Error(
            "The SVG result is empty."
        );
    }

    generatedBlob = new Blob(
        [svgString],
        {
            type: "image/svg+xml;charset=utf-8"
        }
    );

    if (generatedURL) {
        URL.revokeObjectURL(
            generatedURL
        );
    }

    generatedURL =
        URL.createObjectURL(
            generatedBlob
        );

    if (svgPreview) {
        svgPreview.innerHTML =
            svgString;

        svgPreview.classList.remove(
            "hidden"
        );
    }

    showResult(
        replaceExtension(
            selectedFile.name,
            ".svg"
        ),
        generatedBlob
    );
}

function createVectorCanvas(image) {
    const maxDimension = 1600;

    let width =
        image.naturalWidth ||
        image.width;

    let height =
        image.naturalHeight ||
        image.height;

    if (!width || !height) {
        throw new Error(
            "The source image has invalid dimensions."
        );
    }

    const scale = Math.min(
        1,
        maxDimension /
            Math.max(width, height)
    );

    width = Math.max(
        1,
        Math.round(width * scale)
    );

    height = Math.max(
        1,
        Math.round(height * scale)
    );

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width = width;
    canvas.height = height;

    const context =
        canvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    if (!context) {
        throw new Error(
            "Could not create the image processing canvas."
        );
    }

    context.clearRect(
        0,
        0,
        width,
        height
    );

    context.drawImage(
        image,
        0,
        0,
        width,
        height
    );

    applyTraceMode(
        context,
        width,
        height
    );

    return canvas;
}

function applyTraceMode(
    context,
    width,
    height
) {
    const mode =
        traceMode?.value ||
        "color";

    if (mode === "color") {
        return;
    }

    const imageData =
        context.getImageData(
            0,
            0,
            width,
            height
        );

    const data =
        imageData.data;

    for (
        let index = 0;
        index < data.length;
        index += 4
    ) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        if (mode === "grayscale") {
            const gray =
                Math.round(
                    red * 0.299 +
                    green * 0.587 +
                    blue * 0.114
                );

            data[index] = gray;
            data[index + 1] = gray;
            data[index + 2] = gray;
            continue;
        }

        if (mode === "blackwhite") {
            const gray =
                red * 0.299 +
                green * 0.587 +
                blue * 0.114;

            const value =
                gray >= 128
                    ? 255
                    : 0;

            data[index] = value;
            data[index + 1] = value;
            data[index + 2] = value;
            continue;
        }

        if (mode === "posterized") {
            const levels = 4;

            data[index] =
                posterizeChannel(
                    red,
                    levels
                );

            data[index + 1] =
                posterizeChannel(
                    green,
                    levels
                );

            data[index + 2] =
                posterizeChannel(
                    blue,
                    levels
                );

            data[index + 3] =
                alpha;
        }
    }

    context.putImageData(
        imageData,
        0,
        0
    );
}

function posterizeChannel(
    value,
    levels
) {
    const step =
        255 / (levels - 1);

    return Math.round(
        Math.round(value / step) *
            step
    );
}

function createPotraceOptions() {
    const mode =
        traceMode?.value ||
        "color";

    const detail =
        Number(
            detailLevel?.value || 3
        );

    const smoothing =
        Number(
            smoothLevel?.value || 3
        );

    const colors =
        Number(
            colorCount?.value || 16
        );

    const detailMap = {
        1: 12,
        2: 7,
        3: 4,
        4: 2,
        5: 1
    };

    const smoothMap = {
        1: 0.35,
        2: 0.55,
        3: 0.8,
        4: 1.0,
        5: 1.3
    };

    const toleranceMap = {
        1: 0.8,
        2: 0.55,
        3: 0.35,
        4: 0.2,
        5: 0.1
    };

    const options = {
        turdsize:
            detailMap[detail] || 4,

        turnpolicy: 4,

        alphamax:
            smoothMap[smoothing] || 0.8,

        opticurve: 1,

        opttolerance:
            toleranceMap[detail] || 0.35,

        pathonly: false,

        extractcolors:
            mode === "color" ||
            mode === "posterized",

        posterizelevel:
            mode === "color"
                ? Math.max(
                      2,
                      Math.min(
                          32,
                          colors
                      )
                  )
                : mode === "posterized"
                    ? 4
                    : 2,

        posterizationalgorithm: 0
    };

    return options;
}

async function convertToRaster(
    format
) {
    if (!originalImage) {
        throw new Error(
            "The source image is not available."
        );
    }

    const canvas =
        document.createElement(
            "canvas"
        );

    const width =
        originalImage.naturalWidth ||
        originalImage.width;

    const height =
        originalImage.naturalHeight ||
        originalImage.height;

    canvas.width = width;
    canvas.height = height;

    const context =
        canvas.getContext("2d");

    if (!context) {
        throw new Error(
            "Could not create the output canvas."
        );
    }

    if (format === "jpg") {
        context.fillStyle = "#ffffff";

        context.fillRect(
            0,
            0,
            width,
            height
        );
    }

    context.drawImage(
        originalImage,
        0,
        0,
        width,
        height
    );

    const mimeTypes = {
        png: "image/png",
        jpg: "image/jpeg",
        webp: "image/webp"
    };

    const mimeType =
        mimeTypes[format];

    if (!mimeType) {
        throw new Error(
            "This output format is not supported."
        );
    }

    generatedBlob =
        await new Promise(
            (resolve, reject) => {
                canvas.toBlob(
                    blob => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(
                                new Error(
                                    "The output image could not be created."
                                )
                            );
                        }
                    },
                    mimeType,
                    0.92
                );
            }
        );

    if (generatedURL) {
        URL.revokeObjectURL(
            generatedURL
        );
    }

    generatedURL =
        URL.createObjectURL(
            generatedBlob
        );

    showResult(
        replaceExtension(
            selectedFile.name,
            `.${format}`
        ),
        generatedBlob
    );
}

function showResult(
    filename,
    blob
) {
    if (!result) {
        return;
    }

    if (resultFileName) {
        resultFileName.textContent =
            filename;
    }

    generatedBlob = blob;

    result.classList.remove(
        "hidden"
    );

    result.classList.add(
        "visible"
    );

    setTimeout(() => {
        result.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });
    }, 100);
}

function downloadResult() {
    if (
        !generatedBlob ||
        !generatedURL
    ) {
        showToast(
            "Nothing to download",
            "Convert a file first.",
            true
        );
        return;
    }

    const extension =
        selectedFormat === "svg"
            ? "svg"
            : selectedFormat;

    let filename =
        resultFileName?.textContent?.trim();

    if (!filename) {
        filename =
            `nomo-output.${extension}`;
    }

    if (
        !filename
            .toLowerCase()
            .endsWith(
                `.${extension}`
            )
    ) {
        filename =
            replaceExtension(
                filename,
                `.${extension}`
            );
    }

    const anchor =
        document.createElement("a");

    anchor.href = generatedURL;
    anchor.download = filename;
    anchor.rel = "noopener";

    document.body.appendChild(
        anchor
    );

    anchor.click();

    anchor.remove();
}

function setupRemoveFile() {
    if (!removeFile) {
        return;
    }

    removeFile.addEventListener(
        "click",
        resetNomo
    );
}

function resetNomo() {
    selectedFile = null;
    originalImage = null;
    generatedBlob = null;

    if (generatedURL) {
        URL.revokeObjectURL(
            generatedURL
        );

        generatedURL = null;
    }

    if (fileInput) {
        fileInput.value = "";
    }

    if (imagePreview) {
        imagePreview.removeAttribute(
            "src"
        );
    }

    if (svgPreview) {
        svgPreview.innerHTML = "";
        svgPreview.classList.add(
            "hidden"
        );
    }

    if (fileName) {
        fileName.textContent = "";
    }

    if (fileSize) {
        fileSize.textContent = "";
    }

    if (workspace) {
        workspace.classList.add(
            "hidden"
        );

        workspace.classList.remove(
            "active"
        );
    }

    if (result) {
        result.classList.add(
            "hidden"
        );

        result.classList.remove(
            "visible"
        );
    }

    if (dropzone) {
        dropzone.classList.remove(
            "hidden"
        );

        dropzone.classList.remove(
            "drag-over"
        );

        dropzone.style.display = "";
    }

    updateSvgSettings();
    setConvertButtonState();
}

function setLoadingState(
    isLoading
) {
    if (!convertButton) {
        return;
    }

    convertButton.classList.toggle(
        "loading",
        isLoading
    );

    convertButton.disabled =
        isLoading;

    if (buttonArrow) {
        buttonArrow.classList.toggle(
            "hidden",
            isLoading
        );

        buttonArrow.setAttribute(
            "aria-hidden",
            isLoading
                ? "true"
                : "false"
        );
    }

    if (buttonLabel) {
        buttonLabel.classList.toggle(
            "hidden",
            isLoading
        );

        buttonLabel.setAttribute(
            "aria-hidden",
            isLoading
                ? "true"
                : "false"
        );
    }

    if (buttonLoading) {
        buttonLoading.classList.toggle(
            "hidden",
            !isLoading
        );

        buttonLoading.setAttribute(
            "aria-hidden",
            isLoading
                ? "false"
                : "true"
        );
    }
}

function updateConversionStatus(
    message
) {
    if (!conversionStatus) {
        return;
    }

    conversionStatus.textContent =
        message;

    conversionStatus.classList.add(
        "visible"
    );
}

function createToast() {
    let toast =
        document.querySelector(
            ".vetra-toast"
        );

    if (toast) {
        return toast;
    }

    toast =
        document.createElement(
            "div"
        );

    toast.className =
        "vetra-toast";

    toast.innerHTML = `
        <div class="vetra-toast-icon">✓</div>
        <div class="vetra-toast-content">
            <strong class="vetra-toast-title"></strong>
            <span class="vetra-toast-message"></span>
        </div>
        <button
            class="vetra-toast-close"
            type="button"
            aria-label="Close"
        >
            ×
        </button>
    `;

    document.body.appendChild(
        toast
    );

    return toast;
}

function showToast(
    title,
    message,
    isError = false
) {
    const toast =
        createToast();

    const toastTitle =
        toast.querySelector(
            ".vetra-toast-title"
        );

    const toastMessage =
        toast.querySelector(
            ".vetra-toast-message"
        );

    const toastIcon =
        toast.querySelector(
            ".vetra-toast-icon"
        );

    const closeButton =
        toast.querySelector(
            ".vetra-toast-close"
        );

    if (toastTitle) {
        toastTitle.textContent =
            title;
    }

    if (toastMessage) {
        toastMessage.textContent =
            message;
    }

    if (toastIcon) {
        toastIcon.textContent =
            isError
                ? "!"
                : "✓";
    }

    toast.classList.toggle(
        "error",
        isError
    );

    toast.classList.add(
        "visible"
    );

    if (closeButton) {
        closeButton.setAttribute(
            "aria-label",
            "Close"
        );

        closeButton.onclick = () => {
            toast.classList.remove(
                "visible"
            );
        };
    }

    clearTimeout(
        showToast.timeout
    );

    showToast.timeout =
        setTimeout(() => {
            toast.classList.remove(
                "visible"
            );
        }, 5000);
}

function setupTheme() {
    if (!themeToggle) {
        return;
    }

    const savedTheme =
        localStorage.getItem(
            "nomo-theme"
        );

    if (savedTheme === "dark") {
        document.body.classList.add(
            "dark"
        );
    }

    themeToggle.addEventListener(
        "click",
        () => {
            document.body.classList.toggle(
                "dark"
            );

            const isDark =
                document.body.classList.contains(
                    "dark"
                );

            localStorage.setItem(
                "nomo-theme",
                isDark
                    ? "dark"
                    : "light"
            );
        }
    );
}

function formatFileSize(
    bytes
) {
    if (
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {
        return "0 Bytes";
    }

    const units = [
        "Bytes",
        "KB",
        "MB",
        "GB"
    ];

    const index =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                    Math.log(1024)
            ),
            units.length - 1
        );

    const value =
        bytes /
        Math.pow(
            1024,
            index
        );

    return `${value.toFixed(
        index === 0
            ? 0
            : 2
    )} ${units[index]}`;
}

function getExtension(
    filename
) {
    const lastDot =
        filename.lastIndexOf(".");

    if (lastDot === -1) {
        return "";
    }

    return filename.slice(
        lastDot
    );
}

function replaceExtension(
    filename,
    newExtension
) {
    return (
        filename.replace(
            /\.[^/.]+$/,
            ""
        ) + newExtension
    );
}

function getFileTypeIcon(
    file
) {
    const extension =
        getExtension(file.name)
            .replace(
                ".",
                ""
            )
            .toUpperCase();

    return extension || "FILE";
}

function getReadableError(
    error
) {
    if (!error) {
        return "An unknown error occurred.";
    }

    if (typeof error === "string") {
        return error;
    }

    if (error.message) {
        return error.message;
    }

    return "The conversion could not be completed.";
}

window.addEventListener(
    "beforeunload",
    () => {
        if (generatedURL) {
            URL.revokeObjectURL(
                generatedURL
            );
        }
    }
);
