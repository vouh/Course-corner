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

    /**
     * Initialize by loading all JSON data files
     */
    init: async function() {
        try {
            const [campuses, programsLookup, placements] = await Promise.all([
                fetch('/data/placements/campuses.json').then(res => res.json()),
                fetch('/data/placements/programs-lookup.json').then(res => res.json()),
                fetch('/data/placements/placements.json').then(res => res.json())
            ]);

            // Transform programs-lookup.json to flat programs structure
            const programs = {};
            Object.entries(programsLookup.clusters || {}).forEach(([clusterId, cluster]) => {
                Object.entries(cluster.subClusters || {}).forEach(([subClusterId, subCluster]) => {
                    (subCluster.courses || []).forEach(course => {
                        if (course.c) {  // Only if program code exists
                            programs[course.c] = {
                                n: course.n,      // name
                                cl: parseInt(clusterId),  // cluster
                                req: subCluster.requirements  // requirements
                            };
                        }
                    });
                });
            });

            this.data.campuses = campuses;
            this.data.programs = programs;
            this.data.placements = placements;

            console.log('CampusPlacementEngine: Data loaded successfully');
            console.log(`  - Campuses: ${Object.keys(campuses).length}`);
            console.log(`  - Programs: ${Object.keys(programs).length}`);
            console.log(`  - Sample programs:`, Object.keys(programs).slice(0, 5).map(k => `${k}: ${programs[k].n}`));
            console.log(`  - Clusters with placements: ${Object.keys(placements).length}`);

            return true;
        } catch (error) {
            console.error('CampusPlacementEngine: Initialization failed', error);
            return false;
        }
    },

    /**
     * Main function to get all qualified universities and courses
     * 
     * @param {Object} clusterPoints - From calculator: { "Cluster 1": 42.5, "Cluster 2": 38.2, ... }
     * @param {Object} studentGrades - From calculator: { mathematics: 'A', english: 'B+', ... }
     * @returns {Array} - Array of university objects with their qualified courses
     */
    getQualifiedUniversities: function(clusterPoints, studentGrades) {
        if (!this.data.campuses || !this.data.programs || !this.data.placements) {
            console.error('CampusPlacementEngine: Data not loaded. Call init() first.');
            return [];
        }

        console.log('--- Starting Placement Engine ---');
        console.log('Student Grades:', studentGrades);
        console.log('Cluster Points:', clusterPoints);

        const universityMap = new Map();

        // ============================================================
        // PHASE 1: Subject Requirement Check
        // Find all programs the student is eligible for based on grades
        // ============================================================
        const eligiblePrograms = {};  // { programId: programDetails }
        
        Object.entries(this.data.programs).forEach(([programId, details]) => {
            const isEligible = PlacementRules.isEligibleForProgram(studentGrades, details.req);
            if (isEligible) {
                eligiblePrograms[programId] = details;
            }
        });

        console.log(`Phase 1: ${Object.keys(eligiblePrograms).length} programs passed subject requirements`);
        if (Object.keys(eligiblePrograms).length > 0) {
            console.log(`  - Sample eligible programs:`, Object.keys(eligiblePrograms).slice(0, 5).map(k => `${k}: ${eligiblePrograms[k].n}`));
        } else {
            console.warn('  ⚠ No eligible programs found! Check student grades vs requirements.');
        }

        // ============================================================
        // PHASE 2 & 3: Cutoff Comparison + Campus Mapping
        // For each eligible program, check if student meets the cutoff
        // ============================================================
        let totalMatches = 0;
        Object.entries(eligiblePrograms).forEach(([programId, programDetails]) => {
            const clusterId = programDetails.cl;
            const clusterKey = `Cluster ${clusterId}`;
            const studentPoints = clusterPoints[clusterKey];

            // Skip if student has no points for this cluster
            if (!studentPoints || studentPoints <= 0) {
                console.log(`  Program ${programId} (${programDetails.n}): No cluster ${clusterId} points`);
                return;
            }

            // Get all placements for this cluster
            const clusterPlacements = this.data.placements[clusterId.toString()];
            if (!clusterPlacements) {
                console.log(`  Program ${programId}: No placements found for cluster ${clusterId}`);
                return;
            }

            let programMatches = 0;
            // Scan placement codes for this program
            // Code format: 4-digit campus + 3-digit program = 7 digits total
            Object.entries(clusterPlacements).forEach(([fullCode, data]) => {
                // Check if this code ends with the program ID (suffix matching)
                if (!fullCode.endsWith(programId)) {
                    return;
                }

                // Extract cutoff and year
                const cutoff = typeof data === 'object' ? data.c : data;
                const year = typeof data === 'object' ? (data.y || 2024) : 2024;

                // PHASE 2: Compare points
                if (studentPoints < cutoff) {
                    return; // Student doesn't meet cutoff
                }

                programMatches++;
                totalMatches++;

                // PHASE 3: Campus Mapping
                // Extract campus ID (first 4 digits of 7-digit code)
                const campusId = fullCode.substring(0, 4);
                const campus = this.data.campuses[campusId];

                if (!campus) {
                    console.warn(`Campus ID ${campusId} not found in campuses.json`);
                    return;
                }

                // Add to results
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
            });
            if (programMatches > 0) {
                console.log(`  Program ${programId}: ${programMatches} universities qualified`);
            }
        });

        // Convert map to array and sort
        const results = Array.from(universityMap.values()).sort((a, b) => {
            // Public universities first
            if (a.type !== b.type) {
                return a.type === 'Public' ? -1 : 1;
            }
            // Then alphabetically
            return a.name.localeCompare(b.name);
        });

        console.log(`Phase 2 & 3: ${totalMatches} total matches across ${results.length} universities qualified`);
        console.log('--- Placement Engine Complete ---');

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
