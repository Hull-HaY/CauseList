import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const firebaseConfig = {
    apiKey: "AIzaSyDAq_LdMur6TizliELlrrT0NFCTC1F7K8g",
    authDomain: "causelist-98e7b.firebaseapp.com",
    databaseURL: "https://causelist-98e7b-default-rtdb.firebaseio.com/",
    projectId: "causelist-98e7b",
    storageBucket: "causelist-98e7b.firebasestorage.app",
    messagingSenderId: "610909892107",
    appId: "1:610909892107:web:119b5ccba217f1c070610e",
    measurementId: "G-540D56WGM2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ROWS_PER_PAGE = 5;
const ROTATION_INTERVAL_MS = 15000;

let displayPages = [];
let currentPageIndex = 0;
let rotationTimer = null;
let lastPayloadSignature = "";
let currentAnnouncements = {};
let allCachedMatters = [];

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

    allCachedMatters = allData;
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
            return (a.caseLine || a.caseNo).localeCompare(b.caseLine || b.caseNo);
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

    const progressBar = document.getElementById("rotationProgressBar");
    const interval = ROTATION_INTERVAL_MS;

    // Reset and start animation
    const animateBar = () => {
        progressBar.style.transition = "none";
        progressBar.style.width = "0%";
        setTimeout(() => {
            progressBar.style.transition = `width ${interval}ms linear`;
            progressBar.style.width = "100%";
        }, 50);
    };

    animateBar();

    rotationTimer = setInterval(() => {
        if (displayPages.length === 0) return;
        currentPageIndex = (currentPageIndex + 1) % displayPages.length;
        renderCurrentPage();
        animateBar();
    }, interval);
}

function showNoData(message) {
    document.getElementById("scheduleTable").style.display = "none";
    document.getElementById("noDataMessage").classList.remove("hidden");
    document.getElementById("noDataText").innerText = message;
    document.getElementById("tribunalTitle").innerText = "Judiciary Cause List";
}

function updateTicker(allData) {
    const tickerText = document.getElementById("tickerText");
    if (!tickerText) return;

    if (allData.length === 0) {
        tickerText.innerText = "No upcoming cases.";
        return;
    }

    const items = allData.slice(0, 80).map((m) => (
        `<span class="ticker-item"><strong>${m.matterType}:</strong> ${m.caseNo} at ${m.time}</span>`
    ));
    
    tickerText.innerHTML = items.join("");
}

function updateUrgentNews(announcements) {
    const urgentBar = document.getElementById("urgentNewsBar");
    const urgentText = document.getElementById("urgentText");
    if (!urgentBar || !urgentText) return;

    const keys = Object.keys(announcements || {});
    if (keys.length === 0) {
        urgentBar.classList.add("hidden");
        return;
    }

    urgentBar.classList.remove("hidden");
    const newsItems = keys.map(key => `<span class="urgent-item">${announcements[key]}</span>`).join("");
    urgentText.innerHTML = newsItems;
}

function loadPublishedData() {
    const dataRef = ref(db, 'publishedData');
    onValue(dataRef, (snapshot) => {
        const payload = snapshot.val();

        if (!payload || !Array.isArray(payload.matters) || payload.matters.length === 0) {
            lastPayloadSignature = "";
            displayPages = [];
            if (rotationTimer) {
                clearInterval(rotationTimer);
                rotationTimer = null;
            }
            showNoData("Oops! No matters loaded.");
            updateTicker([]);
            return;
        }

        const signature = JSON.stringify(payload);
        if (signature === lastPayloadSignature) return;

        processData(payload.matters);
        lastPayloadSignature = signature;
    });

    const announceRef = ref(db, 'announcements');
    onValue(announceRef, (snapshot) => {
        currentAnnouncements = snapshot.val() || {};
        updateUrgentNews(currentAnnouncements);
    });
}

loadPublishedData();
