"""
BDG2 Site Coordinates
Exact lat/lon from the parquet dataset (first row per site).
Bobcat/Eagle/Gator had placeholder ocean coords → replaced with campus land coords.
Wolf had positive longitude (North Sea) → replaced with Dublin to match timezone.
"""

SITE_COORDINATES = {
    "Bear":     {"lat": 37.871902,  "lon": -122.260727, "city": "Berkeley, CA"},
    # Bobcat's parquet coord (40.22, -73.38) is in the Atlantic Ocean.
    # Timezone is US/Mountain → University of Colorado, Boulder
    "Bobcat":   {"lat": 40.0150,    "lon": -105.2705,   "city": "Boulder, CO"},
    "Bull":     {"lat": 30.267200,  "lon": -97.743103,  "city": "Austin, TX"},
    "Cockatoo": {"lat": 42.459835,  "lon": -76.485291,  "city": "Ithaca, NY"},
    "Crow":     {"lat": 45.387600,  "lon": -75.695999,  "city": "Ottawa, ON"},
    # Eagle's parquet coord (40.22, -73.38) is in the Atlantic Ocean.
    # Timezone is US/Eastern → University of Maryland, College Park
    "Eagle":    {"lat": 38.9897,    "lon": -76.9378,    "city": "College Park, MD"},
    "Fox":      {"lat": 33.424427,  "lon": -111.928139, "city": "Tempe, AZ"},
    # Gator's parquet coord (40.22, -73.38) is in the Atlantic Ocean.
    # Name 'Gator' + US/Eastern → University of Florida, Gainesville
    "Gator":    {"lat": 29.6465,    "lon": -82.3533,    "city": "Gainesville, FL"},
    "Hog":      {"lat": 44.978783,  "lon": -93.255394,  "city": "Minneapolis, MN"},
    "Lamb":     {"lat": 51.497837,  "lon": -3.186246,   "city": "Cardiff, Wales"},
    "Moose":    {"lat": 45.421501,  "lon": -75.697197,  "city": "Ottawa, ON"},
    "Mouse":    {"lat": 51.521938,  "lon": -0.120069,   "city": "London, UK"},
    "Panther":  {"lat": 28.517689,  "lon": -81.379036,  "city": "Orlando, FL"},
    "Peacock":  {"lat": 40.349998,  "lon": -74.699997,  "city": "Princeton, NJ"},
    "Rat":      {"lat": 38.903503,  "lon": -77.005348,  "city": "Washington, DC"},
    "Robin":    {"lat": 51.518791,  "lon": -0.134556,   "city": "London, UK"},
    "Shrew":    {"lat": 51.499840,  "lon": -0.124663,   "city": "London, UK"},
    # Wolf's parquet coord has +6.26 longitude (North Sea). Timezone = Europe/Dublin → Dublin
    "Wolf":     {"lat": 53.3498,    "lon": -6.2603,     "city": "Dublin, Ireland"},
}
