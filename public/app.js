const studentForm = document.getElementById('student-form');
const formTitle = document.getElementById('form-title');
const studentIdInput = document.getElementById('studentId');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const formMessage = document.getElementById('form-message');
const searchInput = document.getElementById('search');
const searchBtn = document.getElementById('search-btn');
const showAllBtn = document.getElementById('show-all-btn');
const tableBody = document.querySelector('#students-table tbody');
const resultsMessage = document.getElementById('results-message');
const datetimeDisplay = document.getElementById('datetime-display');
const feesModalOverlay = document.getElementById('fees-modal-overlay');
const feesStudentName = document.getElementById('fees-student-name');
const feesCloseBtn = document.getElementById('fees-close-btn');
const feesTableBody = document.querySelector('#fees-table tbody');
const feesMessage = document.getElementById('fees-message');

const FIELDS = [
  'studentName',
  'className',
  'schoolName',
  'section',
  'dob',
  'tuitionBeginDate',
  'fatherName',
  'motherName',
  'aadharNo',
  'fatherOccupation',
  'contactNo'
];

let currentStudents = [];
let currentFeesStudentId = null;

function updateDateTime() {
  const now = new Date();
  const dayName = now.toLocaleDateString(undefined, { weekday: 'long' });
  const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  datetimeDisplay.textContent = `${dayName}, ${dateStr} ${timeStr}`;
}

updateDateTime();
setInterval(updateDateTime, 1000);

function setMessage(el, text, type) {
  el.textContent = text;
  el.className = type || '';
}

function renderStudents(students) {
  currentStudents = students;
  tableBody.innerHTML = '';

  if (!students.length) {
    setMessage(resultsMessage, 'No students found.', '');
    return;
  }

  setMessage(resultsMessage, `${students.length} student(s) found.`, '');

  students.forEach((student) => {
    const row = document.createElement('tr');
    const cells = FIELDS.map((field) => `<td>${escapeHtml(student[field] ?? '')}</td>`).join('');
    row.innerHTML = `${cells}<td class="actions-cell">
      <button type="button" class="edit-btn" data-id="${student.id}">Edit</button>
      <button type="button" class="fees-btn" data-id="${student.id}">Fees</button>
      <button type="button" class="delete-btn" data-id="${student.id}">Delete</button>
    </td>`;
    tableBody.appendChild(row);
  });
}

function enterEditMode(student) {
  studentIdInput.value = student.id;
  FIELDS.forEach((field) => {
    const input = studentForm.elements[field];
    if (input) {
      input.value = student[field] ?? '';
    }
  });
  formTitle.textContent = 'Update Student';
  submitBtn.textContent = 'Update Student';
  cancelEditBtn.style.display = 'inline-block';
  setMessage(formMessage, '', '');
  studentForm.scrollIntoView({ behavior: 'smooth' });
}

function exitEditMode() {
  studentIdInput.value = '';
  studentForm.reset();
  formTitle.textContent = 'Add Student';
  submitBtn.textContent = 'Add Student';
  cancelEditBtn.style.display = 'none';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchStudents(search) {
  try {
    const url = search ? `/api/students?search=${encodeURIComponent(search)}` : '/api/students';
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      setMessage(resultsMessage, data.error || 'Could not retrieve students.', 'error');
      return;
    }

    renderStudents(data.students);
  } catch (err) {
    setMessage(resultsMessage, 'Network error while retrieving students.', 'error');
  }
}

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(formMessage, '', '');

  const formData = new FormData(studentForm);
  const payload = {};
  FIELDS.forEach((field) => {
    payload[field] = formData.get(field) || '';
  });

  const editingId = studentIdInput.value;
  const url = editingId ? `/api/students/${editingId}` : '/api/students';
  const method = editingId ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(formMessage, data.error || 'Could not save student.', 'error');
      return;
    }

    setMessage(formMessage, editingId ? 'Student updated successfully.' : 'Student added successfully.', 'success');
    exitEditMode();
    fetchStudents();
  } catch (err) {
    setMessage(formMessage, 'Network error while saving student.', 'error');
  }
});

cancelEditBtn.addEventListener('click', () => {
  exitEditMode();
  setMessage(formMessage, '', '');
});

