"""State -> grid-region mapping and name normalisation (single source of truth).

Regions follow the Central Electricity Authority (CEA) / Grid-India five regional grids.
Island UTs (Andaman & Nicobar, Lakshadweep) are not connected to any grid; they are
assigned to the region they are administratively reported with and flagged `island=True`.
"""
from __future__ import annotations

REGIONS = ["North", "West", "South", "East", "North-East"]

# canonical state name -> (region, short code)
STATES: dict[str, tuple[str, str]] = {
    # Northern grid
    "Chandigarh": ("North", "CH"),
    "Delhi": ("North", "DL"),
    "Haryana": ("North", "HR"),
    "Himachal Pradesh": ("North", "HP"),
    "Jammu and Kashmir": ("North", "JK"),
    "Ladakh": ("North", "LA"),
    "Punjab": ("North", "PB"),
    "Rajasthan": ("North", "RJ"),
    "Uttar Pradesh": ("North", "UP"),
    "Uttarakhand": ("North", "UK"),
    # Western grid
    "Chhattisgarh": ("West", "CG"),
    "Dadra and Nagar Haveli and Daman and Diu": ("West", "DD"),
    "Goa": ("West", "GA"),
    "Gujarat": ("West", "GJ"),
    "Madhya Pradesh": ("West", "MP"),
    "Maharashtra": ("West", "MH"),
    # Southern grid
    "Andhra Pradesh": ("South", "AP"),
    "Karnataka": ("South", "KA"),
    "Kerala": ("South", "KL"),
    "Lakshadweep": ("South", "LD"),
    "Puducherry": ("South", "PY"),
    "Tamil Nadu": ("South", "TN"),
    "Telangana": ("South", "TS"),
    # Eastern grid
    "Andaman and Nicobar": ("East", "AN"),
    "Bihar": ("East", "BR"),
    "Jharkhand": ("East", "JH"),
    "Odisha": ("East", "OD"),
    "Sikkim": ("East", "SK"),
    "West Bengal": ("East", "WB"),
    # North-Eastern grid
    "Arunachal Pradesh": ("North-East", "AR"),
    "Assam": ("North-East", "AS"),
    "Manipur": ("North-East", "MN"),
    "Meghalaya": ("North-East", "ML"),
    "Mizoram": ("North-East", "MZ"),
    "Nagaland": ("North-East", "NL"),
    "Tripura": ("North-East", "TR"),
}

ISLANDS = {"Andaman and Nicobar", "Lakshadweep"}

# spelling variants across sources -> canonical
ALIASES = {
    "Andaman And Nicobar Islands": "Andaman and Nicobar",
    "Andaman and Nicobar Islands": "Andaman and Nicobar",
    "A & N Islands": "Andaman and Nicobar",
    "Jammu And Kashmir": "Jammu and Kashmir",
    "J & K": "Jammu and Kashmir",
    "Jammu & Kashmir": "Jammu and Kashmir",
    "DNH": "Dadra and Nagar Haveli and Daman and Diu",
    "Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu",
    "Orissa": "Odisha",
}

# Census of India 2011 urban population share (%), by state/UT.
# Telangana and Andhra Pradesh are post-2014 bifurcation figures; Ladakh is a district-level estimate.
URBAN_PCT_2011 = {
    "Uttar Pradesh": 22.27, "Bihar": 11.29, "Maharashtra": 45.22, "West Bengal": 31.87,
    "Madhya Pradesh": 27.63, "Rajasthan": 24.87, "Tamil Nadu": 48.40, "Gujarat": 42.60,
    "Karnataka": 38.67, "Andhra Pradesh": 29.47, "Odisha": 16.69, "Telangana": 38.88,
    "Kerala": 47.70, "Jharkhand": 24.05, "Assam": 14.10, "Punjab": 37.48,
    "Chhattisgarh": 23.24, "Haryana": 34.88, "Delhi": 97.50, "Jammu and Kashmir": 26.11,
    "Uttarakhand": 30.23, "Himachal Pradesh": 10.03, "Tripura": 26.17, "Meghalaya": 20.07,
    "Manipur": 30.21, "Nagaland": 28.86, "Goa": 62.17, "Arunachal Pradesh": 22.94,
    "Puducherry": 68.33, "Mizoram": 52.11, "Chandigarh": 97.25, "Sikkim": 25.15,
    "Dadra and Nagar Haveli and Daman and Diu": 58.43, "Andaman and Nicobar": 37.70,
    "Ladakh": 84.0, "Lakshadweep": 78.07,
}


def canon(name: str) -> str:
    """Return canonical state name, raising on unknown names so mapping gaps fail loudly."""
    n = " ".join(str(name).replace("*", "").split())
    n = ALIASES.get(n, n)
    if n not in STATES:
        raise KeyError(f"Unknown state name: {name!r}")
    return n


def region_of(name: str) -> str:
    return STATES[canon(name)][0]
