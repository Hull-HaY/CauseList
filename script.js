const ROWS_PER_PAGE = 5;
const ROTATION_INTERVAL_MS = 15000;
const PUBLISHED_DATA_KEY = "causelist_published_data_v1";
const DATA_REFRESH_INTERVAL_MS = 5000;

let displayPages = [];
let currentPageIndex = 0;
let rotationTimer = null;
let lastPayloadSignature = "";

function getFormattedCurrentDate(dateStr) {
    if (!dateStr) return "";
    const parsed = new Date(dateStr.replace(",", ""));
    if (isNaN(parsed)) return dateStr;
    return parsed.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
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
            newPages.push({
                tribunal,
                rows: rows.slice(i, i + ROWS_PER_PAGE),
                pageNo: Math.floor(i / ROWS_PER_PAGE) + 1,
                totalPages
            });
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
        html += `
            <tr>
                <td>${m.date || "-"}</td>
                <td>${m.tribunal || "-"}</td>
                <td class="officer-name">${m.officer || "-"}</td>
                <td class="matter-type">${m.matterType || "-"}</td>
                <td class="case-no">
                    <div>${m.caseLine || m.caseNo || "-"}</div>
                    <div class="proceedings-text">${m.proceedings || "-"}</div>
                </td>
                <td><span class="time-badge">${m.time || "-"}</span></td>
            </tr>
        `;
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
    document.getElementById("tribunalTitle").innerText = "Judiciary Cause List";
}

function updateTicker(allData) {
    if (allData.length === 0) {
        document.getElementById("tickerText").innerText = "No upcoming cases.";
        return;
    }
    const items = allData.slice(0, 80).map((m) => (
        `<span class="ticker-item"><strong>${m.matterType}:</strong> ${m.caseNo} at ${m.time}</span>`
    ));
    document.getElementById("tickerText").innerHTML = items.join("");
}

function loadPublishedData() {
    const raw = localStorage.getItem(PUBLISHED_DATA_KEY);
    if (!raw) {
        showNoData("Oops! No matters loaded.");
        updateTicker([]);
        return;
    }

    if (raw === lastPayloadSignature) {
        return;
    }

    try {
        const payload = JSON.parse(raw);
        const matters = Array.isArray(payload?.matters) ? payload.matters : [];
        if (matters.length === 0) {
            showNoData("Oops! No matters loaded.");
            updateTicker([]);
            lastPayloadSignature = raw;
            return;
        }
        processData(matters);
        lastPayloadSignature = raw;
    } catch (error) {
        console.error("Failed to read published data:", error);
        showNoData("Oops! No matters loaded.");
        updateTicker([]);
    }
}

window.addEventListener("storage", (event) => {
    if (event.key === PUBLISHED_DATA_KEY) {
        loadPublishedData();
    }
});

loadPublishedData();
setInterval(loadPublishedData, DATA_REFRESH_INTERVAL_MS);
