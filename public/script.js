let filters = [];
let isUnlocked = false;
let inactivityTimer;
let selectedFilter = null;
let accessories = [];
let selectedAccessories = [];
let currentEditingAccessory = null;
let currentPool = 'NSW';

// Booking state management
let isDragging = false;
let dragStartDate = null;
let currentBookingDates = [];
let pendingBookings = [];

// API calls
async function fetchFilters() {
    try {
        const response = await fetch('/api/filters');
        filters = await response.json();
        renderFilters();
    } catch (error) {
        console.error('Error fetching filters:', error);
    }
}

async function updateFilter(filterId, updates) {
    try {
        await fetch(`/api/filters/${filterId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        await fetchFilters();
    } catch (error) {
        console.error('Error updating filter:', error);
    }
}

// Accessory API calls
async function fetchAccessories() {
    try {
        const response = await fetch('/api/accessories');
        accessories = await response.json();
        renderAccessoryList();
    } catch (error) {
        console.error('Error fetching accessories:', error);
    }
}

async function createAccessory(accessoryData) {
    try {
        const response = await fetch('/api/accessories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(accessoryData)
        });
        const result = await response.json();
        if (result.success) {
            await fetchAccessories();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error creating accessory:', error);
        return false;
    }
}

async function updateAccessory(accessoryId, updates) {
    try {
        await fetch(`/api/accessories/${accessoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        await fetchAccessories();
    } catch (error) {
        console.error('Error updating accessory:', error);
    }
}

async function deleteAccessory(accessoryId) {
    try {
        await fetch(`/api/accessories/${accessoryId}`, {
            method: 'DELETE'
        });
        await fetchAccessories();
    } catch (error) {
        console.error('Error deleting accessory:', error);
    }
}

async function fetchAvailableAccessories(filterId, startDate, endDate) {
    try {
        const response = await fetch('/api/accessories/available', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filterId, startDate, endDate })
        });
        return await response.json();
    } catch (error) {
        console.error('Error fetching available accessories:', error);
        return [];
    }
}

// Render functions
function renderFilters() {
    const container = document.getElementById('filters');
    container.innerHTML = filters.map(filter => {
        const capability = getFilterCapability(filter);
        const hasBookings = filter.bookings && filter.bookings.length > 0;
        const serviceStatus = getServiceStatus(filter);
        
        return `
            <div class="filter-card" onclick="openFilterModal(${filter.id})">
                <div class="filter-header">
                    <h3 class="filter-name">${filter.name}</h3>
                    ${serviceStatus.isDue ? '<span class="service-due-icon" title="Service Due">🔧</span>' : ''}
                </div>
                <div class="filter-status">
                    <div class="status-item">
                        <span class="status-indicator ${filter.uvCapability ? 'active' : 'inactive'}"></span>
                        <span>UV Capability</span>
                    </div>
                    <div class="status-item">
                        <span class="status-indicator ${filter.tenMicronCapability ? 'active' : 'inactive'}"></span>
                        <span>10 Micron</span>
                    </div>
                    <div class="status-item">
                        <strong>Filtration: ${capability}</strong>
                    </div>
                    ${serviceStatus.nextServiceDate ? `
                    <div class="status-item">
                        <small>Next Service: ${new Date(serviceStatus.nextServiceDate).toLocaleDateString()}</small>
                    </div>
                    ` : ''}
                </div>
                <div class="location">
                    <div class="location-label">Location:</div>
                    <div class="location-value">${filter.location}</div>
                </div>
                <div class="booking-indicator ${hasBookings ? 'booked' : 'available'}">
                    ${hasBookings ? `${filter.bookings.length} Bookings` : 'Available'}
                </div>
            </div>
        `;
    }).join('');
}

function getFilterCapability(filter) {
    if (filter.uvCapability && filter.tenMicronCapability) {
        return '10 Micron + UV';
    } else if (filter.tenMicronCapability) {
        return '10 Micron';
    } else {
        return '25 Micron';
    }
}

function getServiceStatus(filter) {
    if (!filter.lastServiceDate || !filter.serviceFrequencyDays) {
        return { isDue: false, nextServiceDate: null };
    }
    
    const lastService = new Date(filter.lastServiceDate);
    const nextServiceDate = new Date(lastService);
    nextServiceDate.setDate(lastService.getDate() + filter.serviceFrequencyDays);
    
    const today = new Date();
    const isDue = today >= nextServiceDate;
    
    return { isDue, nextServiceDate: nextServiceDate.toISOString().split('T')[0] };
}

