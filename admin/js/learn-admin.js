// Learn Admin Logic
let allApplications = [];
let allCourses = [];

async function loadLearnApplications() {
    const tableBody = document.getElementById('learn-apps-table-body');
    tableBody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Loading applications...</td></tr>`;

    try {
        const snapshot = await db.collection('learnApplications').orderBy('timestamp', 'desc').get();
        allApplications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderApplications(allApplications);
    } catch (err) {
        console.error(err);
        tableBody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-red-500"><i class="fas fa-exclamation-circle mr-2"></i> Failed to load. ${err.message}</td></tr>`;
    }
}

function renderApplications(apps) {
    const tableBody = document.getElementById('learn-apps-table-body');

    // Update stat tiles
    const total   = allApplications.length;
    const pending  = allApplications.filter(a => (a.status || 'pending') === 'pending').length;
    const approved = allApplications.filter(a => a.status === 'approved').length;
    const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    setEl('learn-stat-total',    total);
    setEl('learn-stat-pending',  pending);
    setEl('learn-stat-approved', approved);

    if (apps.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">No applications found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = apps.map(app => {
        const statusColors = {
            pending: 'bg-amber-100 text-amber-700 dark:bg-amber-800/30 dark:text-amber-400',
            contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-800/30 dark:text-blue-400',
            approved: 'bg-green-100 text-green-700 dark:bg-green-800/30 dark:text-green-400',
            rejected: 'bg-red-100 text-red-700 dark:bg-red-800/30 dark:text-red-400'
        };

        return `
            <tr class="table-row group border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400 flex items-center justify-center font-bold">
                            ${(app.email || app.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                            <p class="text-xs font-extrabold text-primary-600 dark:text-primary-400 leading-tight">${app.email || '—'}</p>
                            <p class="text-sm font-semibold text-gray-800 dark:text-white leading-tight mt-0.5">${app.name || app.fullName || 'Anonymous'}</p>
                            <p class="text-xs text-gray-400 dark:text-gray-500 leading-tight">${app.whatsapp || app.phone || ''}</p>
                        </div>
                    </div>
                </td>
                <td class="px-4 py-4">
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">${app.courseId.replace('-', ' ').toUpperCase()}</span>
                </td>
                <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${app.timestamp ? new Date(app.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}
                </td>
                <td class="px-4 py-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${statusColors[app.status || 'pending']}">
                        ${app.status || 'pending'}
                    </span>
                </td>
                <td class="px-4 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="updateApplicationStatus('${app.id}', 'contacted')" class="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Mark Contacted">
                            <i class="fas fa-phone-alt fa-sm"></i>
                        </button>
                        <button onclick="updateApplicationStatus('${app.id}', 'approved')" class="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Mark Approved">
                            <i class="fas fa-check fa-sm"></i>
                        </button>
                        <button onclick="deleteApplication('${app.id}')" class="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete">
                            <i class="fas fa-trash-alt fa-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function updateApplicationStatus(id, newStatus) {
    try {
        await db.collection('learnApplications').doc(id).update({ status: newStatus });
        showToast(`Updated to ${newStatus}`, 'success');
        loadLearnApplications();
    } catch (err) {
        showToast('Update failed!', 'error');
    }
}

async function deleteApplication(id) {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
        await db.collection('learnApplications').doc(id).delete();
        showToast('Application deleted!', 'success');
        loadLearnApplications();
    } catch (err) {
        showToast('Delete failed!', 'error');
    }
}

function filterLearnApps() {
    const val = document.getElementById('app-status-filter').value;
    if (val === 'all') renderApplications(allApplications);
    else renderApplications(allApplications.filter(a => a.status === val));
}

async function loadLearnCourses() {
    const grid = document.getElementById('courses-grid');
    grid.innerHTML = `<div class="col-span-full py-20 text-center"><i class="fas fa-spinner fa-spin fa-3x text-primary-500"></i></div>`;
    
    try {
        const resp = await fetch('../Learn/data/courses.json');
        allCourses = await resp.json();
        renderCourses(allCourses);
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class="col-span-full py-20 text-center text-red-500">Failed to load courses.</div>`;
    }
}

function renderCourses(courses) {
    const grid = document.getElementById('courses-grid');
    const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    setEl('learn-stat-courses', courses.length);
    grid.innerHTML = courses.map(c => `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-all">
                <button onclick="editCourse('${c.id}')" class="p-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg"><i class="fas fa-edit"></i></button>
            </div>
            <div class="flex items-center gap-4 mb-6">
                <div class="w-14 h-14 bg-primary-100 dark:bg-primary-900/30 text-primary-600 rounded-2xl flex items-center justify-center text-2xl">
                    <i class="fas fa-book"></i>
                </div>
                <div>
                    <h4 class="text-lg font-bold text-gray-900 dark:text-white">${c.title}</h4>
                    <p class="text-xs text-gray-500 font-bold uppercase tracking-widest">${c.duration} &middot; ${c.level}</p>
                </div>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-6 line-clamp-2">${c.description}</p>
            <div class="flex items-center justify-between pt-6 border-t border-gray-100 dark:border-gray-700">
                <span class="text-lg font-bold text-gray-900 dark:text-white">${c.currency} ${c.fee.toLocaleString()}</span>
                <span class="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold">${c.modulesCount} Modules</span>
            </div>
        </div>
    `).join('');
}

function openAddCourseModal() {
    Swal.fire({
        title: 'Coming Soon!',
        text: 'The ability to add/edit courses directly from the dashboard is being finalized. For now, please update data/learn-courses.json manually.',
        icon: 'info',
        confirmButtonColor: '#16a34a'
    });
}

function editCourse(id) {
    Swal.fire({
        title: 'Edit Course',
        text: `Editing system for course ID: ${id} is coming soon.`,
        icon: 'info',
        confirmButtonColor: '#16a34a'
    });
}
