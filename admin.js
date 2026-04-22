import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const ROWS_PER_PAGE = 5;
const ROTATION_INTERVAL_MS = 15000;
const PUBLISHED_DATA_KEY = "causelist_published_data_v1";
const ADMIN_PASSCODE_SHA256 = "c2d33f0eaceab8076bb22fedc1c75ccfa616e9a055c9b176bdf88e781af9f71f";

let displayPages = [];
let currentPageIndex = 0;
let rotationTimer = null;

const uploadInput = document.getElementById("pdfUpload");
const uploadStatus = document.getElementById("uploadStatus");
const clearDataBtn = document.getElementById("clearDataBtn");

enforceAdminPasscode();
clearDataBtn.addEventListener("click", clearPublishedData);

uploadInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    uploadStatus.innerText = `Reading ${files.length} PDF file(s)...`;
    const mergedData = [];
    const failedFiles = [];

    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        uploadStatus.innerText = `Parsing file ${index + 1}/${files.length}: ${file.name}`;
        try {
            const text = await extractPdfText(file);
            mergedData.push(
                ...parseCauseListText(text).map((item) => ({
                    ...item,
                    sourceFile: file.name
                }))
            );
        } catch (error) {
            console.error(`PDF parse failed (${file.name}):`, error);
            failedFiles.push(file.name);
        }
    }

    if (mergedData.length === 0) {
        showNoData("Oops! No matters loaded.");
        updateTicker([]);
        uploadStatus.innerText = `Parsed 0/${files.length}. Failed: ${failedFiles.length}`;
        return;
    }

    publishMatters(mergedData);
    processData(mergedData);

    const parsedFiles = files.length - failedFiles.length;
    uploadStatus.innerText = `Published ${mergedData.length} matters from ${parsedFiles}/${files.length} files${failedFiles.length ? ` | Failed: ${failedFiles.length}` : ""}`;
});

async function enforceAdminPasscode() {
    const pass = prompt("Admin passcode required:");
    if (!pass) {
        document.body.innerHTML = "";
        return;
    }
    const enteredHash = await sha256(pass);
    if (enteredHash !== ADMIN_PASSCODE_SHA256) {
        alert("Unauthorized.");
        document.body.innerHTML = "";
    }
}

function publishMatters(matters) {
    const payload = {
        publishedAt: new Date().toISOString(),
        matters
    };
    localStorage.setItem(PUBLISHED_DATA_KEY, JSON.stringify(payload));
}

function clearPublishedData() {
    const confirmed = confirm("Clear all published matters from display?");
    if (!confirmed) return;

    localStorage.removeItem(PUBLISHED_DATA_KEY);
    displayPages = [];
    currentPageIndex = 0;
    if (rotationTimer) {
        clearInterval(rotationTimer);
        rotationTimer = null;
    }
    document.getElementById("scheduleBody").innerHTML = "";
    showNoData("Oops! No matters loaded.");
    updateTicker([]);
    uploadStatus.innerText = "Published data cleared.";
}

async function extractPdfText(file) {
    const buffer = await file.arrayBuffer();
    const typedData = new Uint8Array(buffer);
    let pdf;
    try {
        pdf = await pdfjsLib.getDocument({ data: typedData }).promise;
    } catch (workerError) {
        pdf = await pdfjsLib.getDocument({ data: typedData, disableWorker: true }).promise;
    }
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const lines = rebuildLinesFromTextItems(content.items);
        pages.push(lines.join("\n"));
    }
    return pages.join("\n");
}

