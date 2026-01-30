/**
 * PlacementRules
 * Independent implementation of the 20 cluster requirements for campus placement.
 * Operates on its own logic and subject mapping to ensure zero dependencies.
 */
const PlacementRules = {
    // Subject mapping internal to the placement system
    SUBJECT_MAPPING: {
        'mathematics': ['MATHEMATICS', 'MAT'],
        'english': ['ENGLISH', 'ENG'],
        'kiswahili': ['KISWAHILI', 'KIS'],
        'biology': ['BIOLOGY', 'BIO'],
        'physics': ['PHYSICS', 'PHY'],
        'chemistry': ['CHEMISTRY', 'CHE'],
        'geography': ['GEOGRAPHY', 'GEO'],
        'history': ['HISTORY', 'HIS', 'HAG'],
        'cre': ['CRE'],
        'ire': ['IRE'],
        'hre': ['HRE'],
        'home_science': ['HSC'],
        'art_design': ['ARD'],
        'agriculture': ['AGR'],
        'computer_studies': ['CMP'],
        'business_studies': ['BST'],
        'french': ['FRE'],
        'german': ['GER'],
        'arabic': ['ARB'],
        'music': ['MUS']
    },

    /**
     * Replicates the main calculator formula
     * C = sqrt((r / 48) * (t / 84)) * 48 - 2
     */
    calculateClusterPoints: function(r, t) {
        if (!r || !t) return 0;
        return ((Math.sqrt((r / 48) * (t / 84)) * 48) - 2);
    },

    /**
     * Check course-specific eligibility based on programs.json 'req' field
     * @param {Object} studentGrades - { mathematics: 'A', ... }
     * @param {Object} requirements - The 'req' object from programs.json
     */
    isEligibleForProgram: function(studentGrades, requirements) {
        if (!requirements) return true; // No specific requirements

        for (const [key, req] of Object.entries(requirements)) {
            const hasMet = this.checkRequirement(studentGrades, req);
            if (!hasMet) return false;
        }
        return true;
    },

    /**
     * Helper to check a single requirement (e.g., "ENG/KIS" min "B")
     */
    checkRequirement: function(grades, req) {
        const GRADE_POINTS = { 'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8, 'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1 };
        const subjects = req.name.split('/');
        const minGrade = req.min || 'E'; // Default to lowest grade if no min specified

        return subjects.some(s => {
            const internalKey = this.getInternalKey(s);
            const studentGrade = grades[internalKey];
            return studentGrade && GRADE_POINTS[studentGrade] >= GRADE_POINTS[minGrade];
        });
    },

    getInternalKey: function(subjectName) {
        const normalized = subjectName.trim().toUpperCase();
        for (const [key, aliases] of Object.entries(this.SUBJECT_MAPPING)) {
            if (aliases.includes(normalized)) return key;
        }
        return subjectName.toLowerCase();
    },

    /**
     * Phase 1 Test Clusters logic
     */
    isQualifiedForCluster: function(grades, clusterId) {
        switch(parseInt(clusterId)) {
            case 1: // Law
                return this.checkRequirement(grades, { name: 'ENG/KIS', min: 'B' });
            case 2: // Business
                return true; 
            default:
                return true; 
        }
    }
};

if (typeof module !== 'undefined') module.exports = PlacementRules;
window.PlacementRules = PlacementRules;