function formatNotesWithLinks(notes) {
    if (!notes) return '';
    
    // Simple URL regex that matches http(s) URLs
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    
    return notes.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Accessory Management Functions
function openAccessoryModal() {
    const accessoryModal = document.getElementById('accessoryModal');
    fetchAccessories();
    accessoryModal.style.display = 'block';
}

function closeAccessoryModal() {
    document.getElementById('accessoryModal').style.display = 'none';
}

function switchPool(pool) {
    currentPool = pool;
    
    // Update button states
    document.getElementById('nswPoolBtn').classList.toggle('active', pool === 'NSW');
    document.getElementById('waPoolBtn').classList.toggle('active', pool === 'WA');
    
    renderAccessoryList();
}

function renderAccessoryList() {
    const container = document.getElementById('accessoryList');
    const poolAccessories = accessories.filter(acc => acc.pool === currentPool);
    
    if (poolAccessories.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <p>No accessories in the ${currentPool} pool yet.</p>
                <p>Click "Add New Accessory" to get started.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = poolAccessories.map(accessory => {
        const quantityClass = accessory.quantity <= 1 ? 'limited' : 
                              accessory.quantity === 0 ? 'unavailable' : '';
        
        return `
            <div class="accessory-item">
                <div class="accessory-item-header">
                    <div>
                        <div class="accessory-name">${accessory.name}</div>
                        <div class="accessory-pool">${accessory.pool}</div>
                    </div>
                </div>
                <div class="accessory-quantity ${quantityClass}">
                    ${accessory.quantity} ${accessory.unit || 'units'}
                </div>
                <div class="accessory-details">
                    <div class="accessory-detail">
                        <span>Total Available:</span>
                        <span>${accessory.quantity}</span>
                    </div>
                    <div class="accessory-detail">
                        <span>Currently Allocated:</span>
                        <span>0</span>
                    </div>
                </div>
                <div class="accessory-notes ${!accessory.notes ? 'empty' : ''}">
                    ${accessory.notes || 'No notes'}
                </div>
                <div class="accessory-actions">
                    <button class="btn-edit" onclick="editAccessory(${accessory.id})">Edit</button>
                    <button class="btn-delete" onclick="confirmDeleteAccessory(${accessory.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAccessoryForm(accessory = null) {
    currentEditingAccessory = accessory;
    const modal = document.getElementById('accessoryFormModal');
    const title = document.getElementById('accessoryFormTitle');
    
    if (accessory) {
        title.textContent = 'Edit Accessory';
        document.getElementById('accessoryName').value = accessory.name;
        document.getElementById('accessoryPool').value = accessory.pool;
        document.getElementById('accessoryQuantity').value = accessory.quantity;
        document.getElementById('accessoryUnit').value = accessory.unit || '';
        document.getElementById('accessoryNotes').value = accessory.notes || '';
    } else {
        title.textContent = 'Add New Accessory';
        document.getElementById('accessoryName').value = '';
        document.getElementById('accessoryPool').value = currentPool;
        document.getElementById('accessoryQuantity').value = 1;
        document.getElementById('accessoryUnit').value = '';
        document.getElementById('accessoryNotes').value = '';
    }
    
    modal.style.display = 'block';
}

function closeAccessoryForm() {
    document.getElementById('accessoryFormModal').style.display = 'none';
    currentEditingAccessory = null;
}

function editAccessory(accessoryId) {
    const accessory = accessories.find(acc => acc.id === accessoryId);
    if (accessory) {
        openAccessoryForm(accessory);
    }
}

function confirmDeleteAccessory(accessoryId) {
    const accessory = accessories.find(acc => acc.id === accessoryId);
    if (accessory && confirm(`Are you sure you want to delete "${accessory.name}"?`)) {
        deleteAccessory(accessoryId);
    }
}

async function saveAccessory() {
    const name = document.getElementById('accessoryName').value.trim();
    const pool = document.getElementById('accessoryPool').value;
    const quantity = parseInt(document.getElementById('accessoryQuantity').value);
    const unit = document.getElementById('accessoryUnit').value.trim();
    const notes = document.getElementById('accessoryNotes').value.trim();
    
    if (!name) {
        alert('Please enter an accessory name');
        return;
    }
    
    if (quantity < 0) {
        alert('Quantity must be 0 or greater');
        return;
    }
    
    const accessoryData = { name, pool, quantity, unit, notes };
    
    let success = false;
    if (currentEditingAccessory) {
        await updateAccessory(currentEditingAccessory.id, accessoryData);
        success = true;
    } else {
        success = await createAccessory(accessoryData);
    }
    
    if (success) {
        closeAccessoryForm();
        // Update current pool to show the updated/new accessory
        if (pool !== currentPool) {
            switchPool(pool);
        }
    } else {
        alert('Error saving accessory. Please try again.');
    }
}

// Accessory Selection for Bookings
async function renderAccessorySelection() {
    if (!selectedFilter || currentBookingDates.length === 0) return;
    
    const sortedDates = currentBookingDates.sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    
    const availableAccessories = await fetchAvailableAccessories(selectedFilter.id, startDate, endDate);
    
    const container = document.getElementById('accessorySelectionContainer');
    if (!container) return;
    
    container.innerHTML = `
        <h4>Available Accessories for Selected Dates</h4>
        <div class="available-accessories">
            ${availableAccessories.map(accessory => `
                <div class="available-accessory" data-accessory-id="${accessory.id}">
                    <div class="accessory-info">
                        <div class="accessory-info-name">${accessory.name}</div>
                        <div class="accessory-info-available">
                            Available: ${accessory.availableQuantity}/${accessory.quantity} ${accessory.unit || ''}
                        </div>
                    </div>
                    <div class="accessory-input">
                        <input type="number" 
                               min="0" 
                               max="${accessory.availableQuantity}" 
                               value="0" 
                               id="qty-${accessory.id}"
                               onchange="updateAccessorySelection(${accessory.id})">
                        <button onclick="quickSelectAccessory(${accessory.id}, ${Math.min(1, accessory.availableQuantity)})">
                            Add
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="selected-accessories" id="selectedAccessoriesDisplay"></div>
    `;
    
    updateSelectedAccessoriesDisplay();
}

function updateAccessorySelection(accessoryId) {
    const input = document.getElementById(`qty-${accessoryId}`);
    const quantity = parseInt(input.value) || 0;
    
    // Remove existing selection for this accessory
    selectedAccessories = selectedAccessories.filter(sel => sel.id !== accessoryId);
    
    // Add new selection if quantity > 0
    if (quantity > 0) {
        const accessory = accessories.find(acc => acc.id === accessoryId);
        if (accessory) {
            selectedAccessories.push({
                id: accessoryId,
                name: accessory.name,
                quantity: quantity,
                unit: accessory.unit || ''
            });
        }
    }
    
    updateSelectedAccessoriesDisplay();
}

function quickSelectAccessory(accessoryId, quantity) {
    const input = document.getElementById(`qty-${accessoryId}`);
    input.value = quantity;
    updateAccessorySelection(accessoryId);
}

function updateSelectedAccessoriesDisplay() {
    const container = document.getElementById('selectedAccessoriesDisplay');
    if (!container) return;
    
    if (selectedAccessories.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <h5>Selected Accessories:</h5>
        ${selectedAccessories.map(accessory => `
            <div class="selected-accessory-item">
                <span>${accessory.name} - ${accessory.quantity} ${accessory.unit}</span>
                <button class="selected-accessory-remove" onclick="removeSelectedAccessory(${accessory.id})">
                    Remove
                </button>
            </div>
        `).join('')}
    `;
}

function removeSelectedAccessory(accessoryId) {
    selectedAccessories = selectedAccessories.filter(sel => sel.id !== accessoryId);
    
    // Reset the input field
    const input = document.getElementById(`qty-${accessoryId}`);
    if (input) input.value = 0;
    
    updateSelectedAccessoriesDisplay();
}

// Modal functions
function openFilterModal(filterId) {
    selectedFilter = filters.find(f => f.id === filterId);
    currentBookingDates = [];
    pendingBookings = [];
    
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = selectedFilter.name;
    modalBody.innerHTML = `
        <div class="form-group">
            <label>Location</label>
            <input type="text" id="location" value="${selectedFilter.location}" ${!isUnlocked ? 'disabled' : ''}>
        </div>
        
        <div class="form-group">
            <label>UV Capability</label>
            <label class="switch">
                <input type="checkbox" id="uvCapability" ${selectedFilter.uvCapability ? 'checked' : ''} ${!isUnlocked ? 'disabled' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        
        <div class="form-group">
            <label>10 Micron Capability</label>
            <label class="switch">
                <input type="checkbox" id="tenMicronCapability" ${selectedFilter.tenMicronCapability ? 'checked' : ''} ${!isUnlocked ? 'disabled' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        
        <div class="form-group">
            <label>Notes</label>
            ${isUnlocked ? `
                <textarea id="notes" rows="4" placeholder="Add notes... URLs will be automatically converted to clickable links">${selectedFilter.notes || ''}</textarea>
            ` : `
                <div class="notes-display">${formatNotesWithLinks(selectedFilter.notes || 'No notes')}</div>
            `}
        </div>
        
        <div class="form-group">
            <label>Service Management</label>
            <div class="service-info">
                ${selectedFilter.lastServiceDate ? `
                    <p>Last Service: ${new Date(selectedFilter.lastServiceDate).toLocaleDateString()}</p>
                    <p>Frequency: Every ${selectedFilter.serviceFrequencyDays || 90} days</p>
                    <p>Next Service: ${getServiceStatus(selectedFilter).nextServiceDate ? new Date(getServiceStatus(selectedFilter).nextServiceDate).toLocaleDateString() : 'Not scheduled'}</p>
                ` : '<p>No service history</p>'}
            </div>
            ${isUnlocked ? `
                <div class="service-controls">
                    <div class="service-frequency">
                        <label>Service Frequency (days):</label>
                        <input type="number" id="serviceFrequency" value="${selectedFilter.serviceFrequencyDays || 90}" min="1" max="365">
                    </div>
                    <button class="btn-service" onclick="scheduleService()">Schedule Service</button>
                </div>
            ` : ''}
        </div>
        
        <div class="form-group">
            <label>Schedule Bookings (Next 4 Weeks)</label>
            ${isUnlocked ? '<p class="booking-instructions">Click and drag to select date ranges, then enter job location and select accessories below</p>' : ''}
            <div id="calendar" class="calendar"></div>
        </div>
        
        ${isUnlocked ? `
            <div id="accessorySelectionContainer" class="accessory-selection"></div>
        ` : ''}
        
        ${isUnlocked ? `
            <div id="bookingControls" class="booking-controls">
                <div class="selected-dates-info" id="selectedDatesInfo" style="display: none;">
                    <span id="selectedDatesText"></span>
                    <div class="booking-input-group">
                        <input type="text" id="jobLocation" placeholder="Enter job location for selected dates" />
                        <button class="btn-secondary" onclick="addBooking()">Add Booking</button>
                        <button class="btn-service" onclick="addServiceBooking()">Add as Service</button>
                        <button class="btn-cancel" onclick="clearSelection()">Clear Selection</button>
                    </div>
                </div>
            </div>
            
            <div id="pendingBookings" class="pending-bookings"></div>
        ` : ''}
        
        <div class="booking-list">
            <h4>Current Bookings</h4>
            ${renderBookings(selectedFilter.bookings || [])}
        </div>
        
        ${isUnlocked ? `
            <div class="modal-actions">
                <button class="btn-primary" onclick="saveAllChanges()">Save All Changes</button>
                <button class="btn-secondary" onclick="cancelChanges()">Cancel</button>
            </div>
        ` : ''}
    `;
    
    renderCalendar();
    modal.style.display = 'block';
    resetInactivityTimer();
}

function renderCalendar() {
    const calendar = document.getElementById('calendar');
    const today = new Date();
    const weeks = [];
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let w = 0; w < 4; w++) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(today);
            date.setDate(today.getDate() + (w * 7) + d);
            week.push(date);
        }
        weeks.push(week);
    }
    
    calendar.innerHTML = `
        <div class="calendar-header">
            ${dayHeaders.map(day => `<div class="day-header">${day}</div>`).join('')}
        </div>
        ${weeks.map(week => `
            <div class="week">
                ${week.map(date => {
                    const dateStr = date.toISOString().split('T')[0];
                    const isBooked = selectedFilter.bookings?.some(b => b.date === dateStr);
                    const isPending = pendingBookings.some(b => b.dates.includes(dateStr));
                    const isSelected = currentBookingDates.includes(dateStr);
                    const isPast = date < today.setHours(0,0,0,0);
                    
                    return `
                        <div class="day ${isBooked ? 'booked' : ''} ${isPending ? 'pending' : ''} ${isSelected ? 'selected' : ''} ${isPast ? 'past' : ''}" 
                             data-date="${dateStr}" 
                             onmousedown="startDateDrag('${dateStr}')"
                             onmouseenter="handleDateDrag('${dateStr}')"
                             onmouseup="endDateDrag()"
                             ${!isUnlocked || isPast || isBooked ? 'style="cursor: default"' : ''}>
                            <span class="day-number">${date.getDate()}</span>
                            ${isBooked ? '<span class="booking-dot"></span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('')}
    `;
    
    // Add mouse event listeners for drag selection
    document.addEventListener('mouseup', endDateDrag);
    document.addEventListener('selectstart', e => e.preventDefault()); // Prevent text selection during drag
}

// Drag selection functionality
function startDateDrag(dateStr) {
    if (!isUnlocked) return;
    
    const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
    if (dayElement.classList.contains('booked') || dayElement.classList.contains('past')) return;
    
    isDragging = true;
    dragStartDate = dateStr;
    currentBookingDates = [dateStr];
    updateDateSelection();
    updateSelectedDatesInfo();
}

function handleDateDrag(dateStr) {
    if (!isDragging || !isUnlocked) return;
    
    const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
    if (dayElement.classList.contains('booked') || dayElement.classList.contains('past')) return;
    
    // Calculate date range from start to current
    const startDate = new Date(dragStartDate);
    const endDate = new Date(dateStr);
    
    currentBookingDates = [];
    const currentDate = new Date(Math.min(startDate, endDate));
    const finalDate = new Date(Math.max(startDate, endDate));
    
    while (currentDate <= finalDate) {
        const currentDateStr = currentDate.toISOString().split('T')[0];
        const dayEl = document.querySelector(`[data-date="${currentDateStr}"]`);
        
        if (dayEl && !dayEl.classList.contains('booked') && !dayEl.classList.contains('past')) {
            currentBookingDates.push(currentDateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    updateDateSelection();
    updateSelectedDatesInfo();
}

function endDateDrag() {
    isDragging = false;
    dragStartDate = null;
}

function updateDateSelection() {
    // Clear all selected states
    document.querySelectorAll('.day').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Add selected state to current booking dates
    currentBookingDates.forEach(dateStr => {
        const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
        if (dayElement) {
            dayElement.classList.add('selected');
        }
    });
}

function updateSelectedDatesInfo() {
    const infoDiv = document.getElementById('selectedDatesInfo');
    const textSpan = document.getElementById('selectedDatesText');
    
    if (currentBookingDates.length === 0) {
        infoDiv.style.display = 'none';
        // Clear accessory selection
        selectedAccessories = [];
        const accessoryContainer = document.getElementById('accessorySelectionContainer');
        if (accessoryContainer) accessoryContainer.innerHTML = '';
        return;
    }
    
    infoDiv.style.display = 'block';
    
    if (currentBookingDates.length === 1) {
        textSpan.textContent = `Selected: ${new Date(currentBookingDates[0]).toLocaleDateString()}`;
    } else {
        const sortedDates = currentBookingDates.sort();
        const startDate = new Date(sortedDates[0]).toLocaleDateString();
        const endDate = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString();
        textSpan.textContent = `Selected: ${startDate} - ${endDate} (${currentBookingDates.length} days)`;
    }
    
    // Render accessory selection for the selected dates
    if (isUnlocked) {
        renderAccessorySelection();
    }
}

function addBooking() {
    const jobLocation = document.getElementById('jobLocation').value.trim();
    
    if (!jobLocation) {
        alert('Please enter a job location');
        return;
    }
    
    if (currentBookingDates.length === 0) {
        alert('Please select dates first');
        return;
    }
    
    // Add to pending bookings
    pendingBookings.push({
        dates: [...currentBookingDates],
        location: jobLocation,
        type: 'booking',
        accessories: [...selectedAccessories]
    });
    
    // Clear current selection
    clearSelection();
    
    // Re-render calendar and pending bookings
    renderCalendar();
    renderPendingBookings();
}

function addServiceBooking() {
    const jobLocation = document.getElementById('jobLocation').value.trim() || 'Service';
    
    if (currentBookingDates.length === 0) {
        alert('Please select dates first');
        return;
    }
    
    // Add to pending bookings as service
    pendingBookings.push({
        dates: [...currentBookingDates],
        location: jobLocation,
        type: 'service',
        accessories: [...selectedAccessories]
    });
    
    // Clear current selection
    clearSelection();
    
    // Re-render calendar and pending bookings
    renderCalendar();
    renderPendingBookings();
}

function scheduleService() {
    const today = new Date();
    const serviceDate = today.toISOString().split('T')[0];
    
    // Add service booking for today
    pendingBookings.push({
        dates: [serviceDate],
        location: 'Service',
        type: 'service'
    });
    
    // Re-render calendar and pending bookings
    renderCalendar();
    renderPendingBookings();
}

function clearSelection() {
    currentBookingDates = [];
    selectedAccessories = [];
    document.getElementById('jobLocation').value = '';
    updateDateSelection();
    updateSelectedDatesInfo();
}

function renderPendingBookings() {
    const container = document.getElementById('pendingBookings');
    
    if (pendingBookings.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <h4>Pending Bookings</h4>
        <div class="pending-list">
            ${pendingBookings.map((booking, index) => {
                const sortedDates = booking.dates.sort();
                const dateRange = sortedDates.length === 1 
                    ? new Date(sortedDates[0]).toLocaleDateString()
                    : `${new Date(sortedDates[0]).toLocaleDateString()} - ${new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString()}`;
                
                const isService = booking.type === 'service';
                
                const accessoryCount = booking.accessories ? booking.accessories.length : 0;
                const accessoryText = accessoryCount > 0 ? ` (${accessoryCount} accessories)` : '';
                
                return `
                    <div class="pending-item ${isService ? 'service-booking' : ''}">
                        <span class="pending-dates">${dateRange}</span>
                        <span class="pending-location">${booking.location} ${isService ? '🔧' : ''}${accessoryText}</span>
                        <button class="remove-pending" onclick="removePendingBooking(${index})">Remove</button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function removePendingBooking(index) {
    pendingBookings.splice(index, 1);
    renderCalendar();
    renderPendingBookings();
}

function renderBookings(bookings) {
    if (!bookings || bookings.length === 0) return '<p>No current bookings</p>';
    
    return bookings.map(booking => {
        const isService = booking.type === 'service';
        const accessoryCount = booking.accessories ? booking.accessories.length : 0;
        const accessoryText = accessoryCount > 0 ? ` (${accessoryCount} accessories)` : '';
        
        return `
            <div class="booking-item ${isService ? 'service-booking' : ''}">
                <span>${new Date(booking.date).toLocaleDateString()} - ${booking.location} ${isService ? '🔧' : ''}${accessoryText}</span>
                ${isUnlocked ? `<button class="remove-booking" onclick="removeBooking('${booking.date}')">Remove</button>` : ''}
            </div>
        `;
    }).join('');
}

function removeBooking(date) {
    selectedFilter.bookings = selectedFilter.bookings.filter(b => b.date !== date);
    updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
        // Refresh the modal content
        openFilterModal(selectedFilter.id);
    });
}

// Save all changes
function saveAllChanges() {
    const location = document.getElementById('location').value;
    const uvCapability = document.getElementById('uvCapability').checked;
    const tenMicronCapability = document.getElementById('tenMicronCapability').checked;
    const notes = document.getElementById('notes')?.value || selectedFilter.notes || '';
    const serviceFrequencyDays = parseInt(document.getElementById('serviceFrequency')?.value) || selectedFilter.serviceFrequencyDays || 90;
    
    // Combine existing bookings with pending bookings
    const existingBookings = selectedFilter.bookings || [];
    const newBookings = [];
    let newLastServiceDate = selectedFilter.lastServiceDate;
    
    pendingBookings.forEach(booking => {
        booking.dates.forEach(date => {
            const bookingData = { 
                date, 
                location: booking.location,
                type: booking.type || 'booking',
                accessories: booking.accessories || []
            };
            
            // If this is a service booking, update the last service date
            if (booking.type === 'service') {
                if (!newLastServiceDate || new Date(date) > new Date(newLastServiceDate)) {
                    newLastServiceDate = date;
                }
            }
            
            newBookings.push(bookingData);
        });
    });
    
    const allBookings = [...existingBookings, ...newBookings].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    updateFilter(selectedFilter.id, {
        location,
        uvCapability,
        tenMicronCapability,
        notes,
        serviceFrequencyDays,
        lastServiceDate: newLastServiceDate,
        bookings: allBookings
    }).then(() => {
        pendingBookings = [];
        currentBookingDates = [];
        closeModal();
    });
}

function cancelChanges() {
    pendingBookings = [];
    currentBookingDates = [];
    closeModal();
}

// Lock/Unlock functionality
document.getElementById('lockBtn').addEventListener('click', function() {
    isUnlocked = !isUnlocked;
    this.classList.toggle('locked');
    this.classList.toggle('unlocked');
    
    const lockIcon = this.querySelector('.lock-icon');
    const lockText = this.querySelector('.lock-text');
    const emailBtn = document.getElementById('emailBtn');
    
    if (isUnlocked) {
        lockIcon.textContent = '🔓';
        lockText.textContent = 'Unlocked';
        emailBtn.style.display = 'none';
        resetInactivityTimer();
    } else {
        lockIcon.textContent = '🔒';
        lockText.textContent = 'Locked';
        emailBtn.style.display = 'flex';
        clearTimeout(inactivityTimer);
    }
});

// Email functionality
document.getElementById('emailBtn').addEventListener('click', openEmailModal);
document.querySelector('.email-close').addEventListener('click', closeEmailModal);
document.getElementById('closeEmailBtn').addEventListener('click', closeEmailModal);
document.getElementById('copyEmailBtn').addEventListener('click', copyEmailToClipboard);

// Accessory functionality
document.getElementById('accessoryBtn').addEventListener('click', openAccessoryModal);
document.querySelector('.accessory-close').addEventListener('click', closeAccessoryModal);
document.getElementById('closeAccessoryBtn').addEventListener('click', closeAccessoryModal);
document.getElementById('nswPoolBtn').addEventListener('click', () => switchPool('NSW'));
document.getElementById('waPoolBtn').addEventListener('click', () => switchPool('WA'));
document.getElementById('addAccessoryBtn').addEventListener('click', () => openAccessoryForm());
document.querySelector('.accessory-form-close').addEventListener('click', closeAccessoryForm);
document.getElementById('saveAccessoryBtn').addEventListener('click', saveAccessory);
document.getElementById('cancelAccessoryBtn').addEventListener('click', closeAccessoryForm);

function openEmailModal() {
    const emailModal = document.getElementById('emailModal');
    const emailText = document.getElementById('emailText');
    
    // Generate email content
    const emailContent = generateWeeklyReport();
    emailText.value = emailContent;
    
    emailModal.style.display = 'block';
}

function closeEmailModal() {
    document.getElementById('emailModal').style.display = 'none';
}

function generateWeeklyReport() {
    const today = new Date();
    const weekFromToday = new Date(today);
    weekFromToday.setDate(today.getDate() + 7);
    
    const subject = `Weekly Filter Status Report - ${today.toLocaleDateString()}`;
    
    let emailBody = `Subject: ${subject}\n\n`;
    emailBody += `WEEKLY FILTER STATUS REPORT\n`;
    emailBody += `Generated on: ${today.toLocaleDateString()} at ${today.toLocaleTimeString()}\n`;
    emailBody += `Report Period: ${today.toLocaleDateString()} - ${weekFromToday.toLocaleDateString()}\n`;
    emailBody += `${'='.repeat(60)}\n\n`;
    
    filters.forEach((filter, index) => {
        emailBody += `FILTER ${filter.id}: ${filter.name}\n`;
        emailBody += `${'-'.repeat(30)}\n`;
        
        // Location
        emailBody += `📍 Location: ${filter.location}\n`;
        
        // Capabilities
        const capability = getFilterCapability(filter);
        emailBody += `🔧 Filtration Capability: ${capability}\n`;
        emailBody += `   • UV Capability: ${filter.uvCapability ? '✅ Yes' : '❌ No'}\n`;
        emailBody += `   • 10 Micron Capability: ${filter.tenMicronCapability ? '✅ Yes' : '❌ No'}\n`;
        
        // Service Status
        const serviceStatus = getServiceStatus(filter);
        if (filter.lastServiceDate) {
            emailBody += `🛠️ Service Information:\n`;
            emailBody += `   • Last Service: ${new Date(filter.lastServiceDate).toLocaleDateString()}\n`;
            emailBody += `   • Service Frequency: Every ${filter.serviceFrequencyDays || 90} days\n`;
            if (serviceStatus.nextServiceDate) {
                emailBody += `   • Next Service Due: ${new Date(serviceStatus.nextServiceDate).toLocaleDateString()}`;
                if (serviceStatus.isDue) {
                    emailBody += ` ⚠️ OVERDUE`;
                }
                emailBody += `\n`;
            }
        } else {
            emailBody += `🛠️ Service Information: No service history recorded\n`;
        }
        
        // Bookings for the next week
        const nextWeekBookings = getNextWeekBookings(filter, today, weekFromToday);
        if (nextWeekBookings.length > 0) {
            emailBody += `📅 Bookings for Next 7 Days:\n`;
            nextWeekBookings.forEach(booking => {
                const bookingDate = new Date(booking.date).toLocaleDateString();
                const isService = booking.type === 'service';
                emailBody += `   • ${bookingDate}: ${booking.location}${isService ? ' (Service)' : ''}\n`;
                
                // Add accessory information for this booking
                if (booking.accessories && booking.accessories.length > 0) {
                    emailBody += `     📦 Accessories: `;
                    const accessoryList = booking.accessories.map(acc => 
                        `${acc.name} (${acc.quantity} ${acc.unit})`
                    ).join(', ');
                    emailBody += `${accessoryList}\n`;
                }
            });
        } else {
            emailBody += `📅 Bookings for Next 7 Days: None scheduled ✅\n`;
        }
        
        // Overall accessory allocation for this filter during the week
        const weeklyAccessoryAllocations = getWeeklyAccessoryAllocations(filter, today, weekFromToday);
        if (weeklyAccessoryAllocations.length > 0) {
            emailBody += `🔧 Weekly Accessory Allocations:\n`;
            weeklyAccessoryAllocations.forEach(allocation => {
                emailBody += `   • ${allocation.name}: ${allocation.totalQuantity} ${allocation.unit} (${allocation.days} days)\n`;
            });
        }
        
        // Notes
        if (filter.notes && filter.notes.trim()) {
            emailBody += `📝 Notes: ${filter.notes.trim()}\n`;
        }
        
        // Overall Status
        const isAvailable = nextWeekBookings.length === 0;
        emailBody += `📊 Status: ${isAvailable ? '✅ Available' : '🔴 Scheduled'}\n`;
        
        if (index < filters.length - 1) {
            emailBody += `\n`;
        }
    });
    
    // Summary
    emailBody += `\n${'='.repeat(60)}\n`;
    emailBody += `SUMMARY\n`;
    emailBody += `${'-'.repeat(30)}\n`;
    
    const availableFilters = filters.filter(filter => {
        const nextWeekBookings = getNextWeekBookings(filter, today, weekFromToday);
        return nextWeekBookings.length === 0;
    });
    
    const bookedFilters = filters.filter(filter => {
        const nextWeekBookings = getNextWeekBookings(filter, today, weekFromToday);
        return nextWeekBookings.length > 0;
    });
    
    const servicesDue = filters.filter(filter => getServiceStatus(filter).isDue);
    
    emailBody += `📊 Total Filters: ${filters.length}\n`;
    emailBody += `✅ Available for Next Week: ${availableFilters.length}\n`;
    emailBody += `🔴 Scheduled for Next Week: ${bookedFilters.length}\n`;
    emailBody += `⚠️ Services Due: ${servicesDue.length}\n`;
    
    if (servicesDue.length > 0) {
        emailBody += `\n🛠️ Filters Requiring Service:\n`;
        servicesDue.forEach(filter => {
            emailBody += `   • ${filter.name} (${filter.location})\n`;
        });
    }
    
    // Accessory Summary
    const accessorySummary = generateAccessorySummary(today, weekFromToday);
    
    emailBody += `\n${'='.repeat(60)}\n`;
    emailBody += `ACCESSORY STATUS SUMMARY\n`;
    emailBody += `${'-'.repeat(30)}\n`;
    
    // High utilization accessories (>50% allocated)
    const highUtilization = accessorySummary.availability.filter(acc => acc.percentUsed >= 50);
    if (highUtilization.length > 0) {
        emailBody += `⚠️ HIGH UTILIZATION ACCESSORIES (50%+ allocated):\n`;
        highUtilization.forEach(acc => {
            const status = acc.available <= 0 ? '🔴 FULLY ALLOCATED' : 
                          acc.available <= 1 ? '🟡 LIMITED' : '🟢 AVAILABLE';
            emailBody += `   • ${acc.name} (${acc.pool}): ${acc.allocated}/${acc.total} ${acc.unit} used (${acc.percentUsed}%) ${status}\n`;
        });
        emailBody += `\n`;
    }
    
    // Pool status
    const nswPoolItems = accessorySummary.availability.filter(acc => acc.pool === 'NSW');
    const waPoolItems = accessorySummary.availability.filter(acc => acc.pool === 'WA');
    
    const nswAllocated = nswPoolItems.filter(acc => acc.allocated > 0).length;
    const waAllocated = waPoolItems.filter(acc => acc.allocated > 0).length;
    
    emailBody += `📦 POOL STATUS:\n`;
    emailBody += `   🏢 NSW Pool (Filter 4): ${nswAllocated}/${nswPoolItems.length} accessories in use\n`;
    emailBody += `   🏢 WA Pool (Filters 1,2,3): ${waAllocated}/${waPoolItems.length} accessories in use\n`;
    
    // Most used accessories this week
    if (accessorySummary.usage.length > 0) {
        const topUsed = accessorySummary.usage
            .sort((a, b) => b.totalAllocated - a.totalAllocated)
            .slice(0, 5);
        
        emailBody += `\n📈 MOST ALLOCATED ACCESSORIES THIS WEEK:\n`;
        topUsed.forEach((usage, index) => {
            const filtersArray = Array.from(usage.filtersUsing);
            emailBody += `   ${index + 1}. ${usage.name}: ${usage.totalAllocated} ${usage.unit} (${filtersArray.join(', ')})\n`;
        });
    }
    
    // Fully available accessories
    const fullyAvailable = accessorySummary.availability.filter(acc => acc.allocated === 0);
    if (fullyAvailable.length > 0) {
        emailBody += `\n✅ FULLY AVAILABLE ACCESSORIES (${fullyAvailable.length} items):\n`;
        const nswAvailable = fullyAvailable.filter(acc => acc.pool === 'NSW');
        const waAvailable = fullyAvailable.filter(acc => acc.pool === 'WA');
        
        if (nswAvailable.length > 0) {
            emailBody += `   NSW Pool: ${nswAvailable.map(acc => acc.name).join(', ')}\n`;
        }
        if (waAvailable.length > 0) {
            emailBody += `   WA Pool: ${waAvailable.map(acc => acc.name).join(', ')}\n`;
        }
    }
    
    emailBody += `\n${'='.repeat(60)}\n`;
    emailBody += `This report was automatically generated by the Filter Status Tracker system.\n`;
    emailBody += `Includes comprehensive filter booking and accessory allocation tracking.\n`;
    emailBody += `For updates or changes, please access the system directly.\n`;
    
    return emailBody;
}

function getNextWeekBookings(filter, startDate, endDate) {
    if (!filter.bookings) return [];
    
    return filter.bookings.filter(booking => {
        const bookingDate = new Date(booking.date);
        return bookingDate >= startDate && bookingDate <= endDate;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getWeeklyAccessoryAllocations(filter, startDate, endDate) {
    const nextWeekBookings = getNextWeekBookings(filter, startDate, endDate);
    const accessoryMap = new Map();
    
    nextWeekBookings.forEach(booking => {
        if (booking.accessories && booking.accessories.length > 0) {
            booking.accessories.forEach(accessory => {
                const key = accessory.id || accessory.name;
                if (accessoryMap.has(key)) {
                    const existing = accessoryMap.get(key);
                    existing.totalQuantity += accessory.quantity;
                    existing.days += 1;
                } else {
                    accessoryMap.set(key, {
                        name: accessory.name,
                        totalQuantity: accessory.quantity,
                        unit: accessory.unit || '',
                        days: 1
                    });
                }
            });
        }
    });
    
    return Array.from(accessoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function generateAccessorySummary(startDate, endDate) {
    // Calculate overall accessory usage across all filters
    const accessoryUsage = new Map();
    const accessoryAvailability = [];
    
    filters.forEach(filter => {
        const allocations = getWeeklyAccessoryAllocations(filter, startDate, endDate);
        allocations.forEach(allocation => {
            const key = allocation.name;
            if (accessoryUsage.has(key)) {
                const existing = accessoryUsage.get(key);
                existing.totalAllocated += allocation.totalQuantity;
                existing.filtersUsing.add(filter.name);
            } else {
                accessoryUsage.set(key, {
                    name: allocation.name,
                    totalAllocated: allocation.totalQuantity,
                    unit: allocation.unit,
                    filtersUsing: new Set([filter.name])
                });
            }
        });
    });
    
    // Check availability status for each accessory
    accessories.forEach(accessory => {
        const usage = accessoryUsage.get(accessory.name);
        const allocated = usage ? usage.totalAllocated : 0;
        const available = accessory.quantity - allocated;
        
        accessoryAvailability.push({
            name: accessory.name,
            pool: accessory.pool,
            total: accessory.quantity,
            allocated: allocated,
            available: available,
            unit: accessory.unit || '',
            percentUsed: accessory.quantity > 0 ? Math.round((allocated / accessory.quantity) * 100) : 0
        });
    });
    
    return {
        usage: Array.from(accessoryUsage.values()),
        availability: accessoryAvailability.sort((a, b) => b.percentUsed - a.percentUsed)
    };
}

async function copyEmailToClipboard() {
    const emailText = document.getElementById('emailText');
    
    try {
        await navigator.clipboard.writeText(emailText.value);
        
        // Show feedback
        const copyBtn = document.getElementById('copyEmailBtn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#38a169';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '#667eea';
        }, 2000);
        
    } catch (err) {
        // Fallback for older browsers
        emailText.select();
        document.execCommand('copy');
        
        alert('Email content copied to clipboard!');
    }
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (isUnlocked) {
        inactivityTimer = setTimeout(() => {
            isUnlocked = false;
            const lockBtn = document.getElementById('lockBtn');
            lockBtn.classList.add('locked');
            lockBtn.classList.remove('unlocked');
            lockBtn.querySelector('.lock-icon').textContent = '🔒';
            lockBtn.querySelector('.lock-text').textContent = 'Locked';
            
            // Close modal if open
            closeModal();
        }, 5 * 60 * 1000); // 5 minutes
    }
}

// Modal close
function closeModal() {
    document.getElementById('modal').style.display = 'none';
    currentBookingDates = [];
    pendingBookings = [];
}

document.querySelector('.close').addEventListener('click', closeModal);

window.addEventListener('click', function(event) {
    const modal = document.getElementById('modal');
    const emailModal = document.getElementById('emailModal');
    const accessoryModal = document.getElementById('accessoryModal');
    const accessoryFormModal = document.getElementById('accessoryFormModal');
    
    if (event.target === modal) {
        closeModal();
    }
    
    if (event.target === emailModal) {
        closeEmailModal();
    }
    
    if (event.target === accessoryModal) {
        closeAccessoryModal();
    }
    
    if (event.target === accessoryFormModal) {
        closeAccessoryForm();
    }
});

// Track activity
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('mousemove', resetInactivityTimer);

// Initialize
fetchFilters();
fetchAccessories();