tableBody.addEventListener('click', async (event) => {
  const target = event.target;
  const id = target.dataset.id;
  if (!id) return;

  if (target.classList.contains('edit-btn')) {
    const student = currentStudents.find((s) => s.id === id);
    if (student) {
      enterEditMode(student);
    }
  } else if (target.classList.contains('fees-btn')) {
    const student = currentStudents.find((s) => s.id === id);
    if (student) {
      openFeesModal(student);
    }
  } else if (target.classList.contains('delete-btn')) {
    if (!confirm('Are you sure you want to delete this student record?')) {
      return;
    }
    try {
      const response = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        setMessage(resultsMessage, data.error || 'Could not delete student.', 'error');
        return;
      }

      if (studentIdInput.value === id) {
        exitEditMode();
      }
      setMessage(resultsMessage, 'Student deleted successfully.', 'success');
      fetchStudents();
    } catch (err) {
      setMessage(resultsMessage, 'Network error while deleting student.', 'error');
    }
  }
});

searchBtn.addEventListener('click', () => {
  fetchStudents(searchInput.value.trim());
});

showAllBtn.addEventListener('click', () => {
  searchInput.value = '';
  fetchStudents();
});

// ---- Fee Details modal ----

function renderFees(fees) {
  feesTableBody.innerHTML = '';

  fees.forEach((fee) => {
    const row = document.createElement('tr');
    const badgeClass = fee.status === 'Submitted' ? 'status-submitted' : 'status-pending';
    row.innerHTML = `
      <td>${escapeHtml(fee.monthLabel)}</td>
      <td>
        <select class="fee-status ${badgeClass}" data-month="${fee.month}">
          <option value="Pending" ${fee.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Submitted" ${fee.status === 'Submitted' ? 'selected' : ''}>Submitted</option>
        </select>
      </td>
      <td><input type="number" class="fee-amount" data-month="${fee.month}" min="0" step="0.01" value="${escapeHtml(fee.amount)}" placeholder="Amount" /></td>
      <td><input type="date" class="fee-paid-date" data-month="${fee.month}" value="${escapeHtml(fee.paidDate)}" /></td>
      <td><button type="button" class="save-fee-btn" data-month="${fee.month}">Save</button></td>
    `;
    feesTableBody.appendChild(row);
  });
}

async function fetchFees(studentId) {
  try {
    const response = await fetch(`/api/students/${studentId}/fees`);
    const data = await response.json();

    if (!response.ok) {
      setMessage(feesMessage, data.error || 'Could not retrieve fee details.', 'error');
      return;
    }

    renderFees(data.fees);
  } catch (err) {
    setMessage(feesMessage, 'Network error while retrieving fee details.', 'error');
  }
}

function openFeesModal(student) {
  currentFeesStudentId = student.id;
  feesStudentName.textContent = student.studentName;
  setMessage(feesMessage, '', '');
  feesModalOverlay.classList.add('visible');
  fetchFees(student.id);
}

function closeFeesModal() {
  feesModalOverlay.classList.remove('visible');
  currentFeesStudentId = null;
}

feesCloseBtn.addEventListener('click', closeFeesModal);

feesModalOverlay.addEventListener('click', (event) => {
  if (event.target === feesModalOverlay) {
    closeFeesModal();
  }
});

feesTableBody.addEventListener('click', async (event) => {
  const target = event.target;
  if (!target.classList.contains('save-fee-btn') || !currentFeesStudentId) {
    return;
  }

  const month = target.dataset.month;
  const row = target.closest('tr');
  const status = row.querySelector('.fee-status').value;
  const amount = row.querySelector('.fee-amount').value;
  const paidDate = row.querySelector('.fee-paid-date').value;

  try {
    const response = await fetch(`/api/students/${currentFeesStudentId}/fees/${month}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, amount, paidDate })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(feesMessage, data.error || 'Could not update fee record.', 'error');
      return;
    }

    setMessage(feesMessage, `${data.fee.monthLabel} fee updated successfully.`, 'success');
    fetchFees(currentFeesStudentId);
  } catch (err) {
    setMessage(feesMessage, 'Network error while updating fee record.', 'error');
  }
});

// Load all students on page load.
fetchStudents();
