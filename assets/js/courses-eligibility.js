let coursesData = null;
let diplomaData = null;
let technicalCoursesData = null;

// Determine base path based on current location
const getBasePath = () => {
    const path = window.location.pathname;
    if (path.includes('/pages/')) {
        return '../';
    }
    return './';
};

const basePath = getBasePath();

Promise.all([
    fetch(`${basePath}data/courses.json`).then(response => response.json()),
    fetch(`${basePath}data/diploma.json`).then(response => response.json()),
    fetch(`${basePath}data/dip.json`).then(response => response.json())
])
    .then(([courses, diploma, technical]) => {
        coursesData = courses;
        diplomaData = diploma;
        technicalCoursesData = technical;
        console.log('📚 Course data loaded successfully');
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

// Grade mapping for comparisons
const GRADE_POINTS = {
    'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
};

// Subject mapping from HTML IDs to JSON codes and aliases
const SUBJECT_MAPPING = {
    'mathematics': { code: 'MAT', aliases: ['MATHEMATICS', 'MAT', 'Math'] },
    'english': { code: 'ENG', aliases: ['ENGLISH', 'ENG', 'English'] },
    'kiswahili': { code: 'KIS', aliases: ['KISWAHILI', 'KIS', 'Kiswahili'] },
    'biology': { code: 'BIO', aliases: ['BIOLOGY', 'BIO', 'Biology'] },
    'physics': { code: 'PHY', aliases: ['PHYSICS', 'PHY', 'Physics'] },
    'chemistry': { code: 'CHE', aliases: ['CHEMISTRY', 'CHE', 'Chemistry'] },
    'geography': { code: 'GEO', aliases: ['GEOGRAPHY', 'GEO', 'Geography'] },
    'history': { code: 'HIS', aliases: ['HISTORY', 'HIS', 'History', 'HAG', 'History & Govt'] },
    'cre': { code: 'CRE', aliases: ['CRE', 'C.R.E', 'Religious Education'] },
    'ire': { code: 'IRE', aliases: ['IRE', 'I.R.E'] },
    'hre': { code: 'HRE', aliases: ['HRE', 'H.R.E'] },
    'homeScience': { code: 'HSC', aliases: ['HSC', 'Home Science', 'HOM'] },
    'artDesign': { code: 'ARD', aliases: ['ARD', 'Art and Design', 'ART'] },
    'computerStudies': { code: 'CMP', aliases: ['CMP', 'Computer Studies', 'CSC', 'COM'] },
    'business': { code: 'BST', aliases: ['BST', 'Business Studies', 'BUS', 'BST'] },
    'french': { code: 'FRE', aliases: ['FRE', 'French'] },
    'german': { code: 'GER', aliases: ['GER', 'German'] },
    'arabic': { code: 'ARB', aliases: ['ARB', 'Arabic'] },
    'music': { code: 'MUS', aliases: ['MUS', 'Music'] },
    'agriculture': { code: 'AGR', aliases: ['AGR', 'Agriculture'] }
};

// Helper function to find HTML ID for a subject name/code from JSON
function findSubjectId(name) {
    if (!name) return null;
    const normalizedName = name.trim().toUpperCase();
    
    // Check codes and aliases
    for (const [id, data] of Object.entries(SUBJECT_MAPPING)) {
        if (data.code === normalizedName || data.aliases.some(alias => alias.toUpperCase() === normalizedName)) {
            return id;
        }
    }
    return null;
}

// Group definitions
const SUBJECT_GROUPS = {
    GROUP2: ['biology', 'physics', 'chemistry'],
    GROUP3: ['geography', 'history', 'cre', 'ire', 'hre'],
    GROUP4: ['homeScience', 'artDesign', 'agriculture', 'computerStudies', 'business'],
    GROUP5: ['french', 'german', 'arabic', 'music']
};

// Enhanced subject mapping system
const GROUP_DEFINITIONS = {
    GROUP1: ['MATHEMATICS', 'ENGLISH', 'KISWAHILI'],
    GROUP2: ['BIOLOGY', 'PHYSICS', 'CHEMISTRY'],
    GROUP3: ['GEOGRAPHY', 'HISTORY', 'CRE', 'IRE', 'HRE'],
    GROUP4: ['HOME_SCIENCE', 'ART_DESIGN', 'COMPUTER_STUDIES', 'BUSINESS_STUDIES'],
    GROUP5: ['FRENCH', 'GERMAN', 'ARABIC']
};

// Helper functions for subject mapping
const SubjectMapper = {
    // Convert JSON key to internal subject key
    getSubjectFromJsonKey(jsonKey) {
        return Object.entries(SUBJECT_MAPPING).find(([_, data]) =>
            data.jsonKeys.includes(jsonKey)
        )?.[0];
    },

    // Convert HTML ID to internal subject key
    getSubjectFromHtmlId(htmlId) {
        return Object.entries(SUBJECT_MAPPING).find(([_, data]) =>
            data.htmlIds.includes(htmlId)
        )?.[0];
    },

    // Get all subjects in a group
    getSubjectsInGroup(groupName) {
        return GROUP_DEFINITIONS[groupName] || [];
    },

    // Check if a subject belongs to a group
    isSubjectInGroup(subject, groupName) {
        return SUBJECT_MAPPING[subject]?.group === groupName;
    },

    // Get subject code
    getSubjectCode(subject) {
        return SUBJECT_MAPPING[subject]?.code;
    },

    // Get subject aliases
    getSubjectAliases(subject) {
        return SUBJECT_MAPPING[subject]?.aliases || [];
    }
};

// Add these helper functions for grade conversion
function convertGrade(numericValue) {
    const gradeMap = {
        '12': 'A', '11': 'A-', '10': 'B+', '9': 'B', '8': 'B-',
        '7': 'C+', '6': 'C', '5': 'C-', '4': 'D+', '3': 'D',
        '2': 'D-', '1': 'E'
    };
    return gradeMap[numericValue] || null;
}

// Get student grades from form
function getStudentGrades() {
    const grades = {};
    document.querySelectorAll('.grade-select').forEach(select => {
        if (select.value) {
            const letterGrade = convertGrade(select.value);
            if (letterGrade) {
                grades[select.id] = letterGrade;
            }
        }
    });
    return grades;
}

// Check if grade meets minimum requirement
function meetsGradeRequirement(studentGrade, requiredGrade) {
    if (!studentGrade || !requiredGrade) return true; // No minimum grade requirement
    return GRADE_POINTS[studentGrade] >= GRADE_POINTS[requiredGrade];
}

// Check alternative subjects (e.g., "ENG/KIS")
function checkAlternativeSubjects(subjects, grades, minGrade) {
    const alternatives = subjects.split('/');
    return alternatives.some(subject => {
        const htmlId = findSubjectId(subject);
        return htmlId && grades[htmlId] &&
            (!minGrade || meetsGradeRequirement(grades[htmlId], minGrade));
    });
}

// Check group requirements
function checkGroupRequirement(groupName, grades, minGrade) {
    const groups = groupName.split('/');
    return groups.some(group => {
        const subjects = SUBJECT_GROUPS[group] || [];
        return subjects.some(subject =>
            grades[subject] && (!minGrade || meetsGradeRequirement(grades[subject], minGrade))
        );
    });
}

// Check cluster requirements
function checkClusterRequirements(grades, requirements) {
    console.log('Checking requirements:', requirements);
    console.log('With grades:', grades);

    for (let i = 1; i <= 4; i++) {
        const requirement = requirements[`subject${i}`];
        if (!requirement) continue;

        const { name, minGrade } = requirement;
        console.log(`Checking requirement ${i}:`, requirement);

        let requirementMet = false;

        if (name.includes('/')) {
            if (name.startsWith('GROUP')) {
                requirementMet = checkGroupRequirement(name, grades, minGrade);
            } else {
                requirementMet = checkAlternativeSubjects(name, grades, minGrade);
            }
        } else if (name.startsWith('GROUP')) {
            requirementMet = checkGroupRequirement(name, grades, minGrade);
        } else {
            const htmlId = findSubjectId(name);
            requirementMet = htmlId && grades[htmlId] &&
                (!minGrade || meetsGradeRequirement(grades[htmlId], minGrade));
        }

        console.log(`Requirement ${i} met:`, requirementMet);
        if (!requirementMet) return false;
    }
    return true;
}

// Modify the checkKMTCCourseEligibility function
function checkKMTCCourseEligibility(grades, course) {
    // Check mean grade requirement
    const studentPoints = parseInt(document.getElementById('overallGrade').value);
    const studentMeanGrade = get_grade_from_points(studentPoints);

    // Map required grade to minimum points
    const gradeToMinPoints = {
        'C': 39,  // C is 39-45 points
        'C-': 32, // C- is 32-38 points
        'D+': 25  // D+ is 25-31 points
    };

    const requiredGrade = course.mean_grade;
    const minPointsRequired = gradeToMinPoints[requiredGrade] || 0;

    // Check if student meets mean grade requirement
    if (studentPoints < minPointsRequired) {
        return false;
    }

    // For courses that only have mean grade requirement
    if (!course.requirements || course.requirements.length === 0 ||
        (course.requirements.length === 1 && course.requirements[0].mean_grade)) {
        return true;
    }

    // Check each subject requirement
    for (const requirement of course.requirements) {
        let requirementMet = false;

        // Get subject codes and required grade
        const subjectKey = Object.keys(requirement).find(key => key.startsWith('subject_'));
        if (!subjectKey) continue;

        const subjectCodes = requirement[subjectKey].split('/');
        const requiredGrade = requirement.grade;

        // Check if student meets grade requirement in any of the subjects
        for (const subjectCode of subjectCodes) {
            if (subjectCode === 'GRP2') {
                // Check any science subject
                const scienceSubjects = ['biology', 'physics', 'chemistry'];
                for (const subject of scienceSubjects) {
                    if (grades[subject] && meetsGradeRequirement(grades[subject], requiredGrade)) {
                        requirementMet = true;
                        break;
                    }
                }
            } else {
                const htmlId = findSubjectId(subjectCode);
                if (htmlId && grades[htmlId] && meetsGradeRequirement(grades[htmlId], requiredGrade)) {
                    requirementMet = true;
                    break;
                }
            }
        }

        if (!requirementMet) {
            return false;
        }
    }

    return true;
}

// Modify getEligibleCourses to handle both degree and KMTC courses
function getEligibleCourses(grades) {
    if (!checkAllDataLoaded()) {
        return { error: "Course data not loaded. Please try again." };
    }

    const overallPoints = parseInt(document.getElementById('overallGrade').value);
    const gradeInfo = getGradeDetails(overallPoints);
    const results = { courses: {} };

    // Get eligible KMTC courses
    const kmtcCourses = [];
    for (const course of diplomaData.courses) {
        if (checkKMTCCourseEligibility(grades, course)) {
            kmtcCourses.push(course.course_name);
        }
    }

    // If below C+ (46 points), only show Diploma and KMTC courses
    if (overallPoints < 46) {
        // Clear degree possibilities if any by chance
        results.courses = {};

        // Add technical (Diploma/KMTC) results
        const technicalResults = getTechnicalCourses(grades);
        if (technicalResults.courses) {
            Object.assign(results.courses, technicalResults.courses);
        }

        if (kmtcCourses.length > 0) {
            results.courses['KMTC PROGRAMS'] = kmtcCourses;
        }
        return results;
    }

    // For C+ and above, show both degree and KMTC programs
    // Process degree programs
    if (coursesData && coursesData.clusters) {
        Object.entries(coursesData.clusters).forEach(([clusterId, cluster]) => {
            if (cluster.subClusters) {
                Object.entries(cluster.subClusters).forEach(([subClusterId, subCluster]) => {
                    if (checkClusterRequirements(grades, subCluster.requirements)) {
                        const clusterName = `${cluster.name} (${subClusterId})`;
                        results.courses[clusterName] = subCluster.courses;
                    }
                });
            }
        });
    }

    // Add KMTC programs if any are eligible
    if (kmtcCourses.length > 0) {
        results.courses['KMTC PROGRAMS'] = kmtcCourses;
    }

    return results;
}

// Add this function back
function getGradeDetails(points) {
    if (points >= 81 && points <= 84) return { grade: 'A', message: 'Excellent! You have a strong foundation for university courses.' };
    if (points >= 74 && points <= 80) return { grade: 'A-', message: 'Outstanding performance! Many opportunities await.' };
    if (points >= 67 && points <= 73) return { grade: 'B+', message: 'Very good performance! You qualify for many courses.' };
    if (points >= 60 && points <= 66) return { grade: 'B', message: 'Good performance! You have solid options.' };
    if (points >= 53 && points <= 59) return { grade: 'B-', message: 'Above average performance.' };
    if (points >= 46 && points <= 52) return { grade: 'C+', message: 'You meet minimum university entry requirements.' };
    if (points >= 39 && points <= 45) return { grade: 'C', message: 'Consider diploma programs or bridging courses.' };
    if (points >= 32 && points <= 38) return { grade: 'C-', message: 'Look into diploma and certificate options.' };
    if (points >= 25 && points <= 31) return { grade: 'D+', message: 'Consider vocational training programs.' };
    if (points >= 18 && points <= 24) return { grade: 'D', message: 'Explore technical training opportunities.' };
    if (points >= 11 && points <= 17) return { grade: 'D-', message: 'Consider certificate programs.' };
    return { grade: 'E', message: 'Look into skill-based training programs.' };
}

// Modify checkMinimumSubjects function to be simpler
function checkMinimumSubjects(grades) {
    // First check if 7 subjects are selected
    const filledSubjects = Object.values(grades).filter(grade => grade !== null && grade !== undefined && grade !== "").length;

    if (filledSubjects < 7) {
        return {
            isValid: false,
            message: `
                <div class="bg-red-50 border-l-4 border-red-500 p-6 mb-8 rounded-lg shadow-lg">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-xl font-bold text-red-800">Insufficient Subjects</h3>
                            <div class="mt-2">
                                <p class="text-red-700">
                                    Please select at least 7 subjects. You have only selected ${filledSubjects} subject${filledSubjects === 1 ? '' : 's'}.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        };
    }

    // Then check if overall grade is calculated
    const overallGrade = document.getElementById('overallGrade').value;
    if (!overallGrade) {
        return {
            isValid: false,
            message: `
                <div class="bg-red-50 border-l-4 border-red-500 p-6 mb-8 rounded-lg shadow-lg">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-xl font-bold text-red-800">Missing Overall Grade</h3>
                            <div class="mt-2">
                                <p class="text-red-700">
                                    Please ensure you have filled all required subjects.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        };
    }

    return { isValid: true };
}

// Add event listeners for both second and third buttons
// NOTE: Payment handlers are now managed by index.html's unified payment system
// These handlers are called AFTER payment is confirmed via showResultsAfterPayment()
document.addEventListener('DOMContentLoaded', function () {
    // Load confetti script once at start
    const confettiScript = document.createElement('script');
    confettiScript.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js';
    document.head.appendChild(confettiScript);

    // IMPORTANT: Do NOT add click handlers to payment buttons here!
    // All payment button click handlers are managed in index.html's unified payment system
    // The functions below (displayAllResults, displayCombinedResults) are called 
    // ONLY after successful payment confirmation

    console.log('courses-eligibility.js loaded - payment handlers deferred to unified system');
});

// Modify displayCombinedResults function
function displayCombinedResults(results) {
    const resultsDiv = document.getElementById('results');
    
    if (!resultsDiv) {
        console.error('Results container not found');
        return;
    }

    // Check for data load errors
    if (results.error) {
        resultsDiv.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-500 p-6 rounded-xl shadow-md">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-2xl text-red-500"></i>
                    </div>
                    <div class="ml-4">
                        <h3 class="text-xl font-bold text-red-800">Error Loading Results</h3>
                        <p class="text-red-700 mt-1">${results.error}</p>
                    </div>
                </div>
            </div>
        `;
        resultsDiv.classList.remove('hidden');
        return;
    }

    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('hidden');

    const studentPoints = parseInt(document.getElementById('overallGrade').value) || 0;

    // Show appropriate success message or notice
    let html = '';
    if (studentPoints < 46) {
        html = `
            <div class="bg-indigo-50 border-l-4 border-indigo-500 p-6 mb-8 rounded-xl shadow-md">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <i class="fas fa-info-circle text-2xl text-indigo-500"></i>
                    </div>
                    <div class="ml-4">
                        <h3 class="text-xl font-bold text-indigo-800">Direct Entry Notice</h3>
                        <p class="text-indigo-700 mt-1">Your grade is below the C+ university entry threshold. We have automatically listed eligible Diploma, KMTC, and Technical courses for you below.</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        html = generateSuccessMessage(studentPoints, getGradeDetails(studentPoints));
    }

    // Get grades and technical results for display
    const grades = getStudentGrades();
    const technicalResults = getTechnicalCourses(grades);

    // Add cluster points section (will always be shown for C+ and above)
    if (window.lastClusterPoints && typeof window.generateClusterPointsHTML === 'function') {
        html += generateCollapsibleSection(
            'cluster-points',
            'Cluster Points',
            '20 clusters',
            'yellow',
            window.generateClusterPointsHTML(window.lastClusterPoints)
        );
    }

    // Add ALL eligible courses sections
    if (results.courses) {
        // Add degree programs
        const degreeCourses = Object.entries(results.courses)
            .filter(([name]) => !['KMTC PROGRAMS', 'DIPLOMA PROGRAMS', 'CERTIFICATE PROGRAMS', 'ARTISAN PROGRAMS'].includes(name.toUpperCase()))
            .reduce((acc, [_, courses]) => acc + (Array.isArray(courses) ? courses.length : 0), 0);

        if (degreeCourses > 0) {
            html += generateCollapsibleSection(
                'degree-programs',
                'Degree Programs',
                degreeCourses,
                'green',
                Object.entries(results.courses)
                    .filter(([name]) => !['KMTC PROGRAMS', 'DIPLOMA PROGRAMS', 'CERTIFICATE PROGRAMS', 'ARTISAN PROGRAMS'].includes(name.toUpperCase()))
                    .map(([clusterName, courses]) => generateClusterHTML(clusterName, courses))
                    .join('')
            );
        }

        // Add KMTC programs
        if (results.courses['KMTC PROGRAMS']) {
            html += generateCollapsibleSection(
                'kmtc-programs',
                'KMTC Programs',
                results.courses['KMTC PROGRAMS'].length,
                'red',
                generateClusterHTML('KMTC PROGRAMS', results.courses['KMTC PROGRAMS'], 'red')
            );
        }
    }

    // Add technical courses sections
    if (technicalResults?.courses) {
        // Add diploma programs
        if (technicalResults.courses['DIPLOMA PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'diploma-programs',
                'Diploma Programs',
                technicalResults.courses['DIPLOMA PROGRAMS'].reduce((acc, cat) => acc + cat.programs.length, 0),
                'blue',
                generateTechnicalCategoryHTML('DIPLOMA PROGRAMS', technicalResults, 'blue')
            );
        }

        // Add certificate programs
        if (technicalResults.courses['CERTIFICATE PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'certificate-programs',
                'Certificate Programs',
                technicalResults.courses['CERTIFICATE PROGRAMS'].reduce((acc, cat) => acc + cat.programs.length, 0),
                'purple',
                generateTechnicalCategoryHTML('CERTIFICATE PROGRAMS', technicalResults, 'purple')
            );
        }

        // Add artisan programs
        if (technicalResults.courses['ARTISAN PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'artisan-programs',
                'Artisan Programs',
                technicalResults.courses['ARTISAN PROGRAMS'].reduce((acc, cat) => acc + cat.programs.length, 0),
                'orange',
                generateTechnicalCategoryHTML('ARTISAN PROGRAMS', technicalResults, 'orange')
            );
        }
    }

    resultsDiv.innerHTML = html;
    initializeCollapsibleSections();
    initializeDownloadButton();
}

// Helper function to generate success message
function generateSuccessMessage(points, gradeInfo) {
    return `
        <div class="bg-green-50 border-l-4 border-green-500 p-6 mb-8 rounded-lg shadow-lg">
            <div class="flex items-center justify-between">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <svg class="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div class="ml-4">
                        <h3 class="text-2xl font-bold text-green-800">Your Results</h3>
                        <div class="mt-2">
                            <p class="text-lg text-green-700">
                                You have scored <span class="font-bold">${points} points</span> 
                                (Grade ${gradeInfo.grade})
                            </p>
                            <p class="text-green-600 mt-1">${gradeInfo.message}</p>
                        </div>
                    </div>
                </div>
                <button id="downloadBtn" class="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-700 transition-all duration-200 gap-2 hover:shadow-green-200 hover:shadow-xl">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    <span>Download PDF</span>
                </button>
            </div>
        </div>
    `;
}

// Helper function to initialize collapsible sections
function initializeCollapsibleSections() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const icon = header.querySelector('.collapse-icon');
            content.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    });
}

