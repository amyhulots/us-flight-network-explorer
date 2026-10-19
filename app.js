
/*
 * Lab 07B - Interactive U.S. Flight Network
 * ISC4221C
 * AI Assistance: OpenAI GPT-6
 */

"use strict";

let network = null;
let airportByCode = new Map();
let activeAirports = [];
let sortedCodes = [];
let map = null;
let airportLayer = null;
let routeLayer = null;
let highlightLayer = null;
let markers = new Map();

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

function airportLabel(code) {
    const airport = airportByCode.get(code);
    return airport
        ? `${code} — ${airport.city}`
        : code;
}

function haversine(lat1, lon1, lat2, lon2) {
    const radius = 6371;
    const radians = (degrees) => degrees * Math.PI / 180;

    const deltaLat = radians(lat2 - lat1);
    const deltaLon = radians(lon2 - lon1);

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(deltaLon / 2) ** 2;

    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Binary search, with one comparison per midpoint visited.
function binarySearch(codes, target) {
    let low = 0;
    let high = codes.length - 1;
    let comparisons = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        comparisons++;

        if (codes[mid] === target) {
            return { index: mid, comparisons };
        }

        if (target < codes[mid]) {
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }

    return { index: -1, comparisons };
}

// Selection sort: the same algorithm used in Part 2.
function selectionSort(items, getKey) {
    const result = [...items];

    for (let i = 0; i < result.length; i++) {
        let minimum = i;

        for (let j = i + 1; j < result.length; j++) {
            if (getKey(result[j]) < getKey(result[minimum])) {
                minimum = j;
            }
        }

        [result[i], result[minimum]] =
            [result[minimum], result[i]];
    }

    return result;
}

function initMap() {
    map = L.map("map").setView([39, -98], 4);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 12
        }
    ).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    airportLayer = L.layerGroup().addTo(map);
    highlightLayer = L.layerGroup().addTo(map);

    // Draw all domestic connections.
    for (const [a, b] of network.edges) {
        const first = airportByCode.get(a);
        const second = airportByCode.get(b);

        if (!first || !second) continue;

        L.polyline(
            [
                [first.lat, first.lon],
                [second.lat, second.lon]
            ],
            {
                color: "#527ba9",
                weight: 1,
                opacity: 0.18,
                interactive: false
            }
        ).addTo(routeLayer);
    }

    // Create a clickable marker for each active airport.
    for (const airport of activeAirports) {
        const marker = L.circleMarker(
            [airport.lat, airport.lon],
            {
                radius: Math.min(13, 3 + airport.degree * 0.065),
                color: "#ffffff",
                weight: 1,
                fillColor: airport.degree >= 75
                    ? "#174ea6"
                    : "#3682d3",
                fillOpacity: 0.9
            }
        );

        marker.bindTooltip(
            `${escapeHTML(airport.code)} — ` +
            `${escapeHTML(airport.city)}`
        );

        marker.on("click", () => selectAirport(airport.code));
        marker.addTo(airportLayer);
        markers.set(airport.code, marker);
    }

    $("show-routes").addEventListener("change", (event) => {
        if (event.target.checked) {
            map.addLayer(routeLayer);
        } else {
            map.removeLayer(routeLayer);
        }
    });

    $("show-airports").addEventListener("change", (event) => {
        if (event.target.checked) {
            map.addLayer(airportLayer);
        } else {
            map.removeLayer(airportLayer);
        }
    });

    $("reset-map").addEventListener("click", () => {
        highlightLayer.clearLayers();
        map.setView([39, -98], 4);
        $("map-info").textContent =
            "Select an airport marker to view its details.";
    });

    // Highlight Tallahassee when the map first loads.
    highlightAirport("TLH", false);
}

function highlightAirport(code, zoom = true) {
    const airport = airportByCode.get(code);
    if (!airport) return;

    highlightLayer.clearLayers();

    for (const neighborCode of airport.neighbors) {
        const neighbor = airportByCode.get(neighborCode);
        if (!neighbor) continue;

        L.polyline(
            [
                [airport.lat, airport.lon],
                [neighbor.lat, neighbor.lon]
            ],
            {
                color: "#e53935",
                weight: 3,
                opacity: 0.9
            }
        ).addTo(highlightLayer);
    }

    L.circleMarker(
        [airport.lat, airport.lon],
        {
            radius: 11,
            color: "#ffffff",
            weight: 2,
            fillColor: "#e53935",
            fillOpacity: 1
        }
    ).addTo(highlightLayer);

    $("map-info").innerHTML =
        `<strong>${escapeHTML(code)}</strong> — ` +
        `${escapeHTML(airport.name)}, ` +
        `${escapeHTML(airport.city)}<br>` +
        `Direct destinations: ${airport.degree}`;

    if (zoom) {
        map.setView([airport.lat, airport.lon], 6);
    }
}

