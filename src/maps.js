/**
 * Google Maps utility functions for DrexelGuessr.
 */

let mapsLoaded = false;
let loadPromise = null;

/**
 * Dynamically loads the Google Maps JavaScript API using the recommended async pattern.
 */
export function loadGoogleMapsAPI(apiKey) {
    if (mapsLoaded) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        if (window.google && window.google.maps) {
            mapsLoaded = true;
            resolve();
            return;
        }

        // Use Google's recommended async callback pattern
        const callbackName = '_gmapsCallback';
        window[callbackName] = () => {
            mapsLoaded = true;
            delete window[callbackName];
            resolve();
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&v=weekly&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            delete window[callbackName];
            reject(new Error('Failed to load Google Maps API'));
        };
        document.head.appendChild(script);
    });

    return loadPromise;
}

/**
 * Check if Street View coverage exists near a location.
 * Returns the nearest panorama data or null if none found.
 */
/**
 * Check if Street View coverage exists near a location.
 * Tries to find high-quality outdoor imagery first.
 * Returns the nearest panorama data or null if none found.
 */
export function checkStreetViewCoverage(location, radius = 50) {
    return new Promise((resolve) => {
        const sv = new google.maps.StreetViewService();

        // 1. Try finding official outdoor imagery first (usually higher quality/reliable)
        sv.getPanorama(
            {
                location: { lat: location.lat, lng: location.lng },
                radius,
                preference: google.maps.StreetViewPreference.NEAREST,
                source: google.maps.StreetViewSource.OUTDOOR,
            },
            (data, status) => {
                if (status === google.maps.StreetViewStatus.OK) {
                    resolve(data);
                } else {
                    // 2. Fallback to any imagery if outdoor specific fails
                    sv.getPanorama(
                        {
                            location: { lat: location.lat, lng: location.lng },
                            radius: radius * 1.5, // slightly larger radius for fallback
                            preference: google.maps.StreetViewPreference.NEAREST,
                            source: google.maps.StreetViewSource.DEFAULT,
                        },
                        (data2, status2) => {
                            if (status2 === google.maps.StreetViewStatus.OK) {
                                resolve(data2);
                            } else {
                                resolve(null);
                            }
                        }
                    );
                }
            }
        );
    });
}

/**
 * Creates a Street View panorama in the given container.
 * Uses StreetViewService to snap to the nearest available panorama.
 * Includes error detection and retry overlay for failed loads.
 */
export async function createStreetView(container, location) {
    // Clear any previous error overlays
    const existingOverlay = container.querySelector('.sv-error-overlay');
    if (existingOverlay) existingOverlay.remove();

    const panoData = await checkStreetViewCoverage(location, 100);

    const config = {
        pov: {
            heading: location.heading || 0,
            pitch: location.pitch || 0,
        },
        zoom: 1,
        disableDefaultUI: false,
        showRoadLabels: false,
        linksControl: false,      // Disable arrows
        clickToGo: false,         // Disable click-to-move
        panControl: true,
        zoomControl: true,
        addressControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
    };

    if (panoData) {
        config.pano = panoData.location.pano;
    } else {
        config.position = { lat: location.lat, lng: location.lng };
    }

    const panorama = new google.maps.StreetViewPanorama(container, config);

    // Monitor for load failures
    panorama.addListener('status_changed', () => {
        const status = panorama.getStatus();
        if (status === google.maps.StreetViewStatus.ZERO_RESULTS) {
            showStreetViewError(container, panorama, location);
        }
    });

    return panorama;
}

/**
 * Show an error overlay when Street View fails to load.
 */
