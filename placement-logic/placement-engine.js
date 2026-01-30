/**
 * CampusPlacementEngine
 * Manages the "Bronze Package" logic: finding universities for qualified courses.
 * 
 * LOGIC FLOW:
 * 1. PHASE 1 (Subject Requirements): Check if student meets course-specific grade requirements
 * 2. PHASE 2 (Cutoff Comparison): Compare student's cluster points against 2024 cutoffs
 * 3. PHASE 3 (Campus Mapping): Map 7-digit codes to university names
 * 
 * CODE STRUCTURE:
 * - 7-digit code format: [4-digit campus ID][3-digit program ID]
 * - Example: 1263134 = 1263 (University of Nairobi) + 134 (Law)
 */
const CampusPlacementEngine = {
    data: {
        campuses: null,   // Campus ID -> { n: name, t: type }
        programs: null,   // Program ID -> { n: name, cl: cluster, req: requirements }
        placements: null  // Cluster ID -> { "campusIdprogramId": { c: cutoff, y: year } }
    },
    
    // Cache for cluster placements to avoid repeated lookups
    _placementCache: {},
    
    // Track initialization state
    _initialized: false,

    /**
     * Initialize by loading all JSON data files with caching
     */
    init: async function() {
        // Return cached data if already initialized
        if (this._initialized) {
            return true;
        }

        try {
            // Parallel fetch with timeout
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const [campuses, programsLookup, placements] = await Promise.all([
                fetch('/data/placements/campuses.json', { signal: controller.signal }).then(res => res.json()),
                fetch('/data/placements/programs-lookup.json', { signal: controller.signal }).then(res => res.json()),
                fetch('/data/placements/placements.json', { signal: controller.signal }).then(res => res.json())
            ]);
            clearTimeout(timeout);

            // Transform programs-lookup.json to flat programs structure (optimized)
            const programs = {};
            const clusterEntries = Object.entries(programsLookup.clusters || {});
            
            for (let i = 0; i < clusterEntries.length; i++) {
                const [clusterId, cluster] = clusterEntries[i];
                const subClusterEntries = Object.entries(cluster.subClusters || {});
                
                for (let j = 0; j < subClusterEntries.length; j++) {
                    const [subClusterId, subCluster] = subClusterEntries[j];
                    const courses = subCluster.courses || [];
                    
                    for (let k = 0; k < courses.length; k++) {
                        const course = courses[k];
                        if (course.c) {
                            programs[course.c] = {
                                n: course.n,
                                cl: parseInt(clusterId),
                                req: subCluster.requirements
                            };
                        }
                    }
                }
            }

            // Pre-cache cluster placements for faster lookup
            const placements_entries = Object.entries(placements);
            for (let i = 0; i < placements_entries.length; i++) {
                const [clusterId, clusterPlacements] = placements_entries[i];
                this._placementCache[clusterId] = clusterPlacements;
            }

            this.data.campuses = campuses;
            this.data.programs = programs;
            this.data.placements = placements;
            this._initialized = true;

            console.log('✓ CampusPlacementEngine: Data loaded (cached)');
            console.log(`  - Campuses: ${Object.keys(campuses).length} | Programs: ${Object.keys(programs).length}`);

            return true;
        } catch (error) {
            console.error('CampusPlacementEngine: Initialization failed', error);
            return false;
        }
    },

    /**
     * Main function to get all qualified universities and courses (optimized)
     * 
     * @param {Object} clusterPoints - From calculator: { "Cluster 1": 42.5, "Cluster 2": 38.2, ... }
     * @param {Object} studentGrades - From calculator: { mathematics: 'A', english: 'B+', ... }
     * @returns {Array} - Array of university objects with their qualified courses
     */
    getQualifiedUniversities: function(clusterPoints, studentGrades) {
        const startTime = performance.now();
        
        if (!this.data.campuses || !this.data.programs || !this.data.placements) {
            console.error('CampusPlacementEngine: Data not loaded. Call init() first.');
            return [];
        }

        const universityMap = new Map();

        // ============================================================
        // PHASE 1: Subject Requirement Check (optimized with for loop)
        // ============================================================
        const eligiblePrograms = {};
        const programIds = Object.keys(this.data.programs);
        
        for (let i = 0; i < programIds.length; i++) {
            const programId = programIds[i];
            const details = this.data.programs[programId];
            
            if (PlacementRules.isEligibleForProgram(studentGrades, details.req)) {
                eligiblePrograms[programId] = details;
            }
        }

        console.log(`✓ Phase 1: ${Object.keys(eligiblePrograms).length} eligible programs`);

        // ============================================================
        // PHASE 2 & 3: Cutoff Comparison + Campus Mapping (optimized)
        // ============================================================
        let totalMatches = 0;
        const eligibleIds = Object.keys(eligiblePrograms);
        
        for (let i = 0; i < eligibleIds.length; i++) {
            const programId = eligibleIds[i];
            const programDetails = eligiblePrograms[programId];
            const clusterId = programDetails.cl;
            const clusterKey = `Cluster ${clusterId}`;
            const studentPoints = clusterPoints[clusterKey];

            // Skip if no points for this cluster
            if (!studentPoints || studentPoints <= 0) continue;

            // Get cached cluster placements
            const clusterPlacements = this._placementCache[clusterId.toString()] || this.data.placements[clusterId.toString()];
            if (!clusterPlacements) continue;

            // Scan placements (optimized)
            const placementCodes = Object.keys(clusterPlacements);
            const suffix = programId;
            
            for (let j = 0; j < placementCodes.length; j++) {
                const fullCode = placementCodes[j];
                
                // Suffix matching
                if (!fullCode.endsWith(suffix)) continue;

                const data = clusterPlacements[fullCode];
                const cutoff = typeof data === 'object' ? data.c : data;
                const year = typeof data === 'object' ? (data.y || 2024) : 2024;

                // PHASE 2: Compare points
                if (studentPoints < cutoff) continue;

                totalMatches++;

                // PHASE 3: Campus Mapping
                const campusId = fullCode.substring(0, 4);
                const campus = this.data.campuses[campusId];

                if (!campus) continue;

                // Add to results (optimized)
                if (!universityMap.has(campusId)) {
                    universityMap.set(campusId, {
                        name: campus.n,
                        type: campus.t,
                        courses: []
                    });
                }

                universityMap.get(campusId).courses.push({
                    name: programDetails.n,
                    code: fullCode,
                    cutoff: cutoff,
                    year: year,
                    studentPoints: studentPoints.toFixed(2)
                });
            }
        }

        // Convert map to array and sort
        const results = Array.from(universityMap.values()).sort((a, b) => {
            // Public universities first
            if (a.type !== b.type) {
                return a.type === 'Public' ? -1 : 1;
            }
            // Then alphabetically
            return a.name.localeCompare(b.name);
        });

        const endTime = performance.now();
        console.log(`✓ Phase 2&3: ${totalMatches} matches | ${results.length} universities | ${(endTime - startTime).toFixed(0)}ms`);

        return results;
    }
};

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CampusPlacementEngine;
}
if (typeof window !== 'undefined') {
    window.CampusPlacementEngine = CampusPlacementEngine;
}