function selectAirport(code) {
    highlightAirport(code);
    $("airport-search").value = code;
    lookupAirport();
}

function lookupAirport() {
    const code = $("airport-search").value.trim().toUpperCase();
    const resultBox = $("lookup-result");

    if (!/^[A-Z]{3}$/.test(code)) {
        resultBox.textContent =
            "Please enter a valid three-letter airport code.";
        $("neighbor-list").textContent = "No airport selected.";
        $("nearest-list").textContent = "No airport selected.";
        return;
    }

    const search = binarySearch(sortedCodes, code);

    if (search.index === -1) {
        const known = airportByCode.get(code);

        resultBox.innerHTML = known
            ? `<strong>${escapeHTML(code)}</strong> exists in the ` +
              `airport dataset but has no domestic routes. ` +
              `Binary search used ${search.comparisons} comparisons.`
            : `<strong>${escapeHTML(code)}</strong> was not found ` +
              `in the active flight network. ` +
              `Binary search used ${search.comparisons} comparisons.`;

        $("neighbor-list").textContent = "No active routes.";
        $("nearest-list").textContent = "No active routes.";
        return;
    }

    const airport = airportByCode.get(code);

    resultBox.innerHTML =
        `<strong>${escapeHTML(code)}</strong> — ` +
        `${escapeHTML(airport.name)}<br>` +
        `City: ${escapeHTML(airport.city)}<br>` +
        `Direct connections: ${airport.degree}<br>` +
        `Binary search comparisons: ${search.comparisons}`;

    const neighbors = airport.neighbors.map((neighborCode) => {
        const neighbor = airportByCode.get(neighborCode);
        const distance = haversine(
            airport.lat, airport.lon,
            neighbor.lat, neighbor.lon
        );

        return {
            code: neighborCode,
            degree: neighbor.degree,
            distance
        };
    });

    const orderedNeighbors = selectionSort(
        neighbors,
        (item) => item.code
    );

    $("neighbor-list").innerHTML = orderedNeighbors.length
        ? `<ul class="data-list">` +
          orderedNeighbors.map((item) =>
              `<li><strong>${escapeHTML(item.code)}</strong> — ` +
              `${item.degree} connections, ` +
              `${item.distance.toFixed(1)} km</li>`
          ).join("") +
          `</ul>`
        : "No direct neighbors.";

    const distances = activeAirports
        .filter((other) => other.code !== code)
        .map((other) => ({
            code: other.code,
            distance: haversine(
                airport.lat, airport.lon,
                other.lat, other.lon
            )
        }));

    const nearest = selectionSort(
        distances,
        (item) => item.distance
    ).slice(0, 5);

    $("nearest-list").innerHTML =
        `<ol class="data-list">` +
        nearest.map((item) =>
            `<li><strong>${escapeHTML(item.code)}</strong> — ` +
            `${item.distance.toFixed(1)} km</li>`
        ).join("") +
        `</ol>`;

    highlightAirport(code, false);
}

function initLookup() {
    $("search-button").addEventListener("click", lookupAirport);

    $("airport-search").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            lookupAirport();
        }
    });

    $("airport-search").value = "TLH";
    lookupAirport();
}

