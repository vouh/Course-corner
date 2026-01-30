/**
 * CampusPlacementEngine
 * Manages the "Bronze Package" logic: finding universities for qualified courses.
 * Independent of the main eligibility system.
 */
const CampusPlacementEngine = {
    data: {
        campuses: null,
        programs: null,
        placements: null
    },

    /**
     * Initialize data fetching from the placements data folder
     */
    init: async function() {
        try {
            // Paths are relative to root for web fetch
            const [campuses, programs, placements] = await Promise.all([
                fetch('/data/placements/campuses.json').then(res => res.json()),
                fetch('/data/placements/programs.json').then(res => res.json()),
                fetch('/data/placements/placements.json').then(res => res.json())
            ]);

            this.data.campuses = campuses;
            this.data.programs = programs;
            this.data.placements = placements;
            console.log('CampusPlacementEngine: Data loaded successfully');
            return true;
        } catch (error) {
            console.error('CampusPlacementEngine: Initialization failed', error);
            return false;
        }
    },

    /**
     * Main function to get all qualified universities and courses
     * @param {Object} clusterPoints - Result from calculator { "Cluster 1": 42.5, ... }
     * @param {Object} studentGrades - { mathematics: 'A', ... }
     */
    getQualifiedUniversities: function(clusterPoints, studentGrades) {
        if (!this.data.campuses || !this.data.programs || !this.data.placements) {
            return [];
        }

        const universityMap = new Map();

        // 1. Identify all programs/courses the student is eligible for based on subject requirements
        const eligibleProgramIds = Object.entries(this.data.programs)
            .filter(([id, details]) => PlacementRules.isEligibleForProgram(studentGrades, details.req))
            .map(([id]) => id);

        // 2. Map these programs to campuses using cutoffs and points
        eligibleProgramIds.forEach(programId => {
            const programDetails = this.data.programs[programId];
            const clusterId = programDetails.cl;
            const studentPoints = clusterPoints[`Cluster ${clusterId}`];

            if (!studentPoints || studentPoints <= 0) return;

            const clusterPlacements = this.data.placements[clusterId.toString()] || {};

            // Find all campus codes that offer this program (code ends with programId)
            Object.entries(clusterPlacements).forEach(([fullCode, data]) => {
                if (fullCode.endsWith(programId)) {
                    // Support both old structure (number) and new structure (object {cutoff, year})
                    const cutoff = typeof data === 'object' ? data.cutoff : data;
                    const year = typeof data === 'object' ? data.year : '2024';

                    if (studentPoints >= cutoff) {
                        const campusId = fullCode.substring(0, 4);
                        const campus = this.data.campuses[campusId];

                        if (campus) {
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
                }
            });
        });

        // Sort universities: Public first, then alphabetical
        return Array.from(universityMap.values()).sort((a, b) => {
            if (a.type !== b.type) return a.type === 'Public' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    },

    /**
     * Render the university cards to the specified container
     */
    displayUniversityCards: function(universities, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (universities.length === 0) {
            container.innerHTML = `
                <div class="alert alert-warning mt-4">
                    <h5>No direct matches found</h5>
                    <p>Based on your grades and cluster points, we couldn't find universities where you meet the 2024 cutoffs for the clusters you scored highest in. Try refining your grades or checking other clusters.</p>
                </div>`;
            return;
        }

        let html = `
            <div class="results-summary mt-4 mb-4">
                <h4 class="text-primary"><i class="fas fa-university me-2"></i>You qualify for ${universities.length} Universities</h4>
                <p class="text-muted">Showing courses where your points exceed the 2024 cutoff.</p>
            </div>
            <div class="university-grid">`;

        universities.forEach(uni => {
            html += `
                <div class="uni-card mb-4 border rounded shadow-sm bg-white overflow-hidden">
                    <div class="uni-header p-3 ${uni.type === 'Public' ? 'bg-primary text-white' : 'bg-info text-dark'}">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 font-weight-bold">${uni.name}</h5>
                            <span class="badge ${uni.type === 'Public' ? 'bg-light text-primary' : 'bg-white text-info'}">${uni.type}</span>
                        </div>
                    </div>
                    <div class="uni-body p-0">
                        <table class="table table-hover mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th>Course & Code</th>
                                    <th class="text-center">Cutoff</th>
                                    <th class="text-center">Your Points</th>
                                </tr>
                            </thead>
                            <tbody>`;
            
            uni.courses.forEach(course => {
                html += `
                    <tr>
                        <td>
                            <div class="course-name font-weight-bold">${course.name}</div>
                            <small class="text-muted">Code: ${course.code}</small>
                        </td>
                        <td class="text-center align-middle">
                            <span class="badge bg-secondary">${course.cutoff}</span>
                            <div style="font-size: 0.7rem" class="text-muted">(${course.year})</div>
                        </td>
                        <td class="text-center align-middle">
                            <span class="badge bg-success">${course.studentPoints}</span>
                        </td>
                    </tr>`;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>`;
        });

        html += `</div>`;
        container.innerHTML = html;
    }
};

window.CampusPlacementEngine = CampusPlacementEngine;

