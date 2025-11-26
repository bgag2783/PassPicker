# WMATA Pass Picker

A simple, private, and static web application to help Washington D.C. area commuters determine the most cost-effective WMATA Monthly Unlimited Pass based on their actual travel history.

## Features

*   **Privacy First**: All data processing happens locally in your browser. Your travel history is never uploaded to any server.
*   **Smart Analysis**: Parses your official SmarTrip CSV export to calculate your exact spending.
*   **Automated Fare Lookup**: Uses official WMATA fare data to calculate costs for trips covered by your existing pass, ensuring accurate savings estimates.
*   **Intelligent Recommendations**: Analyzes 19 different pass levels to recommend the one that saves you the most money.
*   **Edge Case Handling**: Correctly handles Metrobus transfers, same-station exits, and peak/off-peak pricing.

## How to Use

1.  **Export your history**: Log in to your [SmarTrip account](https://smartrip.wmata.com/) and export your card usage history as a CSV file.
2.  **Open the App**:
    *   **Local**: Run a local web server (e.g., `python3 -m http.server`) and open `http://localhost:8000`.
    *   **Web**: (Link to your GitHub Pages deployment if applicable)
3.  **Drag & Drop**: Drag your CSV file onto the page.
4.  **View Results**: Instantly see your actual spend, optimal pass cost, and potential savings.

## Development

### Prerequisites

*   Python 3 (for local server)

## License

MIT
