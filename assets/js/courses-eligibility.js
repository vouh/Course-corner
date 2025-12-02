let coursesData = null;
let diplomaData = null;
let technicalCoursesData = null;

Promise.all([
    fetch('data/courses.json').then(response => response.json()),
    fetch('data/diploma.json').then(response => response.json()),
    fetch('data/dip.json').then(response => response.json())
])
.then(([courses, diploma, technical]) => {
    coursesData = courses;
    diplomaData = diploma;
    technicalCoursesData = technical;
})
.catch(error => {
    console.error('Error loading data:', error);
});

// Grade mapping for comparisons
const GRADE_POINTS = {
    'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
};

// Subject mapping from HTML IDs to JSON codes
const SUBJECT_MAPPING = {
    'mathematics': 'MAT',
    'english': 'ENG',
    'kiswahili': 'KIS',
    'biology': 'BIO',
    'physics': 'PHY',
    'chemistry': 'CHE',
    'geography': 'GEO',
    'history': 'HIS',
    'cre': 'CRE',
    'ire': 'IRE',
    'hre': 'HRE',
    'homeScience': 'HSC',
    'artDesign': 'ARD',
    'computerStudies': 'CMP',
    'business': 'BST',
    'french': 'FRE',
    'german': 'GER',
    'arabic': 'ARB',
    'agriculture': 'AGR'
};

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
        const htmlId = Object.keys(SUBJECT_MAPPING).find(key => 
            SUBJECT_MAPPING[key] === subject
        );
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
            const htmlId = Object.keys(SUBJECT_MAPPING).find(key => 
                SUBJECT_MAPPING[key] === name
            );
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
                const htmlId = Object.keys(SUBJECT_MAPPING).find(key => 
                    SUBJECT_MAPPING[key] === subjectCode
                );
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

    // If below C+ (46 points), only show KMTC courses if any are eligible
    if (overallPoints < 46) {
        // Remove the error return and just add KMTC courses if any
        if (kmtcCourses.length > 0) {
            results.courses['KMTC PROGRAMS'] = kmtcCourses;
        }
        return results; // Return results without error, allowing other course types to be shown
    }

    // For C+ and above, show both degree and KMTC programs
    // Process degree programs
    Object.entries(coursesData.clusters).forEach(([clusterId, cluster]) => {
        Object.entries(cluster.subClusters).forEach(([subClusterId, subCluster]) => {
            if (checkClusterRequirements(grades, subCluster.requirements)) {
                const clusterName = `${cluster.name} (${subClusterId})`;
                results.courses[clusterName] = subCluster.courses;
            }
        });
    });

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
document.addEventListener('DOMContentLoaded', function() {
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
    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('hidden');

    const studentPoints = parseInt(document.getElementById('overallGrade').value);
    
    // First check if student qualifies for combined view (C+ and above)
    if (!studentPoints || studentPoints < 46) {
        resultsDiv.innerHTML = `
            <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-yellow-800 font-medium">Points & Courses Calculator Notice</h3>
                        <div class="mt-2 text-yellow-700">
                            <p>Your grade is below C+. Cluster points calculation is only available for students with C+ and above.</p>
                            <p class="mt-2">Please use the "Courses Only" button to see your eligible courses.</p>
                        </div>
                    </div>
            </div>
        </div>
    `;
        return;
    }

    // Continue with normal error checking for required subjects
    const grades = getStudentGrades();
    const subjectsCheck = checkMinimumSubjects(grades);
    if (!subjectsCheck.isValid) {
        resultsDiv.innerHTML = subjectsCheck.message;
        return;
    }

    // Get technical courses
    const technicalResults = getTechnicalCourses(grades);

    // Show success message
    let html = generateSuccessMessage(studentPoints, getGradeDetails(studentPoints));

    // Add cluster points section (will always be shown for C+ and above)
    if (window.lastClusterPoints) {
        html += generateCollapsibleSection(
            'cluster-points',
            'Cluster Points',
            '20 clusters',
            'yellow',
            generateClusterPointsHTML(window.lastClusterPoints)
        );
    }

    // Add ALL eligible courses sections
    if (results.courses) {
        // Add degree programs
        const degreeCourses = Object.entries(results.courses)
            .filter(([name]) => !name.includes('KMTC'))
            .reduce((acc, [_, courses]) => acc + courses.length, 0);
            
        if (degreeCourses > 0) {
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
    return `
        <div class="mb-6">
            <button class="collapsible-header w-full bg-white p-4 rounded-lg shadow-lg flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors duration-200">
                <div class="flex items-center">
                    <div class="w-2 h-12 bg-${color}-500 rounded-full mr-4"></div>
                    <div>
                        <h3 class="text-xl font-semibold text-gray-800">${title}</h3>
                        <p class="text-sm text-gray-600">${count} course${count !== 1 ? 's' : ''} available</p>
                    </div>
                </div>
                <svg class="collapse-icon w-6 h-6 text-gray-400 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </button>
            <div class="collapsible-content hidden mt-4 pl-6 border-l-2 border-${color}-500">
                ${content}
            </div>
        </div>
    `;
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
                const subjectId = Object.keys(SUBJECT_MAPPING).find(key => 
                    SUBJECT_MAPPING[key] === alt
                );
                return subjectId && grades[subjectId] && 
                       meetsGradeRequirement(grades[subjectId], normalizedRequiredGrade);
            });
            if (!meetsAny) return false;
        } else {
            const subjectId = Object.keys(SUBJECT_MAPPING).find(key => 
                SUBJECT_MAPPING[key] === subject
            );
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
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';
    resultsDiv.classList.remove('hidden');

    const studentPoints = parseInt(document.getElementById('overallGrade').value);
    const gradeInfo = getGradeDetails(studentPoints);
    const technicalResults = getTechnicalCourses(getStudentGrades());

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