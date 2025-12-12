document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file');
    const resultsSection = document.getElementById('results-section');
    const estimationSection = document.getElementById('estimation-section');
    const calculateBtn = document.getElementById('calculate-btn');
    const estimatedFareInput = document.getElementById('estimated-fare');
    const passDisplayArea = document.getElementById('pass-display-area');
    const detectedPassDisplay = document.getElementById('detected-pass-display');
    const shareBtn = document.getElementById('share-btn');
    const toast = document.getElementById('toast');
    const exampleLink = document.getElementById('example-link');

    let currentTrips = [];
    let latestAnalysis = null; // Store results for sharing
    let detectedPassLevel = 0; // 0 means no pass
    let stationErrors = new Set();
    let isExampleData = false;

    // Data is now loaded via <script> tags (stationsData, faresData, stationOverrides)

    // Theme Toggle Logic
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const icon = themeToggle.querySelector('.icon');

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    html.setAttribute('data-theme', savedTheme);
    icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    themeToggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });

    // Example Data Handler
    exampleLink.addEventListener('click', (e) => {
        e.preventDefault();
        loadExampleData();
    });

    // Drag and Drop Handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    // Keyboard support for drop zone
    dropZone.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) processFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) processFiles(e.target.files);
    });

    calculateBtn.addEventListener('click', () => {
        const estimatedFare = parseFloat(estimatedFareInput.value);
        if (isNaN(estimatedFare) || estimatedFare < 0) {
            alert("Please enter a valid fare amount.");
            return;
        }

        // Apply estimate to pass trips
        const tripsWithEstimate = currentTrips.map(trip => {
            if (trip.isPassTrip) {
                return { ...trip, cost: estimatedFare };
            }
            return trip;
        });

        estimationSection.classList.add('hidden');
        calculateAndDisplayResults(tripsWithEstimate);
    });

    // Modal Focus Trap
    const modal = document.getElementById('onboarding-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    let lastFocusedElement;

    function openModal() {
        lastFocusedElement = document.activeElement;
        modal.classList.remove('hidden');
        // Find focusable elements
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) { /* shift + tab */
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else { /* tab */
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Focus the first element (close button usually, or we might want to focus the heading text for screen readers? No, interactive element is better)
        // Wait a tick for visibility
        setTimeout(() => {
            closeModalBtn.focus();
        }, 50);
    }

    function closeModal() {
        modal.classList.add('hidden');
        if (lastFocusedElement) {
            lastFocusedElement.focus();
        }
    }

    const helpLink = document.getElementById('help-link');
    if (helpLink) {
        helpLink.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            closeModal();
            localStorage.setItem('hasVisited', 'true');
        });
    }

    // Auto-open if first visit
    if (!localStorage.getItem('hasVisited')) {
        // short delay to ensure transition works
        setTimeout(() => {
            openModal();
        }, 500);
    }

    // Close on click outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Share Feature
    shareBtn.addEventListener('click', () => {
        if (!latestAnalysis) return;

        const text = generateShareText(latestAnalysis);
        copyToClipboard(text);
    });

    function generateShareText(data) {
        // Calculate Peak % for the text
        let peakCount = 0;
        let total = 0;
        currentTrips.forEach(t => {
            if (t.operator === 'Metrorail' && t.date) {
                total++;
                if (checkPeak(new Date(t.date))) peakCount++;
            }
        });
        const peakPct = total > 0 ? Math.round((peakCount / total) * 100) : 0;

        return `${data.shareTitle}\n` +
            `💰 Potential Savings: $${data.savings.toFixed(2)}\n` +
            `🗓️ Trips Analyzed: ${data.tripCount}\n` +
            `⚡ Peak Rides: ${peakPct}%\n` +
            `✅ Recommendation: ${data.recommendation}\n\n` +
            `Check your savings: https://bgag2783.github.io/PassPicker/`;
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast();
        }).catch(err => {
            console.error('Failed to copy', err);
            // Fallback for older browsers if needed, but modern normally works
        });
    }

    function showToast() {
        toast.classList.remove('hidden');
        // Trigger reflow
        void toast.offsetWidth;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    function processFiles(fileList) {
        const readers = [];
        stationErrors.clear(); // Clear previous errors

        for (let i = 0; i < fileList.length; i++) {
            readers.push(readFile(fileList[i]));
        }

        Promise.all(readers).then(results => {
            let allTrips = [];
            results.forEach(text => {
                const trips = parseCSV(text);
                allTrips = allTrips.concat(trips);
            });

            if (allTrips.length === 0) {
                alert("No valid trips found in CSV(s). Please check the format.");
                return;
            }

            // Deduplicate
            allTrips = deduplicateTrips(allTrips);
            currentTrips = allTrips;

            // Auto-detect pass from trips (using most frequent or max?)
            // For multi-month, we might detect different passes. 
            // Let's just detect if *any* pass was used.
            const detectedPasses = detectPassFromTrips(allTrips);
            // detectedPassLevel is no longer a single number, but we might need it for legacy or just remove it.
            // Let's store the map or just use it for display.
            const hasPass = Object.keys(detectedPasses).length > 0;

            // Calculate Date Range
            const dates = allTrips.map(t => new Date(t.date));
            const minDate = new Date(Math.min.apply(null, dates));
            const maxDate = new Date(Math.max.apply(null, dates));
            const dateRangeStr = `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`;

            // Update Display
            passDisplayArea.style.display = 'block';

            const fileCount = fileList.length;
            const fileLabel = fileCount === 1 ? 'file' : 'files';

            let passInfoHtml = '';
            const passCount = Object.keys(detectedPasses).length;

            if (passCount > 0) {
                if (passCount === 1) {
                    // Show specific pass if only one found
                    const price = Object.values(detectedPasses)[0];
                    passInfoHtml = `<span class="badge success">Auto-detected</span> $${price.toFixed(2)} Monthly Pass`;
                } else {
                    passInfoHtml = `<span class="badge success">Auto-detected</span> ${passCount} Passes Found`;
                }
            } else {
                passInfoHtml = `<span class="badge neutral">Auto-detected</span> No Active Pass (Pay As You Go)`;
            }

            detectedPassDisplay.innerHTML = `
                <div style="margin-bottom: 8px; font-size: 0.9em; color: #666;">
                    ${dateRangeStr} • ${fileCount} ${fileLabel}
                </div>
                ${passInfoHtml}
            `;

            // Check if we need estimation
            let tripsWithFares = resolveFares(allTrips);

            // Display any errors found during processing
            displayErrors();

            const stillNeedsEstimation = tripsWithFares.some(t => t.isPassTrip && t.cost === 0 && t.isEstimated !== false);

            resultsSection.classList.add('hidden');

            if (stillNeedsEstimation) {
                currentTrips = tripsWithFares;
                estimationSection.classList.remove('hidden');
                estimationSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                estimationSection.classList.add('hidden');
                calculateAndDisplayResults(tripsWithFares);
            }
        });
    }

    function loadExampleData() {
        const trips = generateExampleData();

        // Mocking file list for display
        const dropZone = document.getElementById('drop-zone');

        currentTrips = trips;
        isExampleData = true;

        // Reset display
        document.getElementById('detected-pass-display').innerHTML = `
            <div style="margin-bottom: 8px; font-size: 0.9em; color: #666;">
                Example Data • 1 Month
            </div>
            <span class="badge neutral">Example</span> No Active Pass (Pay As You Go)
        `;
        document.getElementById('pass-display-area').style.display = 'block';

        // Clear errors
        stationErrors.clear();
        displayErrors();

        // Hide estimations
        document.getElementById('estimation-section').classList.add('hidden');

        // Show results
        calculateAndDisplayResults(trips);

        // Focus shift is handled in calculateAndDisplayResults, 
        // but we might want to ensure scrolling happens too since example is explicit user action
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    }

    function generateExampleData() {
        const trips = [];
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() === 0 ? 11 : today.getMonth() - 1; // Previous month
        const actualYear = today.getMonth() === 0 ? year - 1 : year;

        const daysInMonth = new Date(actualYear, month + 1, 0).getDate();

        // Data Generation Strategy: "The Realistic Commuter"
        // 1. Establish "Home" and "Work" (Core Commute)
        // 2. Establish 3-4 "Other" destinations (Social, Errands)
        // 3. Generate Core Commute (M-F, Peak, AM/PM) with some entropy (sick days, happy hour)
        // 4. Generate Other Trips (Weekends, Evenings, Lunches)

        // Filter valid stations
        const validStations = stationsData.filter(s => s.Lat && s.Lon);

        // Pick Home and Work
        let homeStation, workStation, peakFare;

        // Retry until we find a route with a significant fare (>$4.50) to ensure savings
        let attempts = 0;
        while (attempts < 100) {
            const homeIdx = Math.floor(Math.random() * validStations.length);
            homeStation = validStations[homeIdx];

            let workIdx = Math.floor(Math.random() * validStations.length);
            while (workIdx === homeIdx) workIdx = Math.floor(Math.random() * validStations.length);
            workStation = validStations[workIdx];

            // Check fare at a peak time (Mon 8am)
            const testDate = new Date(actualYear, month, 1, 8, 0, 0);
            while (testDate.getDay() === 0 || testDate.getDay() === 6) {
                testDate.setDate(testDate.getDate() + 1);
            }

            peakFare = lookupFare(homeStation.Name, workStation.Name, testDate.toString());

            if (peakFare && peakFare > 4.50) {
                break; // Found a good route
            }
            attempts++;
        }

        // Fallback if random search fails (unlikely)
        if (!peakFare || peakFare <= 4.50) {
            // Fallback to a known long route: Vienna to Metro Center
            homeStation = stationsData.find(s => s.Code === 'K08'); // Vienna
            workStation = stationsData.find(s => s.Code === 'A01'); // Metro Center
        }

        // Pick 3 Random "Other" Destinations
        const otherStations = [];
        for (let i = 0; i < 3; i++) {
            let idx = Math.floor(Math.random() * validStations.length);
            while (validStations[idx].Code === homeStation.Code || validStations[idx].Code === workStation.Code || otherStations.includes(validStations[idx])) {
                idx = Math.floor(Math.random() * validStations.length);
            }
            otherStations.push(validStations[idx]);
        }

        // Helper to add trip with REAL FARE LOOKUP
        const addTrip = (d, h, m, entry, exit) => {
            const dateObj = new Date(actualYear, month, d);
            dateObj.setHours(h, m, 0);
            const dateStr = dateObj.toString();

            // Lookup EXACT fare
            const cost = lookupFare(entry.Name, exit.Name, dateStr);

            if (cost !== null) {
                trips.push({
                    date: dateStr,
                    operator: 'Metrorail',
                    entry: entry.Name,
                    exit: exit.Name,
                    cost: cost,
                    surcharge: 0,
                    product: 'Stored Value',
                    isPassTrip: false
                });
            }
        };

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(actualYear, month, d);
            const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // 1. Core Commute (M-F)
            if (!isWeekend) {
                // 90% chance of going to work
                if (Math.random() < 0.9) {
                    // AM: Home -> Work
                    // Time: 7:00 - 9:30 AM (Peak)
                    const amHour = 7 + Math.floor(Math.random() * 2); // 7 or 8
                    const amMin = Math.floor(Math.random() * 59);
                    addTrip(d, amHour, amMin, homeStation, workStation);

                    // PM: Work -> Home
                    // Time: 4:30 - 7:00 PM (Peak)
                    const pmHour = 16 + Math.floor(Math.random() * 3); // 16-18
                    const pmMin = Math.floor(Math.random() * 59);
                    addTrip(d, pmHour, pmMin, workStation, homeStation);
                }
            }

            // 2. Random Other Trips (Any Day)
            const tripChance = isWeekend ? 0.6 : 0.2;

            if (Math.random() < tripChance) {
                // Pick a destination
                const dest = otherStations[Math.floor(Math.random() * otherStations.length)];

                // Determine Time
                let h, m = Math.floor(Math.random() * 59);
                if (Math.random() < 0.5) {
                    h = 10 + Math.floor(Math.random() * 5); // 10-14 (Off Peak)
                } else {
                    h = 20 + Math.floor(Math.random() * 3); // 20-22 (Off Peak)
                }

                // Go there
                addTrip(d, h, m, homeStation, dest);

                // Return trip
                let h2 = h + 2 + Math.floor(Math.random() * 2);
                if (h2 > 23) h2 = 23;

                addTrip(d, h2, Math.floor(Math.random() * 59), dest, homeStation);
            }
        }

        return trips;
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    function deduplicateTrips(trips) {
        const seen = new Set();
        return trips.filter(trip => {
            // Create a unique key for the trip
            // Use Date + Time + Balance + Description + Operator
            // Note: Seq # might not be unique across files if they overlap or are from different exports?
            // Actually Seq # should be unique per card, but let's be safe with content.
            const key = `${trip.date}-${trip.operator}-${trip.entry}-${trip.exit}-${trip.balance}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    function resolveFares(trips) {
        if (!typeof stationsData === 'undefined' || !stationsData.length || !faresData.length) {
            console.warn("Missing reference data:", { stations: typeof stationsData !== 'undefined' ? stationsData.length : 'undefined' });
            return trips;
        }

        return trips.map(trip => {
            // If it's a pass trip, we want to know the *full value* of the trip.
            // Even if it had a surcharge (cost > 0), the "value" is higher.
            if (trip.isPassTrip) {
                if (trip.operator === 'Metrorail') {
                    if (trip.entry && trip.exit) {
                        const fare = lookupFare(trip.entry, trip.exit, trip.date);
                        if (fare !== null) {
                            return { ...trip, cost: fare, isEstimated: false };
                        } else {
                            // Error already collected
                        }
                    }
                } else if (trip.operator === 'Metrobus') {
                    // ... same bus logic ...
                    let fare = 2.00;
                    if (trip.entry && trip.entry.toLowerCase().includes('express')) {
                        fare = 4.25;
                    }
                    return { ...trip, cost: fare, isEstimated: false };
                }
            }
            return trip;
        });
    }

    function lookupFare(entryName, exitName, dateStr) {
        // 1. Normalize names
        const entryStation = findStation(entryName);
        const exitStation = findStation(exitName);

        if (!entryStation || !exitStation) return null;

        // Handle same station entry/exit
        if (entryStation.Code === exitStation.Code) {
            return 0;
        }

        // 2. Find fare pair
        // faresData has { o: code, d: code, p: price, op: price }
        const fareInfo = faresData.find(f => f.o === entryStation.Code && f.d === exitStation.Code);

        if (!fareInfo) {
            stationErrors.add(`Fare not found: ${entryStation.Name} -> ${exitStation.Name}`);
            return null;
        }

        // 3. Determine Peak vs Off-Peak
        // This is complex. WMATA peak hours:
        // Weekdays: 5:00-9:30 AM, 3:00-7:00 PM
        // Weekends: Off-peak
        // We need to parse dateStr "MM/DD/YY HH:MM AM/PM"
        const date = new Date(dateStr); // This might not work reliably across browsers for "10/30/25 09:07 PM"
        // Better to parse manually or use a robust parser. 
        // Let's try a simple manual parse for the specific format if Date() fails, 
        // but usually modern JS handles "MM/DD/YY HH:MM AM/PM" okay-ish? 
        // Actually, "10/30/25" might be read as 1925 or 2025. 
        // Let's assume 20xx.

        const isPeak = checkPeak(date);
        return isPeak ? fareInfo.p : fareInfo.op;
    }

    function findStation(name) {
        if (!name) return null;
        const cleanName = name.toLowerCase().trim();
        // Try exact match first
        let station = stationsData.find(s => s.Name.toLowerCase() === cleanName);
        if (station) return station;

        // Get the station from the hardcoded override list

        if (stationOverrides[cleanName]) {
            return stationsData.find(s => s.Name === stationOverrides[cleanName]);
        }

        stationErrors.add(`Station not found: ${name}`);
        return null;
    }

    function displayErrors() {
        const errorSection = document.getElementById('error-section');
        const errorList = document.getElementById('error-list');

        if (stationErrors.size > 0) {
            errorList.innerHTML = '';
            stationErrors.forEach(err => {
                const li = document.createElement('li');
                li.textContent = err;
                errorList.appendChild(li);
            });

            // Add help text
            const helpText = document.createElement('p');
            helpText.style.marginTop = '12px';
            helpText.style.fontSize = '0.9rem';
            helpText.innerHTML = 'If you see a station error, please <a href="https://github.com/bgag2783/PassPicker/issues" target="_blank">submit an issue on GitHub</a> with your CSV file so we can fix it.';
            errorList.appendChild(helpText);

            errorSection.classList.remove('hidden');
        } else {
            errorSection.classList.add('hidden');
        }
    }

    function checkPeak(date) {
        const day = date.getDay(); // 0 = Sun, 6 = Sat
        if (day === 0 || day === 6) return false; // Weekend is off-peak

        const hour = date.getHours();
        const min = date.getMinutes();
        const time = hour + min / 60;

        // Peak: 5:00 - 9:30 (5.0 - 9.5)
        // Peak: 15:00 - 19:00 (15.0 - 19.0)
        if ((time >= 5 && time < 9.5) || (time >= 15 && time < 19)) {
            return true;
        }
        return false;
    }

    function parseCSV(text) {
        const lines = text.split('\n');
        const trips = [];

        // Headers: Seq. #,Time,Description,Operator,Entry Location/ Bus Route,Exit Location,Product,Rem. Rides,Change (+/-),Balance

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Regex to split by comma, ignoring commas in quotes
            const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));

            // Skip header
            if (columns[0] === 'Seq. #' || columns[0].includes('Seq')) continue;

            // Ensure enough columns (at least 9 for Change (+/-))
            if (columns.length < 9) continue;

            const time = columns[1];
            const description = columns[2];
            const operator = columns[3];
            const entryLoc = columns[4]; // Entry Location/ Bus Route
            const exitLoc = columns[5];  // Exit Location

            const product = columns[6] || "";
            const changeStr = columns[8];

            // Parse Cost
            let cost = 0;
            if (changeStr) {
                const cleanChange = changeStr.replace(/[$,()]/g, ''); // Remove $ , and ()
                const val = parseFloat(cleanChange);

                // In the CSV, negative numbers are often in parens like ($3.15) or just negative
                // We stripped parens, so check if original had parens or minus sign
                const isNegative = changeStr.includes('(') || changeStr.includes('-');

                if (isNegative && val > 0) {
                    cost = val;
                } else if (!isNegative && val === 0) {
                    cost = 0;
                } else {
                    // Positive value, likely reload or error correction
                    // But wait, sometimes 0.00 is a ride with a pass.
                    // If it's a ride (Entry/Exit) and cost is 0, it's 0.
                }
            }

            // Filter for rides
            // Logic:
            // If Metrorail: Count 'Exit' rows.
            // If Metrobus: Count 'Entry' rows.

            let isRide = false;

            if (operator === 'Metrorail' && description === 'Exit') {
                isRide = true;
            } else if (operator === 'Metrobus' && description === 'Entry') {
                isRide = true;
            }

            if (isRide) {
                const isPassTrip = product.toLowerCase().includes('pass') || product.toLowerCase().includes('monthly');

                trips.push({
                    date: time,
                    operator: operator,
                    entry: entryLoc,
                    exit: exitLoc,
                    cost: cost, // Initial cost from CSV (surcharge or full fare)
                    surcharge: isPassTrip ? cost : 0, // Store what was actually paid for this ride
                    product: product,
                    isPassTrip: isPassTrip
                });
            }
        }
        return trips;
    }

    function detectPassFromTrips(trips) {
        // Returns a map of "YYYY-M" -> passPrice
        const monthlyPasses = {};

        trips.forEach(trip => {
            // Check if this trip used a pass
            if (trip.product && trip.product.includes('Monthly Unlimited Pass')) {
                const match = trip.product.match(/\$(\d+\.\d{2})/);
                if (match) {
                    const price = parseFloat(match[1]);
                    const date = new Date(trip.date);
                    // Key by month of usage
                    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;

                    // Store/Overwrite (assuming same pass for whole month)
                    monthlyPasses[key] = price;
                }
            }
        });

        return monthlyPasses;
    }

    function calculateAndDisplayResults(trips) {
        // trips contains only rides
        const rideTrips = trips;

        // Detect passes per month
        const detectedPasses = detectPassFromTrips(trips);
        const hasAnyPass = Object.keys(detectedPasses).length > 0;

        // 1. Calculate actual spend (Pay As You Go + Inferred Pass Costs)
        let actualRideSpend = 0;
        rideTrips.forEach(t => {
            if (t.isPassTrip) {
                // For a pass trip, actual spend is just the surcharge paid
                actualRideSpend += (t.surcharge || 0);
            } else {
                actualRideSpend += t.cost;
            }
        });

        // Add inferred pass costs for months where a pass was detected
        // Pass Price (e.g. 2.25) is the level. Cost is Level * 32.
        const actualPassSpend = Object.values(detectedPasses).reduce((sum, level) => sum + (level * 32), 0);
        const totalActualSpend = actualRideSpend + actualPassSpend;

        // Pay As You Go Scenario (No Pass)
        // This is Sum(Full Fare for ALL rides).
        // `rideTrips` has resolved fares for pass trips.
        const payAsYouGoTotal = rideTrips.reduce((sum, t) => sum + t.cost, 0);

        // 2. Group trips by month
        const tripsByMonth = {};
        rideTrips.forEach(trip => {
            if (trip.date) {
                const d = new Date(trip.date);
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`; // YYYY-M
                if (!tripsByMonth[key]) tripsByMonth[key] = [];
                tripsByMonth[key].push(trip);
            }
        });

        const activeMonthsCount = Object.keys(tripsByMonth).length;

        // 3. Calculate optimal pass
        const passLevels = [
            2.25, 2.50, 2.75, 3.00, 3.25, 3.50, 3.75, 4.00,
            4.25, 4.50, 4.75, 5.00, 5.25, 5.50, 5.75, 6.00,
            6.25, 6.50, 6.75
        ];

        let bestOption = {
            type: 'none',
            level: 0,
            totalCost: payAsYouGoTotal
        };

        // Check each pass level
        passLevels.forEach(level => {
            const monthlyPassPrice = level * 32;
            let totalScenarioCost = 0;

            Object.values(tripsByMonth).forEach(monthTrips => {
                let monthSurcharges = 0;
                monthTrips.forEach(trip => {
                    if (trip.cost > level) {
                        monthSurcharges += (trip.cost - level);
                    }
                });
                totalScenarioCost += (monthlyPassPrice + monthSurcharges);
            });

            if (totalScenarioCost < bestOption.totalCost) {
                bestOption = {
                    type: 'pass',
                    level: level,
                    totalCost: totalScenarioCost
                };
            }
        });

        // 4. Determine Scenario and Message
        let message = "";
        let badgeClass = "neutral";
        let badgeText = "Info";

        if (!hasAnyPass) {
            if (bestOption.type === 'none') {
                message = "You are already saving the most by paying as you go. No pass needed.";
                badgeClass = "success";
                badgeText = "Keep As Is";
            } else {
                message = `You should buy the <strong>$${bestOption.level.toFixed(2)} Monthly Pass</strong>.`;
                badgeClass = "warning";
                badgeText = "Buy Pass";
            }
        } else {
            // User has a pass (or passes)
            // Compare Total Actual Spend vs Best Option
            const savings = totalActualSpend - bestOption.totalCost;

            if (bestOption.type === 'none') {
                message = "You are overspending on your pass. You should switch to <strong>Pay As You Go</strong>.";
                badgeClass = "warning";
                badgeText = "Cancel Pass";
            } else {
                // Determine if they should upgrade/downgrade/stay
                // This is tricky if they have different passes in different months.
                // Let's just compare the *recommended* level to their *most recent* or *average* pass?
                // Or just generic "Switch to X".

                // Let's find the most common pass level they bought?
                // Or just say "Switch to $X".

                if (savings > 1.00) { // Threshold for "Save Money"
                    message = `You can save money by switching to the <strong>$${bestOption.level.toFixed(2)} Monthly Pass</strong>.`;
                    badgeClass = "warning";
                    badgeText = "Switch Pass";
                } else {
                    message = "Perfect! You are using the optimal strategy.";
                    badgeClass = "success";
                    badgeText = "Keep As Is";
                }
            }
        }

        // 5. Update UI
        resultsSection.classList.remove('hidden');

        const savings = totalActualSpend - bestOption.totalCost;

        document.getElementById('main-message').innerHTML = message;
        document.getElementById('recommendation-badge').className = `badge ${badgeClass}`;
        document.getElementById('recommendation-badge').textContent = badgeText;

        document.getElementById('actual-spend').textContent = `$${totalActualSpend.toFixed(2)}`;
        document.getElementById('optimal-cost').textContent = `$${bestOption.totalCost.toFixed(2)}`;
        document.getElementById('savings').textContent = `$${Math.max(0, savings).toFixed(2)}`;

        const monthLabel = activeMonthsCount === 1 ? 'month' : 'months';

        document.getElementById('details-text').innerHTML = `
            Based on ${rideTrips.length} trips over ${activeMonthsCount} ${monthLabel}.<br>
            Pay-As-You-Go Total: $${payAsYouGoTotal.toFixed(2)}<br>
            Best Option: ${bestOption.type === 'none' ? 'Pay As You Go' : '$' + bestOption.level.toFixed(2) + ' Pass'}
        `;

        // Render Table
        // We need to pass the detected pass level for "Your Cost" column.
        // Since it varies by month, we should pass the map.
        renderTripTable(rideTrips, bestOption, detectedPasses);

        // Move focus to Share button for better workflow
        // Use timeout to ensure DOM update and smooth transition
        setTimeout(() => {
            const shareBtn = document.getElementById('share-btn');
            if (shareBtn) shareBtn.focus();
        }, 100);

        // Setup Toggle
        const btn = document.getElementById('view-details-btn');
        const container = document.getElementById('details-table-container');

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', () => {
            container.classList.toggle('hidden');
            newBtn.textContent = container.classList.contains('hidden') ? 'View Trip Details' : 'Hide Trip Details';
        });

        resultsSection.scrollIntoView({ behavior: 'smooth' });

        calculateAnalytics(rideTrips);

        // Generate Share Title
        let shareTitle = "PassPicker Results 🚇";
        if (activeMonthsCount === 1) {
            // "2025-10"
            const [year, month] = Object.keys(tripsByMonth)[0].split('-');
            const date = new Date(year, month - 1);
            const monthName = date.toLocaleString('default', { month: 'long' });
            shareTitle = `PassPicker Results for ${monthName} ${year} 🚇`;
        } else {
            shareTitle = `PassPicker Results for ${activeMonthsCount} months 🚇`;
        }

        // Store for sharing
        latestAnalysis = {
            shareTitle: shareTitle,
            savings: Math.max(0, savings),
            tripCount: rideTrips.length,
            recommendation: bestOption.type === 'none' ? 'Pay As You Go' : `$${bestOption.level.toFixed(2)} Pass`,
            totalSpend: totalActualSpend
        };

        renderMap(rideTrips);

        // 6. Break-Even Analysis
        const breakEvenSection = document.getElementById('break-even-section');
        const breakEvenBar = document.getElementById('break-even-bar');
        const breakEvenStatus = document.getElementById('break-even-status');
        const breakEvenText = document.getElementById('break-even-text');

        // Only show Break-Even for single month analysis to avoid confusion
        if (bestOption.type === 'pass' && activeMonthsCount === 1) {
            const passPrice = bestOption.level * 32; // This is monthly pass cost
            // Wait, bestOption.level is the "Pass Level" (e.g. $2.25). 
            // The monthly cost is level * 32. But wait, WMATA pricing is complex.
            // "Select a pass level... The cost is current pass level * 32".  Yes.

            const monthlyCost = bestOption.level * 32;
            const avgTripWithPass = bestOption.level; // Effectively capped at this? No.

            // To be simple: How many trips at *pay-as-you-go rates* does it take to equal the pass cost?
            // But trips have variable costs.
            // We should sum the trips in chronological order until we hit the pass cost.

            let cumulativeSpend = 0;
            let tripCount = 0;
            let breakEvenTripIndex = -1;

            // Sort trips by date
            const sortedTrips = [...rideTrips].sort((a, b) => new Date(a.date) - new Date(b.date));

            for (let i = 0; i < sortedTrips.length; i++) {
                cumulativeSpend += sortedTrips[i].cost;
                if (cumulativeSpend >= monthlyCost && breakEvenTripIndex === -1) {
                    breakEvenTripIndex = i + 1;
                }
            }

            const totalTrips = rideTrips.length;

            // If they haven't broken even yet
            if (breakEvenTripIndex === -1) {
                const remainingCost = monthlyCost - cumulativeSpend;
                // Estimate remaining trips needed based on average
                const avgTripCost = cumulativeSpend / totalTrips;
                const tripsNeeded = Math.ceil(remainingCost / avgTripCost);

                const progressPct = Math.min(100, (cumulativeSpend / monthlyCost) * 100);

                breakEvenBar.style.width = `${progressPct}%`;
                breakEvenBar.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
                breakEvenStatus.textContent = "Keep Riding";
                breakEvenStatus.className = "badge warning";
                breakEvenText.innerHTML = `You've taken <strong>${totalTrips}</strong> trips. You need about <strong>${tripsNeeded}</strong> more to break even on the $${bestOption.level.toFixed(2)} pass.`;
            } else {
                // They broke even (theoretically or actually)
                breakEvenBar.style.width = '100%';
                breakEvenBar.style.background = 'var(--success)';

                // Compare Actual Spend vs Optimal to see if they *actually* had the pass
                // We use a small threshold for floating point differences
                const actuallyHadPass = totalActualSpend <= (bestOption.totalCost + 1.0);

                if (actuallyHadPass) {
                    breakEvenStatus.textContent = "Money Saved!";
                    breakEvenStatus.className = "badge success";
                    breakEvenText.innerHTML = `Great job! You started saving money after trip <strong>#${breakEvenTripIndex}</strong>. Everything after was free bonus!`;
                } else {
                    breakEvenStatus.textContent = "Opportunity Missed";
                    breakEvenStatus.className = "badge warning";
                    breakEvenText.innerHTML = `With this pass, you would have broken even at trip <strong>#${breakEvenTripIndex}</strong>.`;
                }
            }
            breakEvenSection.classList.remove('hidden');
        } else {
            // Pay As You Go is best
            breakEvenSection.classList.add('hidden');
        }
    }

    function renderTripTable(trips, bestOption, detectedPasses) {
        const tbody = document.querySelector('#trip-details-table tbody');
        tbody.innerHTML = '';

        // Sort by date desc
        const sortedTrips = [...trips].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedTrips.forEach(trip => {
            const d = new Date(trip.date);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            const monthPassPrice = detectedPasses[key];

            // Determine "Your Cost" (Current)
            let yourCost = 0;
            if (trip.isPassTrip) {
                yourCost = trip.surcharge || 0;
            } else {
                yourCost = trip.cost;
            }

            // Determine "Optimal Cost" (Suggested)
            let optimalCost = 0;
            if (bestOption.type === 'none') {
                optimalCost = trip.cost; // Full fare
            } else {
                // Pass: You pay surcharge if fare > pass level
                optimalCost = Math.max(0, trip.cost - bestOption.level);
            }

            // Resolve proper station names
            const entryStation = findStation(trip.entry);
            const exitStation = findStation(trip.exit);
            const entryName = entryStation ? entryStation.Name : (trip.entry || '-');
            const exitName = exitStation ? exitStation.Name : (trip.exit || '-');

            const tr = document.createElement('tr');

            const dateStr = d.toLocaleDateString();
            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td>${entryName}</td>
                <td>${exitName}</td>
                <td class="cost-cell">$${trip.cost.toFixed(2)}</td>
                <td class="cost-cell">$${yourCost.toFixed(2)}</td>
                <td class="cost-cell ${optimalCost < yourCost ? 'highlight-cost' : ''}">$${optimalCost.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    let mapInstance = null;

    function renderMap(trips) {
        const mapSection = document.getElementById('map-section');
        mapSection.classList.remove('hidden');

        if (!mapInstance) {
            mapInstance = L.map('map').setView([38.8977, -77.0365], 11); // Center on DC
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(mapInstance);
        } else {
            // Clear existing layers if re-running
            mapInstance.eachLayer((layer) => {
                if (layer instanceof L.Marker || layer instanceof L.CircleMarker || layer instanceof L.Polyline) {
                    mapInstance.removeLayer(layer);
                }
            });
        }

        // Aggregate station visits
        const stationVisits = {};
        trips.forEach(t => {
            if (t.entry) stationVisits[t.entry] = (stationVisits[t.entry] || 0) + 1;
            if (t.exit) stationVisits[t.exit] = (stationVisits[t.exit] || 0) + 1;
        });

        // Plot Stations
        const markers = [];
        Object.entries(stationVisits).forEach(([name, count]) => {
            const station = findStation(name);
            if (station && station.Lat && station.Lon) {
                // Size marker based on visits (min 5, max 20)
                const radius = Math.min(20, Math.max(5, count * 1.5));

                const marker = L.circleMarker([station.Lat, station.Lon], {
                    radius: radius,
                    fillColor: "#007AFF",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.7
                }).addTo(mapInstance);

                marker.bindPopup(`<b>${station.Name}</b><br>${count} visits`);
                markers.push(marker);
            }
        });

        // Draw Lines for Trips
        // To avoid clutter, only draw unique paths with thickness based on frequency
        const paths = {};
        trips.forEach(t => {
            if (t.operator === 'Metrorail' && t.entry && t.exit) {
                const key = [t.entry, t.exit].sort().join('-'); // Undirected graph
                paths[key] = (paths[key] || 0) + 1;
            }
        });

        Object.entries(paths).forEach(([key, count]) => {
            const [name1, name2] = key.split('-');
            const s1 = findStation(name1);
            const s2 = findStation(name2);

            if (s1 && s2) {
                const weight = Math.min(5, Math.max(1, count * 0.5));
                L.polyline([[s1.Lat, s1.Lon], [s2.Lat, s2.Lon]], {
                    color: '#007AFF',
                    weight: weight,
                    opacity: 0.3
                }).addTo(mapInstance);
            }
        });

        // Fit bounds if we have markers
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            mapInstance.fitBounds(group.getBounds().pad(0.1));
        }

        // Invalidate size after a slight delay to ensure container is visible/sized
        setTimeout(() => {
            mapInstance.invalidateSize();
        }, 100);
    }

    function calculateAnalytics(trips) {
        // 1. Top Stations
        const stationCounts = {};
        trips.forEach(t => {
            if (t.entry) {
                const s = findStation(t.entry);
                const name = s ? s.Name : t.entry;
                stationCounts[name] = (stationCounts[name] || 0) + 1;
            }
            if (t.exit) {
                const s = findStation(t.exit);
                const name = s ? s.Name : t.exit;
                stationCounts[name] = (stationCounts[name] || 0) + 1;
            }
        });

        const sortedStations = Object.entries(stationCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const maxVisits = sortedStations[0] ? sortedStations[0][1] : 1;
        const topStationsList = document.getElementById('top-stations-list');
        topStationsList.innerHTML = '';

        sortedStations.forEach(([name, count]) => {
            const percentage = (count / maxVisits) * 100;
            const div = document.createElement('div');
            div.className = 'station-bar-item';
            div.innerHTML = `
                <div class="station-info">
                    <span>${name}</span>
                    <span>${count} visits</span>
                </div>
                <div class="progress-bg">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
            `;
            topStationsList.appendChild(div);
        });

        // 2. Peak vs Off-Peak
        let peakCount = 0;
        let offPeakCount = 0;
        trips.forEach(t => {
            if (t.operator === 'Metrorail' && t.date) {
                const date = new Date(t.date);
                if (checkPeak(date)) {
                    peakCount++;
                } else {
                    offPeakCount++;
                }
            }
        });

        const totalRailTrips = peakCount + offPeakCount;
        const peakPct = totalRailTrips > 0 ? (peakCount / totalRailTrips) * 100 : 0;
        const offPeakPct = totalRailTrips > 0 ? (offPeakCount / totalRailTrips) * 100 : 0;

        document.getElementById('peak-bar').style.width = `${peakPct}%`;
        document.getElementById('offpeak-bar').style.width = `${offPeakPct}%`;
        document.getElementById('peak-count').textContent = peakCount;
        document.getElementById('offpeak-count').textContent = offPeakCount;

        // 3. Spend Breakdown
        let railSpend = 0;
        let busSpend = 0;

        trips.forEach(t => {
            if (t.operator === 'Metrorail') railSpend += t.cost;
            else if (t.operator === 'Metrobus') busSpend += t.cost;
        });

        document.getElementById('rail-spend').textContent = `$${railSpend.toFixed(2)}`;
        document.getElementById('bus-spend').textContent = `$${busSpend.toFixed(2)}`;
        document.getElementById('total-spend-analytics').textContent = `$${(railSpend + busSpend).toFixed(2)}`;

        // Show section
        document.getElementById('analytics-section').classList.remove('hidden');

        // 4. Commuter Calendar Logic
        renderCalendar(trips);
    }

    let currentCalDate = new Date();
    let calendarTrips = [];

    function renderCalendar(trips) {
        if (trips) calendarTrips = trips;

        // Find date range to set initial view
        if (trips && trips.length > 0) {
            // Set to most recent trip month
            const dates = trips.map(t => new Date(t.date));
            currentCalDate = new Date(Math.max.apply(null, dates));
        }

        updateCalendarGrid();
    }

    function updateCalendarGrid() {
        const grid = document.getElementById('commuter-calendar');
        const label = document.getElementById('cal-month-label');
        grid.innerHTML = '';

        const year = currentCalDate.getFullYear();
        const month = currentCalDate.getMonth();

        label.textContent = currentCalDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay(); // 0-6

        // Add Day Headers
        const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        days.forEach(d => {
            const div = document.createElement('div');
            div.className = 'calendar-day-header';
            div.textContent = d;
            grid.appendChild(div);
        });

        // Add Empty Slots
        for (let i = 0; i < startDayOfWeek; i++) {
            const div = document.createElement('div');
            div.className = 'cal-day empty';
            grid.appendChild(div);
        }

        // Aggregate Trips per Day
        const dailyStats = {};
        calendarTrips.forEach(t => {
            const d = new Date(t.date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                const day = d.getDate();
                if (!dailyStats[day]) dailyStats[day] = { count: 0, cost: 0 };
                dailyStats[day].count++;

                // Use actual spend (surcharge for pass trips, full cost for others)
                const rideCost = t.isPassTrip ? (t.surcharge || 0) : t.cost;
                dailyStats[day].cost += rideCost;
            }
        });

        // Add Days
        for (let day = 1; day <= daysInMonth; day++) {
            const div = document.createElement('div');
            const stats = dailyStats[day] || { count: 0, cost: 0 };

            // Determine Level
            let level = 0;
            if (stats.count > 0) level = 1;
            if (stats.count > 2) level = 2; // Commute
            if (stats.count > 4) level = 3; // Heavy

            div.className = `cal-day level-${level}`;
            div.textContent = day;

            if (stats.count > 0) {
                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip';
                tooltip.innerHTML = `${stats.count} trips<br>$${stats.cost.toFixed(2)}`;
                div.appendChild(tooltip);
            }

            grid.appendChild(div);
        }

        // Update Buttons based on available months (Skip empty logic)
        const availableMonths = getAvailableMonths();

        const prevBtn = document.getElementById('cal-prev');
        const nextBtn = document.getElementById('cal-next');

        if (availableMonths.length <= 1) {
            prevBtn.style.visibility = 'hidden';
            nextBtn.style.visibility = 'hidden';
        } else {
            prevBtn.style.visibility = 'visible';
            nextBtn.style.visibility = 'visible';

            if (availableMonths.length > 0) {
                const currentMonthTime = new Date(year, month, 1).getTime();
                const currentIndex = availableMonths.findIndex(d => d.getTime() === currentMonthTime);

                // Determine if we can go Prev/Next
                const hasPrev = currentIndex > 0;
                const hasNext = currentIndex !== -1 && currentIndex < availableMonths.length - 1;

                prevBtn.disabled = !hasPrev;
                nextBtn.disabled = !hasNext;

                // Visual styling
                prevBtn.style.opacity = !hasPrev ? '0.3' : '1';
                nextBtn.style.opacity = !hasNext ? '0.3' : '1';
                prevBtn.style.cursor = !hasPrev ? 'default' : 'pointer';
                nextBtn.style.cursor = !hasNext ? 'default' : 'pointer';
            }
        }
    }

    function getAvailableMonths() {
        if (!calendarTrips || calendarTrips.length === 0) return [];
        const uniqueMonths = new Set();
        calendarTrips.forEach(t => {
            const d = new Date(t.date);
            uniqueMonths.add(`${d.getFullYear()}-${d.getMonth()}`);
        });

        return Array.from(uniqueMonths).map(str => {
            const [y, m] = str.split('-');
            return new Date(parseInt(y), parseInt(m), 1);
        }).sort((a, b) => a - b);
    }

    // Calendar Navigation
    document.getElementById('cal-prev').addEventListener('click', () => {
        if (document.getElementById('cal-prev').disabled) return;

        const availableMonths = getAvailableMonths();
        const currentMonthTime = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth(), 1).getTime();
        const currentIndex = availableMonths.findIndex(d => d.getTime() === currentMonthTime);

        if (currentIndex > 0) {
            currentCalDate = new Date(availableMonths[currentIndex - 1]);
            updateCalendarGrid();
        }
    });

    document.getElementById('cal-next').addEventListener('click', () => {
        if (document.getElementById('cal-next').disabled) return;

        const availableMonths = getAvailableMonths();
        const currentMonthTime = new Date(currentCalDate.getFullYear(), currentCalDate.getMonth(), 1).getTime();
        const currentIndex = availableMonths.findIndex(d => d.getTime() === currentMonthTime);

        if (currentIndex !== -1 && currentIndex < availableMonths.length - 1) {
            currentCalDate = new Date(availableMonths[currentIndex + 1]);
            updateCalendarGrid();
        }
    });


});

