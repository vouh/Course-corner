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
        const laptopText = app.laptop === true || app.laptop === 'yes' || app.laptop === 'Yes'
            ? '<span style="color:#16a34a;font-weight:700"><i class="fas fa-check-circle"></i> Yes</span>'
            : app.laptop === false || app.laptop === 'no' || app.laptop === 'No'
            ? '<span style="color:#dc2626;font-weight:700"><i class="fas fa-times-circle"></i> No</span>'
            : '<span style="color:#9ca3af">Not specified</span>';
        const date = app.timestamp ? new Date(app.timestamp.seconds * 1000).toLocaleString() : 'N/A';

        return `
            <tr class="table-row group border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 cursor-pointer" onclick="toggleAppDetails('${app.id}')">
                <td class="px-4 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-400 flex items-center justify-center font-bold flex-shrink-0">
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
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">${(app.courseId || '—').replace(/-/g,' ').toUpperCase()}</span>
                </td>
                <td class="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    ${app.timestamp ? new Date(app.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}
                </td>
                <td class="px-4 py-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${statusColors[app.status || 'pending']}">
                        ${app.status || 'pending'}
                    </span>
                </td>
                <td class="px-4 py-4 text-right" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="toggleAppDetails('${app.id}')" class="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Toggle Details">
                            <i class="fas fa-chevron-down fa-sm" id="chevron-${app.id}" style="transition:transform .2s"></i>
                        </button>
                        <button onclick="updateApplicationStatus('${app.id}', 'contacted')" class="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Mark Contacted">
                            <i class="fas fa-phone-alt fa-sm"></i>
                        </button>
                        <button onclick="updateApplicationStatus('${app.id}', 'approved')" class="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Approve">
                            <i class="fas fa-check fa-sm"></i>
                        </button>
                        <button onclick="deleteApplication('${app.id}')" class="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete">
                            <i class="fas fa-trash-alt fa-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
            <tr id="detail-${app.id}" style="display:none">
                <td colspan="5" class="px-6 pb-5 pt-0">
                    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:.75rem;padding:1.25rem 1.5rem;font-size:.875rem;color:#374151;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.75rem 2rem">
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Full Name</span>${app.name || app.fullName || '—'}</div>
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Email</span>${app.email || '—'}</div>
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">WhatsApp</span>${app.whatsapp || app.phone || '—'}</div>
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Location</span>${app.location || '—'}</div>
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Has Laptop</span>${laptopText}</div>
                        <div><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Submitted</span>${date}</div>
                        ${app.interest || app.reason || app.message ? `<div style="grid-column:1/-1"><span style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;display:block;margin-bottom:.2rem">Why Interested</span><span style="line-height:1.6">${app.interest || app.reason || app.message}</span></div>` : ''}
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

function toggleAppDetails(id) {
    const row = document.getElementById('detail-' + id);
    const chevron = document.getElementById('chevron-' + id);
    if (!row) return;
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function viewApplication(id) {
    const app = allApplications.find(a => a.id === id);
    if (!app) return;

    const laptopBadge = app.laptop === true || app.laptop === 'yes' || app.laptop === 'Yes'
        ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold"><i class="fas fa-check-circle"></i> Yes — has a laptop</span>`
        : app.laptop === false || app.laptop === 'no' || app.laptop === 'No'
        ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-bold"><i class="fas fa-times-circle"></i> No — does not have a laptop</span>`
        : `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold"><i class="fas fa-question-circle"></i> Not specified</span>`;

    const date = app.timestamp
        ? new Date(app.timestamp.seconds * 1000).toLocaleString()
        : 'N/A';

    const statusColors = {
        pending:   'background:#fef3c7;color:#b45309',
        contacted: 'background:#dbeafe;color:#1d4ed8',
        approved:  'background:#dcfce7;color:#15803d',
        rejected:  'background:#fee2e2;color:#dc2626'
    };
    const statusStyle = statusColors[app.status || 'pending'] || statusColors.pending;

    Swal.fire({
        title: '',
        width: 520,
        padding: '0',
        showConfirmButton: false,
        showCloseButton: true,
        html: `
        <div style="text-align:left;font-family:'Inter',sans-serif;">
            <div style="background:linear-gradient(135deg,#16a34a,#0ea5e9);padding:1.5rem 1.75rem;border-radius:.75rem .75rem 0 0;color:white;">
                <p style="font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.75;margin-bottom:.25rem">Application Details</p>
                <h3 style="font-size:1.25rem;font-weight:800;margin:0">${app.name || app.fullName || 'Unknown Applicant'}</h3>
                <p style="font-size:.85rem;opacity:.85;margin:.25rem 0 0">${app.email || '—'}</p>
            </div>
            <div style="padding:1.5rem 1.75rem;display:grid;gap:.85rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                    <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                        <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.35rem">Course</p>
                        <p style="font-size:.9rem;font-weight:700;color:#111827">${(app.courseId || '—').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                    </div>
                    <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                        <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.35rem">Status</p>
                        <span style="font-size:.8rem;font-weight:800;padding:.25rem .75rem;border-radius:9999px;${statusStyle}">${(app.status || 'pending').toUpperCase()}</span>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                    <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                        <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.35rem">WhatsApp</p>
                        <p style="font-size:.9rem;font-weight:600;color:#111827">${app.whatsapp || app.phone || '—'}</p>
                    </div>
                    <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                        <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.35rem">Location</p>
                        <p style="font-size:.9rem;font-weight:600;color:#111827">${app.location || '—'}</p>
                    </div>
                </div>
                <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                    <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.5rem">Laptop Ownership</p>
                    ${laptopBadge}
                </div>
                ${app.interest || app.reason || app.message ? `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.75rem;padding:.85rem">
                    <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#16a34a;margin-bottom:.5rem">Why Interested</p>
                    <p style="font-size:.875rem;color:#374151;line-height:1.6">${app.interest || app.reason || app.message}</p>
                </div>` : ''}
                <div style="background:#f9fafb;border-radius:.75rem;padding:.85rem">
                    <p style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:.35rem">Submitted</p>
                    <p style="font-size:.85rem;color:#374151">${date}</p>
                </div>
                <div style="display:flex;gap:.65rem;padding-top:.25rem;">
                    <button onclick="updateApplicationStatus('${app.id}','approved');Swal.close()" style="flex:1;padding:.7rem;background:#16a34a;color:white;border:none;border-radius:.65rem;font-weight:700;cursor:pointer;font-size:.85rem"><i class="fas fa-check mr-1"></i> Approve</button>
                    <button onclick="updateApplicationStatus('${app.id}','contacted');Swal.close()" style="flex:1;padding:.7rem;background:#3b82f6;color:white;border:none;border-radius:.65rem;font-weight:700;cursor:pointer;font-size:.85rem"><i class="fas fa-phone-alt mr-1"></i> Mark Contacted</button>
                </div>
            </div>
        </div>`
    });
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