// Add helper function for collapsible sections
function generateCollapsibleSection(id, title, count, color, content) {
    const colorClasses = {
        'yellow': 'bg-yellow-500 border-yellow-500',
        'green': 'bg-green-500 border-green-500',
        'red': 'bg-red-500 border-red-500',
        'blue': 'bg-blue-500 border-blue-500',
        'purple': 'bg-purple-500 border-purple-500',
        'orange': 'bg-orange-500 border-orange-500'
    };

    return `
        <div class="mb-6 overflow-hidden rounded-xl shadow-lg border border-gray-100 bg-white">
            <button class="collapsible-header w-full p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-all duration-200 group">
                <div class="flex items-center">
                    <div class="w-1.5 h-10 ${colorClasses[color].split(' ')[0]} rounded-full mr-5 group-hover:scale-y-110 transition-transform"></div>
                    <div class="text-left">
                        <h3 class="text-lg font-bold text-gray-800">${title}</h3>
                        <p class="text-xs font-medium text-gray-500 uppercase tracking-widest">${count} ${typeof count === 'string' ? '' : (count === 1 ? 'Entry' : 'Entries')} Found</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Click to view</span>
                    <i class="fas fa-chevron-down collapse-icon text-gray-400 group-hover:text-gray-600 transition-transform duration-300"></i>
                </div>
            </button>
            <div class="collapsible-content hidden border-t border-gray-50 bg-gray-50/30">
                <div class="p-6">
                    ${content}
                </div>
            </div>
        </div>
    `;
}

