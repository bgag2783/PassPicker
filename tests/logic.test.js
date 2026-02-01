
/**
 * @jest-environment jsdom
 */

// Load data files into global scope to simulate browser environment
// Note: We need to load them *before* script.js if script.js used them at top level.
// But script.js uses them inside functions, so standard require order is fine.

// Mock globals
global.stationsData = require('../stations.js');
global.faresData = require('../fares.js');
global.stationOverrides = require('../station_overrides.js');

const {
    checkPeak,
    lookupFare,
    findStation,
    parseCSV,
    detectPassFromTrips,
    resolveFares
} = require('../script.js');

describe('PassPicker Logic', () => {

    describe('checkPeak', () => {
        test('should return true for weekday peak hours', () => {
            // Monday 8:00 AM
            const d1 = new Date('2023-10-30T08:00:00');
            expect(checkPeak(d1)).toBe(true);

            // Monday 5:00 PM
            const d2 = new Date('2023-10-30T17:00:00');
            expect(checkPeak(d2)).toBe(true);
        });

        test('should return false for weekday off-peak hours', () => {
            // Monday 10:00 PM
            const d1 = new Date('2023-10-30T22:00:00');
            expect(checkPeak(d1)).toBe(false);

            // Monday 10:00 AM (Wait, 5AM-9:30PM is peak? No, broken split?)
            // script.js logic: if (time >= 5 && time < 21.5) -> 5:00 AM to 9:30 PM is ALL Peak?
            // WMATA usually has AM peak and PM peak and midday off-peak?
            // "Weekday Peak: 5:00 AM - 9:30 PM" comment says yes.
            // If that's the logic implemented, let's test that.

            // Monday 4:00 AM
            const d2 = new Date('2023-10-30T04:00:00');
            expect(checkPeak(d2)).toBe(false);
        });

        test('should return false for weekends', () => {
            // Saturday
            const d1 = new Date('2023-10-28T12:00:00');
            expect(checkPeak(d1)).toBe(false);

            // Sunday
            const d2 = new Date('2023-10-29T08:00:00');
            expect(checkPeak(d2)).toBe(false);
        });
    });

    describe('findStation', () => {
        test('should find station by exact name', () => {
            const station = findStation('Metro Center');
            expect(station).not.toBeNull();
            expect(station.Name).toBe('Metro Center');
            expect(['A01', 'C01']).toContain(station.Code); // Metro Center has multiple, station file usually lists one primary? 
            // Actually stations.js has entries for all codes. 'Metro Center' might appear twice.
            // find() returns first.
        });

        test('should find station by override name', () => {
            // "College Pk-U Md" -> "College Park-U of Md"
            const station = findStation('College Pk-U Md');
            expect(station).not.toBeNull();
            expect(station.Name).toBe('College Park-U of Md');
        });

        test('should return null for unknown station', () => {
            expect(findStation('Unknown Station')).toBeNull();
        });
    });

    describe('lookupFare', () => {
        test('should return fare for valid route', () => {
            // Metro Center (A01) to Union Station (B35) -> Red Line
            // Need to verify codes from data first if unsure, but let's trust logic
            const date = '2023-10-30 08:00 AM'; // Peak
            const fare = lookupFare('Metro Center', 'Union Station', date);
            expect(fare).toBeGreaterThan(0);
        });

        test('should return 0 for same station', () => {
            const date = '2023-10-30 08:00 AM';
            const fare = lookupFare('Metro Center', 'Metro Center', date);
            expect(fare).toBe(0);
        });
    });

    describe('parseCSV', () => {
        test('should parse valid CSV content', () => {
            const csv = `Seq. #,Time,Description,Operator,Entry Location/ Bus Route,Exit Location,Product,Rem. Rides,Change (+/-),Balance
1,10/30/23 08:00 AM,Exit,Metrorail,Metro Center,Union Station,,,"($2.25)",$10.00
2,10/30/23 07:30 AM,Entry,Metrorail,Metro Center,,,Use Pass,$0.00,$10.00`;

            // Note: Parser logic relies on looking ahead for Exits to find Entries.
            // Row 1 is Exit. Row 2 is Entry.
            // parseCSV iterates lines.
            // When it hits row 1 (Exit), it looks for Entry in subsequent lines.

            const trips = parseCSV(csv);
            expect(trips.length).toBe(1);
            expect(trips[0].entry).toBe('Metro Center');
            expect(trips[0].exit).toBe('Union Station');
            expect(trips[0].cost).toBe(2.25);
        });
    });

});
