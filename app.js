const CONNECT_URL = "https://xmjeqiqnkvvfieyyfxrz.supabase.co"; 
const ACCESS_TOKEN = "sb_publishable_e64P95iDm_IjC4lv5XauwA_ZqaW7aPw";   

const systemDatabaseInstance = window.supabase.createClient(CONNECT_URL, ACCESS_TOKEN);

let localDataCollection = [];
let layoutSortingConfig = { key: 'weight', direction: 'desc' }; 
let currentSelectedStudentId = null;
let databaseSearchThrottleTimer = null; 

function sanitizeInputPayload(rawHtmlStr) {
  if (!rawHtmlStr) return '';
  return rawHtmlStr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function testSearchMatch(baseFieldText, searchKeyword) {
  baseFieldText = (baseFieldText || '').toLowerCase();
  searchKeyword = (searchKeyword || '').toLowerCase();
  return !searchKeyword || baseFieldText.includes(searchKeyword);
}

// FIXED: Implemented Normalized Mathematical Scoring Scaling out of 125 Max Points
function computeDeterministicWeightScore(studentRow) {
  let calculationValue = 30; 

  // Course Weights
  if (studentRow.course === 'BTech') {
    calculationValue += 25;
  } else if (studentRow.course === 'BSc Computer Science') {
    calculationValue += 20;
  } else if (studentRow.course === 'BCA') {
    calculationValue += 15;
  } else if (studentRow.course === 'MBA') {
    calculationValue += 15;
  } else if (studentRow.course === 'MCA') {
    calculationValue += 15;
  } else if (studentRow.course === 'BBA') {
    calculationValue += 10;
  } else if (studentRow.course === 'BCom') {
    calculationValue += 8;
  } else if (studentRow.course === 'Data Science Diploma') {
    calculationValue += 10;
  } else if (studentRow.course === 'AI Tools') {
    calculationValue += 8;
  }

  // Academic Backing Weights
  if (studentRow.qualification === 'Post Graduation') {
    calculationValue += 25;
  } else if (studentRow.qualification === 'Graduation') {
    calculationValue += 20;
  } else if (studentRow.qualification === '12th Completed') {
    calculationValue += 15;
  } else if (studentRow.qualification === 'Diploma') {
    calculationValue += 12;
  } else if (studentRow.qualification === 'ITI') {
    calculationValue += 10;
  } else if (studentRow.qualification === '10th Completed') {
    calculationValue += 5;
  }

  // Multi-tier Age Weights
  if (studentRow.age >= 17 && studentRow.age <= 20) {
    calculationValue += 15;
  } else if (studentRow.age >= 21 && studentRow.age <= 24) {
    calculationValue += 8;
  } else {
    calculationValue += 3;
  }

  // Behavior Metric Weights
  if (studentRow.website_visits >= 4) calculationValue += 20;

  if (studentRow.brochure_downloaded) {
    calculationValue += 15;
  } else if (studentRow.website_visits >= 3) {
    calculationValue -= 10;
  }

  // Convert raw points out of 125 total scale into uniform 100% distribution
  let normalizedPercentage = Math.round((calculationValue / 125) * 100);

  // Hard status overrides take ultimate precedence
  if (studentRow.status === 'Lost') normalizedPercentage = 5;
  if (studentRow.status === 'Enrolled') normalizedPercentage = 100;

  normalizedPercentage = Math.max(0, Math.min(100, normalizedPercentage));

  let styleBadgeConfig = 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200/50';
  let trackingBarHex = 'bg-rose-500';

  if (normalizedPercentage >= 41 && normalizedPercentage <= 75) {
    styleBadgeConfig = 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-accent-400 border-amber-200/50';
    trackingBarHex = 'bg-amber-500';
  } else if (normalizedPercentage > 75) {
    styleBadgeConfig = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/50';
    trackingBarHex = 'bg-emerald-500';
  }

  return { finalWeight: normalizedPercentage, styles: styleBadgeConfig, bar: trackingBarHex };
}

function processAnalyticsAndGraphedFunnels() {
  const courses = {
  'BTech': 0,
  'BCA': 0,
  'BSc Computer Science': 0,
  'BBA': 0,
  'BCom': 0,
  'MBA': 0,
  'MCA': 0,
  'Data Science Diploma': 0,
  'AI Tools': 0
};
  const stages = { 'New': 0, 'Contacted': 0, 'Qualified': 0, 'Enrolled': 0, 'Lost': 0 };
  const total = localDataCollection.length;

  localDataCollection.forEach(item => {
    if (courses[item.course] !== undefined) courses[item.course]++;
    if (stages[item.status] !== undefined) stages[item.status]++;
  });

  const courseContainer = document.getElementById('analytics-course-list');
  if (courseContainer) {
    courseContainer.innerHTML = Object.keys(courses).map(key => {
      const pct = total > 0 ? Math.round((courses[key] / total) * 100) : 0;
      return `<div class="space-y-1"><div class="flex justify-between text-xs font-semibold"><span>${key}</span><span class="text-slate-400">${courses[key]} (${pct}%)</span></div><div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-brand-500" style="width: ${pct}%"></div></div></div>`;
    }).join('');
  }

  const stageContainer = document.getElementById('analytics-status-list');
  if (stageContainer) {
    stageContainer.innerHTML = Object.keys(stages).map(key => {
      const pct = total > 0 ? Math.round((stages[key] / total) * 100) : 0;
      return `<div class="space-y-1"><div class="flex justify-between text-xs font-semibold"><span>${key}</span><span class="text-slate-400">${stages[key]} (${pct}%)</span></div><div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-accent-500" style="width: ${pct}%"></div></div></div>`;
    }).join('');
  }
}

function syncMetricsDisplays() {
  const total = localDataCollection.length;
  let weightSum = 0;
  let enrolled = 0;

  localDataCollection.forEach(item => {
    const metrics = computeDeterministicWeightScore(item);
    weightSum += metrics.finalWeight;
    if (item.status === 'Enrolled') enrolled++;
  });

  document.getElementById('stat-total').innerText = total;
  document.getElementById('stat-avg-score').innerText = total > 0 ? `${Math.round(weightSum / total)}%` : "0%";
  document.getElementById('stat-conversion').innerText = `${total > 0 ? Math.round((enrolled / total) * 100) : 0}%`;

  processAnalyticsAndGraphedFunnels();
}

async function fetchActiveDatabaseRecords() {
  const tbody = document.getElementById('table-body');
  const icon = document.getElementById('refresh-icon');
  
  if (icon) icon.classList.add('animate-spin');
  if (tbody && localDataCollection.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">Loading pipeline engine arrays...</td></tr>`;
  }

  const { data, error } = await systemDatabaseInstance.from('leads').select('*');

  if (icon) icon.classList.remove('animate-spin');
  if (error) return tbody ? tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-rose-500 font-bold">Network Connectivity Error.</td></tr>` : null;
  
  localDataCollection = data || [];
  executeSortingRoutine();
}

// RESTORED & EXTENDED: Column sorting controls with distinct custom header triggers
window.toggleSortingKey = function(keyName) {
  if (layoutSortingConfig.key === keyName) {
    layoutSortingConfig.direction = layoutSortingConfig.direction === 'asc' ? 'desc' : 'asc';
  } else {
    layoutSortingConfig.key = keyName;
    layoutSortingConfig.direction = 'desc';
  }
  executeSortingRoutine();
};

function executeSortingRoutine() {
  const k = layoutSortingConfig.key;
  const dir = layoutSortingConfig.direction === 'asc' ? 1 : -1;

  localDataCollection.sort((a, b) => {
    if (k === 'weight') {
      return (computeDeterministicWeightScore(a).finalWeight - computeDeterministicWeightScore(b).finalWeight) * dir;
    }
    let valA = (a[k] || '').toString().toLowerCase();
    let valB = (b[k] || '').toString().toLowerCase();
    return valA.localeCompare(valB) * dir;
  });

  assembleMainGridDisplayTable();
  syncMetricsDisplays();
}

// FIXED: Replaced plain "Manage" text with WhatsApp, Email, and View action shortcuts inside table row cells
function assembleMainGridDisplayTable() {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

  const searchVal = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('filter-status')?.value || 'All';

  const displayedRecords = localDataCollection.filter(item => {
    const matchesSearch = testSearchMatch(item.name, searchVal) || testSearchMatch(item.city, searchVal) || testSearchMatch(item.course, searchVal);
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (displayedRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400 font-medium">No student records found matching parameters.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayedRecords.map(item => {
    const { finalWeight, styles } = computeDeterministicWeightScore(item);
    const escapedPhone = encodeURIComponent(item.phone || '');
    const escapedEmail = encodeURIComponent(item.email || '');
    const escapedName = encodeURIComponent(item.name || '');
    
    return `
      <tr class="hover:bg-slate-100/70 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80 transition-colors duration-200">
        <!-- FIXED: Enhanced interactive hover layout for student names -->
        <td class="px-6 py-3.5 font-bold text-slate-900 dark:text-white group cursor-pointer" onclick="openProfileViewerDrawer('${item.id}')">
          <span class="group-hover:text-brand-600 dark:group-hover:text-accent-400 transition-all duration-200 inline-block group-hover:translate-x-1">${sanitizeInputPayload(item.name)}</span>
          <div class="text-[10px] text-slate-400 font-medium group-hover:text-slate-500">${item.email}</div>
        </td>
        <td class="px-6 py-3.5 font-medium">${sanitizeInputPayload(item.city)}</td>
        <td class="px-6 py-3.5">
          <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-bold mr-1">${item.qualification}</span>
          <span class="bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 px-2 py-0.5 rounded font-bold">${item.course}</span>
        </td>
        <td class="px-6 py-3.5"><span class="border px-2 py-0.5 rounded-full text-[10px] font-bold ${styles}">${finalWeight}% Index</span></td>
        <td class="px-6 py-3.5">
          <select onchange="updateLiveStatusField('${item.id}', this.value)" class="text-[11px] font-bold rounded-full px-2.5 py-1 border outline-none bg-white dark:bg-slate-800 dark:text-white cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 focus:ring-1 focus:ring-brand-500 transition-colors duration-150">
            <option value="New" ${item.status === 'New' ? 'selected' : ''}>New</option>
            <option value="Contacted" ${item.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
            <option value="Qualified" ${item.status === 'Qualified' ? 'selected' : ''}>Qualified</option>
            <option value="Enrolled" ${item.status === 'Enrolled' ? 'selected' : ''}>Enrolled</option>
            <option value="Lost" ${item.status === 'Lost' ? 'selected' : ''}>Lost</option>
          </select>
        </td>
        <!-- FIXED: Added discrete action shortcuts for communication clicks + profile views -->
        <td class="px-6 py-3.5 text-right">
          <div class="flex items-center justify-end space-x-2">
            <a href="https://wa.me/91${escapedPhone}?text=Hello%20${escapedName}" target="_blank" class="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-600 dark:hover:text-white rounded-lg transition-all duration-150" title="Chat on WhatsApp">
              <i data-lucide="message-square" class="w-3.5 h-3.5"></i>
            </a>
            <a href="mailto:${escapedEmail}?subject=Admissions%20Follow%20Up" class="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white rounded-lg transition-all duration-150" title="Send Email Notification">
              <i data-lucide="mail" class="w-3.5 h-3.5"></i>
            </a>
            <button onclick="openProfileViewerDrawer('${item.id}')" class="px-2 py-1 bg-slate-100 hover:bg-brand-600 hover:text-white dark:bg-slate-800 dark:hover:bg-accent-500 dark:hover:text-slate-950 text-slate-700 dark:text-slate-300 font-bold rounded-md text-[11px] transition-all duration-150 cursor-pointer">
              Profile
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

window.updateLiveStatusField = async function(id, val) {
  await systemDatabaseInstance.from('leads').update({ status: val }).eq('id', id);
  await fetchActiveDatabaseRecords();
};

window.openProfileViewerDrawer = function(id) {
  const item = localDataCollection.find(x => x.id == id);
  if (!item) return;
  currentSelectedStudentId = id;
  
  document.getElementById('drawer-student-name').innerText = item.name;
  document.getElementById('drawer-student-meta').innerText = `${item.course} Tracking Parameters`;

  const { finalWeight, styles, bar } = computeDeterministicWeightScore(item);
  document.getElementById('ai-ml-probability-badge').innerText = `${finalWeight}% Target`;
  document.getElementById('ai-ml-probability-badge').className = `text-[10px] font-bold px-2 py-0.5 rounded-md ${styles}`;
  document.getElementById('ai-ml-progress-bar').className = `h-full transition-all ${bar}`;
  document.getElementById('ai-ml-progress-bar').style.width = `${finalWeight}%`;

  const logsDOM = document.getElementById('notes-history-container');
  logsDOM.innerHTML = item.notes ? item.notes.split('\n').filter(Boolean).map(x => `<div class="bg-slate-50 dark:bg-slate-800 p-2.5 border border-slate-200 dark:border-slate-700 text-[11px] rounded-xl font-medium">${sanitizeInputPayload(x)}</div>`).reverse().join('') : `<div class="text-[11px] text-slate-400 py-4 text-center">No historical entries recorded.</div>`;

  document.getElementById('drawer-overlay').classList.remove('hidden');
  document.getElementById('engagement-drawer').classList.remove('translate-x-full');
  setTimeout(() => document.getElementById('drawer-overlay').classList.remove('opacity-0'), 20);
};

function closeProfileViewerDrawer() {
  currentSelectedStudentId = null;
  document.getElementById('drawer-overlay').classList.add('opacity-0');
  document.getElementById('engagement-drawer').classList.add('translate-x-full');
  setTimeout(() => document.getElementById('drawer-overlay').classList.add('hidden'), 200);
}

document.getElementById('save-notes-btn').addEventListener('click', async () => {
  if (!currentSelectedStudentId) return;
  const input = document.getElementById('drawer-notes-input').value.trim();
  if (!input) return;

  const currentItem = localDataCollection.find(x => x.id == currentSelectedStudentId);
  const stamp = `[${new Date().toLocaleDateString('en-IN')}]`;
  const nextNotes = currentItem.notes ? `${currentItem.notes}\n${stamp} ${input}` : `${stamp} ${input}`;

  await systemDatabaseInstance.from('leads').update({ notes: nextNotes }).eq('id', currentSelectedStudentId);
  document.getElementById('drawer-notes-input').value = '';
  await fetchActiveDatabaseRecords();
  openProfileViewerDrawer(currentSelectedStudentId);
});

function toggleDocumentationModal(shouldOpen) {
  const modal = document.getElementById('doc-modal-overlay');
  if (shouldOpen) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

function printDocumentReportCanvasPDF() {
  const contentSource = document.getElementById('pdf-print-canvas').innerHTML;
  const printSandboxFrame = window.open('', '_blank', 'width=800,height=600');
  printSandboxFrame.document.write(`
    <html>
      <head>
        <title>LeadXpert_Scoring_System_Rules</title>
        <style>
          body { font-family: monospace; padding: 40px; color: #1e293b; background: #fff; font-size: 12px; line-height: 1.6; }
          .border-b-2 { border-bottom: 2px dashed #cbd5e1; padding-bottom: 15px; margin-bottom: 20px; text-align: center; }
          .bg-slate-50 { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .flex { display: flex; justify-content: space-between; }
          .font-bold { font-weight: bold; }
          .text-rose-600 { color: #dc2626; }
          .pl-2 { padding-left: 10px; }
          .pt-1 { padding-top: 5px; }
          .pb-0.5 { padding-bottom: 3px; border-bottom: 1px solid #e2e8f0; margin-top: 5px; }
        </style>
      </head>
      <body>
        ${contentSource}
        <script>
          window.onload = function() { window.print(); window.close(); }
        <\/script>
      </body>
    </html>
  `);
  printSandboxFrame.document.close();
}

function exportDatasetToExcelFile() {
  if (localDataCollection.length === 0) return alert("No operational data to export.");

  const cleanExportRows = localDataCollection.map(lead => {
    const { finalWeight } = computeDeterministicWeightScore(lead);
    return {
      "Student Name": lead.name,
      "Email Address": lead.email,
      "Phone Number": lead.phone,
      "City Location": lead.city,
      "Candidate Age": lead.age,
      "Academic Level": lead.qualification,
      "Target Course": lead.course,
      "Website Visits": lead.website_visits,
      "Brochure Downloaded": lead.brochure_downloaded ? "Yes" : "No",
      "Calculated Lead Score": `${finalWeight}%`,
      "Pipeline Status": lead.status,
      "System Logs/Notes": lead.notes || ""
    };
  });

  const targetWorkbook = XLSX.utils.book_new();
  const targetWorksheet = XLSX.utils.json_to_sheet(cleanExportRows);
  XLSX.utils.book_append_sheet(targetWorkbook, targetWorksheet, "Leads Register");
  
  XLSX.writeFile(targetWorkbook, `LeadXpert_Registry_${new Date().toISOString().slice(0,10)}.xlsx`);
}

const viewMappings = { 'tab-dashboard': 'view-dashboard', 'tab-analytics': 'view-analytics', 'tab-add-lead': 'view-add-lead' };
Object.keys(viewMappings).forEach(tabId => {
  document.getElementById(tabId)?.addEventListener('click', () => {
    Object.keys(viewMappings).forEach(k => {
      document.getElementById(k).className = "flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer hover:text-slate-900 dark:hover:text-white";
      document.getElementById(viewMappings[k]).classList.add('hidden');
    });
    document.getElementById(tabId).className = "flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 border border-brand-100 dark:border-brand-900/50 cursor-pointer";
    document.getElementById(viewMappings[tabId]).classList.remove('hidden');
  });
});

document.getElementById('lead-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    const dataPackage = {
        name: document.getElementById('form-name').value.trim(),
        email: document.getElementById('form-email').value.trim(),
        phone: document.getElementById('form-phone').value.trim(),
        city: document.getElementById('form-city').value.trim(),
        age: parseInt(document.getElementById('form-age').value),
        website_visits: parseInt(document.getElementById('form-visits').value),
        brochure_downloaded: document.getElementById('form-brochure').checked,
        qualification: document.getElementById('form-qualification').value,
        course: document.getElementById('form-course').value,
        status: "New",
        notes: ""
    };

    const { data, error } = await systemDatabaseInstance
        .from('leads')
        .insert([dataPackage])
        .select();

    if (error) {
        console.error(error);
        alert(error.message);
        btn.disabled = false;
        return;
    }

    document.getElementById('submit-success').classList.remove('hidden');
    document.getElementById('lead-form').reset();

    await fetchActiveDatabaseRecords();

    setTimeout(() => {
        document.getElementById('submit-success').classList.add('hidden');
    }, 3000);

    btn.disabled = false;
});

document.getElementById('search-input')?.addEventListener('input', () => {
  clearTimeout(databaseSearchThrottleTimer);
  databaseSearchThrottleTimer = setTimeout(assembleMainGridDisplayTable, 100);
});

function initializeThemeToggleEngine() {
  const btn = document.getElementById('theme-toggle-btn');
  
  if (localStorage.getItem('theme-view-mode') === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme-view-mode', 'light');
  }

  btn?.addEventListener('click', () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme-view-mode', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme-view-mode', 'dark');
    }
  });
}

document.getElementById('filter-status')?.addEventListener('change', assembleMainGridDisplayTable);
document.getElementById('refresh-btn')?.addEventListener('click', fetchActiveDatabaseRecords);
document.getElementById('close-drawer-btn')?.addEventListener('click', closeProfileViewerDrawer);
document.getElementById('drawer-overlay')?.addEventListener('click', closeProfileViewerDrawer);
document.getElementById('open-doc-btn')?.addEventListener('click', () => toggleDocumentationModal(true));
document.getElementById('close-doc-btn')?.addEventListener('click', () => toggleDocumentationModal(false));
document.getElementById('download-pdf-btn')?.addEventListener('click', printDocumentReportCanvasPDF);
document.getElementById('export-excel-btn')?.addEventListener('click', exportDatasetToExcelFile);

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) window.lucide.createIcons();
  initializeThemeToggleEngine();
  fetchActiveDatabaseRecords();
});


(function(){if(!window.chatbase||window.chatbase("getState")!=="initialized"){window.chatbase=(...arguments)=>{if(!window.chatbase.q){window.chatbase.q=[]}window.chatbase.q.push(arguments)};window.chatbase=new Proxy(window.chatbase,{get(target,prop){if(prop==="q"){return target.q}return(...args)=>target(prop,...args)}})}const onLoad=function(){const script=document.createElement("script");script.src="https://www.chatbase.co/embed.min.js";script.id="OGcCTWWs5xd65nlAZRcDK";script.domain="www.chatbase.co";document.body.appendChild(script)};if(document.readyState==="complete"){onLoad()}else{window.addEventListener("load",onLoad)}})();