// Function to generate cluster points HTML with progress bars
function generateClusterPointsHTML(points) {
    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    Object.entries(points).forEach(([name, score]) => {
        const percentage = Math.min(100, (score / 48) * 100);
        const barColor = score >= 35 ? 'bg-green-500' : (score >= 25 ? 'bg-yellow-500' : 'bg-red-500');

        html += `
            <div class="bg-white p-4 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-gray-700">${name}</span>
                    <span class="text-lg font-black ${barColor.replace('bg-', 'text-')}">${score.toFixed(3)}</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2.5">
                    <div class="${barColor} h-2.5 rounded-full shadow-sm" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Function to generate Cluster Group HTML (Degree)
function generateClusterHTML(title, courses, color = 'green') {
    return `
        <div class="mb-6 last:mb-0">
            <h4 class="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
                <i class="fas fa-layer-group"></i> ${title.toUpperCase()}
            </h4>
            <div class="grid grid-cols-1 gap-2">
                ${courses.map(course => `
                    <div class="p-3 bg-white rounded-lg border-l-4 border-${color}-400 shadow-sm text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                        ${course}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Initialize Download Button
function initializeDownloadButton() {
    const btn = document.getElementById('downloadBtn');
    if (!btn) return;

    btn.onclick = async function () {
        const { jsPDF } = window.jspdf;
        const resultsEl = document.getElementById('results');

        // Show loading
        Swal.fire({
            title: 'Generating PDF...',
            text: 'Please wait while we prepare your results',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            // Expand all sections for capture
            document.querySelectorAll('.collapsible-content').forEach(c => c.classList.remove('hidden'));

            const canvas = await html2canvas(resultsEl, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // Re-hide sections if they were hidden (optional, but keep expanded for now)

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Course-Corner-Results-${new Date().getTime()}.pdf`);

            Swal.fire({
                icon: 'success',
                title: 'PDF Downloaded!',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('PDF Generation Error:', error);
            Swal.fire('Error', 'Failed to generate PDF. Please try again.', 'error');
        }
    };
}

// Add helper function for PDF content generation
function generatePDFContent(results, technicalResults, points, gradeInfo) {
    // Create a styled HTML document for download
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Course Eligibility Results - Grade ${gradeInfo.grade}</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
                .header { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin-bottom: 30px; }
                .section { margin-bottom: 30px; }
                .section-title { color: #1f2937; font-size: 1.5rem; font-weight: bold; margin-bottom: 15px; }
                .course-list { list-style-type: none; padding-left: 20px; }
                .course-item { margin-bottom: 8px; }
                .footer { margin-top: 40px; text-align: center; color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Your Course Eligibility Results</h1>
                <p>Points: ${points} (Grade ${gradeInfo.grade})</p>
                <p>${gradeInfo.message}</p>
            </div>
            ${generatePDFSections(results, technicalResults)}
            <div class="footer">
                <p>Generated on ${new Date().toLocaleDateString()}</p>
            </div>
        </body>
        </html>
    `;
}

// Helper function to generate PDF sections
function generatePDFSections(results, technicalResults) {
    let sections = '';

    // Add each category of courses...
    // (Similar structure to displayAllResults but formatted for PDF)

    return sections;
}

// Add new function to check diploma eligibility
function getDiplomaCourses(grades) {
    if (!diplomaData || !diplomaData.courses) {
        console.error('Diploma data not loaded');
        return {};
    }

    const eligibleCourses = {
        'KMTC Diploma Programs': []
    };

    for (const course of diplomaData.courses) {
        if (checkDiplomaEligibility(grades, course)) {
            eligibleCourses['KMTC Diploma Programs'].push(course.course_name);
        }
    }

    return eligibleCourses;
}

// Add function to check diploma course eligibility
function checkDiplomaEligibility(grades, course) {
    // Check mean grade requirement
    const studentMeanGrade = get_grade_from_points(parseInt(document.getElementById('overallGrade').value));
    if (!meetsGradeRequirement(studentMeanGrade, course.mean_grade)) {
        return false;
    }

    // Check subject requirements
    for (const requirement of course.requirements) {
        // Handle special case where only mean grade is specified
        if (requirement.mean_grade) {
            continue;
        }

        // Check each subject requirement
        let requirementMet = false;
        const subjects = Object.keys(requirement)[0].split('/');
        const requiredGrade = requirement[Object.keys(requirement)[1]];

        for (const subject of subjects) {
            const studentGrade = getStudentGradeForSubject(grades, subject);
            if (studentGrade && meetsGradeRequirement(studentGrade, requiredGrade)) {
                requirementMet = true;
                break;
            }
        }

        if (!requirementMet) {
            return false;
        }
    }

    return true;
}

// Helper function to get student grade for a subject code
function getStudentGradeForSubject(grades, subjectCode) {
    // Map subject codes to form field IDs
    const subjectMap = {
        'ENG': 'english',
        'KIS': 'kiswahili',
        'MAT': 'mathematics',
        'BIO': 'biology',
        'PHY': 'physics',
        'CHE': 'chemistry',
        'GEO': 'geography',
        'HIS': 'history',
        'CRE': 'cre',
        'IRE': 'ire',
        'HSC': 'homeScience',
        'AGR': 'agriculture',
        'CSC': 'computerStudies',
        'BUS': 'business',
        'COM': 'business'  // Assuming Commerce maps to Business Studies
    };

    const fieldId = subjectMap[subjectCode];
    return fieldId ? grades[fieldId] : null;
}

// Add error handling for data loading
function checkAllDataLoaded() {
    if (!coursesData || !diplomaData || !technicalCoursesData) {
        console.error('Some course data not loaded');
        return false;
    }
    return true;
}

// Modify getTechnicalCourses to handle education programs
function getTechnicalCourses(grades) {
    if (!technicalCoursesData) return {};

    const eligibleCourses = {
        'DIPLOMA PROGRAMS': [],
        'CERTIFICATE PROGRAMS': [],
        'ARTISAN PROGRAMS': []
    };

    const categoryStyles = {
        'DIPLOMA PROGRAMS': 'border-blue-500',
        'CERTIFICATE PROGRAMS': 'border-purple-500',
        'ARTISAN PROGRAMS': 'border-orange-500'
    };

    // Handle diploma courses
    if (technicalCoursesData.courses.diploma) {
        technicalCoursesData.courses.diploma.programs.forEach(category => {
            // Handle categories with subcategories
            if (category.subCategories) {
                category.subCategories.forEach(subCat => {
                    if (checkTechnicalRequirements(grades, subCat.requirements)) {
                        // If programs is an array of strings
                        if (typeof subCat.programs[0] === 'string') {
                            eligibleCourses['DIPLOMA PROGRAMS'].push({
                                category: `${category.category}`,
                                programs: subCat.programs,
                                note: subCat.note || category.note,
                                onlyMeanGrade: Object.keys(subCat.requirements).length === 1
                            });
                        } else {
                            // If programs is an array of objects with program-specific requirements
                            const eligiblePrograms = subCat.programs.filter(program =>
                                checkTechnicalRequirements(grades, program.requirements)
                            ).map(program => program.program);

                            if (eligiblePrograms.length > 0) {
                                eligibleCourses['DIPLOMA PROGRAMS'].push({
                                    category: `${category.category}`,
                                    programs: eligiblePrograms,
                                    note: subCat.note || category.note,
                                    onlyMeanGrade: false
                                });
                            }
                        }
                    }
                });
            }
            // Handle categories without subcategories
            else if (checkTechnicalRequirements(grades, category.requirements)) {
                if (typeof category.programs[0] === 'string') {
                    eligibleCourses['DIPLOMA PROGRAMS'].push({
                        category: category.category,
                        programs: category.programs,
                        note: category.note,
                        onlyMeanGrade: Object.keys(category.requirements).length === 1
                    });
                }
            }
        });
    }

    // Handle certificate courses
    if (technicalCoursesData.courses.certificate) {
        technicalCoursesData.courses.certificate.programs.forEach(category => {
            if (checkTechnicalRequirements(grades, category.requirements)) {
                eligibleCourses['CERTIFICATE PROGRAMS'].push({
                    category: category.category,
                    programs: category.programs,
                    note: category.note,
                    onlyMeanGrade: Object.keys(category.requirements).length === 1
                });
            }
        });
    }

    // Handle artisan courses
    if (technicalCoursesData.courses.artisan) {
        technicalCoursesData.courses.artisan.programs.forEach(category => {
            if (checkTechnicalRequirements(grades, category.requirements)) {
                eligibleCourses['ARTISAN PROGRAMS'].push({
                    category: category.category,
                    programs: category.programs,
                    note: category.note,
                    onlyMeanGrade: Object.keys(category.requirements).length === 1
                });
            }
        });
    }

    return { courses: eligibleCourses, styles: categoryStyles };
}

// Modify checkTechnicalRequirements to normalize grade case
function checkTechnicalRequirements(grades, requirements) {
    if (!requirements) return false;

    const studentPoints = parseInt(document.getElementById('overallGrade').value);
    const studentMeanGrade = get_grade_from_points(studentPoints);

    // Check mean grade requirement
    if (requirements.meanGrade && !meetsGradeRequirement(studentMeanGrade, requirements.meanGrade)) {
        return false;
    }

    // Check other subject requirements
    for (const [subject, requiredGrade] of Object.entries(requirements)) {
        if (subject === 'meanGrade') continue;

        // Normalize grade case (convert to uppercase)
        const normalizedRequiredGrade = requiredGrade.toUpperCase();

        if (subject.includes('/')) {
            // Handle alternative subjects
            const alternatives = subject.split('/');
            const meetsAny = alternatives.some(alt => {
                const subjectId = findSubjectId(alt);
                return subjectId && grades[subjectId] &&
                    meetsGradeRequirement(grades[subjectId], normalizedRequiredGrade);
            });
            if (!meetsAny) return false;
        } else {
            const subjectId = findSubjectId(subject);
            if (!subjectId || !grades[subjectId] ||
                !meetsGradeRequirement(grades[subjectId], normalizedRequiredGrade)) {
                return false;
            }
        }
    }

    return true;
}

// Update generateTechnicalCategoryHTML to handle the new structure and remove "Subcat" text
function generateTechnicalCategoryHTML(categoryKey, results, color) {
    return `
        <div class="cluster mb-6 bg-white p-6 rounded-lg shadow-lg print:shadow-none print:border 
                  border-2 ${results.styles[categoryKey]}">
            <h3 class="text-xl font-semibold text-${color}-600 mb-4">${categoryKey}</h3>
            ${results.courses[categoryKey].map(category => `
                <div class="mb-4">
                    <h4 class="text-lg font-semibold text-gray-700 mb-2">
                        ${category.category.replace(/\s*-\s*Subcat\s*\d+/g, '')}
                    </h4>
                    <ul class="space-y-2">
                        ${category.programs.map(program => `
                            <li class="text-gray-700 flex items-start gap-2">
                                <svg class="w-5 h-5 text-${color}-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                ${program}
                            </li>
                        `).join('')}
                    </ul>
                    ${category.onlyMeanGrade ? `
                        <p class="text-sm text-gray-600 mt-2 italic">
                            Note: These programs require only the mean grade. ${category.note || ''}
                        </p>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function generateClusterHTML(clusterName, courses, color = 'green') {
    return `
        <div class="cluster mb-6 bg-white p-6 rounded-lg shadow-lg print:shadow-none print:border 
                  border-2 ${color === 'red' ? 'border-red-500' : 'border-green-500'}">
            <h3 class="text-xl font-semibold text-${color}-600 mb-4">${clusterName}</h3>
            <ul class="space-y-2">
                ${courses.map(course => `
                    <li class="text-gray-700 flex items-start gap-2">
                        <svg class="w-5 h-5 text-${color}-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        ${course}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

function get_grade_from_points(points) {
    if (points >= 81) return "A"
    else if (points >= 74) return "A-"
    else if (points >= 67) return "B+"
    else if (points >= 60) return "B"
    else if (points >= 53) return "B-"
    else if (points >= 46) return "C+"
    else if (points >= 39) return "C"
    else if (points >= 32) return "C-"
    else if (points >= 25) return "D+"
    else if (points >= 18) return "D"
    else if (points >= 11) return "D-"
    else return "E"
}

// Add back displayAllResults function
function displayAllResults(results) {
    try {
        console.log('displayAllResults called with:', results);
        const resultsDiv = document.getElementById('results');

        if (!resultsDiv) {
            console.error('Results div not found!');
            return;
        }

        // Check for data load errors
        if (results.error) {
            resultsDiv.innerHTML = `
                <div class="bg-red-50 border-l-4 border-red-500 p-6 rounded-xl shadow-md">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-circle text-2xl text-red-500"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-xl font-bold text-red-800">Error Loading Results</h3>
                            <p class="text-red-700 mt-1">${results.error}</p>
                        </div>
                    </div>
                </div>
            `;
            resultsDiv.classList.remove('hidden');
            return;
        }

        resultsDiv.innerHTML = '';
        resultsDiv.classList.remove('hidden');

        const studentPoints = parseInt(document.getElementById('overallGrade').value) || 0;
        const gradeInfo = getGradeDetails(studentPoints);

        let technicalResults;
        try {
            technicalResults = getTechnicalCourses(getStudentGrades());
        } catch (techError) {
            console.error('Error getting technical courses:', techError);
            technicalResults = { courses: {} };
        }

        // Success message with download button
        let html = `
            <div class="bg-green-50 border-l-4 border-green-500 p-6 mb-8 rounded-lg shadow-lg">
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <svg class="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-2xl font-bold text-green-800">Your Results</h3>
                            <div class="mt-2">
                                <p class="text-lg text-green-700">
                                    You have scored <span class="font-bold">${studentPoints} points</span> 
                                    (Grade ${gradeInfo.grade})
                                </p>
                                <p class="text-green-600 mt-1">${gradeInfo.message}</p>
                            </div>
                        </div>
                    </div>
                    <button id="downloadBtn" class="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-700 transition-all duration-200 gap-2 hover:shadow-green-200 hover:shadow-xl">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        <span>Download PDF</span>
                    </button>
                </div>
            </div>
        `;

        // Count eligible courses in each category
        const degreeCourses = studentPoints >= 46 && results.courses ?
            Object.entries(results.courses).filter(([name]) => !name.includes('KMTC')).reduce((acc, [_, courses]) => acc + courses.length, 0) : 0;

        const kmtcCourses = results.courses?.['KMTC PROGRAMS']?.length || 0;

        const diplomaCourses = technicalResults?.courses?.['DIPLOMA PROGRAMS']?.reduce((acc, category) =>
            acc + category.programs.length, 0) || 0;

        const certificateCourses = technicalResults?.courses?.['CERTIFICATE PROGRAMS']?.reduce((acc, category) =>
            acc + category.programs.length, 0) || 0;

        const artisanCourses = technicalResults?.courses?.['ARTISAN PROGRAMS']?.reduce((acc, category) =>
            acc + category.programs.length, 0) || 0;

        // Add degree programs section
        if (studentPoints >= 46 && results.courses) {
            html += generateCollapsibleSection(
                'degree-programs',
                'Degree Programs',
                degreeCourses,
                'green',
                Object.entries(results.courses)
                    .filter(([name]) => !name.includes('KMTC'))
                    .map(([clusterName, courses]) => generateClusterHTML(clusterName, courses))
                    .join('')
            );
        }

        // Add diploma programs section
        if (technicalResults?.courses?.['DIPLOMA PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'diploma-programs',
                'Diploma Programs',
                diplomaCourses,
                'blue',
                generateTechnicalCategoryHTML('DIPLOMA PROGRAMS', technicalResults, 'blue')
            );
        }

        // Add KMTC programs section
        if (results.courses?.['KMTC PROGRAMS']) {
            html += generateCollapsibleSection(
                'kmtc-programs',
                'KMTC Programs',
                kmtcCourses,
                'red',
                generateClusterHTML('KMTC PROGRAMS', results.courses['KMTC PROGRAMS'], 'red')
            );
        }

        // Add certificate programs section
        if (technicalResults?.courses?.['CERTIFICATE PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'certificate-programs',
                'Certificate Programs',
                certificateCourses,
                'purple',
                generateTechnicalCategoryHTML('CERTIFICATE PROGRAMS', technicalResults, 'purple')
            );
        }

        // Add artisan programs section
        if (technicalResults?.courses?.['ARTISAN PROGRAMS']?.length > 0) {
            html += generateCollapsibleSection(
                'artisan-programs',
                'Artisan Programs',
                artisanCourses,
                'orange',
                generateTechnicalCategoryHTML('ARTISAN PROGRAMS', technicalResults, 'orange')
            );
        }

        // Check if we have any content to show
        if (degreeCourses === 0 && kmtcCourses === 0 && diplomaCourses === 0 && certificateCourses === 0 && artisanCourses === 0) {
            html += `
                <div class="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-triangle text-2xl text-yellow-500"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-xl font-bold text-yellow-800">No Eligible Courses Found</h3>
                            <p class="text-yellow-700 mt-2">Based on your current grades, we couldn't find any matching courses. Please verify your grades are entered correctly.</p>
                        </div>
                    </div>
                </div>
            `;
        }

        resultsDiv.innerHTML = html;

        // Initialize collapsible sections and download button
        initializeCollapsibleSections();
        initializeDownloadButton();

        // Trigger confetti if any courses are available
        if ((results.courses && Object.keys(results.courses).length > 0) ||
            (technicalResults?.courses && Object.values(technicalResults.courses).some(arr => arr.length > 0))) {
            if (window.confetti) {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        }

        console.log('displayAllResults completed successfully');
    } catch (error) {
        console.error('Critical error in displayAllResults:', error);
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.innerHTML = `
                <div class="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <i class="fas fa-exclamation-circle text-2xl text-red-500"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-xl font-bold text-red-800">Error Loading Results</h3>
                            <p class="text-red-700 mt-2">We encountered an error while loading your results. Please try again or contact support.</p>
                            <p class="text-red-600 text-sm mt-2">Error: ${error.message}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Modify generateClusterPointsPDF function
async function generateClusterPointsPDF() {
    // Check if we have calculated points
    const calculatedPoints = document.getElementById('overallGrade').value;
    if (!calculatedPoints) {
        Swal.fire({
            icon: 'error',
            title: 'No cluster points available',
            text: 'Please calculate your cluster points first'
        });
        return;
    }

    const studentName = await Swal.fire({
        title: 'Enter your name',
        input: 'text',
        inputLabel: 'Your name will appear on the PDF report',
        inputPlaceholder: 'Enter your full name',
        showCancelButton: true,
        inputValidator: (value) => {
            if (!value) {
                return 'Please enter your name!';
            }
        }
    });

    if (studentName.isConfirmed) {
        const pdfGenerator = new PDFGenerator();
        const studentGrade = get_grade_from_points(parseInt(calculatedPoints));

        // Get all the calculated cluster points from the results
        const clusterResults = {};
        document.querySelectorAll('.cluster').forEach(cluster => {
            const clusterName = cluster.querySelector('h3').textContent;
            const coursesList = Array.from(cluster.querySelectorAll('li'))
                .map(li => li.textContent.trim());
            clusterResults[clusterName] = coursesList;
        });

        // Generate PDF with actual cluster points and courses
        const doc = await pdfGenerator.generateClusterPointsPDF(
            {
                points: calculatedPoints,
                grade: studentGrade,
                clusters: clusterResults
            },
            studentName.value,
            studentGrade
        );

        // Save the PDF
        doc.save(`${studentName.value.replace(/\s+/g, '_')}_cluster_points.pdf`);
    }
}

// Add this to the existing initializeDownloadButton function
function initializeDownloadButton() {
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', generateClusterPointsPDF);
    }
}

// Make functions available globally
window.getStudentGrades = getStudentGrades;
window.getEligibleCourses = getEligibleCourses;
window.getTechnicalCourses = getTechnicalCourses;
window.displayAllResults = displayAllResults;
window.displayCombinedResults = displayCombinedResults;