function initStatistics() {
    const stats = network.statistics;

    $("total-airports").textContent =
        stats.total_us_airports.toLocaleString();

    $("active-airports").textContent =
        stats.active_airports.toLocaleString();

    $("total-routes").textContent =
        stats.unique_routes.toLocaleString();

    $("total-components").textContent =
        stats.connected_components.toLocaleString();

    const largestDegree = network.hubs[0].degree;

    $("hub-chart").innerHTML = network.hubs.map((hub) => {
        const width = (hub.degree / largestDegree) * 100;

        return `
            <div class="hub-row"
                 data-airport="${escapeHTML(hub.code)}"
                 role="button"
                 tabindex="0">
                <strong>${escapeHTML(hub.code)}</strong>
                <div class="hub-track">
                    <div class="hub-bar"
                         style="width:${width}%"></div>
                </div>
                <span>${hub.degree}</span>
            </div>
        `;
    }).join("");

    for (const row of $("hub-chart").querySelectorAll(".hub-row")) {
        const openHub = () => {
            const code = row.dataset.airport;
            selectAirport(code);
            $("map-section").scrollIntoView({
                behavior: "smooth"
            });
        };

        row.addEventListener("click", openHub);

        row.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openHub();
            }
        });
    }

    $("component-list").innerHTML =
        network.components.map((component, index) => `
            <div class="component-item">
                <strong>Component ${index + 1}</strong><br>
                ${component.length} airports<br>
                <span class="small-note">
                    ${component.length <= 12
                        ? component.map(escapeHTML).join(", ")
                        : "Largest connected airport group"}
                </span>
            </div>
        `).join("");
}

function shortestPath(origin, destination) {
    if (!airportByCode.has(origin) ||
        !airportByCode.has(destination)) {
        return null;
    }

    const originAirport = airportByCode.get(origin);
    const destinationAirport = airportByCode.get(destination);

    if (originAirport.degree === 0 ||
        destinationAirport.degree === 0) {
        return null;
    }

    const queue = [origin];
    const visited = new Set([origin]);
    const parent = new Map([[origin, null]]);
    let head = 0;
    let iterations = 0;

    while (head < queue.length) {
        const current = queue[head++];
        iterations++;

        if (current === destination) {
            const path = [];
            let node = destination;

            while (node !== null) {
                path.push(node);
                node = parent.get(node);
            }

            path.reverse();
            return { path, iterations };
        }

        const neighbors = airportByCode.get(current).neighbors;

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }

    return { path: null, iterations };
}

function initConnections() {
    const options = activeAirports.map((airport) =>
        `<option value="${escapeHTML(airport.code)}">` +
        `${escapeHTML(airport.code)} — ` +
        `${escapeHTML(airport.city)}</option>`
    ).join("");

    $("origin-select").innerHTML = options;
    $("destination-select").innerHTML = options;

    $("origin-select").value = "TLH";
    $("destination-select").value = "SEA";

    $("find-route").addEventListener("click", () => {
        const origin = $("origin-select").value;
        const destination = $("destination-select").value;

        const result = shortestPath(origin, destination);

        if (!result || !result.path) {
            $("route-result").innerHTML =
                `<strong>No connection found.</strong><br>` +
                `${escapeHTML(origin)} and ` +
                `${escapeHTML(destination)} are in separate ` +
                `connected components.`;
            return;
        }

        const flights = result.path.length - 1;

        $("route-result").innerHTML =
            `<strong>Connection found!</strong><br>` +
            `Route: ${result.path.map(escapeHTML).join(" → ")}<br>` +
            `Minimum flights: <strong>${flights}</strong><br>` +
            `Airports processed by BFS: ${result.iterations}`;

        highlightLayer.clearLayers();

        for (let i = 0; i < result.path.length - 1; i++) {
            const a = airportByCode.get(result.path[i]);
            const b = airportByCode.get(result.path[i + 1]);

            L.polyline(
                [[a.lat, a.lon], [b.lat, b.lon]],
                {
                    color: "#e53935",
                    weight: 4,
                    opacity: 0.95
                }
            ).addTo(highlightLayer);
        }

        $("map-section").scrollIntoView({
            behavior: "smooth"
        });
    });
}

async function startWebsite() {
    try {
        const response = await fetch("data/network.json");

        if (!response.ok) {
            throw new Error(
                `Could not load network.json (${response.status})`
            );
        }

        network = await response.json();

        airportByCode = new Map(
            network.airports.map((airport) => [
                airport.code, airport
            ])
        );

        activeAirports = network.airports.filter(
            (airport) => airport.degree > 0
        );

        sortedCodes = selectionSort(
            activeAirports.map((airport) => airport.code),
            (code) => code
        );

        initMap();
        initLookup();
        initStatistics();
        initConnections();

        console.log(
            "Flight Network Explorer loaded:",
            activeAirports.length,
            "active airports"
        );

    } catch (error) {
        console.error(error);

        $("map-info").textContent =
            "Website loading error: " + error.message;

        $("lookup-result").textContent =
            "Unable to load airport data.";
    }
}

document.addEventListener("DOMContentLoaded", startWebsite);
