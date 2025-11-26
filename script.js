document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file');
    const resultsSection = document.getElementById('results-section');
    const estimationSection = document.getElementById('estimation-section');
    const calculateBtn = document.getElementById('calculate-btn');
    const estimatedFareInput = document.getElementById('estimated-fare');
    const passDisplayArea = document.getElementById('pass-display-area');
    const detectedPassDisplay = document.getElementById('detected-pass-display');

    let currentTrips = [];
    let detectedPassLevel = 0; // 0 means no pass
    let stationsData = [];
    let faresData = [];
    let stationErrors = new Set();

    // Load reference data
    fetch('stations.json')
        .then(r => r.json())
        .then(data => stationsData = data)
        .catch(e => console.warn("Could not load stations.json", e));

    fetch('fares.json')
        .then(r => r.json())
        .then(data => faresData = data)
        .catch(e => console.warn("Could not load fares.json", e));

    // Drag and Drop Handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
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
            const detectedPass = detectPassFromTrips(allTrips);
            detectedPassLevel = detectedPass || 0;

            // Calculate Date Range
            const dates = allTrips.map(t => new Date(t.date));
            const minDate = new Date(Math.min.apply(null, dates));
            const maxDate = new Date(Math.max.apply(null, dates));
            const dateRangeStr = `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`;

            // Update Display
            passDisplayArea.style.display = 'block';

            let passInfoHtml = '';
            if (detectedPass) {
                passInfoHtml = `<span class="badge success">Auto-detected</span> $${detectedPass.toFixed(2)} Monthly Pass`;
            } else {
                passInfoHtml = `<span class="badge neutral">Auto-detected</span> No Active Pass (Pay As You Go)`;
            }

            detectedPassDisplay.innerHTML = `
                <div style="margin-bottom: 8px; font-size: 0.9em; color: #666;">
                    ${dateRangeStr} • ${fileList.length} file(s)
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
        if (!stationsData.length || !faresData.length) {
            console.warn("Missing reference data:", { stations: stationsData.length, fares: faresData.length });
            return trips;
        }

        return trips.map(trip => {
            if (trip.isPassTrip && trip.cost === 0) {
                if (trip.operator === 'Metrorail') {
                    if (trip.entry && trip.exit) {
                        const fare = lookupFare(trip.entry, trip.exit, trip.date);
                        if (fare !== null) {
                            return { ...trip, cost: fare, isEstimated: false };
                        } else {
                            // Error already collected in lookupFare or findStation
                        }
                    } else {
                        // console.warn("Trip missing entry/exit:", trip);
                    }
                } else if (trip.operator === 'Metrobus') {
                    // Default Metrobus fare is $2.00, Express is $4.25
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

        // Try fuzzy / mapping
        // CSV: "NoMa Gallaudet South" -> API: "NoMa-Gallaudet U"
        // CSV: "Dupont Circle N" -> API: "Dupont Circle"
        // CSV: "U Street-Cardozo" -> API: "U Street/African-Amer Civil War Memorial/Cardozo"

        // Simple heuristic: match if API name contains CSV name parts or vice versa
        // Or specific overrides
        const overrides = {
            "addison road": "Addison Road-Seat Pleasant",
            "arch-navy mem": "Archives-Navy Memorial-Penn Quarter",
            "archives-navy mem'l": "Archives-Navy Memorial-Penn Quarter",
            "ballston": "Ballston-MU",
            "ballston-mu": "Ballston-MU",
            "benning road": "Benning Road",
            "brookland": "Brookland-CUA",
            "capitol heights": "Capitol Heights",
            "capitol s": "Capitol South",
            "columbia hgts": "Columbia Heights",
            "downtown largo": "Downtown Largo",
            "dulles airport": "Washington Dulles International Airport",
            "dunn loring-merrifield": "Dunn Loring-Merrifield",
            "dupont circle n": "Dupont Circle",
            "dupont circle s": "Dupont Circle",
            "east falls church": "East Falls Church",
            "farragut n nw": "Farragut North",
            "farragut north": "Farragut North",
            "farragut west": "Farragut West",
            "fed center sw": "Federal Center SW",
            "fed triangle": "Federal Triangle",
            "foggy bottom": "Foggy Bottom-GWU",
            "frndshp hgts n": "Friendship Heights",
            "gal pl-chntwn n": "Gallery Pl-Chinatown",
            "gal pl-chntwn s": "Gallery Pl-Chinatown",
            "gal plc-chntn e": "Gallery Pl-Chinatown",
            "gal plc-chntn n": "Gallery Pl-Chinatown",
            "gal plc-chntn s": "Gallery Pl-Chinatown",
            "gal plc-chntn w": "Gallery Pl-Chinatown",
            "greensboro": "Greensboro",
            "grosvenor": "Grosvenor-Strathmore",
            "herndon": "Herndon",
            "huntington n": "Huntington",
            "huntington s": "Huntington",
            "innovation center": "Innovation Center",
            "judiciary sq w": "Judiciary Square",
            "l'enfant plaza w": "L'Enfant Plaza",
            "l'enfant plza": "L'Enfant Plaza",
            "l'enfant plza e": "L'Enfant Plaza",
            "l'enfant plza n": "L'Enfant Plaza",
            "l'enfant plza s": "L'Enfant Plaza",
            "l'enfant plza w": "L'Enfant Plaza",
            "largo town center": "Downtown Largo",
            "lenfant plaza": "L'Enfant Plaza",
            "mclean": "McLean",
            "mcpherson sq e": "McPherson Square",
            "medical center": "Medical Center",
            "metro center e": "Metro Center",
            "metro center n": "Metro Center",
            "metro center s": "Metro Center",
            "metro center w": "Metro Center",
            "morgan boulevard": "Morgan Boulevard",
            "mt vern sq-udc": "Mt Vernon Sq 7th St-Convention Center",
            "n bethesda": "North Bethesda",
            "nat airport n": "Ronald Reagan Washington National Airport",
            "nat airport s": "Ronald Reagan Washington National Airport",
            "navy yard e": "Navy Yard-Ballpark",
            "navy yard w": "Navy Yard-Ballpark",
            "noma gallaudet north": "NoMa-Gallaudet U",
            "noma gallaudet south": "NoMa-Gallaudet U",
            "potomac ave": "Potomac Ave",
            "prince georges plaza": "Hyattsville Crossing",
            "reston town center": "Reston Town Center",
            "rhode island ave": "Rhode Island Ave-Brentwood",
            "shaw-hwrd u n": "Shaw-Howard U",
            "shaw-hwrd u s": "Shaw-Howard U",
            "silver spring n": "Silver Spring",
            "silver spring s": "Silver Spring",
            "smithsonian n": "Smithsonian",
            "smithsonian s": "Smithsonian",
            "spring hill": "Spring Hill",
            "stadium-armory": "Stadium-Armory",
            "tysons corner": "Tysons",
            "u st-cardozo e": "U Street/African-Amer Civil War Memorial/Cardozo",
            "u st-cardozo w": "U Street/African-Amer Civil War Memorial/Cardozo",
            "u street-cardozo": "U Street/African-Amer Civil War Memorial/Cardozo",
            "udc-van ness": "Van Ness-UDC",
            "union stn e": "Union Station",
            "union stn n": "Union Station",
            "union stn s": "Union Station",
            "union stn w": "Union Station",
            "vienna/fairfax-gmu": "Vienna/Fairfax-GMU",
            "virginia sq-gmu": "Virginia Square-GMU",
            "w hyattsville": "West Hyattsville",
            "washington dulles international airport": "Washington Dulles International Airport",
            "west falls church-vt/uva": "West Falls Church",
            "white flint": "North Bethesda",
            "wiehle-reston east": "Wiehle-Reston East",
            "woodley park-zoo": "Woodley Park-Zoo/Adams Morgan"
        };

        if (overrides[cleanName]) {
            return stationsData.find(s => s.Name === overrides[cleanName]);
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
            const exitLoc = columns[5];  // Exit Location (Wait, header says Exit Location is col 5? Let's check)
            // Header: Seq. #,Time,Description,Operator,Entry Location/ Bus Route,Exit Location,Product...
            // 0: Seq, 1: Time, 2: Desc, 3: Op, 4: Entry, 5: Exit, 6: Product

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
                trips.push({
                    date: time,
                    operator: operator,
                    entry: entryLoc,
                    exit: exitLoc,
                    cost: cost,
                    product: product,
                    isPassTrip: (cost === 0 && product.toLowerCase().includes('pass'))
                });
            }
        }
        return trips;
    }

    function detectPassFromTrips(trips) {
        // Look for "Monthly Unlimited Pass $X.XX Price Point" in product column
        // If we find mixed signals, we might need a heuristic (e.g. most frequent)
        // But usually a file is for a month.

        // Note: The new file has "Monthly Unlimited Pass $4.50 Price Point" in the first line (Sale),
        // but then "Stored Value" for the rides.
        // Wait, the new file `Card_Usage...11.01.25-11.30.25.csv` (No Pass) has:
        // Line 2: "Monthly Unlimited Pass $4.50 Price Point" on a "Sale" transaction?
        // Ah, line 2 says: "Sale, WMATA POS... Monthly Unlimited Pass $4.50 Price Point"
        // Does this mean they BOUGHT a pass?
        // But the rides (lines 3-39) say "Stored Value" and have costs like ($3.15).
        // If they bought a pass on 11/25 (Line 2), then previous trips were Stored Value.
        // This is tricky. A user might buy a pass in the middle of the month.
        // However, the user said "It should also support users not having a pass, see the ... file for an example".
        // The example file shows "Stored Value" for almost all trips.
        // The one line with "Monthly Unlimited Pass" is a "Sale".

        // We should look at the TRIPS (isRide=true).
        // If the trips use "Stored Value", they are not using a pass for those trips.
        // If the trips use "Monthly Unlimited Pass...", they are.

        // Let's count pass trips vs stored value trips.
        let passTrips = 0;
        let storedValueTrips = 0;
        let detectedPrice = 0;

        for (const trip of trips) {
            if (trip.product && trip.product.includes('Monthly Unlimited Pass')) {
                passTrips++;
                const match = trip.product.match(/\$(\d+\.\d{2})/);
                if (match) {
                    detectedPrice = parseFloat(match[1]);
                }
            } else {
                storedValueTrips++;
            }
        }

        // If majority are pass trips, assume pass.
        // Or if we found a pass price on a trip, use it.
        if (passTrips > 0 && detectedPrice > 0) {
            return detectedPrice;
        }

        return null;
    }

    function calculateAndDisplayResults(trips) {
        const currentPassLevel = detectedPassLevel;
        const currentPassValue = currentPassLevel > 0 ? 'pass' : 'none';

        // 1. Calculate actual spend (Pay As You Go)
        const payAsYouGoTotal = trips.reduce((sum, trip) => sum + trip.cost, 0);

        // 2. Group trips by month
        const tripsByMonth = {};
        trips.forEach(trip => {
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
            // For this pass level, calculate total cost across all months
            // Total Cost = (Pass Price * Months) + Sum(Surcharges)

            // Note: If a month has NO trips, we shouldn't buy a pass for it?
            // The user said "easier for most users to just get one pass and keep renewing that one".
            // But if they didn't use it at all in a month, they probably wouldn't renew?
            // Let's assume they buy it for every month they have data for.

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
        let scenario = 0;
        let message = "";
        let badgeClass = "neutral";
        let badgeText = "Info";

        if (currentPassValue === 'none') {
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
            if (bestOption.type === 'none') {
                message = "You are overspending on your pass. You should switch to <strong>Pay As You Go</strong>.";
                badgeClass = "warning";
                badgeText = "Cancel Pass";
            } else {
                if (bestOption.level < currentPassLevel) {
                    message = `You can save money by downgrading to the <strong>$${bestOption.level.toFixed(2)} Monthly Pass</strong>.`;
                    badgeClass = "warning";
                    badgeText = "Downgrade";
                } else if (bestOption.level === currentPassLevel) {
                    message = "Perfect! You have the correct pass for your usage.";
                    badgeClass = "success";
                    badgeText = "Keep As Is";
                } else {
                    message = `You would actually save money by upgrading to the <strong>$${bestOption.level.toFixed(2)} Monthly Pass</strong> to avoid surcharges.`;
                    badgeClass = "warning";
                    badgeText = "Upgrade";
                }
            }
        }

        // 5. Update UI
        resultsSection.classList.remove('hidden');

        // Calculate savings
        let currentScenarioCost = 0;
        if (currentPassValue === 'none') {
            currentScenarioCost = payAsYouGoTotal;
        } else {
            // Current pass cost across all months
            const currentPassMonthlyPrice = currentPassLevel * 32;
            Object.values(tripsByMonth).forEach(monthTrips => {
                let monthSurcharges = 0;
                monthTrips.forEach(trip => {
                    if (trip.cost > currentPassLevel) {
                        monthSurcharges += (trip.cost - currentPassLevel);
                    }
                });
                currentScenarioCost += (currentPassMonthlyPrice + monthSurcharges);
            });
        }

        const savings = currentScenarioCost - bestOption.totalCost;

        document.getElementById('main-message').innerHTML = message;
        document.getElementById('recommendation-badge').className = `badge ${badgeClass}`;
        document.getElementById('recommendation-badge').textContent = badgeText;

        document.getElementById('actual-spend').textContent = `$${currentScenarioCost.toFixed(2)}`;
        document.getElementById('optimal-cost').textContent = `$${bestOption.totalCost.toFixed(2)}`;
        document.getElementById('savings').textContent = `$${savings.toFixed(2)}`;

        document.getElementById('details-text').innerHTML = `
            Based on ${trips.length} trips over ${activeMonthsCount} month(s).<br>
            Pay-As-You-Go Total: $${payAsYouGoTotal.toFixed(2)}<br>
            Best Option: ${bestOption.type === 'none' ? 'Pay As You Go' : '$' + bestOption.level.toFixed(2) + ' Pass'}
        `;

        // Render Table
        renderTripTable(trips, bestOption);

        // Setup Toggle
        const btn = document.getElementById('view-details-btn');
        const container = document.getElementById('details-table-container');

        // Remove old listener to avoid duplicates if re-run
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', () => {
            container.classList.toggle('hidden');
            newBtn.textContent = container.classList.contains('hidden') ? 'View Trip Details' : 'Hide Trip Details';
        });

        // Scroll to results
        resultsSection.scrollIntoView({ behavior: 'smooth' });

        // 5. Calculate Analytics
        calculateAnalytics(trips);

        // 6. Render Map
        renderMap(trips);
    }

    function renderTripTable(trips, bestOption) {
        const tbody = document.querySelector('#trip-details-table tbody');
        tbody.innerHTML = '';

        // Sort by date desc
        const sortedTrips = [...trips].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedTrips.forEach(trip => {
            // Determine "Your Cost" (Current)
            // If it was a pass trip, cost was 0. If PAYG, cost was trip.cost.
            // But wait, if we are simulating "Current Plan", we should use the detectedPassLevel logic?
            // The user wants "Cost with current plan".
            // If detectedPassLevel > 0, then trips <= level are 0.
            // If detectedPassLevel == 0, then trips are full fare.
            // Actually, `trip.cost` ALREADY reflects the cost they paid (or 0 if pass).
            // So `trip.cost` is "Your Cost".

            // Determine "Optimal Cost" (Suggested)
            let optimalCost = 0;
            if (bestOption.type === 'none') {
                // PAYG: You pay the full fare
                // We need the original fare. 
                // If trip.cost is 0 (pass), we need to know what the fare WOULD have been.
                // We resolved this in `resolveFares`. So `trip.cost` might be 0, but we might have stored the resolved fare?
                // Ah, `resolveFares` updates `trip.cost` ONLY if it was 0 and we found a fare.
                // Wait, if `trip.isPassTrip` was true, `resolveFares` UPDATES `trip.cost` to the fare value!
                // So `trip.cost` in `trips` array IS the resolved fare value now?
                // Let's check `resolveFares`.
                // Yes: `return { ...trip, cost: fare, isEstimated: false };`
                // So `trip.cost` is the FARE VALUE.

                // So "Your Cost" needs to be calculated based on `detectedPassLevel`.
                // "Optimal Cost" needs to be calculated based on `bestOption.level`.

                optimalCost = trip.cost; // Full fare
            } else {
                // Pass: You pay surcharge if fare > pass level
                optimalCost = Math.max(0, trip.cost - bestOption.level);
            }

            // Re-calculate "Your Cost" for display
            let yourCost = 0;
            if (detectedPassLevel > 0) {
                yourCost = Math.max(0, trip.cost - detectedPassLevel);
            } else {
                yourCost = trip.cost;
            }

            const tr = document.createElement('tr');

            // Date/Time Parsing
            const d = new Date(trip.date);
            const dateStr = d.toLocaleDateString();
            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td>${trip.entry || '-'}</td>
                <td>${trip.exit || '-'}</td>
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
    }
});
