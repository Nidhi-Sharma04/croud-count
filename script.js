"use strict";

const API_BASE = "http://127.0.0.1:5000"; // Flask backend URL

// --- NEW BUBBLE CHART VARIABLES/CONSTANTS ---
let bubbleChart = null;

// NOTE: For a real application, max capacity should be stored in the 'savedZones'
// structure fetched from the API. We mock it here based on a simple index or name.
const ZONE_CAPACITIES_MOCK = (zoneName) => {
    // Mock capacity values for demonstration (e.g., higher capacity for larger zones)
    if (zoneName.includes('Entrance')) return 50;
    if (zoneName.includes('Checkout')) return 120;
    if (zoneName.includes('Aisle')) return 80;
    return 60; // Default capacity
};
const ZONE_COLORS_MOCK = (zoneName, index) => {
    const colors = [
        'rgba(255, 99, 132, 0.6)', // Red
        'rgba(54, 162, 235, 0.6)', // Blue
        'rgba(255, 206, 86, 0.6)', // Yellow
        'rgba(75, 192, 192, 0.6)', // Teal
        'rgba(153, 102, 255, 0.6)', // Purple
        'rgba(255, 159, 64, 0.6)' // Orange
    ];
    return colors[index % colors.length];
};
// --------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    // ---------- Helpers ----------
    const getToken = () => localStorage.getItem("token") || "";
    const setToken = (t) => {
        if (t) localStorage.setItem("token", t);
    };
    const authHeaders = () => {
        const token = getToken();
        return token ? {
            "Authorization": `Bearer ${token}`
        } : {};
    };

    // ---------- LOGIN / REGISTER ----------
    const loginForm = document.querySelector(".login-form");
    const registerForm = document.querySelector(".register-form");
    const wrapper = document.querySelector(".wrapper");

    if (loginForm && registerForm) {
        function loginFunction() {
            loginForm.style.left = "50%";
            loginForm.style.opacity = 1;
            registerForm.style.left = "150%";
            registerForm.style.opacity = 0;
            wrapper.style.height = "500px";
            document.querySelector(".title-login").style.top = "50%";
            document.querySelector(".title-login").style.opacity = 1;
            document.querySelector(".title-register").style.top = "50px";
            document.querySelector(".title-register").style.opacity = 0;
        }

        function registerFunction() {
            loginForm.style.left = "-50%";
            loginForm.style.opacity = 0;
            registerForm.style.left = "50%";
            registerForm.style.opacity = 1;
            wrapper.style.height = "580px";
            document.querySelector(".title-login").style.top = "-60px";
            document.querySelector(".title-login").style.opacity = 0;
            document.querySelector(".title-register").style.top = "50%";
            document.querySelector(".title-register").style.opacity = 1;
        }

        window.loginFunction = loginFunction;
        window.registerFunction = registerFunction;

        const signUpBtn = document.querySelector("#SignUpBtn");
        if (signUpBtn) {
            signUpBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const username = document.getElementById("reg-name").value.trim();
                const email = document.getElementById("reg-email").value.trim();
                const password = document.getElementById("reg-pass").value;
                if (!username || !email || !password) return alert("Please fill all fields");

                try {
                    const res = await fetch(`${API_BASE}/register`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            username,
                            email,
                            password
                        })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        alert(data.message || "Registered");
                        loginFunction();
                        document.getElementById("reg-name").value = "";
                        document.getElementById("reg-email").value = "";
                        document.getElementById("reg-pass").value = "";
                    } else {
                        alert(data.message || "Registration failed");
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error. Please try again.");
                }
            });
        }

        const signInBtn = document.querySelector("#SignInBtn");
        if (signInBtn) {
            signInBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const email = document.getElementById("log-email").value.trim();
                const password = document.getElementById("log-pass").value;
                if (!email || !password) return alert("Please fill all fields");

                try {
                    const res = await fetch(`${API_BASE}/login`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            email,
                            password
                        })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setToken(data.token);
                        localStorage.setItem("username", data.username || "");
                        window.location.href = "dashboard.html";
                    } else {
                        alert(data.message || "Invalid credentials");
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error. Please try again.");
                }
            });
        }
    }
    
    // ---------- ELEMENTS ----------
    const menuItems = document.querySelectorAll(".sidebar ul li");
    const views = document.querySelectorAll(".content-card");

    const videoFeed = document.getElementById("video-feed");
    const videoContainer = document.querySelector(".video-container");
    const videoUploadInput = document.getElementById("video-upload-input");
    const uploadBtn = document.getElementById("upload-btn");
    const uploadToServerBtn = document.getElementById("upload-server-btn");
    const startLiveBtn = document.getElementById("start-live-stream");
    const stopLiveBtn = document.getElementById("stop-live-stream");
    // ---------- ELEMENTS (Add to existing list) ----------
const startLiveAnalysisBtn = document.getElementById("start-live-analysis-btn");
const stopLiveAnalysisBtn = document.getElementById("stop-live-analysis-btn");
const liveOverlayImage = document.getElementById("liveOverlayFrame");
const liveHeatmapImage = document.getElementById("liveHeatmapFrame");
const liveAnalysisList = document.getElementById("live-analysis-list");

