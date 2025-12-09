# WMATA Pass Picker

A simple, private, and static web application to help Washington D.C. area commuters determine the most cost-effective WMATA Monthly Unlimited Pass based on their actual travel history.

## Features

*   **Privacy First**: All data processing happens locally in your browser. Your travel history is never uploaded to any server.
*   **Smart Analysis**: Parses your official SmarTrip CSV export(s) to calculate your exact spending.
*   **Multi-File Support**: Upload months of history at once. The app deduplicates trips and optimizes for long-term savings.
*   **Advanced Analysis Mode**: Inspect every trip in a detailed table view to compare your actual cost vs. the optimal pass cost.
*   **Usage Analytics**: Visualize your top stations, peak vs. off-peak travel habits, and spending breakdown (Rail vs. Bus).
*   **Interactive Map**: See your travel footprint on a map of the DC area, with markers for visited stations and lines showing your trips.
*   **Automated Fare Lookup**: Uses official WMATA fare data to calculate costs for trips covered by your existing pass.
*   **Intelligent Recommendations**: Analyzes 19 different pass levels to recommend the one that saves you the most money.

## How to Use

1.  **Export your history**: Log in to your [SmarTrip account](https://smartrip.wmata.com/) and export your card usage history as CSV files (e.g., one for each month).
2.  **Open the App**: Visit [bgag2783.github.io/PassPicker](https://bgag2783.github.io/PassPicker/).
3.  **Drag & Drop**: Drag your CSV file(s) onto the page. You can drop multiple files at once.
4.  **View Results**: Instantly see your actual spend, optimal pass cost, potential savings, and detailed analytics.

## Privacy & Technology

*   **Privacy Preserving Analytics**: Anonymous visit counting provided by GoatCounter (https://www.goatcounter.com/)
*   **Map Visualization**: Uses [Leaflet.js](https://leafletjs.com/) with CartoDB tiles. Map tiles are fetched from the internet, but your trip data is overlaid locally and never sent to the map provider.

## License

MIT