function showStreetViewError(container, panorama, location) {
    // Remove any existing overlay first
    const existing = container.querySelector('.sv-error-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'sv-error-overlay';
    overlay.style.cssText = `
        position: absolute;
        inset: 0;
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: rgba(10, 14, 23, 0.92);
        color: #f0f2f5;
        font-family: 'Inter', sans-serif;
    `;

    overlay.innerHTML = `
        <div style="font-size: 2.5rem;">📍</div>
        <div style="font-size: 1.1rem; font-weight: 600;">Street View unavailable here</div>
        <div style="font-size: 0.85rem; color: #8b97b0; text-align: center; max-width: 280px;">
            This location doesn't have imagery right now. Try retrying or just make your best guess!
        </div>
        <button class="sv-retry-btn" style="
            padding: 10px 24px;
            background: linear-gradient(135deg, #e6b200, #FFC600);
            color: #041b33;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.9rem;
            cursor: pointer;
            font-family: 'Inter', sans-serif;
        ">Retry Loading</button>
    `;

    // Retry button
    const retryBtn = overlay.querySelector('.sv-retry-btn');
    retryBtn.addEventListener('click', async () => {
        overlay.remove();
        const panoData = await checkStreetViewCoverage(location, 200);
        if (panoData) {
            panorama.setPano(panoData.location.pano);
        } else {
            panorama.setPosition({ lat: location.lat, lng: location.lng });
        }
    });

    container.style.position = 'relative';
    container.appendChild(overlay);
}

/**
 * Creates an interactive map for placing guesses.
 * Centered on Drexel's campus.
 */
export function createGuessMap(container) {
    const map = new google.maps.Map(container, {
        center: { lat: 39.9550, lng: -75.1890 },
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8b97b0' }] },
            {
                featureType: 'administrative',
                elementType: 'geometry',
                stylers: [{ color: '#2a2a4a' }],
            },
            {
                featureType: 'poi',
                elementType: 'geometry',
                stylers: [{ color: '#1e2d45' }],
            },
            {
                featureType: 'poi',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#6b7d99' }],
            },
            {
                featureType: 'poi.park',
                elementType: 'geometry',
                stylers: [{ color: '#1a3320' }],
            },
            {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ color: '#2c3e5a' }],
            },
            {
                featureType: 'road',
                elementType: 'geometry.stroke',
                stylers: [{ color: '#1a2a40' }],
            },
            {
                featureType: 'road',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#6e8099' }],
            },
            {
                featureType: 'transit',
                elementType: 'geometry',
                stylers: [{ color: '#1e2d45' }],
            },
            {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#0e1a2b' }],
            },
        ],
    });

    return map;
}

/**
 * Creates a result map for showing guess vs actual.
 */
export function createResultMap(container) {
    const map = new google.maps.Map(container, {
        center: { lat: 39.9550, lng: -75.1890 },
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#8b97b0' }] },
            {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ color: '#2c3e5a' }],
            },
            {
                featureType: 'poi.park',
                elementType: 'geometry',
                stylers: [{ color: '#1a3320' }],
            },
            {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#0e1a2b' }],
            },
        ],
    });

    return map;
}

/**
 * Draw an animated dashed polyline between guess and actual location.
 */
export function drawResultLine(map, guessPos, actualPos) {
    const markers = {};

    // Actual marker (navy) - always show
    markers.actualMarker = new google.maps.Marker({
        position: actualPos,
        map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#07294D',
            fillOpacity: 1,
            strokeColor: '#FFC600',
            strokeWeight: 3,
        },
        title: 'Actual Location',
        zIndex: 10,
    });

    // If user made a guess, show it and the line
    if (guessPos) {
        markers.guessMarker = new google.maps.Marker({
            position: guessPos,
            map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#FFC600',
                fillOpacity: 1,
                strokeColor: '#e6b200',
                strokeWeight: 3,
            },
            title: 'Your Guess',
            zIndex: 10,
        });

        const lineSymbol = {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            strokeColor: '#FFC600',
            scale: 3,
        };

        markers.line = new google.maps.Polyline({
            path: [guessPos, actualPos],
            strokeOpacity: 0,
            icons: [
                {
                    icon: lineSymbol,
                    offset: '0',
                    repeat: '16px',
                },
            ],
            map,
        });

        // Fit bounds to show both markers
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(guessPos);
        bounds.extend(actualPos);
        map.fitBounds(bounds, { top: 80, bottom: 200, left: 80, right: 80 });
    } else {
        // Only fit to actual location if no guess
        map.setCenter(actualPos);
        map.setZoom(16);
    }

    return markers;
}

/**
 * Calculate distance between two points using Haversine formula.
 * @returns Distance in meters
 */
export function haversineDistance(p1, p2) {
    const R = 6371000; // Earth's radius in meters
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Convert meters to feet.
 */
export function metersToFeet(meters) {
    return meters * 3.28084;
}