// ---------- STATE (Add to existing state block) ----------
let liveAnalysisInterval = null;
const LIVE_ANALYSIS_POLL_RATE = 1000; // Poll backend every 1 second (1000ms)
    const liveVideoContainer = document.getElementById("live-video-container");
    const liveVideoFeed = document.getElementById("live-video-feed");
    const liveCanvas = document.getElementById("live-zone-canvas");
    const liveCtx = liveCanvas ? liveCanvas.getContext("2d") : null;

    const canvas = document.getElementById("zone-canvas");
    const ctx = canvas ? canvas.getContext("2d") : null;
    
    // --- NEW: Overlay image element for server-provided detection frame ---
    const overlayImage = document.getElementById("overlayFrame");
    // --- NEW: Overlay image element for server-provided HEATMAP frame ---
    const heatmapImage = document.getElementById("heatmapFrame");

    const zoneNameInput = document.getElementById("zone-name");
    const saveZoneBtn = document.getElementById("save-zone-btn");
    const clearZoneBtn = document.getElementById("clear-zone-btn");
    const startAnalysisBtn = document.getElementById("start-analysis-btn");
    const stopAnalysisBtn = document.getElementById("stop-analysis-btn");

    const zonesList = document.getElementById("zones-list");
    const analysisList = document.getElementById("analysis-list");
    let activeCanvas = null;
    let activeCtx = null;

    if (!canvas || !ctx) {
        console.warn("Canvas or context not found (#zone-canvas). Drawing features disabled.");
    }

    // ---------- STATE ----------
    let polygonPoints = [];
    let savedZones = [];
    const MAX_POINTS = 4;

    // Analysis state
    let analysisInterval = null;
    let hourlyChart = null;
    let zoneChart = null;
    let totalFrames = 0;
    let analysisData = {
        currentCount: 0,
        totalEntries: 0,
        totalExits: 0,
        peakCount: 0,
        hourlyZoneData: {}, // New property to store per-zone hourly trends
        zoneData: {}
    };

    // Alert threshold (configurable UI recommended)
    const ALERT_THRESHOLD = 7;

    // ---------- SIDEBAR NAV ----------
    // script.js: Locate the SIDEBAR NAV section (snippet_4)
// and modify the click handler

if (menuItems.length > 0) {
    menuItems.forEach((item) => {
        item.addEventListener("click", () => {
            const id = item.id.replace("menu-", "") + "-view";
            views.forEach((v) => (v.style.display = "none"));
            const target = document.getElementById(id);
            if (target) target.style.display = "block";

            menuItems.forEach((i) => i.classList.remove("active"));
            item.classList.add("active");

            // --- NEW/UPDATED: Determine the active canvas ---
            const isLiveOrZoneCreation = (id === "live-view" || id === "create-zone-view");

            if (id === "live-view") {
                liveVideoContainer.style.display = liveVideoFeed && liveVideoFeed.src ? "block" : "none";
            } else if (id === "upload-view") {
                videoContainer.style.display = videoFeed && videoFeed.src ? "block" : "none";
            }
            
            // Set the active canvas/context
            if (isLiveOrZoneCreation && liveCanvas) {
                activeCanvas = liveCanvas;
                activeCtx = liveCtx;
            } else if (canvas) { // Default to uploaded video canvas
                activeCanvas = canvas;
                activeCtx = ctx;
            } else {
                activeCanvas = null;
                activeCtx = null;
            }
            
            // Re-draw zones on the active canvas
            drawAll();
            // --- END NEW/UPDATED ---

            if (id === "analysis-view") {
                loadAnalysisSummary();
            }
            if (id === "profiles-view") { 
                  loadProfiles(); // <-- This triggers the feature!
             }
             if (item.id === "menu-logout") {
                // 1. Clear the stored JWT token
                localStorage.removeItem("access_token");
                
                // 2. Redirect to the login/register page
                window.location.href = "index.html"; 
                return; // Stop further processing since we're leaving the page
            }
        });
    });
}
    
    // ---------- VIDEO UPLOAD & PREVIEW ----------
    if (videoUploadInput) {
        videoUploadInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const url = URL.createObjectURL(file);
            if (videoFeed) {
                videoFeed.src = url;
                videoFeed.controls = true;
                videoContainer.style.display = "block";
                videoFeed.onloadedmetadata = () => {
                    if (canvas) {
                        canvas.width = videoFeed.videoWidth || canvas.clientWidth;
                        canvas.height = videoFeed.videoHeight || canvas.clientHeight;
                        drawAll();
                    }
                };
            }
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener("click", () => {
            if (!videoFeed || !videoFeed.src) return alert("Select a video first.");
            videoFeed.play();
        });
    }

    if (uploadToServerBtn) {
        uploadToServerBtn.addEventListener("click", async () => {
            const file = videoUploadInput && videoUploadInput.files ? videoUploadInput.files[0] : null;
            if (!file) return alert("Select a video file first to upload to server.");
            const token = getToken();
            if (!token) return alert("Login required to upload video to server.");

            const form = new FormData();
            form.append("video", file);

            try {
                const res = await fetch(`${API_BASE}/upload_video`, {
                    method: "POST",
                    headers: { ...authHeaders() },
                    body: form
                });
                const data = await res.json();
                if (res.ok) {
                    alert(data.message || "Uploaded to server");
                } else {
                    alert(data.error || data.message || "Upload failed");
                }
            } catch (err) {
                console.error(err);
                alert("Network error during upload.");
            }
        });
    }
    // script.js: Add inside the document.addEventListener("DOMContentLoaded", ...) block

