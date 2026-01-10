// Wrap in IIFE to prevent global scope conflicts with calculator.js
(function () {
    'use strict';
    console.log('🚀 courses-eligibility.js: Starting script execution');

    // 1. Grade mapping for comparisons (scoped to this IIFE)
    const GRADE_POINTS = {
        'A': 12, 'A-': 11, 'B+': 10, 'B': 9, 'B-': 8,
        'C+': 7, 'C': 6, 'C-': 5, 'D+': 4, 'D': 3, 'D-': 2, 'E': 1
    };

    // 2. Subject mapping from HTML IDs to JSON codes and aliases
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

    // 3. Group definitions
    const SUBJECT_GROUPS = {
        GROUP2: ['biology', 'physics', 'chemistry'],
        GROUP3: ['geography', 'history', 'cre', 'ire', 'hre'],
        GROUP4: ['homeScience', 'artDesign', 'agriculture', 'computerStudies', 'business'],
        GROUP5: ['french', 'german', 'arabic', 'music']
    };

    const GROUP_DEFINITIONS = {
        GROUP1: ['MATHEMATICS', 'ENGLISH', 'KISWAHILI'],
        GROUP2: ['BIOLOGY', 'PHYSICS', 'CHEMISTRY'],
        GROUP3: ['GEOGRAPHY', 'HISTORY', 'CRE', 'IRE', 'HRE'],
        GROUP4: ['HOME_SCIENCE', 'ART_DESIGN', 'COMPUTER_STUDIES', 'BUSINESS_STUDIES'],
        GROUP5: ['FRENCH', 'GERMAN', 'ARABIC']
    };

    // 4. Global Variables
    let coursesData = null;
    let diplomaData = null;
    let technicalCoursesData = null;

    // 5. Make functions available globally IMMEDIATELY
    try {
        console.log('🚀 courses-eligibility.js: Initializing global functions...');
        window.getStudentGrades = getStudentGrades;
        window.getEligibleCourses = getEligibleCourses;
        window.getTechnicalCourses = getTechnicalCourses;
        window.displayAllResults = displayAllResults;
        window.displayCombinedResults = displayCombinedResults;
        window.displayResultsUnified = displayResultsUnified;
        window.convertGrade = convertGrade;
        window.findSubjectId = findSubjectId;
        console.log('✅ courses-eligibility.js: Global functions attached to window');
    } catch (e) {
        console.error('❌ Error attaching functions to window:', e);
    }

    // 6. Data Fetching
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
            window.dataLoaded = true;
        })
        .catch(error => {
            console.error('Error loading data:', error);
            window.dataLoadError = error.message;
        });

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

    // Check cluster requirements - with subject tracking to prevent double-counting
    function checkClusterRequirements(grades, requirements) {
        console.log('Checking requirements:', requirements);
        console.log('With grades:', grades);

        // Track which subjects have been used to satisfy requirements
        const usedSubjects = new Set();

        for (let i = 1; i <= 4; i++) {
            const requirement = requirements[`subject${i}`];
            if (!requirement) continue;

            const { name, minGrade } = requirement;
            console.log(`Checking requirement ${i}:`, requirement);

            let requirementMet = false;
            let subjectUsed = null;

            if (name.includes('/')) {
                if (name.startsWith('GROUP')) {
                    // Check groups
                    const result = checkGroupRequirementWithTracking(name, grades, minGrade, usedSubjects);
                    requirementMet = result.met;
                    subjectUsed = result.subject;
                } else {
                    // Check alternative subjects (e.g., "MAT/PHY/CHE/BIO")
                    const result = checkAlternativeSubjectsWithTracking(name, grades, minGrade, usedSubjects);
                    requirementMet = result.met;
                    subjectUsed = result.subject;
                }
            } else if (name.startsWith('GROUP')) {
                const result = checkGroupRequirementWithTracking(name, grades, minGrade, usedSubjects);
                requirementMet = result.met;
                subjectUsed = result.subject;
            } else {
                // Single subject requirement
                const htmlId = findSubjectId(name);
                if (htmlId && grades[htmlId] && !usedSubjects.has(htmlId) &&
                    (!minGrade || meetsGradeRequirement(grades[htmlId], minGrade))) {
                    requirementMet = true;
                    subjectUsed = htmlId;
                }
            }

            // Mark subject as used if requirement was met
            if (subjectUsed) {
                usedSubjects.add(subjectUsed);
            }

            console.log(`Requirement ${i} met:`, requirementMet, subjectUsed ? `(used: ${subjectUsed})` : '');
            if (!requirementMet) return false;
        }
        return true;
    }

    // Check alternative subjects with tracking (e.g., "MAT/PHY/BIO")
    function checkAlternativeSubjectsWithTracking(subjects, grades, minGrade, usedSubjects) {
        const alternatives = subjects.split('/');
        for (const subject of alternatives) {
            const htmlId = findSubjectId(subject);
            if (htmlId && grades[htmlId] && !usedSubjects.has(htmlId)) {
                if (!minGrade || meetsGradeRequirement(grades[htmlId], minGrade)) {
                    return { met: true, subject: htmlId };
                }
            }
        }
        return { met: false, subject: null };
    }

    // Check group requirement with tracking
    function checkGroupRequirementWithTracking(groupName, grades, minGrade, usedSubjects) {
        const groups = groupName.split('/');
        for (const group of groups) {
            const subjects = SUBJECT_GROUPS[group] || [];
            for (const subject of subjects) {
                if (grades[subject] && !usedSubjects.has(subject)) {
                    if (!minGrade || meetsGradeRequirement(grades[subject], minGrade)) {
                        return { met: true, subject: subject };
                    }
                }
            }
        }
        return { met: false, subject: null };
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

    // Unified display function
    function displayResultsUnified(type, results) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        // Store current package type for PDF generation
        window.lastPackageType = type;

        resultsDiv.innerHTML = '';
        resultsDiv.classList.remove('hidden');

        const studentPoints = parseInt(document.getElementById('overallGrade').value) || 0;
        const gradeInfo = getGradeDetails(studentPoints);

        // Always show success banner with download button for paid results
        let html = generateSuccessMessage(studentPoints, gradeInfo);

        // Add specific sections based on type
        if (type === 'points-only' || type === 'combined') {
            if (window.lastClusterPoints && typeof window.generateClusterPointsHTML === 'function') {
                html += generateCollapsibleSection(
                    'cluster-points',
                    'Cluster Points',
                    '20 clusters',
                    'yellow',
                    window.generateClusterPointsHTML(window.lastClusterPoints)
                );
            }
        }

        if (type === 'courses-only' || type === 'combined') {
            const grades = getStudentGrades();
            const techRes = getTechnicalCourses(grades);

            // Subject Grades section
            html += generateCollapsibleSection(
                'subject-grades',
                'Your Subject Grades',
                Object.keys(grades).length,
                'blue',
                `<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    ${Object.entries(grades).map(([subject, grade]) => `
                        <div class="bg-white p-3 rounded-lg border-l-4 border-blue-400 shadow-sm">
                            <span class="text-gray-600 text-sm">${subject.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                            <span class="block font-bold text-lg text-blue-600">${grade}</span>
                        </div>
                    `).join('')}
                </div>`
            );

            if (results.courses) {
                // Degree Programs
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

                // KMTC
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

            // Technical Courses
            if (techRes?.courses) {
                ['DIPLOMA PROGRAMS', 'CERTIFICATE PROGRAMS', 'ARTISAN PROGRAMS'].forEach(cat => {
                    if (techRes.courses[cat]?.length > 0) {
                        const count = techRes.courses[cat].reduce((acc, c) => acc + c.programs.length, 0);
                        const color = cat.startsWith('DIP') ? 'blue' : (cat.startsWith('CER') ? 'purple' : 'orange');
                        html += generateCollapsibleSection(
                            cat.toLowerCase().replace(' ', '-'),
                            cat,
                            count,
                            color,
                            generateTechnicalCategoryHTML(cat, techRes, color)
                        );
                    }
                });
            }
        }

        resultsDiv.innerHTML = html;
        initializeCollapsibleSections();
        initializeDownloadButton();

        // Trigger Confetti
        if (window.confetti) {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444']
            });
        }
    }

    // Map existing display functions to the unified one
    function displayAllResults(results) {
        displayResultsUnified('courses-only', results);
    }

    function displayCombinedResults(results) {
        displayResultsUnified('combined', results);
    }


    // Helper function to generate success message
    function generateSuccessMessage(points, gradeInfo) {
        return `
        <div class="bg-green-50 border-l-4 border-green-500 p-4 md:p-6 mb-8 rounded-lg shadow-lg">
            <div class="flex flex-col md:flex-row items-center md:justify-between gap-6">
                <div class="flex flex-col md:flex-row items-center text-center md:text-left">
                    <div class="flex-shrink-0">
                        <svg class="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div class="md:ml-4 mt-2 md:mt-0">
                        <h3 class="text-xl md:text-2xl font-bold text-green-800">Your Results</h3>
                        <div class="mt-2">
                            <p class="text-base md:text-lg text-green-700">
                                You have scored <span class="font-bold">${points} points</span> 
                                (Grade ${gradeInfo.grade})
                            </p>
                            <p class="text-green-600 mt-1 text-sm md:text-base">${gradeInfo.message}</p>
                        </div>
                    </div>
                </div>
                <button id="downloadBtn" class="flex items-center justify-center w-full md:w-auto px-6 py-3 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-700 transition-all duration-200 gap-2 hover:shadow-green-200 hover:shadow-xl">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    <span class="whitespace-nowrap">Download PDF</span>
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



    // Optimized Download Button Initialization
    function initializeDownloadButton() {
        const btn = document.getElementById('downloadBtn');
        if (!btn) return;

        btn.onclick = generateClusterPointsPDF;
    }

    // Fast data-driven PDF generation
    async function generateClusterPointsPDF() {
        // Fix scroll lock immediately if stuck
        fixScrollLock();

        const studentPoints = document.getElementById('overallGrade').value;
        if (!studentPoints) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Please calculate results first.' });
            return;
        }

        const { value: name, isConfirmed } = await Swal.fire({
            title: 'Enter Name for PDF',
            input: 'text',
            inputLabel: 'Your name will appear on the report',
            showCancelButton: true,
            inputValidator: (v) => !v && 'Name is required!'
        });

        if (!isConfirmed) {
            fixScrollLock();
            return;
        }

        // Show loading state
        Swal.fire({
            title: 'Generating Report...',
            text: 'Please wait a moment',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        try {

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();

            // Theme Colors (Matching Website Green)
            const THEME = {
                primary: [22, 163, 74], // Green
                secondary: [21, 128, 61], // Darker Green
                blue: [37, 99, 235],
                gray: [107, 114, 128],
                dark: [31, 41, 55]
            };

            const addFooter = (p) => {
                const pageCount = p.internal.getNumberOfPages();
                p.setFontSize(8);
                p.setTextColor(...THEME.gray);
                const footerText = `© Course Corner 2026 | Page ${pageCount}`;
                p.text(footerText, 105, 287, { align: 'center' });
            };

            const checkPage = (p, currentY, margin = 30) => {
                if (currentY > (297 - margin)) {
                    addFooter(p);
                    p.addPage();
                    return 20;
                }
                return currentY;
            };

            let y = 20;

            // Header Section
            pdf.setFontSize(24);
            pdf.setTextColor(...THEME.primary);
            pdf.setFont(undefined, 'bold');
            pdf.text('Course Corner Report', 105, y, { align: 'center' });

            // Decorative Line
            y += 4;
            pdf.setDrawColor(...THEME.primary);
            pdf.setLineWidth(0.5);
            pdf.line(40, y, 170, y);

            y += 12;
            pdf.setFontSize(14);
            pdf.setTextColor(...THEME.dark);
            pdf.text(`Student: ${name}`, 105, y, { align: 'center' });
            y += 7;
            pdf.setFontSize(11);
            pdf.setTextColor(...THEME.gray);
            pdf.text(`Grade Points: ${studentPoints} | Date: ${new Date().toLocaleDateString()}`, 105, y, { align: 'center' });
            y += 15;

            const gradesSnapshot = getStudentGrades();

            // 1. Subject Grades
            pdf.setFontSize(16);
            pdf.setTextColor(...THEME.secondary);
            pdf.setFont(undefined, 'bold');
            pdf.text('Your Subject Grades', 15, y);
            y += 8;

            pdf.setFontSize(10);
            pdf.setTextColor(...THEME.dark);
            pdf.setFont(undefined, 'normal');

            const gradeEntries = Object.entries(gradesSnapshot);
            for (let i = 0; i < gradeEntries.length; i += 2) {
                y = checkPage(pdf, y);
                const [s1, g1] = gradeEntries[i];
                const sName1 = s1.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                pdf.text(`${sName1}: ${g1}`, 20, y);

                if (gradeEntries[i + 1]) {
                    const [s2, g2] = gradeEntries[i + 1];
                    const sName2 = s2.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    pdf.text(`${sName2}: ${g2}`, 110, y);
                }
                y += 6;
            }
            y += 10;

            // 2. Cluster Points
            if ((window.lastPackageType === 'points-only' || window.lastPackageType === 'combined') && window.lastClusterPoints) {
                y = checkPage(pdf, y);
                pdf.setFontSize(16);
                pdf.setTextColor(...THEME.secondary);
                pdf.setFont(undefined, 'bold');
                pdf.text('Cluster Points Analysis', 15, y);
                y += 8;

                pdf.setFontSize(10);
                pdf.setTextColor(...THEME.dark);
                pdf.setFont(undefined, 'normal');

                const entries = Object.entries(window.lastClusterPoints);
                for (let i = 0; i < entries.length; i += 2) {
                    y = checkPage(pdf, y);
                    const [c1, p1] = entries[i];
                    pdf.text(`${c1}: ${p1.toFixed(3)}`, 20, y);

                    if (entries[i + 1]) {
                        const [c2, p2] = entries[i + 1];
                        pdf.text(`${c2}: ${p2.toFixed(3)}`, 110, y);
                    }
                    y += 6;
                }
                y += 10;
            }

            // 3. Eligible Programs
            if (window.lastPackageType === 'courses-only' || window.lastPackageType === 'combined') {
                const universityResults = getEligibleCourses(gradesSnapshot);
                const technicalResults = getTechnicalCourses(gradesSnapshot);

                y = checkPage(pdf, y, 40);
                pdf.setFontSize(16);
                pdf.setTextColor(...THEME.secondary);
                pdf.setFont(undefined, 'bold');
                pdf.text('Eligible Academic Programs', 15, y);
                y += 8;

                const allCategories = {
                    ...(universityResults.courses || {}),
                    ...(technicalResults.courses || {})
                };

                Object.entries(allCategories).forEach(([cat, data]) => {
                    y = checkPage(pdf, y, 35);
                    pdf.setFontSize(11);
                    pdf.setTextColor(...THEME.primary);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(cat, 15, y);
                    y += 6;

                    pdf.setFontSize(9);
                    pdf.setTextColor(...THEME.dark);
                    pdf.setFont(undefined, 'normal');

                    if (Array.isArray(data) && typeof data[0] === 'string') {
                        data.forEach(p => {
                            y = checkPage(pdf, y);
                            pdf.setTextColor(...THEME.primary);
                            pdf.text('•', 20, y);
                            pdf.setTextColor(...THEME.dark);
                            pdf.text(p, 24, y);
                            y += 5;
                        });
                    } else if (data.map) {
                        data.forEach(sub => {
                            y = checkPage(pdf, y, 25);
                            pdf.setFont(undefined, 'italic');
                            pdf.setTextColor(...THEME.secondary);
                            pdf.text(sub.category.replace(/\s*-\s*Subcat\s*\d+/g, ''), 20, y);
                            y += 5;
                            pdf.setFont(undefined, 'normal');
                            pdf.setTextColor(...THEME.dark);

                            if (sub.programs) {
                                sub.programs.forEach(p => {
                                    y = checkPage(pdf, y);
                                    pdf.setTextColor(...THEME.primary);
                                    pdf.text('•', 25, y);
                                    pdf.setTextColor(...THEME.dark);
                                    pdf.text(p, 29, y);
                                    y += 4.5;
                                });
                            }
                            y += 2;
                        });
                    }
                    y += 4;
                });
            }

            addFooter(pdf);
            pdf.save(`${name.replace(/\s+/g, '_')}_Course_Corner_Report.pdf`);

            Swal.fire({ icon: 'success', title: 'Report Generated!', timer: 2000, showConfirmButton: false });
        } catch (error) {
            console.error('PDF Error:', error);
            Swal.fire({ icon: 'error', title: 'Generation Failed', text: 'An error occurred while creating your PDF.' });
        } finally {
            setTimeout(fixScrollLock, 2100);
        }
    }

    // Explicit helper to fix scroll block
    function fixScrollLock() {
        document.body.classList.remove('swal2-shown', 'swal2-height-auto');
        document.body.style.overflow = 'auto';
        document.body.style.paddingRight = '0px';
    }

    console.log('🏁 courses-eligibility.js: Script fully loaded');
})(); // End of IIFE