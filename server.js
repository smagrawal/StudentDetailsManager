const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const CSV_FILE = path.join(DATA_DIR, 'students.csv');
const FEES_CSV_FILE = path.join(DATA_DIR, 'fees.csv');

// Order of columns stored in the CSV file.
const HEADERS = [
  'id',
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

// Order of columns stored in the fees CSV file.
const FEE_HEADERS = ['studentId', 'month', 'status', 'amount', 'paidDate'];

// Fee months for academic year 2026-27, starting July.
const FEE_MONTHS = [
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'
];

function getMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function ensureCsvFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, HEADERS.join(',') + '\n', 'utf8');
  }
}

function ensureFeesCsvFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FEES_CSV_FILE)) {
    fs.writeFileSync(FEES_CSV_FILE, FEE_HEADERS.join(',') + '\n', 'utf8');
  }
}

// Escape a single CSV field (wraps in quotes if it contains a comma, quote or newline).
function escapeCsvField(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Parse a single CSV line, respecting quoted fields.
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function readStudents() {
  ensureCsvFile();
  const content = fs.readFileSync(CSV_FILE, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const student = {};
    HEADERS.forEach((header, idx) => {
      student[header] = values[idx] ?? '';
    });
    return student;
  });
}

function appendStudent(student) {
  ensureCsvFile();
  const row = HEADERS.map((header) => escapeCsvField(student[header])).join(',') + '\n';
  fs.appendFileSync(CSV_FILE, row, 'utf8');
}

function writeAllStudents(students) {
  ensureCsvFile();
  const lines = [HEADERS.join(',')].concat(
    students.map((student) => HEADERS.map((header) => escapeCsvField(student[header])).join(','))
  );
  fs.writeFileSync(CSV_FILE, lines.join('\n') + '\n', 'utf8');
}

function readFees() {
  ensureFeesCsvFile();
  const content = fs.readFileSync(FEES_CSV_FILE, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const fee = {};
    FEE_HEADERS.forEach((header, idx) => {
      fee[header] = values[idx] ?? '';
    });
    return fee;
  });
}

function writeAllFees(fees) {
  ensureFeesCsvFile();
  const lines = [FEE_HEADERS.join(',')].concat(
    fees.map((fee) => FEE_HEADERS.map((header) => escapeCsvField(fee[header])).join(','))
  );
  fs.writeFileSync(FEES_CSV_FILE, lines.join('\n') + '\n', 'utf8');
}

function appendFees(feeRecords) {
  ensureFeesCsvFile();
  const rows = feeRecords
    .map((fee) => FEE_HEADERS.map((header) => escapeCsvField(fee[header])).join(','))
    .join('\n') + '\n';
  fs.appendFileSync(FEES_CSV_FILE, rows, 'utf8');
}

// Creates default (Pending) fee records for any fee months missing for the given student.
function ensureFeeRecordsForStudent(studentId) {
  const existing = readFees().filter((fee) => fee.studentId === studentId);
  const existingMonths = new Set(existing.map((fee) => fee.month));
  const missing = FEE_MONTHS.filter((month) => !existingMonths.has(month)).map((month) => ({
    studentId,
    month,
    status: 'Pending',
    amount: '',
    paidDate: ''
  }));

  if (missing.length) {
    appendFees(missing);
  }
}

// Returns all 12 fee records (Jul 2026 - Jun 2027) for a student, creating defaults if needed.
function getFeesForStudent(studentId) {
  ensureFeeRecordsForStudent(studentId);
  const fees = readFees().filter((fee) => fee.studentId === studentId);
  return FEE_MONTHS.map((month) => {
    const fee = fees.find((f) => f.month === month) || { studentId, month, status: 'Pending', amount: '', paidDate: '' };
    return { ...fee, monthLabel: getMonthLabel(month) };
  });
}

