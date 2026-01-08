document.addEventListener('DOMContentLoaded', function () {
    // Initialize grade selects
    initializeGradeSelects();

    // NOTE: Payment buttons are handled by paymentHandler.js
    // Direct calculation is ONLY done after payment is confirmed
    // Do NOT add click listener to calculateBtn here

    // Export functions to window for payment handler
    window.calculateClusterPoints = calculateClusterPoints;
    window.displayResults = displayResults;

    // Get all grade select dropdowns
    const gradeSelects = document.querySelectorAll('.grade-select');


});

function initializeGradeSelects() {
    const gradeSelects = document.querySelectorAll('.grade-select');
    const grades = [
        { value: '12', text: 'A' },
        { value: '11', text: 'A-' },
        { value: '10', text: 'B+' },
        { value: '9', text: 'B' },
        { value: '8', text: 'B-' },
        { value: '7', text: 'C+' },
        { value: '6', text: 'C' },
        { value: '5', text: 'C-' },
        { value: '4', text: 'D+' },
        { value: '3', text: 'D' },
        { value: '2', text: 'D-' },
        { value: '1', text: 'E' }
    ];

    gradeSelects.forEach(select => {
        // Clear existing options
        select.innerHTML = '';

        // Add default "Select Grade" option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Grade';
        select.appendChild(defaultOption);

        // Add grade options
        grades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade.value;
            option.textContent = grade.text;
            select.appendChild(option);
        });
    });
}

function calculateClusterPoints() {
    // Add console.log for debugging
    console.log('Calculate button clicked');

    // Validation
    if (!validateInputs()) {
        console.log('Validation failed');
        return;
    }

    // Get all subject scores
    const scores = getAllSubjectScores();
    console.log('Scores:', scores);

    // Calculate cluster points for all clusters (1-20)
    const allClusterPoints = {};
    for (let i = 1; i <= 20; i++) {
        // Create cluster subjects logic
        const clusterSubjects = selectClusterSubjects(scores, i);

        // Skip if cluster subjects is null
        if (!clusterSubjects) {
            allClusterPoints[`Cluster ${i}`] = 0;
            continue;
        }

        // Calculate r (sum of 4 cluster subjects scores)
        const r = Object.values(clusterSubjects).reduce((sum, sub) => sum + (sub.score || 0), 0);

        // Get t (total KCSE points - 84 max)
        const t = parseInt(document.getElementById('overallGrade').value) || 0;

        // Formula: C = sqrt((r/48) * (t/84)) * 48
        // Formula: C = sqrt((r / 48) * (t / 84)) * 48
        // User requested 1c, 1b etc not included, just 1-20
        const points = (Math.sqrt((r / 48) * (t / 84)) * 48);
        allClusterPoints[`Cluster ${i}`] = points;
    }

    console.log('All cluster points:', allClusterPoints);
    window.lastClusterPoints = allClusterPoints; // Store for eligibility display

    // Automatically trigger display
    displayResults(allClusterPoints);

    return allClusterPoints;
}

function validateInputs() {
    const errors = [];
    const scores = getAllSubjectScores();
    const filledCount = Object.values(scores).filter(s => s.score > 0).length;

    // 1. Check 7 subjects rule
    if (filledCount < 7) {
        errors.push("Please select at least 7 subjects (You have filled " + filledCount + ")");
    }

    // 2. Check compulsory subjects (Math, 2 Sciences, 1 Language)
    if (!scores.mathematics || scores.mathematics.score === 0) {
        errors.push("Mathematics is compulsory");
    }

    const sciences = ['biology', 'physics', 'chemistry'];
    const filledSciences = sciences.filter(s => scores[s] && scores[s].score > 0);
    if (filledSciences.length < 2) {
        errors.push("At least two science subjects are required");
    }

    const languages = ['english', 'kiswahili'];
    const filledLanguages = languages.filter(l => scores[l] && scores[l].score > 0);
    if (filledLanguages.length === 0) {
        errors.push("At least one language (English or Kiswahili) is required");
    }

    // Check overall grade
    const overallGrade = parseInt(document.getElementById('overallGrade').value);
    if (!overallGrade) {
        errors.push("Overall grade calculation is incomplete");
    }

    // Log errors
    if (errors.length > 0) {
        console.error('Validation errors:', errors);
        // We still return true if we want to try and show results anyway 
        // especially if it's called after a successful payment
        return true;
    }
    return true;
}

function getAllSubjectScores() {
    const subjects = [
        'english', 'kiswahili', 'mathematics',
        'biology', 'physics', 'chemistry',
        'history', 'geography', 'business',
        'agriculture', 'french', 'german', 'arabic',
        'cre', 'ire', 'hre', 'homeScience', 'signLanguage',
        'computerStudies', 'aviation', 'woodwork', 'metalWork',
        'buildingConstruction', 'artDesign'
    ];

    const scores = {};
    subjects.forEach(subject => {
        const element = document.getElementById(subject);
        if (element) {
            scores[subject] = {
                score: parseInt(element.value) || 0,
                name: element.previousElementSibling ? element.previousElementSibling.textContent : subject
            };
        }
    });
    return scores;
}

