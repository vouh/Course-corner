/**
 * PlacementEngine
 * Handles matching eligible course strings to university placement data
 */
const PlacementEngine = {
    data: {
        campuses: null,
        programs: null,
        placements: null
    },

    /**
     * Initialize the engine by loading JSON data
     */
    init: async function() {
        try {
            const [campuses, programs, placements] = await Promise.all([
                fetch('/data/placements/campuses.json').then(res => res.json()),
                fetch('/data/placements/programs.json').then(res => res.json()),
                fetch('/data/placements/placements.json').then(res => res.json())
            ]);

            this.data.campuses = campuses;
            this.data.programs = programs;
            this.data.placements = placements;
            console.log('PlacementEngine initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize PlacementEngine:', error);
            return false;
        }
    },

    /**
     * Find the Program ID (3 digits) for a given course name string
     */
    getProgramIdByName: function(courseName) {
        if (!this.data.programs) return null;
        
        // Exact match search
        const match = Object.entries(this.data.programs).find(([id, prog]) => 
            prog.n.trim() === courseName.trim()
        );
        
        return match ? match[0] : null;
    },

    /**
     * Get a list of campuses where the student qualifies for a specific course
     * @param {string} courseName - The exact string from courses.json
     * @param {number|string} clusterId - The parent cluster ID (1-20)
     * @param {number} studentPoints - The student calculated cluster points
     */
    getQualifiedCampuses: function(courseName, clusterId, studentPoints) {
        if (!this.data.campuses || !this.data.programs || !this.data.placements) {
            return [];
        }

        const programId = this.getProgramIdByName(courseName);
        if (!programId) return [];

        const clusterPlacements = this.data.placements[clusterId] || {};
        const results = [];

        Object.entries(clusterPlacements).forEach(([code, cutoff]) => {
            // Check if the 7-digit code ends with the 3-digit program ID
            if (code.endsWith(programId)) {
                if (studentPoints >= cutoff) {
                    const campusId = code.substring(0, 4);
                    const campus = this.data.campuses[campusId];
                    
                    if (campus) {
                        results.push({
                            campusName: campus.n,
                            type: campus.t,
                            cutoff: cutoff,
                            code: code
                        });
                    }
                }
            }
        });

        // Sort results: Public universities first, then by cutoff descending
        return results.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'Public' ? -1 : 1;
            return b.cutoff - a.cutoff;
        });
    }
};