# University Placement System Implementation Plan (Refined)

This document outlines the architecture for the independent university placement and campus lookup system, designed to work separately from the main eligibility engine to ensure high reliability and easy maintenance.

## 1. Objective
Enable students to see exactly which **campuses** they qualify for based on:
- Official 2024 university cutoffs.
- Historical data (the year a course was last offered).
- Independent subject requirement checks (Cluster 1–20).

## 2. Refined Data Structure
The system uses three primary JSON files in `data/placements/`, optimized for fast lookups.

### 2.1. `campuses.json`
Connects the 4-digit campus prefix to university details.
- **Key:** `"1263"` (e.g., University of Nairobi)
- **Value:** `{ "n": "University of Nairobi", "t": "Public" }`

### 2.2. `programs.json` (The Source of Truth)
Contains the unique 3 or 4 digit program codes and their specific requirements.
- **Key:** `"101"` (Short Course Code)
- **Value:** 
  ```json
  {
    "n": "Bachelor of Medicine & Surgery",
    "cl": 13,
    "req": {
      "subject1": { "name": "BIO", "min": "B" },
      "subject2": { "name": "CHE", "min": "B" },
      "subject3": { "name": "MAT/PHY/GEO", "min": "C+" },
      "subject4": { "name": "ENG/KIS/HSC/..." }
    }
  }
  ```

### 2.3. `placements.json`
Stores the actual cutoffs and historical context, indexed by Cluster to prevent lag.
- **Key:** Cluster ID (`"1"` to `"20"`)
- **Structure:**
  ```json
  {
    "13": {
      "1263101": { "cutoff": 44.5, "year": 2022 },
      "1111101": { "cutoff": 43.2, "year": 2023 }
    }
  }
  ```
- **Logic:** `1263` (Campus) + `101` (Program) = `1263101`.

## 3. Independent Logic Flow
The `placement-logic/` folder contains the engine. It replicates the main calculator's rules but operates on its own data.

1. **Calculate Cluster Points:** The system calculates points for Clusters 1–20 using the standard formula.
2. **Filter Eligible Programs:** `placement-rules.js` checks every program in `programs.json` against the student's grades.
3. **Map to Campuses:** For every eligible program ID (e.g., `101`), `placement-engine.js` finds all keys in `placements.json` that end with those digits.
4. **Final Cutoff Check:** If `Student Cluster Points >= Cutoff`, the university and course are added to the "Qualified" list.
5. **Display:** Shows the University Name, Course, Cutoff, and the Year it was last offered.

## 4. Implementation Strategy (Phase 1)
- **Test Set:** Focus on Clusters 1 (Law) and 2 (Business).
- **Independence:** Ensure no imports from `assets/js/...` to prevent global breakage.
- **Data Prep:** Transition `placements.json` from a flat number value to an object `{ "cutoff": X, "year": Y }`.