// ---------- LIVE STREAM CONTROL ----------
if (startLiveBtn) {
    startLiveBtn.addEventListener("click", async () => {
        const token = getToken();
        if (!token) return alert("Login required to start live stream.");

        try {
            const res = await fetch(`${API_BASE}/start_live_stream`, {
                method: "POST",
                headers: { ...authHeaders() }
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(data.message);
                liveVideoContainer.style.display = "block";
                startLiveBtn.style.display = "none";
                stopLiveBtn.style.display = "block";
                if (startLiveAnalysisBtn) startLiveAnalysisBtn.style.display = "block";
                // Set the image source to start pulling the MJPEG stream
                // We add a timestamp to prevent browser caching.
                liveVideoFeed.src = `${API_BASE}/live_feed_mjpeg?t=${new Date().getTime()}`;
                
                // Once the stream starts, set the canvas size and draw zones
                liveVideoFeed.onload = () => {
                    liveCanvas.width = liveVideoFeed.offsetWidth;
                    liveCanvas.height = liveVideoFeed.offsetHeight;
                    loadZones(); // Load and draw zones on the live canvas
                };
                // Handle window resize to keep canvas size correct
                window.onresize = () => {
                    liveCanvas.width = liveVideoFeed.offsetWidth;
                    liveCanvas.height = liveVideoFeed.offsetHeight;
                    drawAll(); // Redraw zones
                };
            } else {
                alert(data.error || data.message || "Failed to start live stream");
            }
        } catch (err) {
            console.error("Network error starting live stream:", err);
            alert("Network error. Could not start live stream.");
        }
    });
}

if (stopLiveBtn) {
    stopLiveBtn.addEventListener("click", async () => {
         stopLiveAnalysis(); 
        try {
            await fetch(`${API_BASE}/stop_live_stream`, {
                method: "POST",
                headers: { ...authHeaders() }
            });
        } catch (err) {
            console.warn("Failed to stop live stream on backend.");
        }
        
        // Frontend cleanup
        liveVideoFeed.src = "";
        liveVideoContainer.style.display = "none";
        startLiveBtn.style.display = "block";
        stopLiveBtn.style.display = "none";
        
        alert("Live stream stopped.");
    });
}
// --- LIVE ANALYSIS FUNCTIONS ---

/**
 * Polls the backend for a new analyzed frame and updates the display.
 */
async function fetchAndDisplayLiveAnalysis() {
    try {
        // Calls the backend route that handles YOLO, DeepSORT, and zone counting on the current live camera frame
        const res = await fetch(`${API_BASE}/start_live_analysis`, {
            method: "POST",
            headers: { ...authHeaders() }
        });
        const data = await res.json();

        if (res.ok && !data.finished) {
            // 1. Display analyzed frames by decoding Base64
            if (liveOverlayImage) {
                liveOverlayImage.src = `data:image/jpeg;base64,${data.overlay_frame}`;
                liveOverlayImage.style.display = "block";
            }
            if (liveHeatmapImage) {
                liveHeatmapImage.src = `data:image/jpeg;base64,${data.heatmap_frame}`;
                liveHeatmapImage.style.display = "block";
            }

            // 2. Update live zone counts (similar to your video analysis update)
            if (liveAnalysisList) {
                liveAnalysisList.innerHTML = "";
                for (const zoneId in data.zone_counts) {
                    const count = data.zone_counts[zoneId];
                    // Find zone name from locally stored zones (assuming loadZones was called)
                    const zone = savedZones.find(z => z.id == zoneId);
                    const zoneName = zone ? zone.name : `Zone ${zoneId}`;

                    // Mock analysis update (reusing existing logic/mocks)
                    const capacity = ZONE_CAPACITIES_MOCK(zoneName);
                    const percentage = (count / capacity) * 100;

                    let listItem = document.createElement("li");
                    listItem.innerHTML = `<strong>${zoneName}</strong>: ${count} people (${percentage.toFixed(0)}% capacity)`;
                    
                    // Add alert styling if needed (using existing ALERT_THRESHOLD or capacity logic)
                    if (percentage > 90) {
                        listItem.classList.add('alert-error');
                    } else if (percentage > 70) {
                        listItem.classList.add('alert-warning');
                    }
                    
                    liveAnalysisList.appendChild(listItem);
                }
            }
        } else {
             console.error("Live analysis failed or finished.", data.error || data.message);
        }
    } catch (err) {
        console.error("Network error during live analysis poll:", err);
    }
}

/**
 * Starts the continuous analysis polling loop.
 */
function startLiveAnalysis() {
    if (liveAnalysisInterval) return alert("Live analysis is already running.");
    if (!liveVideoFeed.src) return alert("Please start the camera feed first.");

    // Hide the raw MJPEG feed and show the analyzed overlays
    liveVideoFeed.style.display = "none";
    liveCanvas.style.display = "none";
    liveOverlayImage.style.display = "block";
    liveHeatmapImage.style.display = "block";
    
    // Start the polling loop (treating each poll as a "next frame" process)
    liveAnalysisInterval = setInterval(fetchAndDisplayLiveAnalysis, LIVE_ANALYSIS_POLL_RATE);
    
    // Update button states
    startLiveAnalysisBtn.style.display = "none";
    stopLiveAnalysisBtn.style.display = "block";
    
    alert("Live analysis started.");
}

/**
 * Stops the continuous analysis polling loop.
 */
function stopLiveAnalysis() {
    if (liveAnalysisInterval) {
        clearInterval(liveAnalysisInterval);
        liveAnalysisInterval = null;
        
        // Show the raw MJPEG feed again (if it's still running)
        if (liveVideoFeed.src) {
            liveVideoFeed.style.display = "block";
            liveCanvas.style.display = "block";
        }
        liveOverlayImage.style.display = "none";
        liveHeatmapImage.style.display = "none";
        liveAnalysisList.innerHTML = "<li>Live analysis stopped.</li>";
        
        // Update button states
        startLiveAnalysisBtn.style.display = "block";
        stopLiveAnalysisBtn.style.display = "none";
        
        alert("Live analysis stopped.");
    }
}
if (startLiveAnalysisBtn) {
    startLiveAnalysisBtn.addEventListener("click", startLiveAnalysis);
}

if (stopLiveAnalysisBtn) {
    stopLiveAnalysisBtn.addEventListener("click", stopLiveAnalysis);
}
    // New: Stop analysis when the video ends
    if (videoFeed) {
        videoFeed.addEventListener('ended', async () => {
            console.log("Video has ended. Stopping analysis.");
            stopAnalysis();
            alert("Video playback finished. Analysis stopped.");
        });
    }
    // script.js: Add this new function 

async function loadWelcomeUser() {
    const usernameDisplay = document.getElementById("usernameDisplay");
    if (!usernameDisplay) return;

    try {
        const res = await fetch(`${API_BASE}/current-user`, { 
            method: "GET",
            headers: { ...authHeaders() }
        });
        const data = await res.json();

        if (res.ok && data.username) {
            // Update the span with the fetched username
            usernameDisplay.textContent = data.username;
        } else {
            // Set a fallback if the fetch fails
            usernameDisplay.textContent = "Guest";
            console.error("Failed to fetch username:", data.message || 'Unknown error');
        }
    } catch (err) {
        console.error("Network error fetching username:", err);
        usernameDisplay.textContent = "User"; // Default fallback
    }
}
    // ---------- CANVAS / ZONE DRAWING ----------
    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
            y: ((evt.clientY - rect.top) / rect.height) * canvas.height
        };
    }

    function drawAll() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        savedZones.forEach((z) => {
            if (!z.coordinates || z.coordinates.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(z.coordinates[0].x, z.coordinates[0].y);
            z.coordinates.forEach((p, i) => {
                if (i > 0) ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fillStyle = "rgba(0,0,255,0.12)";
            ctx.strokeStyle = "#1a2949";
            ctx.lineWidth = 2;
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = "#000";
            ctx.font = "14px Arial";
            const cx = z.coordinates.reduce((s, p) => s + p.x, 0) / z.coordinates.length;
            const cy = z.coordinates.reduce((s, p) => s + p.y, 0) / z.coordinates.length;
            ctx.fillText(z.name || "Zone", cx + 6, cy + 6);
        });

        if (polygonPoints.length > 0) {
            ctx.beginPath();
            ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
            polygonPoints.forEach((p, i) => {
                if (i > 0) ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.strokeStyle = "red";
            ctx.lineWidth = 2;
            ctx.stroke();

            polygonPoints.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
            });
        }
    }

    if (canvas) {
        canvas.addEventListener("click", (e) => {
            if (polygonPoints.length >= MAX_POINTS) {
                alert(`Already ${MAX_POINTS} points. Save or clear.`);
                return;
            }
            const pos = getMousePos(e);
            polygonPoints.push({
                x: Math.round(pos.x),
                y: Math.round(pos.y)
            });
            drawAll();
        });
    }

    if (clearZoneBtn) {
        clearZoneBtn.addEventListener("click", async () => {
            polygonPoints = [];
            drawAll();

            if (savedZones.length === 0) {
                return alert("Canvas cleared.");
            }

            if (!confirm("Do you want to also remove all saved zones from the server?")) {
                return alert("Current drawing cleared. Saved zones preserved.");
            }

            for (const z of savedZones) {
                if (z.id && getToken()) {
                    try {
                        const res = await fetch(`${API_BASE}/delete_zone/${z.id}`, {
                            method: "DELETE",
                            headers: { ...authHeaders() }
                        });
                        if (!res.ok) console.warn(`Failed to delete zone ${z.id}`);
                    } catch (err) {
                        console.warn("Error deleting zone on server:", err);
                    }
                }
            }

            savedZones = [];
            localStorage.removeItem("savedZones");
            updateZonesList();
            drawAll();
            alert("All zones cleared from local and server.");
        });
    }

    if (saveZoneBtn) {
        saveZoneBtn.addEventListener("click", async () => {
            const name = zoneNameInput ? zoneNameInput.value.trim() : "";
            if (!name) return alert("Enter zone name.");
            if (polygonPoints.length !== MAX_POINTS) return alert(`Select exactly ${MAX_POINTS} points.`);

            const token = getToken();
            if (!token) return alert("Login required to save zones to database.");

            const payload = {
                name,
                coordinates: polygonPoints
            };

            try {
                const res = await fetch(`${API_BASE}/save_zone`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders()
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    alert(data.message || "Zone saved to database!");
                    polygonPoints = [];
                    if (zoneNameInput) zoneNameInput.value = "";
                    await loadZones();
                } else {
                    alert(data.message || "Failed to save zone.");
                    console.error("Save zone error:", data);
                }
            } catch (err) {
                console.error("Network error saving zone:", err);
                alert("Network error while saving zone.");
            }
        });
    }
    // script.js: Add this new function 

async function loadProfiles() {
    const tableBody = document.querySelector("#profiles-table tbody");
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="3">Fetching profiles from server...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/profiles`, { 
            method: "GET",
            headers: { ...authHeaders() }
        });
        const data = await res.json();

        if (res.ok && Array.isArray(data.profiles)) {
            tableBody.innerHTML = ''; // Clear loading message

            data.profiles.forEach(profile => {
                const row = tableBody.insertRow();
                
                // Highlight the row for the currently active user
                if (profile.is_current) {
                    row.classList.add('current-profile-row');
                }

                // Username Cell
                const usernameCell = row.insertCell();
                usernameCell.textContent = profile.username;
                if (profile.is_current) {
                    // Add an icon to clearly mark the active profile
                    usernameCell.innerHTML += ' <i class="bx bxs-user-check current-icon"></i>';
                }

                // Email Cell
                const emailCell = row.insertCell();
                emailCell.textContent = profile.email;

                // Status Cell
                const statusCell = row.insertCell();
                statusCell.innerHTML = `<span class="status ${profile.status.toLowerCase()}">${profile.status}</span>`;
            });

            if (data.profiles.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3">No registered profiles found.</td></tr>';
            }

        } else {
            tableBody.innerHTML = `<tr><td colspan="3">Error fetching profiles: ${data.message || 'Unknown error'}</td></tr>`;
        }
    } catch (err) {
        console.error("Network error fetching profiles:", err);
        tableBody.innerHTML = '<tr><td colspan="3">Network error. Could not connect to the server.</td></tr>';
    }
}
// END NEW loadProfiles function
    // ---------- LOAD ZONES FROM BACKEND OR LOCAL ----------
    async function loadZones() {
        const token = getToken();
        if (token) {
            try {
                const res = await fetch(`${API_BASE}/get_zones`, {
                    method: "GET",
                    headers: { ...authHeaders() }
                });
                const data = await res.json();
                if (res.ok && Array.isArray(data.zones)) {
                    savedZones = data.zones;
                    localStorage.setItem("savedZones", JSON.stringify(savedZones));
                    updateZonesList();
                    drawAll();
                    return;
                } else {
                    console.warn("Failed to load zones from backend:", data);
                }
            } catch (err) {
                console.error("Error fetching zones from backend:", err);
            }
        }
        const stored = localStorage.getItem("savedZones");
        savedZones = stored ? JSON.parse(stored) : [];
        updateZonesList();
        drawAll();
    }

    function updateZonesList() {
        if (!zonesList) return;
        zonesList.innerHTML = "";
        if (savedZones.length === 0) {
            zonesList.innerHTML = "<li>No zones saved</li>";
            return;
        }
        savedZones.forEach((z) => {
            const li = document.createElement("li");
            li.className = "zone-list-item";
            const title = document.createElement("span");
            title.textContent = z.name || "Zone";
            li.appendChild(title);

            const jumpBtn = document.createElement("button");
            jumpBtn.textContent = "View";
            jumpBtn.className = "small-btn";
            jumpBtn.addEventListener("click", () => flashZone(z));
            li.appendChild(jumpBtn);

            const delBtn = document.createElement("button");
            delBtn.textContent = "Delete";
            delBtn.className = "small-btn danger";
            delBtn.addEventListener("click", async () => {
                if (!confirm(`Delete zone "${z.name}"?`)) return;
                if (z.id && getToken()) {
                    try {
                        await fetch(`${API_BASE}/delete_zone/${z.id}`, {
                            method: "DELETE",
                            headers: { ...authHeaders() }
                        });
                    } catch (err) {
                        console.warn("Error deleting zone on server:", err);
                    }
                }
                savedZones = savedZones.filter(s => s !== z);
                localStorage.setItem("savedZones", JSON.stringify(savedZones));
                updateZonesList();
                drawAll();
            });
            li.appendChild(delBtn);
            zonesList.appendChild(li);
        });
    }

    function flashZone(zone) {
        if (!ctx || !zone || !zone.coordinates) return;
        let flashes = 0;
        const id = setInterval(() => {
            drawAll();
            ctx.beginPath();
            ctx.moveTo(zone.coordinates[0].x, zone.coordinates[0].y);
            zone.coordinates.forEach((p, i) => {
                if (i > 0) ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = flashes % 2 === 0 ? "yellow" : "#1a2949";
            ctx.stroke();
            flashes++;
            if (flashes > 5) {
                clearInterval(id);
                drawAll();
            }
        }, 200);
    }

    // ---------- ANALYSIS (LIVE YOLO-BASED) ----------

    // NEW: Bubble Chart Logic
    const initializeBubbleChart = () => {
        const ctx = document.getElementById('bubble-chart');
        if (ctx && !bubbleChart) {

            // Find the highest mock capacity to set a reasonable Y-axis max
            const maxCapacityValues = savedZones.map(z => ZONE_CAPACITIES_MOCK(z.name));
            const maxCapacity = maxCapacityValues.length > 0 ? Math.max(...maxCapacityValues) : 100;

            bubbleChart = new Chart(ctx, {
                type: 'bubble',
                data: { datasets: [] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const data = context.dataset.data[context.dataIndex];
                                    const zoneName = context.dataset.label;
                                    const actualCapacity = Math.round(data.r / 3); // Un-scale the radius value
                                    let label = `${zoneName} | Count: ${data.y} people`;
                                    label += ` | Occupancy: ${data.x.toFixed(1)}%`;
                                    label += ` | Max Capacity: ${actualCapacity}`;
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Occupancy (%)' },
                            min: 0,
                            max: 20,
                            ticks: {
                            // This sets the step size (gap) to 2
                            stepSize: 2 
                        }
                        },
                        y: {
                            title: { display: true, text: 'Live Count (People)' },
                            min: 0,
                            max: 20, // 20% padding
                            ticks: {
                            // This sets the step size (gap) to 2
                            stepSize: 2 }
                        }
                    }
                }
            });
        }
    };

    const updateBubbleChart = () => {
        if (!bubbleChart || !savedZones || savedZones.length === 0) return;

        // analysisData.zoneData holds the latest live counts from fetchLiveZoneCounts
        const liveZoneData = analysisData.zoneData;

        const datasets = savedZones.map((zone, index) => {
            const zoneName = zone.name || `Zone ${index + 1}`;
            const currentCount = liveZoneData[zoneName] || 0;
            const maxCapacity = ZONE_CAPACITIES_MOCK(zoneName);

            const occupancyPercent = (currentCount / maxCapacity) * 100;

            // Radius (r) is scaled for visibility: r = capacity * factor. We use 3.
            const rValue = Math.sqrt(maxCapacity) * 3;

            return {
                label: zoneName,
                data: [{
                    // X: Occupancy Percentage (0-100)
                    x: occupancyPercent,
                    // Y: Live People Count
                    y: currentCount,
                    // R (Radius): Max Capacity (Scaled for Chart.js)
                    r: rValue
                }],
                backgroundColor: ZONE_COLORS_MOCK(zoneName, index),
                // Use the same color for the border but make it solid
                borderColor: ZONE_COLORS_MOCK(zoneName, index).replace('0.6', '1'),
                borderWidth: 2,
                hoverRadius: 8
            };
        });

        bubbleChart.data.datasets = datasets;
        bubbleChart.update('none'); // 'none' for smooth, non-animated update
    };
    // END NEW: Bubble Chart Logic

    function initializeCharts() {
        const hourlyEl = document.getElementById("hourly-chart");
        const zoneEl = document.getElementById("zone-chart") || document.getElementById("zoneChart");
        if (!hourlyEl || !zoneEl) return;

        const hourlyCtx = hourlyEl.getContext("2d");
        const chartColors = [
            'rgb(75, 192, 192)',
            'rgb(153, 102, 255)',
            'rgb(255, 159, 64)',
            'rgb(255, 99, 132)',
            'rgb(54, 162, 235)',
            'rgb(201, 203, 207)'
        ];

        // Dynamically create datasets based on saved zones
        const hourlyDatasets = savedZones.map((zone, index) => ({
            label: zone.name || `Zone ${zone.id}`,
            data: Array(24).fill(0), // Will be updated by backend data
            borderColor: chartColors[index % chartColors.length],
            backgroundColor: chartColors[index % chartColors.length].replace('rgb', 'rgba').replace(')', ', 0.2)'),
            tension: 0.4,
            fill: true,
            pointRadius: 3,
            pointHoverRadius: 6
        }));

        if (hourlyChart) {
            hourlyChart.destroy();
        }

        hourlyChart = new Chart(hourlyCtx, {
            type: "line",
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: hourlyDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: 'Number of People' } },
                    x: { title: { display: true, text: 'Time of Day' } }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    title: { display: true, text: 'Real-time Population Analytics by Zone' }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                hover: {
                    mode: 'nearest',
                    intersect: true
                }
            }
        });

        const zoneCtx = zoneEl.getContext("2d");
        if (zoneChart) {
            zoneChart.destroy();
        }
        zoneChart = new Chart(zoneCtx, {
            type: "bar",
            data: {
                labels: [],
                datasets: [{
                    label: "Zone Count",
                    data: [],
                    backgroundColor: ['#1a2949', '#273a63', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                aspectRatio: 1.5,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });

        // NEW: Initialize Bubble Chart
        initializeBubbleChart();
    }

    function stopAnalysis() {
        if (analysisInterval) {
            clearInterval(analysisInterval);
            analysisInterval = null;
        }
        resetAnalysisDisplay();
        if (startAnalysisBtn) startAnalysisBtn.disabled = false;
        if (stopAnalysisBtn) stopAnalysisBtn.disabled = true;

        if (overlayImage) overlayImage.style.display = 'none';
        // NEW: Hide the heatmap image
        if (heatmapImage) heatmapImage.style.display = 'none';
    }

    function resetAnalysisDisplay() {
        analysisData = {
            currentCount: 0,
            totalEntries: 0,
            totalExits: 0,
            peakCount: 0,
            hourlyZoneData: {},
            zoneData: {}
        };
        updateAnalysisDisplay();
    }

    async function fetchLiveZoneCounts() {
        if (!getToken()) {
            stopAnalysis();
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/get_frame_data`, {
                method: "GET",
                headers: { ...authHeaders() }
            });

            const data = await res.json();

            if (!res.ok || data.finished) {
                console.warn("Analysis finished or failed:", data.error || data.message);
                if (data.finished) {
                    alert("Analysis complete. Video has ended.");
                } else {
                    alert(`Analysis stopped due to error: ${data.error || data.message}`);
                }
                try {
                    await fetch(`${API_BASE}/stop_analysis`, {
                        method: "POST",
                        headers: { ...authHeaders() }
                    });
                } catch (e) { /* ignore */ }
                stopAnalysis();
                return;
            }

            // Existing logic for detection overlay
            if (data.overlay_frame && overlayImage) {
                overlayImage.src = `data:image/jpeg;base64,${data.overlay_frame}`;
                overlayImage.style.display = 'block';
            }

            // NEW: Logic for heatmap overlay
            if (data.heatmap_frame && heatmapImage) {
                heatmapImage.src = `data:image/jpeg;base64,${data.heatmap_frame}`;
                heatmapImage.style.display = 'block';
            } else if (heatmapImage) {
                heatmapImage.style.display = 'none';
            }

            const zoneCountsRaw = data.zone_counts || {};
            const totalCount = Object.values(zoneCountsRaw).reduce((sum, count) => sum + (Number(count) || 0), 0);
            analysisData.currentCount = totalCount;
            analysisData.peakCount = Math.max(analysisData.peakCount, totalCount);

            const idToName = {};
            savedZones.forEach(z => {
                if (z.id !== undefined && z.id !== null) {
                    idToName[String(z.id)] = z.name || (`Zone ${z.id}`);
                }
            });

            const mappedZoneData = {};
            for (const key in zoneCountsRaw) {
                if (Object.prototype.hasOwnProperty.call(zoneCountsRaw, key)) {
                    const count = zoneCountsRaw[key];
                    const name = idToName[key] || `Zone ${key}`;
                    mappedZoneData[name] = count;
                }
            }
            analysisData.zoneData = mappedZoneData;

            // Update the hourly chart with live data for the current hour
            if (hourlyChart && mappedZoneData) {
                const currentHour = new Date().getHours();
                hourlyChart.data.datasets.forEach(dataset => {
                    const zoneName = dataset.label;
                    const liveCountForZone = mappedZoneData[zoneName] || 0;
                    if (Object.prototype.hasOwnProperty.call(mappedZoneData, zoneName)) {
                        dataset.data[currentHour] = liveCountForZone;
                    }
                });
                hourlyChart.update("none");
            }

            for (const [zoneName, count] of Object.entries(mappedZoneData)) {
                if (Number(count) >= ALERT_THRESHOLD) {
                    const alreadyShown = document.querySelector(`#alert-${zoneName.replace(/\s+/g,'-')}`);
                    if (!alreadyShown) {
                        const alertEl = document.createElement("div");
                        alertEl.id = `alert-${zoneName.replace(/\s+/g,'-')}`;
                        alertEl.className = "alert-box capacity-alert alert-error";
                        alertEl.innerHTML =  `<i class='bx bxs-error-alt'></i> <span><strong>Alert:</strong> ${zoneName} has reached a capacity threshold (${count})</span>`;
                        document.body.appendChild(alertEl);
                        setTimeout(() => {
                            try { alertEl.remove(); } catch(e) {}
                        }, 3000);
                    }
                    try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.type = "sine";
                        o.frequency.value = 880;
                        o.connect(g);
                        g.connect(ctx.destination);
                        o.start();
                        g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
                        setTimeout(()=>{ o.stop(); }, 350);
                    } catch(e) { /* ignore audio errors */ }
                }
            }

            updateAnalysisDisplay();

        } catch (err) {
            console.error("Error fetching live zone counts:", err);
            try {
                await fetch(`${API_BASE}/stop_analysis`, {
                    method: "POST",
                    headers: { ...authHeaders() }
                });
            } catch (e) {}
            stopAnalysis();
        }
    }
    
    async function loadAnalysisSummary() {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/get_daily_summary`, {
                method: "GET",
                headers: { ...authHeaders() }
            });

            const data = await res.json();
            if (res.ok) {
                analysisData.totalEntries = data.total_entries;
                analysisData.totalExits = data.total_exits;
                // Assuming backend provides hourly_trend_by_zone
                analysisData.hourlyZoneData = data.hourly_trend_by_zone || {};

                if (!hourlyChart) {
                    initializeCharts();
                }

                hourlyChart.data.datasets.forEach(dataset => {
                    const zoneName = dataset.label;
                    if (analysisData.hourlyZoneData[zoneName]) {
                        dataset.data = analysisData.hourlyZoneData[zoneName];
                    }
                });
                hourlyChart.update("none");

                updateAnalysisDisplay();
            } else {
                console.warn("Failed to load daily summary:", data.message);
            }
        } catch (err) {
            console.error("Error fetching daily summary:", err);
        }
    }

    function updateAnalysisDisplay() {
        const el = (id) => document.getElementById(id);
        el("currentCount") && (el("currentCount").textContent = analysisData.currentCount);
        el("totalEntries") && (el("totalEntries").textContent = analysisData.totalEntries);
        el("totalExits") && (el("totalExits").textContent = analysisData.totalExits);
        el("peakCount") && (el("peakCount").textContent = analysisData.peakCount);

        if (analysisList) {
            analysisList.innerHTML = "";
            const zoneEntries = Object.entries(analysisData.zoneData);
            if (zoneEntries.length === 0 && analysisData.currentCount === 0) {
                analysisList.innerHTML = "<li><div class='zone-info'>No people detected</div><div class='zone-count'>0</div></li>";
            } else {
                zoneEntries.forEach(([zoneName, count]) => {
                    const li = document.createElement("li");
                    li.innerHTML = `
                    <div class="zone-info">
                        <strong>${zoneName}</strong><br><small>Live Count</small>
                    </div>
                    <div class="zone-count">${count}</div>
                    `;
                    analysisList.appendChild(li);
                });
            }
        }

        if (zoneChart) {
            const zoneNames = Object.keys(analysisData.zoneData);
            const zoneCounts = Object.values(analysisData.zoneData).map(v => Number(v) || 0);
            zoneChart.data.labels = zoneNames;
            zoneChart.data.datasets[0].data = zoneCounts;
            zoneChart.update("none");
        }
        
        // NEW: Update Bubble Chart with the latest live data
        updateBubbleChart();
    }

    if (startAnalysisBtn) {
        startAnalysisBtn.addEventListener("click", async () => {
            if (savedZones.length === 0) return alert("Save zones first!");
            if (!hourlyChart) initializeCharts();
            if (!videoFeed || !videoFeed.src) return alert("Please upload and preview a video first.");

            const token = getToken();
            if (!token) return alert("Login required for live analysis.");

            try {
                const res = await fetch(`${API_BASE}/start_analysis`, {
                    method: "POST",
                    headers: { ...authHeaders() }
                });
                const data = await res.json();
                if (!res.ok) {
                    alert(data.error || "Failed to start analysis session on server.");
                    return;
                }

                totalFrames = data.total_frames;
                alert("Analysis session started on server. Fetching data...");

                if (overlayImage) overlayImage.style.display = 'block';
                // Show heatmap on start
                if (heatmapImage) heatmapImage.style.display = 'block';

                if (!analysisInterval) {
                    analysisInterval = setInterval(fetchLiveZoneCounts, 100); 
                    fetchLiveZoneCounts();
                }

                startAnalysisBtn.disabled = true;
                stopAnalysisBtn.disabled = false;
            } catch (err) {
                console.error("Error starting analysis session:", err);
                alert("Network error. Could not start analysis.");
            }
        });
    }

    if (stopAnalysisBtn) {
        stopAnalysisBtn.addEventListener("click", async () => {
            try {
                await fetch(`${API_BASE}/stop_analysis`, {
                    method: "POST",
                    headers: { ...authHeaders() }
                });
            } catch (err) {
                console.warn("Failed to tell backend to stop analysis, clearing locally anyway.");
            }
            stopAnalysis();
            alert("Analysis stopped.");
        });
    }

    const analysisMenu = document.getElementById("menu-analysis");
    if (analysisMenu) {
        analysisMenu.addEventListener("click", () => {
            setTimeout(() => {
                if (!hourlyChart) {
                    initializeCharts();
                }
                updateAnalysisDisplay();
                loadAnalysisSummary();
            }, 100);
        });
    }

    if (videoFeed && canvas) {
        if (videoFeed.readyState >= 1) {
            canvas.width = videoFeed.videoWidth || canvas.clientWidth;
            canvas.height = videoFeed.videoHeight || canvas.clientHeight;
        } else {
            videoFeed.onloadedmetadata = () => {
                canvas.width = videoFeed.videoWidth || canvas.clientWidth;
                canvas.height = videoFeed.videoHeight || canvas.clientHeight;
                drawAll();
            };
        }
    }

    // Initial load
    loadZones();
    loadWelcomeUser(); 
    if (window.location.href.includes("dashboard.html")) {
        const defaultView = document.getElementById("menu-dashboard");
        if (defaultView) defaultView.click();
    }
});