function rebuildLinesFromTextItems(items) {
    const byY = new Map();
    items.forEach((item) => {
        const y = Math.round(item.transform[5] * 10) / 10;
        const x = item.transform[4];
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push({ x, str: item.str });
    });

    return [...byY.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map((r) => r.str).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function parseCauseListText(fullText) {
    const lines = fullText.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

    let currentDate = "";
    let currentTribunal = "";
    let currentOfficer = "";
    let currentTime = "";
    let currentMatterType = "";

    const allData = [];
    const strictCasePattern = /\b([A-Z0-9_/-]+\/[A-Z]?\d+\/\d{4})\b/i;
    const fallbackCasePattern = /^([A-Z0-9_/-]{4,})\s+/i;
    const numberedLinePattern = /^\d+\./;
    const pageMarkerPattern = /^--\s*\d+\s+of\s+\d+\s*--$/i;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (pageMarkerPattern.test(line)) {
            i++;
            continue;
        }
        const tribunalMatch = line.match(/^Tribunal:\s*(.+)$/i);
        if (tribunalMatch) {
            currentTribunal = tribunalMatch[1].trim();
            i++;
            continue;
        }
        if (/^[A-Z]+,\s+\d{1,2}\s+[A-Z]+\s+\d{4}$/.test(line)) {
            currentDate = line;
            i++;
            continue;
        }
        if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(line)) {
            currentTime = line.toUpperCase();
            i++;
            continue;
        }
        if (/^(HEARING|MENTION)$/i.test(line)) {
            currentMatterType = line.toUpperCase();
            i++;
            continue;
        }
        if (/^MILIMANI HIGH COURT$/i.test(line) || /^NAIROBI$/i.test(line)) {
            if (!currentTribunal) currentTribunal = "MILIMANI HIGH COURT - NAIROBI";
            i++;
            continue;
        }
        if (line.includes("HON.")) {
            const m = line.match(/(HON\.\s*.+?)(?:\s+COURT\b|$)/i);
            if (m) currentOfficer = m[1].replace(/\s+/g, " ").trim();
            i++;
            continue;
        }
        if (!numberedLinePattern.test(line)) {
            i++;
            continue;
        }

        const matterLines = [line];
        let j = i + 1;
        while (
            j < lines.length &&
            !numberedLinePattern.test(lines[j]) &&
            !/^(HEARING|MENTION)$/i.test(lines[j]) &&
            !/^Tribunal:\s*/i.test(lines[j]) &&
            !/^[A-Z]+,\s+\d{1,2}\s+[A-Z]+\s+\d{4}$/.test(lines[j]) &&
            !/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(lines[j]) &&
            !pageMarkerPattern.test(lines[j])
        ) {
            matterLines.push(lines[j]);
            j++;
        }

        const fullMatterLine = matterLines.join(" ").replace(/^\d+\.\s+/, "").trim();
        const strictCaseMatch = fullMatterLine.match(strictCasePattern);
        const fallbackMatch = fullMatterLine.match(fallbackCasePattern);
        const caseNo = strictCaseMatch ? strictCaseMatch[1] : (fallbackMatch ? fallbackMatch[1] : "CASE-NO-UNAVAILABLE");
        const proceedings = fullMatterLine.replace(caseNo, "").trim() || "-";

        allData.push({
            date: currentDate,
            tribunal: currentTribunal || "BPRT",
            officer: currentOfficer || "HON. -",
            matterType: currentMatterType || "UNSPECIFIED",
            caseNo,
            caseLine: fullMatterLine,
            proceedings,
            time: currentTime || "-"
        });
        i = j;
    }
    return allData;
}

function getFormattedCurrentDate(dateStr) {
    if (!dateStr) return "";
    const parsed = new Date(dateStr.replace(",", ""));
    if (isNaN(parsed)) return dateStr;
    return parsed.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function processData(allData) {
    if (allData.length === 0) {
        showNoData("Oops! No matters loaded.");
        updateTicker([]);
        return;
    }

    document.getElementById("currentDateDisplay").innerText = getFormattedCurrentDate(allData[0].date);
    const grouped = {};
    allData.forEach((item) => {
        const key = `${item.tribunal}|${item.officer}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(item);
    });

    const newPages = [];
    Object.keys(grouped).sort().forEach((groupKey) => {
        const rows = grouped[groupKey].sort((a, b) => {
            if (a.matterType !== b.matterType) return a.matterType.localeCompare(b.matterType);
            return a.caseNo.localeCompare(b.caseNo);
        });
        const [tribunal] = groupKey.split("|");
        const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
        for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
            newPages.push({ tribunal, rows: rows.slice(i, i + ROWS_PER_PAGE), pageNo: Math.floor(i / ROWS_PER_PAGE) + 1, totalPages });
        }
    });

    displayPages = newPages;
    currentPageIndex = 0;
    renderCurrentPage();
    startRotation();
    updateTicker(allData);
}

function renderCurrentPage() {
    const page = displayPages[currentPageIndex];
    if (!page) return;
    document.getElementById("tribunalTitle").innerText = `${page.tribunal} Matters`;
    document.getElementById("scheduleTable").style.display = "table";
    document.getElementById("noDataMessage").classList.add("hidden");

    let html = "";
    page.rows.forEach((m) => {
        html += `<tr>
            <td>${m.date || "-"}</td>
            <td>${m.tribunal || "-"}</td>
            <td class="officer-name">${m.officer || "-"}</td>
            <td class="matter-type">${m.matterType || "-"}</td>
            <td class="case-no"><div>${m.caseLine || m.caseNo || "-"}</div><div class="proceedings-text">${m.proceedings || "-"}</div></td>
            <td><span class="time-badge">${m.time || "-"}</span></td>
        </tr>`;
    });
    document.getElementById("scheduleBody").innerHTML = html;
}

function startRotation() {
    if (rotationTimer) clearInterval(rotationTimer);
    rotationTimer = setInterval(() => {
        if (displayPages.length === 0) return;
        currentPageIndex = (currentPageIndex + 1) % displayPages.length;
        renderCurrentPage();
    }, ROTATION_INTERVAL_MS);
}

function showNoData(message) {
    document.getElementById("scheduleTable").style.display = "none";
    document.getElementById("noDataMessage").classList.remove("hidden");
    document.getElementById("noDataText").innerText = message;
    document.getElementById("tribunalTitle").innerText = "Judiciary Cause List - Admin";
}

function updateTicker(allData) {
    if (allData.length === 0) {
        document.getElementById("tickerText").innerText = "No upcoming cases.";
        return;
    }
    const items = allData.slice(0, 80).map((m) => `<span class="ticker-item"><strong>${m.matterType}:</strong> ${m.caseNo} at ${m.time}</span>`);
    document.getElementById("tickerText").innerHTML = items.join("");
}

async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

showNoData("Oops! No matters loaded.");
