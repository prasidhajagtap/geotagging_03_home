const SUPABASE_URL = 'https://svhbqvcabbzrxvndxtjm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aGJxdmNhYmJ6cnh2bmR4dGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTA0MjksImV4cCI6MjA5MDc4NjQyOX0.lYIsM5zN4uGKbP79avcKR_EaAlP5tu2N688OgZI6wZA';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = {
    name: '', id: '', clockIn: null, isClockedIn: false,
    clockInCoords: '', clockInLoc: '', clockOut: null,
    clockOutCoords: '', clockOutLoc: '', submitted: false
};
let timerInterval;
let isSubmitting = false;

const validateName = (str) => /^[a-zA-Z\s]+$/.test(str);
const validateID   = (str) => /^[0-9]+$/.test(str);

// UI Elements
const btnStart = document.getElementById('btn-start');
const nameInput = document.getElementById('user-name');
const idInput = document.getElementById('poornata-id');

window.onload = () => {
    // Keep last Poornata ID logged in
    const lastID = localStorage.getItem('last_poornata_id');
    if (lastID) idInput.value = lastID;

    const saved = localStorage.getItem('seamex_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        // Check if day is already submitted (logic for till 00:00 reset)
        if (!isNewDay(currentUser.lastActionDate)) {
            showMainUI();
        } else {
            localStorage.removeItem('seamex_user');
        }
    }
    setupValidationListeners();
};

function isNewDay(lastDate) {
    if (!lastDate) return false;
    const last = new Date(lastDate).setHours(0,0,0,0);
    const today = new Date().setHours(0,0,0,0);
    return today > last;
}

function setupValidationListeners() {
    const checkForm = () => {
        const nameVal = nameInput.value.trim();
        const idVal = idInput.value.trim();
        
        const isNameValid = validateName(nameVal);
        const isIDValid = validateID(idVal);

        document.getElementById('name-error').style.display = (nameVal && !isNameValid) ? 'block' : 'none';
        document.getElementById('id-error').style.display = (idVal && !isIDValid) ? 'block' : 'none';

        btnStart.disabled = !(isNameValid && isIDValid);
    };

    nameInput.addEventListener('input', checkForm);
    idInput.addEventListener('input', checkForm);
}

btnStart.onclick = async () => {
    localStorage.setItem('last_poornata_id', idInput.value.trim());
    currentUser.name = nameInput.value.trim();
    currentUser.id = idInput.value.trim();
    currentUser.lastActionDate = new Date().toISOString();
    saveState();
    showMainUI();
};

function showMainUI() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('main-logo').classList.add('small');
    document.getElementById('tagline-text').classList.add('hidden');
    
    document.getElementById('main-section').classList.remove('hidden');
    document.getElementById('display-name').innerText = currentUser.name;
    document.getElementById('display-id').innerText = currentUser.id;

    if (currentUser.isClockedIn) {
        document.getElementById('clock-in-group').classList.add('hidden');
        document.getElementById('status-display').classList.remove('hidden');
        document.getElementById('clock-in-info').innerText = `In: ${new Date(currentUser.clockIn).toLocaleTimeString()}`;
        document.getElementById('clock-in-loc-display').innerText = `@ ${currentUser.clockInLoc}`;
        
        if (!currentUser.clockOut) {
            document.getElementById('clock-out-group').classList.remove('hidden');
            startTimer();
        } else {
            showFinalSummary();
        }
    }
}

document.getElementById('btn-clock-in').onclick = async () => {
    const loc = document.getElementById('in-location-name').value.trim();
    if (!loc) return showToast("Enter location name");

    const coords = await getCoords();
    if (!coords) return;

    currentUser.clockIn = new Date().toISOString();
    currentUser.clockInCoords = coords;
    currentUser.clockInLoc = loc;
    currentUser.isClockedIn = true;
    currentUser.lastActionDate = new Date().toISOString();
    
    saveState();
    showMainUI();
};

document.getElementById('btn-clock-out').onclick = async () => {
    const loc = document.getElementById('out-location-name').value.trim();
    if (!loc) return showToast("Enter location name");

    const coords = await getCoords();
    if (!coords) return;

    currentUser.clockOut = new Date().toISOString();
    currentUser.clockOutCoords = coords;
    currentUser.clockOutLoc = loc;
    clearInterval(timerInterval);
    
    saveState();
    showFinalSummary();
};

function showFinalSummary() {
    document.getElementById('clock-out-group').classList.add('hidden');
    document.getElementById('final-summary').classList.remove('hidden');
    
    document.getElementById('sum-in-time').innerText = new Date(currentUser.clockIn).toLocaleTimeString();
    document.getElementById('sum-in-loc').innerText = currentUser.clockInLoc;
    document.getElementById('sum-out-time').innerText = new Date(currentUser.clockOut).toLocaleTimeString();
    document.getElementById('sum-out-loc').innerText = currentUser.clockOutLoc;

    // Move timer to top as requested
    const timerBox = document.getElementById('status-display');
    document.getElementById('main-section').prepend(timerBox);
}

document.getElementById('btn-submit-day').onclick = async () => {
    if (isSubmitting) return; // Prevent double entry
    isSubmitting = true;

    const btn = document.getElementById('btn-submit-day');
    btn.innerText = "Submitting...";
    btn.disabled = true;

    const { error } = await _supabase.from('attendance').insert([{
        user_name: currentUser.name,
        employee_id: currentUser.id,
        clock_in_time: currentUser.clockIn,
        clock_in_coords: currentUser.clockInCoords,
        clock_in_location_name: currentUser.clockInLoc,
        clock_out_time: currentUser.clockOut,
        clock_out_coords: currentUser.clockOutCoords,
        clock_out_location_name: currentUser.clockOutLoc,
        status: 'completed'
    }]);

    if (!error) {
        showToast("Attendance submitted successfully!", "success");
        currentUser.submitted = true;
        saveState();
        // Keep screen on summary till end of day as requested
        btn.innerText = "Submitted ✅";
    } else {
        showToast("Error: " + error.message);
        isSubmitting = false;
        btn.disabled = false;
        btn.innerText = "Submit the Day";
    }
};

async function getCoords() {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (p) => resolve(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`),
            () => { showToast("Location Access Denied"); resolve(null); },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

function startTimer() {
    timerInterval = setInterval(() => {
        const diff = new Date() - new Date(currentUser.clockIn);
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        document.getElementById('timer-display').innerText = `Shift Duration: ${h}:${m}:${s}`;
    }, 1000);
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function saveState() {
    localStorage.setItem('seamex_user', JSON.stringify(currentUser));
}