// Validates the student fields common to create and update. Returns an error message, or null if valid.
function validateStudent({ studentName, className, schoolName, aadharNo, contactNo }) {
  if (!studentName || !className || !schoolName) {
    return 'Student Name, Class and School Name are required.';
  }
  if (aadharNo && !/^\d{12}$/.test(String(aadharNo))) {
    return 'Aadhar No must be exactly 12 digits.';
  }
  if (contactNo && !/^\d{10}$/.test(String(contactNo))) {
    return 'Contact No must be exactly 10 digits.';
  }
  return null;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a new student record.
app.post('/api/students', (req, res) => {
  const {
    studentName,
    className,
    schoolName,
    section,
    dob,
    tuitionBeginDate,
    fatherName,
    motherName,
    aadharNo,
    fatherOccupation,
    contactNo
  } = req.body;

  const validationError = validateStudent(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const student = {
    id: crypto.randomUUID(),
    studentName,
    className,
    schoolName,
    section: section || '',
    dob: dob || '',
    tuitionBeginDate: tuitionBeginDate || '',
    fatherName: fatherName || '',
    motherName: motherName || '',
    aadharNo: aadharNo || '',
    fatherOccupation: fatherOccupation || '',
    contactNo: contactNo || ''
  };

  appendStudent(student);
  ensureFeeRecordsForStudent(student.id);
  res.status(201).json({ message: 'Student added successfully.', student });
});

// Retrieve all students, optionally filtered by a search term (name, Aadhar No or Contact No).
app.get('/api/students', (req, res) => {
  const { search } = req.query;
  let students = readStudents();

  if (search) {
    const term = String(search).toLowerCase();
    students = students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(term) ||
        s.aadharNo.includes(term) ||
        s.contactNo.includes(term)
    );
  }

  res.json({ count: students.length, students });
});

// Update an existing student record by id.
app.put('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const students = readStudents();
  const index = students.findIndex((s) => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const validationError = validateStudent(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const {
    studentName,
    className,
    schoolName,
    section,
    dob,
    tuitionBeginDate,
    fatherName,
    motherName,
    aadharNo,
    fatherOccupation,
    contactNo
  } = req.body;

  const updatedStudent = {
    id,
    studentName,
    className,
    schoolName,
    section: section || '',
    dob: dob || '',
    tuitionBeginDate: tuitionBeginDate || '',
    fatherName: fatherName || '',
    motherName: motherName || '',
    aadharNo: aadharNo || '',
    fatherOccupation: fatherOccupation || '',
    contactNo: contactNo || ''
  };

  students[index] = updatedStudent;
  writeAllStudents(students);
  res.json({ message: 'Student updated successfully.', student: updatedStudent });
});

// Delete a student record by id.
app.delete('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const students = readStudents();
  const index = students.findIndex((s) => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const [deletedStudent] = students.splice(index, 1);
  writeAllStudents(students);

  const remainingFees = readFees().filter((fee) => fee.studentId !== id);
  writeAllFees(remainingFees);

  res.json({ message: 'Student deleted successfully.', student: deletedStudent });
});

// Retrieve the fee records (Jul 2026 - Jun 2027) for a specific student.
app.get('/api/students/:id/fees', (req, res) => {
  const { id } = req.params;
  const students = readStudents();
  const student = students.find((s) => s.id === id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const fees = getFeesForStudent(id);
  res.json({ fees });
});

// Update the fee status/amount for a specific student and month.
app.put('/api/students/:id/fees/:month', (req, res) => {
  const { id, month } = req.params;
  const { status, amount, paidDate } = req.body;

  const students = readStudents();
  const student = students.find((s) => s.id === id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  if (!FEE_MONTHS.includes(month)) {
    return res.status(400).json({ error: 'Invalid fee month.' });
  }

  if (status && !['Pending', 'Submitted'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Pending or Submitted.' });
  }

  ensureFeeRecordsForStudent(id);
  const fees = readFees();
  const index = fees.findIndex((fee) => fee.studentId === id && fee.month === month);

  const updatedFee = {
    studentId: id,
    month,
    status: status || fees[index].status,
    amount: amount !== undefined ? amount : fees[index].amount,
    paidDate: paidDate !== undefined ? paidDate : fees[index].paidDate
  };

  fees[index] = updatedFee;
  writeAllFees(fees);
  res.json({ message: 'Fee record updated successfully.', fee: { ...updatedFee, monthLabel: getMonthLabel(month) } });
});

app.listen(PORT, () => {
  console.log(`Student details app running on http://localhost:${PORT}`);
});
