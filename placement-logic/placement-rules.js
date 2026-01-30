/**
 * PlacementRules
 * Independent implementation of subject requirement checking for campus placement.
 * Phase 1 of the placement logic: Check if student meets course-specific grade requirements.
 */
const PlacementRules = {
    // Grade points mapping (same as calculator)
    GRADE_POINTS: {
        'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
        'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
    },

    // Subject mapping: Maps HTML form IDs to course requirement codes
    // The key is what comes from the calculator (e.g., 'english')
    // The values are what might appear in programs.json requirements (e.g., 'ENG')
    SUBJECT_MAPPING: {
        'mathematics': ['MATHEMATICS', 'MAT', 'MATHS'],
        'english': ['ENGLISH', 'ENG'],
        'kiswahili': ['KISWAHILI', 'KIS', 'KISW'],
        'biology': ['BIOLOGY', 'BIO'],
        'physics': ['PHYSICS', 'PHY'],
        'chemistry': ['CHEMISTRY', 'CHE', 'CHEM'],
        'geography': ['GEOGRAPHY', 'GEO'],
        'history': ['HISTORY', 'HIS', 'HAG', 'HISTORY & GOVT'],
        'cre': ['CRE', 'C.R.E'],
        'ire': ['IRE', 'I.R.E'],
        'hre': ['HRE', 'H.R.E'],
        'homeScience': ['HSC', 'HOME SCIENCE', 'HOME_SCIENCE', 'HOMESCIENCE'],
        'artDesign': ['ARD', 'ART', 'ART DESIGN', 'ART_DESIGN', 'ARTDESIGN'],
        'agriculture': ['AGR', 'AGRICULTURE', 'AGRIC'],
        'computerStudies': ['CMP', 'COMP', 'COMPUTER', 'COMPUTER STUDIES', 'COMPUTER_STUDIES'],
        'business': ['BST', 'BUS', 'BUSINESS', 'BUSINESS STUDIES', 'BUSINESS_STUDIES'],
        'french': ['FRE', 'FRENCH'],
        'german': ['GER', 'GERMAN'],
        'arabic': ['ARB', 'ARABIC'],
        'music': ['MUS', 'MUSIC'],
        'aviation': ['AVN', 'AVIATION'],
        'woodwork': ['WWK', 'WOODWORK'],
        'metalWork': ['MWK', 'METALWORK', 'METAL WORK'],
        'buildingConstruction': ['BLD', 'BC', 'BUILDING', 'BUILDING CONSTRUCTION'],
        'signLanguage': ['KSL', 'SIGN LANGUAGE', 'SIGNLANGUAGE']
    },

    // Subject groups for GROUP2, GROUP3, etc. requirements
    SUBJECT_GROUPS: {
        'GROUP1': ['mathematics', 'english', 'kiswahili'],
        'GROUP2': ['biology', 'physics', 'chemistry'],
        'GROUP3': ['history', 'geography', 'cre', 'ire', 'hre'],
        'GROUP4': ['homeScience', 'artDesign', 'agriculture', 'computerStudies', 'business', 'aviation', 'woodwork', 'metalWork', 'buildingConstruction'],
        'GROUP5': ['french', 'german', 'arabic', 'music', 'signLanguage']
    },

    /**
     * PHASE 1: Check if student is eligible for a specific program based on subject requirements
     * @param {Object} studentGrades - Grades from calculator: { mathematics: 'A', english: 'B+', ... }
     * @param {Object} requirements - The 'req' object from programs.json
     * @returns {boolean} - true if student meets ALL requirements
     */
    isEligibleForProgram: function(studentGrades, requirements) {
        // If no requirements specified, student is eligible
        if (!requirements || Object.keys(requirements).length === 0) {
            return true;
        }

        // Check each requirement (subject1, subject2, etc.)
        for (const [key, req] of Object.entries(requirements)) {
            if (!this.checkSingleRequirement(studentGrades, req)) {
                return false;
            }
        }
        return true;
    },

    /**
     * Check a single requirement like { "name": "ENG/KIS", "minGrade": "B" }
     * @param {Object} grades - Student grades
     * @param {Object} req - Requirement object with 'name' and optional 'minGrade'
     * @returns {boolean}
     */
    checkSingleRequirement: function(grades, req) {
        if (!req || !req.name) return true;

        const alternatives = req.name.split('/');
        const minGrade = req.minGrade || 'E'; // Default to E (lowest) if no minimum specified
        const minPoints = this.GRADE_POINTS[minGrade] || 1;

        // Student must meet AT LEAST ONE of the alternatives
        return alternatives.some(alt => {
            const trimmed = alt.trim().toUpperCase();

            // Check if it's a GROUP reference (e.g., GROUP2)
            if (trimmed.startsWith('GROUP')) {
                return this.checkGroupRequirement(grades, trimmed, minPoints);
            }

            // Otherwise it's a specific subject code
            const htmlId = this.getHtmlIdFromCode(trimmed);
            if (!htmlId) return false;

            const studentGrade = grades[htmlId];
            if (!studentGrade) return false;

            const studentPoints = this.GRADE_POINTS[studentGrade] || 0;
            return studentPoints >= minPoints;
        });
    },

    /**
     * Check if student has ANY subject from a group meeting the minimum grade
     * @param {Object} grades - Student grades
     * @param {string} groupName - e.g., 'GROUP2'
     * @param {number} minPoints - Minimum grade points required
     * @returns {boolean}
     */
    checkGroupRequirement: function(grades, groupName, minPoints) {
        const subjects = this.SUBJECT_GROUPS[groupName];
        if (!subjects) return false;

        return subjects.some(htmlId => {
            const studentGrade = grades[htmlId];
            if (!studentGrade) return false;
            const studentPoints = this.GRADE_POINTS[studentGrade] || 0;
            return studentPoints >= minPoints;
        });
    },

    /**
     * Convert a subject code (from programs.json) to HTML form ID
     * @param {string} code - e.g., 'ENG', 'MAT', 'BIO'
     * @returns {string|null} - e.g., 'english', 'mathematics', 'biology'
     */
    getHtmlIdFromCode: function(code) {
        const normalized = code.trim().toUpperCase();
        for (const [htmlId, aliases] of Object.entries(this.SUBJECT_MAPPING)) {
            if (aliases.includes(normalized)) {
                return htmlId;
            }
        }
        // If not found in mapping, try lowercase as fallback
        return null;
    }
};

// Export for browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlacementRules;
}
if (typeof window !== 'undefined') {
    window.PlacementRules = PlacementRules;
}