const SUBJECT_GROUPS = {
    GROUP_I: ['english', 'kiswahili'],
    GROUP_II: ['mathematics', 'biology', 'physics', 'chemistry'],
    GROUP_III: ['history', 'geography', 'cre', 'ire', 'hre'],
    GROUP_IV: [
        'agriculture',
        'homeScience',
        'business',
        'music',
        'computerStudies',
        'aviation',
        'woodwork',
        'metalWork',
        'buildingConstruction',
        'artDesign'
    ],
    GROUP_V: ['french', 'german', 'arabic', 'signLanguage']
};

function selectClusterSubjects(scores, clusterNum) {
    const validateRequiredSubject = (subjectScore, subjectName, clusterNum) => {
        if (!subjectScore) {
            console.log(`Cluster ${clusterNum}: Required subject ${subjectName} missing`);
            return false;
        }
        return true;
    };

    switch (clusterNum) {
        case 1:
            if (!validateRequiredSubject(scores.mathematics, 'Mathematics', 1)) {
                return null;
            }
            return {
                subject1: getBestScore(['english', 'kiswahili'], scores),
                subject2: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject3: getBestScore(['biology', 'physics', 'chemistry'], scores),
                subject4: getBestRemainingScore(scores, ['mathematics'])
            };

        case 2:
            if (!validateRequiredSubject(scores.mathematics, 'Mathematics', 2)) {
                return null;
            }
            return {
                subject1: getBestScore(['english', 'kiswahili'], scores),
                subject2: getBestScore(['english', 'kiswahili'], scores, true),
                subject3: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_III], scores)
            };

        case 4:
        case 5:
        case 6:
        case 7:
            if (!validateRequiredSubject(scores.mathematics, 'Mathematics', clusterNum) ||
                !validateRequiredSubject(scores.physics, 'Physics', clusterNum)) {
                return null;
            }
            return {
                subject1: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject2: { name: 'Physics', score: scores.physics || 0 },
                subject3: getBestScore(['biology', 'chemistry', 'geography'], scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 8:
            if (!validateRequiredSubject(scores.mathematics, 'Mathematics', 8) ||
                !validateRequiredSubject(scores.biology, 'Biology', 8)) {
                return null;
            }
            return {
                subject1: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject2: { name: 'Biology', score: scores.biology || 0 },
                subject3: getBestScore(['physics', 'chemistry'], scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores, true)
            };

        case 11:
            if (!validateRequiredSubject(scores.chemistry, 'Chemistry', 11)) {
                return null;
            }
            return {
                subject1: { name: 'Chemistry', score: scores.chemistry || 0 },
                subject2: getBestScore(['mathematics', 'physics'], scores),
                subject3: getBestScore(['biology', 'homeScience'], scores),
                subject4: getBestGroupScore(['english', 'kiswahili', ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 13:
        case 15:
            if (!validateRequiredSubject(scores.biology, 'Biology', clusterNum) ||
                !validateRequiredSubject(scores.chemistry, 'Chemistry', clusterNum)) {
                return null;
            }
            return {
                subject1: { name: 'Biology', score: scores.biology || 0 },
                subject2: { name: 'Chemistry', score: scores.chemistry || 0 },
                subject3: getBestScore(['mathematics', 'physics', 'geography'], scores),
                subject4: getBestGroupScore(['english', 'kiswahili', ...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 16:
            if (!validateRequiredSubject(scores.geography, 'Geography', 16) ||
                !validateRequiredSubject(scores.mathematics, 'Mathematics', 16)) {
                return null;
            }
            return {
                subject1: { name: 'Geography', score: scores.geography || 0 },
                subject2: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject3: getBestGroupScore(SUBJECT_GROUPS.GROUP_II, scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores, true)
            };

        case 19:
            if (!validateRequiredSubject(scores.english, 'English', 19)) {
                return null;
            }
            return {
                subject1: { name: 'English', score: scores.english || 0 },
                subject2: getBestGroupScore(['mathematics', ...SUBJECT_GROUPS.GROUP_II], scores),
                subject3: getBestGroupScore(SUBJECT_GROUPS.GROUP_II, scores, true),
                subject4: getBestGroupScore(['kiswahili', ...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 3:
            return {
                subject1: getBestScore(['english', 'kiswahili'], scores),
                subject2: getBestScore(['mathematics'], scores),
                subject3: getBestScore(['biology', 'physics', 'chemistry'], scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV], scores)
            };

        case 9:
        case 10:
        case 12:
        case 14:
            return {
                subject1: getBestScore(['biology', 'physics', 'chemistry'], scores),
                subject2: getBestScore(['biology', 'physics', 'chemistry'], scores, true),
                subject3: getBestGroupScore(SUBJECT_GROUPS.GROUP_II, scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 17:
            // Validate that either French or German is present
            if (!scores.french && !scores.german) {
                console.log('Cluster 17: Required subject French or German missing');
                return null;
            }
            return {
                subject1: getBestScore(['french', 'german'], scores),
                subject2: getBestScore(['english', 'kiswahili'], scores),
                subject3: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III], scores),
                subject4: getBestGroupScore(['english', 'kiswahili', ...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 18:
            // Validate that Music is present
            if (!scores.music) {
                console.log('Cluster 18: Required subject Music missing');
                return null;
            }
            return {
                subject1: { name: 'Music', score: scores.music || 0 },
                subject2: getBestScore(['english', 'kiswahili'], scores),
                subject3: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III], scores),
                subject4: getBestGroupScore(['english', 'kiswahili', ...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores)
            };

        case 20:
            if (!validateRequiredSubject(scores.mathematics, 'Mathematics', 20) ||
                !validateRequiredSubject(scores.biology, 'Biology', 20)) {
                return null;
            }
            return {
                subject1: { name: 'Mathematics', score: scores.mathematics || 0 },
                subject2: { name: 'Biology', score: scores.biology || 0 },
                subject3: getBestScore(['physics', 'chemistry'], scores),
                subject4: getBestGroupScore([...SUBJECT_GROUPS.GROUP_II, ...SUBJECT_GROUPS.GROUP_III, ...SUBJECT_GROUPS.GROUP_IV, ...SUBJECT_GROUPS.GROUP_V], scores, true)
            };

        default:
            console.log(`Unhandled cluster number: ${clusterNum}`);
            return null;
    }
}

function getBestScore(subjects, scores, excludeFirst = false) {
    const subjectScores = subjects
        .map(subject => ({
            name: subject.charAt(0).toUpperCase() + subject.slice(1),
            score: scores[subject] || 0
        }))
        .sort((a, b) => b.score - a.score);

    return excludeFirst ? subjectScores[1] || subjectScores[0] : subjectScores[0];
}

function getBestGroupScore(groupSubjects, scores, excludeFirst = false) {
    return getBestScore(groupSubjects, scores, excludeFirst);
}

function getBestRemainingScore(scores, excludeSubjects) {
    const allSubjects = Object.keys(scores);
    const remainingSubjects = allSubjects.filter(subject => !excludeSubjects.includes(subject));
    return getBestScore(remainingSubjects, scores);
}

function displayResults(allClusterPoints) {
    // Extract the HTML generation into a separate function
    const clusterPointsHTML = generateClusterPointsHTML(allClusterPoints);

    // If called directly (from first button), display in results div
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = clusterPointsHTML;
    }

    // Store the results for reuse
    window.lastClusterPoints = allClusterPoints;
    return clusterPointsHTML;
}

// New function to generate cluster points HTML
function generateClusterPointsHTML(allClusterPoints) {
    const overallGrade = parseInt(document.getElementById('overallGrade').value);

    // Check if overall grade is below C+ (45 points)
    if (overallGrade < 45) {
        return `
            <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-red-800 font-medium text-lg">University Entry Not Qualified</h3>
                        <div class="mt-2 text-red-700">
                            <p>Your overall grade is below C+. You do not qualify for direct university entry.</p>
                            <p class="mt-2">Consider exploring:</p>
                            <ul class="list-disc list-inside mt-1">
                                <li>Diploma programs</li>
                                <li>Certificate courses</li>
                                <li>Bridging courses</li>
                                <li>Technical training institutions</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Generate cluster points cards HTML
    let clusterCardsHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${Object.entries(allClusterPoints).map(([cluster, points]) => {
        const percentage = (points / 48) * 100;
        const isEligible = points >= 45;

        return `
                    <div class="cluster-card bg-white p-4 rounded-lg shadow-md hover:shadow-lg transition-all fade-in-up">
                        <h4 class="text-xl font-bold mb-2">${cluster}</h4>
                        <div class="relative pt-1">
                            <div class="overflow-hidden h-2 mb-4 text-xs flex 'bg-green-100">
                                <div 
                                    class="progress-bar-fill shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${isEligible ? 'bg-green-500' : 'bg-red-500'}"
                                    style="width: ${percentage}%">
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="text-xl font-bold ${isEligible ? 'text-green-500' : 'text-pink-500'}">
                                    ${points.toFixed(4)}
                                </span>
                                <span class="text-sm"> / 48</span>
                            </div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
        <div class="mt-6 space-y-4">
            <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-gray-600">
                <p>Note: We strive to provide the most accurate calculations possible. However, due to KUCCPS standardization, actual cluster points may vary by ±2 points range. However this approximation is important to have proper campus and course goals. These results should be used as a close approximation for making preliminary decisions.</p>
            </div>
        </div>
    `;

    return clusterCardsHTML;
} 