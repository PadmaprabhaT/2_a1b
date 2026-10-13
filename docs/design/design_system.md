# StaySpot — Design System

## 1. Design Direction

StaySpot uses a clean, modern property-management dashboard style. The interface prioritises readability, consistent navigation, and easy access to booking, transaction, property and performance information.

The visual style uses a balanced, spacious layout inspired by modern SaaS dashboards. All screens share the same navigation, typography, colour palette and reusable components.

## 2. Colour Palette

- Primary colour: Forest Green — `#173F35`
- Secondary colour: Sage Green — `#DCE9E2`
- Page background: Warm White — `#F7F6F2`
- Card background: White — `#FFFFFF`
- Primary text: Dark Charcoal — `#252A28`
- Secondary text: Grey — `#68736D`
- Borders: Subtle neutral grey
- Success state: Green
- Warning state: Amber
- Error state: Red

Status indicators should use both colour and text or icons so that meaning is not communicated by colour alone.

## 3. Typography

Use Inter or a similar sans-serif font.

- Page headings: Bold or semibold
- Section headings: Semibold
- Body text: Regular
- Labels and supporting information: Smaller text with sufficient contrast
- Numeric values: Clear and easy to scan

Maintain consistent text sizes and hierarchy across all screens.

## 4. Layout and Navigation

- Use a fixed sidebar approximately 240px wide on desktop.
- Include the StaySpot logo and navigation links for Browse, Booking, Wallet & Audit Trail, Analytics, Search Hotspots, and Reviews & Amenities.
- Highlight the active navigation item using the sage-green background and forest-green text.
- Use a top header containing the breadcrumb, relevant page information, and contextual actions.
- Keep the main content area spacious, with consistent margins and aligned cards, charts and tables.
- Use responsive layouts for laptop and smaller mobile screens.

The page title, breadcrumb, active sidebar item and page content must always match.

## 5. Reusable Components

- Sidebar and top header
- Navigation items and breadcrumbs
- Buttons and action links
- Search bars, filters and dropdowns
- Forms and date selectors
- Data tables with pagination
- Property cards
- Metric and summary cards
- Status badges
- Chart containers and legends
- Map markers and nearby-result cards
- Review cards and amenity items
- Loading skeletons
- Empty-state messages
- Error alerts and retry actions
- Success notifications and toast messages

Reusable components should have consistent spacing, borders, typography and interaction styling.

## 6. Screen-Specific Design Guidelines

### Browse

Use property cards for the Properties view and appropriate tables for Guests and Bookings. Include search, filters, availability statuses, property details and pagination where relevant.

### Booking

Use clearly separated sections for property selection, stay details, guest and wallet information, and the reservation summary. Display booking status and confirmation feedback clearly.

### Wallet & Audit Trail

Use summary cards for wallet information and transaction totals. Separate wallet transactions from audit records, with readable tables, timestamps, amounts and statuses where supported.

### Analytics

- Use metric cards for summary values from the materialized view.
- Use a line chart for the seven-day moving average of revenue per property.
- Use a ranked table for property performance rankings based on `DENSE_RANK()`.
- Display the materialized view's last-refreshed timestamp beside the refresh action.
- Provide distinct Loading, Empty, Error and Success designs.
- Show refresh-success feedback only after a successful refresh.

The Analytics SVGs should not include the prototype state-switcher bar. Each state is documented in a separate SVG file.

### Search Hotspots

Use a map-style visualisation with a selected origin, 5km search radius, numbered markers and a nearby-results list sorted by distance. Clearly label illustrative map content until connected to the actual geospatial workflow.

### Reviews & Amenities

Use summary cards, a rating-distribution chart, top review tags, review cards and an amenities panel. Keep the review analytics and amenity information visually distinct.

## 7. Data Presentation

- Use illustrative sample data for design previews only.
- Clearly label illustrative values as sample data, not live database records.
- Do not present placeholder values as actual database results.
- Preserve the distinction between PostgreSQL-based workflows and MongoDB-based workflows.
- Use clear labels, timestamps, units and status descriptions where relevant.
- Ensure charts and tables remain readable and do not overlap or clip content.

## 8. Loading, Empty, Error and Success States

- **Loading:** Keep the page structure visible and use skeleton placeholders for pending data.
- **Empty:** Explain that no records are available and provide a useful next action where appropriate.
- **Error:** Display a concise error message and a Retry action.
- **Success:** Display the returned data and relevant confirmation feedback.
- **Refresh success:** Show a success notification only after the refresh operation succeeds.

The same navigation, typography and layout should remain consistent across the different states.

## 9. Usability Guidelines

- Maintain consistent spacing, colours and typography.
- Use clear labels and meaningful error messages.
- Ensure sufficient colour contrast.
- Do not rely on colour alone to communicate status.
- Keep tables readable and provide suitable pagination.
- Make actions visually distinguishable from informational content.
- Preserve a consistent visual hierarchy across screens.
- Design for both desktop and smaller mobile viewports.

## 10. Implementation Note

The SVG files under `docs/design/wireframes/` are visual design references. They document the intended layout and appearance but do not provide working database connections or functional controls.

The frontend should recreate these designs using the project's frontend framework and connect to the existing API. Actual data, loading states, empty states, errors and refresh notifications should reflect real API responses rather than the illustrative values used in the designs.