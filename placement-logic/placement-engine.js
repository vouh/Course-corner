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
    
    // Store raw programs-lookup for Phase 1 subcluster matching
    _programsLookup: null,
    
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

            const [campuses, programsLookup, placements, programsRef] = await Promise.all([
                fetch('/data/placements/campuses.json', { signal: controller.signal }).then(res => res.json()),
                fetch('/data/placements/programs-lookup.json', { signal: controller.signal }).then(res => res.json()),
                fetch('/data/placements/placements.json', { signal: controller.signal }).then(res => res.json()),
                fetch('/data/placements/programs.json', { signal: controller.signal }).then(res => res.json())
            ]);
            clearTimeout(timeout);

            // Store raw programs-lookup for Phase 1 subcluster matching
            this._programsLookup = programsLookup;
            
            // Store programs.json as reference for program names (fallback lookup)
            this._programsRef = programsRef;

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
            console.log(`  - Campuses: ${Object.keys(campuses).length} | Programs: ${Object.keys(programs).length} | ProgramsRef: ${Object.keys(programsRef).length}`);

            return true;
        } catch (error) {
            console.error('CampusPlacementEngine: Initialization failed', error);
            return false;
        }
    },

    /**
     * Get program name from programs.json reference (fallback lookup)
     * @param {string} programCode - The 3-digit program code
     * @returns {string|null} - Program name or null if not found
     */
    getProgramName: function(programCode) {
        if (this._programsRef && this._programsRef[programCode]) {
            return this._programsRef[programCode].n;
        }
        return null;
    },

    /**
     * Get program cluster from programs.json reference
     * @param {string} programCode - The 3-digit program code
     * @returns {number|null} - Cluster number or null if not found
     */
    getProgramCluster: function(programCode) {
        if (this._programsRef && this._programsRef[programCode]) {
            return this._programsRef[programCode].c;
        }
        return null;
    },

    /**
     * Main function to get all qualified universities and courses (optimized)
     * 
     * CORRECT LOGIC:
     * Phase 1: Collect ALL courses from ALL subClusters that student qualifies for
     * Phase 2: Filter by cluster points cutoff
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
        // PHASE 1: Collect courses from qualifying subClusters
        // For each subCluster, check if student qualifies
        // Collect ALL courses from qualifying subClusters by cluster
        // ============================================================
        const coursesByCluster = {};  // { clusterId: { programCode: courseInfo, ... }, ... }
        
        // Get cluster data from programs-lookup
        const clusterNodes = this._programsLookup?.clusters || {};
        const clusterIds = Object.keys(clusterNodes);
        
        for (let i = 0; i < clusterIds.length; i++) {
            const clusterId = clusterIds[i];
            const cluster = clusterNodes[clusterId];
            const subClusters = cluster.subClusters || {};
            const subClusterIds = Object.keys(subClusters);
            
            coursesByCluster[clusterId] = {};
            
            // Check each subCluster
            for (let j = 0; j < subClusterIds.length; j++) {
                const subClusterId = subClusterIds[j];
                const subCluster = subClusters[subClusterId];
                const requirements = subCluster.requirements || {};
                
                // Check if student qualifies for this subCluster
                const qualifies = PlacementRules.isEligibleForProgram(studentGrades, requirements);
                
                if (qualifies) {
                    // Add all courses from this qualifying subCluster to the cluster pool
                    const courses = subCluster.courses || [];
                    for (let k = 0; k < courses.length; k++) {
                        const course = courses[k];
                        if (course.c) {  // Has program code
                            coursesByCluster[clusterId][course.c] = {
                                n: course.n,
                                cl: parseInt(clusterId)
                            };
                        }
                    }
                }
            }
        }

        // Count total qualifying courses
        let totalQualifyingCourses = 0;
        Object.values(coursesByCluster).forEach(courses => {
            totalQualifyingCourses += Object.keys(courses).length;
        });
        console.log(`✓ Phase 1: ${totalQualifyingCourses} courses from qualifying subClusters`);

        // ============================================================
        // PHASE 2 & 3: Cutoff Comparison + Campus Mapping
        // Now use cluster points (not subcluster) to match against cutoffs
        // ============================================================
        let totalMatches = 0;
        
        const clusterIdsToProcess = Object.keys(coursesByCluster);
        for (let i = 0; i < clusterIdsToProcess.length; i++) {
            const clusterId = clusterIdsToProcess[i];
            const coursesInCluster = coursesByCluster[clusterId];
            const programIds = Object.keys(coursesInCluster);
            
            const clusterKey = `Cluster ${clusterId}`;
            const studentPoints = clusterPoints[clusterKey];

            // Skip if no points for this cluster
            if (!studentPoints || studentPoints <= 0) continue;

            // Get cached cluster placements
            const clusterPlacements = this._placementCache[clusterId.toString()] || this.data.placements[clusterId.toString()];
            if (!clusterPlacements) continue;

            // Track which program codes we've already matched from programs-lookup
            const matchedProgramCodes = new Set();

            // For each program in this cluster, check placements
            for (let k = 0; k < programIds.length; k++) {
                const programId = programIds[k];
                const courseInfo = coursesInCluster[programId];
                matchedProgramCodes.add(programId);
                
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

                    // PHASE 2: Compare cluster points against cutoff
                    if (studentPoints < cutoff) continue;

                    totalMatches++;

                    // PHASE 3: Campus Mapping
                    const campusId = fullCode.substring(0, 4);
                    const campus = this.data.campuses[campusId];

                    if (!campus) continue;

                    // Add to results
                    if (!universityMap.has(campusId)) {
                        universityMap.set(campusId, {
                            name: campus.n,
                            type: campus.t,
                            courses: []
                        });
                    }

                    universityMap.get(campusId).courses.push({
                        name: courseInfo.n,
                        code: fullCode,
                        cutoff: cutoff,
                        year: year,
                        studentPoints: studentPoints.toFixed(2)
                    });
                }
            }
            
            // FALLBACK PASS: Use programs.json for courses in placements but not in programs-lookup
            // This catches courses that exist in placements but weren't defined in programs-lookup
            const placementCodes = Object.keys(clusterPlacements);
            for (let j = 0; j < placementCodes.length; j++) {
                const fullCode = placementCodes[j];
                const programCode = fullCode.slice(-3); // Last 3 digits
                
                // Skip if already matched from programs-lookup
                if (matchedProgramCodes.has(programCode)) continue;
                
                // Check if this program belongs to this cluster using programs.json
                const refCluster = this.getProgramCluster(programCode);
                if (refCluster !== parseInt(clusterId)) continue;
                
                const data = clusterPlacements[fullCode];
                const cutoff = typeof data === 'object' ? data.c : data;
                const year = typeof data === 'object' ? (data.y || 2024) : 2024;
                
                // Compare points
                if (studentPoints < cutoff) continue;
                
                // Get program name from reference
                const programName = this.getProgramName(programCode);
                if (!programName) continue;
                
                totalMatches++;
                
                // Campus mapping
                const campusId = fullCode.substring(0, 4);
                const campus = this.data.campuses[campusId];
                if (!campus) continue;
                
                if (!universityMap.has(campusId)) {
                    universityMap.set(campusId, {
                        name: campus.n,
                        type: campus.t,
                        courses: []
                    });
                }
                
                universityMap.get(campusId).courses.push({
                    name: programName,
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
