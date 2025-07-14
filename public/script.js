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
        filters.sort((a, b) => a.id - b.id);
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
        
        // Ensure all accessories have outOfService field for backward compatibility
        accessories = accessories.map(accessory => ({
            ...accessory,
            outOfService: accessory.outOfService || { 
                isOutOfService: false, 
                startDate: null, 
                endDate: null, 
                reason: "" 
            },
            isCritical: accessory.isCritical || false,
            requiredPerBooking: accessory.requiredPerBooking || 1
        }));
        
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
        const futureRanges = getFutureBookingRanges(filter);
        const hasFutureBookings = futureRanges.length > 0;
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
                <div class="booking-indicator ${hasFutureBookings ? 'booked' : 'available'}">
                    ${hasFutureBookings ? futureRanges.join('<br>') : 'Available'}
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
        const isOutOfService = accessory.outOfService && accessory.outOfService.isOutOfService;
        const quantityClass = isOutOfService ? 'out-of-service' :
                              accessory.quantity <= 1 ? 'limited' : 
                              accessory.quantity === 0 ? 'unavailable' : '';
        
        // Calculate current allocations across all filters
        let currentAllocated = 0;
        if (filters && filters.length > 0) {
            const today = new Date();
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);
            
            filters.forEach(filter => {
                if (filter.bookings) {
                    filter.bookings.forEach(booking => {
                        const bookingDate = new Date(booking.date);
                        // Only count current and future bookings
                        if (bookingDate >= today && booking.accessories) {
                            const allocation = booking.accessories.find(a => a.id === accessory.id);
                            if (allocation) {
                                currentAllocated += allocation.quantity;
                            }
                        }
                    });
                }
            });
        }
        
        // Check if currently out of service
        let outOfServiceStatus = '';
        if (isOutOfService) {
            const startDate = new Date(accessory.outOfService.startDate).toLocaleDateString();
            const endDate = new Date(accessory.outOfService.endDate).toLocaleDateString();
            outOfServiceStatus = `
                <div class="out-of-service-banner">
                    🔧 OUT OF SERVICE: ${startDate} - ${endDate}
                    ${accessory.outOfService.reason ? `<br><small>${accessory.outOfService.reason}</small>` : ''}
                </div>
            `;
        }
        
        return `
            <div class="accessory-item ${isOutOfService ? 'out-of-service-item' : ''}">
                <div class="accessory-item-header">
                    <div>
                        <div class="accessory-name">${accessory.name} ${accessory.isCritical ? '<span class="critical-tag">Critical</span>' : ''}</div>
                        <div class="accessory-pool">${accessory.pool}</div>
                    </div>
                    ${isOutOfService ? '<div class="service-status-icon">🔧</div>' : ''}
                </div>
                ${outOfServiceStatus}
                <div class="accessory-quantity ${quantityClass}">
                    ${isOutOfService ? 'OUT OF SERVICE' : `${accessory.quantity} ${accessory.unit || 'units'}`}
                </div>
                <div class="accessory-details">
                    <div class="accessory-detail">
                        <span>Total Available:</span>
                        <span>${accessory.quantity}</span>
                    </div>
                    <div class="accessory-detail">
                        <span>Currently Allocated:</span>
                        <span class="${currentAllocated > 0 ? 'allocated-quantity' : ''}">${currentAllocated}</span>
                    </div>
                    <div class="accessory-detail">
                        <span>Available Now:</span>
                        <span class="${Math.max(0, accessory.quantity - currentAllocated) === 0 ? 'unavailable-quantity' : 'available-quantity'}">${Math.max(0, accessory.quantity - currentAllocated)}</span>
                    </div>
                    ${isOutOfService ? `
                    <div class="accessory-detail">
                        <span>Service Period:</span>
                        <span>${new Date(accessory.outOfService.startDate).toLocaleDateString()} - ${new Date(accessory.outOfService.endDate).toLocaleDateString()}</span>
                    </div>
                    ` : ''}
                    ${accessory.isCritical ? `
                    <div class="accessory-detail">
                        <span>Required per Booking:</span>
                        <span>${accessory.requiredPerBooking}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="accessory-notes ${!accessory.notes ? 'empty' : ''}">
                    ${accessory.notes || 'No notes'}
                </div>
                <div class="accessory-actions">
                    <button class="btn-edit" onclick="editAccessory(${accessory.id})">Edit</button>
                    ${isOutOfService ? 
                        `<button class="btn-service" onclick="clearOutOfService(${accessory.id})">Return to Service</button>` :
                        `<button class="btn-service" onclick="setOutOfService(${accessory.id})">Set Out of Service</button>`
                    }
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
        
        // Set out of service fields
        const outOfService = accessory.outOfService || { isOutOfService: false, startDate: null, endDate: null, reason: '' };
        document.getElementById('outOfServiceCheck').checked = outOfService.isOutOfService;
        document.getElementById('serviceStartDate').value = outOfService.startDate || '';
        document.getElementById('serviceEndDate').value = outOfService.endDate || '';
        document.getElementById('serviceReason').value = outOfService.reason || '';
        
        // Set critical fields
        document.getElementById('isCritical').checked = accessory.isCritical;
        document.getElementById('requiredPerBooking').value = accessory.requiredPerBooking;
        document.getElementById('requiredQuantityGroup').style.display = accessory.isCritical ? 'block' : 'none';
        
        toggleOutOfServiceFields();
    } else {
        title.textContent = 'Add New Accessory';
        document.getElementById('accessoryName').value = '';
        document.getElementById('accessoryPool').value = currentPool;
        document.getElementById('accessoryQuantity').value = 1;
        document.getElementById('accessoryUnit').value = '';
        document.getElementById('accessoryNotes').value = '';
        
        // Reset out of service fields
        document.getElementById('outOfServiceCheck').checked = false;
        document.getElementById('serviceStartDate').value = '';
        document.getElementById('serviceEndDate').value = '';
        document.getElementById('serviceReason').value = '';
        
        // Reset critical fields
        document.getElementById('isCritical').checked = false;
        document.getElementById('requiredPerBooking').value = 1;
        document.getElementById('requiredQuantityGroup').style.display = 'none';
        
        toggleOutOfServiceFields();
    }
    
    modal.style.display = 'block';
    
    // Add event listener for critical checkbox
    document.getElementById('isCritical').addEventListener('change', function() {
        document.getElementById('requiredQuantityGroup').style.display = this.checked ? 'block' : 'none';
    });
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

// Out of service modal state
let currentServiceAccessory = null;
let serviceSelectedDates = [];
let serviceIsDragging = false;
let serviceDragStartDate = null;

function setOutOfService(accessoryId) {
    const accessory = accessories.find(acc => acc.id === accessoryId);
    if (!accessory) return;
    
    currentServiceAccessory = accessory;
    serviceSelectedDates = [];
    
    const modal = document.getElementById('outOfServiceModal');
    document.getElementById('serviceAccessoryName').textContent = accessory.name;
    document.getElementById('serviceAccessoryPool').textContent = accessory.pool;
    document.getElementById('serviceReasonInput').value = '';
    
    renderServiceCalendar();
    modal.style.display = 'block';
}

function renderServiceCalendar() {
    const calendar = document.getElementById('serviceDateCalendar');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Start from today, show next 8 weeks
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - today.getDay()); // Start of current week
    
    const weeks = [];
    for (let w = 0; w < 8; w++) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + (w * 7) + d);
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
                    const isPast = date < today;
                    const isSelected = serviceSelectedDates.includes(dateStr);
                    
                    return `
                        <div class="day ${isPast ? 'past' : ''} ${isSelected ? 'selected' : ''}" 
                             data-date="${dateStr}" 
                             onmousedown="startServiceDateDrag('${dateStr}')"
                             onmouseenter="handleServiceDateDrag('${dateStr}')"
                             onmouseup="endServiceDateDrag()"
                             ${isPast ? 'style="cursor: default"' : ''}>
                            <span class="day-number">${date.getDate()}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `).join('')}
    `;
    
    // Add mouse event listeners
    document.addEventListener('mouseup', endServiceDateDrag);
    document.addEventListener('selectstart', e => e.preventDefault());
}

function startServiceDateDrag(dateStr) {
    const dayElement = document.querySelector(`#serviceDateCalendar [data-date="${dateStr}"]`);
    if (dayElement.classList.contains('past')) return;
    
    serviceIsDragging = true;
    serviceDragStartDate = dateStr;
    serviceSelectedDates = [dateStr];
    updateServiceDateSelection();
    updateServicePeriodDisplay();
}

function handleServiceDateDrag(dateStr) {
    if (!serviceIsDragging) return;
    
    const dayElement = document.querySelector(`#serviceDateCalendar [data-date="${dateStr}"]`);
    if (dayElement.classList.contains('past')) return;
    
    // Calculate date range from start to current
    const startDate = new Date(serviceDragStartDate);
    const endDate = new Date(dateStr);
    
    serviceSelectedDates = [];
    const currentDate = new Date(Math.min(startDate, endDate));
    const finalDate = new Date(Math.max(startDate, endDate));
    
    while (currentDate <= finalDate) {
        const currentDateStr = currentDate.toISOString().split('T')[0];
        const dayEl = document.querySelector(`#serviceDateCalendar [data-date="${currentDateStr}"]`);
        
        if (dayEl && !dayEl.classList.contains('past')) {
            serviceSelectedDates.push(currentDateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    updateServiceDateSelection();
    updateServicePeriodDisplay();
}

function endServiceDateDrag() {
    serviceIsDragging = false;
    serviceDragStartDate = null;
}

function updateServiceDateSelection() {
    // Clear all selected states
    document.querySelectorAll('#serviceDateCalendar .day').forEach(day => {
        day.classList.remove('selected');
    });
    
    // Add selected state to service dates
    serviceSelectedDates.forEach(dateStr => {
        const dayElement = document.querySelector(`#serviceDateCalendar [data-date="${dateStr}"]`);
        if (dayElement) {
            dayElement.classList.add('selected');
        }
    });
}

function updateServicePeriodDisplay() {
    const periodDiv = document.getElementById('selectedServicePeriod');
    const periodText = document.getElementById('servicePeriodText');
    
    if (serviceSelectedDates.length === 0) {
        periodDiv.style.display = 'none';
        return;
    }
    
    periodDiv.style.display = 'block';
    
    if (serviceSelectedDates.length === 1) {
        periodText.textContent = `Service Date: ${new Date(serviceSelectedDates[0]).toLocaleDateString()}`;
    } else {
        const sortedDates = serviceSelectedDates.sort();
        const startDate = new Date(sortedDates[0]).toLocaleDateString();
        const endDate = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString();
        periodText.textContent = `Service Period: ${startDate} - ${endDate} (${serviceSelectedDates.length} days)`;
    }
}

function clearServiceSelection() {
    serviceSelectedDates = [];
    updateServiceDateSelection();
    updateServicePeriodDisplay();
}

function confirmOutOfService() {
    if (serviceSelectedDates.length === 0) {
        alert('Please select a service period');
        return;
    }
    
    if (!currentServiceAccessory) return;
    
    const reason = document.getElementById('serviceReasonInput').value.trim();
    const sortedDates = serviceSelectedDates.sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    
    const outOfService = {
        isOutOfService: true,
        startDate: startDate,
        endDate: endDate,
        reason: reason
    };
    
    updateAccessory(currentServiceAccessory.id, { outOfService });
    closeOutOfServiceModal();
}

function closeOutOfServiceModal() {
    document.getElementById('outOfServiceModal').style.display = 'none';
    currentServiceAccessory = null;
    serviceSelectedDates = [];
}

function clearOutOfService(accessoryId) {
    const accessory = accessories.find(acc => acc.id === accessoryId);
    if (!accessory) return;
    
    if (confirm(`Return "${accessory.name}" to service?`)) {
        const outOfService = {
            isOutOfService: false,
            startDate: null,
            endDate: null,
            reason: ''
        };
        
        updateAccessory(accessoryId, { outOfService });
    }
}

function toggleOutOfServiceFields() {
    const isChecked = document.getElementById('outOfServiceCheck').checked;
    const serviceFields = document.getElementById('serviceFields');
    serviceFields.style.display = isChecked ? 'block' : 'none';
    
    // Set default dates if enabling out of service
    if (isChecked) {
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const defaultEndDate = nextWeek.toISOString().split('T')[0];
        
        if (!document.getElementById('serviceStartDate').value) {
            document.getElementById('serviceStartDate').value = today;
        }
        if (!document.getElementById('serviceEndDate').value) {
            document.getElementById('serviceEndDate').value = defaultEndDate;
        }
    }
}

async function saveAccessory() {
    const name = document.getElementById('accessoryName').value.trim();
    const pool = document.getElementById('accessoryPool').value;
    const quantity = parseInt(document.getElementById('accessoryQuantity').value);
    const unit = document.getElementById('accessoryUnit').value.trim();
    const notes = document.getElementById('accessoryNotes').value.trim();
    
    // Get critical fields
    const isCritical = document.getElementById('isCritical').checked;
    const requiredPerBooking = parseInt(document.getElementById('requiredPerBooking').value) || 1;
    
    // Get out of service data
    const isOutOfService = document.getElementById('outOfServiceCheck').checked;
    const outOfService = {
        isOutOfService: isOutOfService,
        startDate: isOutOfService ? document.getElementById('serviceStartDate').value : null,
        endDate: isOutOfService ? document.getElementById('serviceEndDate').value : null,
        reason: isOutOfService ? document.getElementById('serviceReason').value.trim() : ''
    };
    
    if (!name) {
        alert('Please enter an accessory name');
        return;
    }
    
    if (quantity < 0) {
        alert('Quantity must be 0 or greater');
        return;
    }
    
    if (isOutOfService) {
        if (!outOfService.startDate || !outOfService.endDate) {
            alert('Please enter both start and end dates for out of service period');
            return;
        }
        
        if (new Date(outOfService.startDate) >= new Date(outOfService.endDate)) {
            alert('End date must be after start date');
            return;
        }
    }
    
    const accessoryData = { name, pool, quantity, unit, notes, outOfService, isCritical, requiredPerBooking };
    
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
    
    // Critical accessories check
    let warningHTML = '';
    const criticalAccessories = availableAccessories.filter(acc => acc.isCritical);
    const insufficientCritical = criticalAccessories.filter(acc => acc.availableQuantity < acc.requiredPerBooking && !acc.isOutOfServiceDuringPeriod);
    const outOfServiceCritical = criticalAccessories.filter(acc => acc.isOutOfServiceDuringPeriod);
    
    if (insufficientCritical.length > 0 || outOfServiceCritical.length > 0) {
        warningHTML = `
            <div class="critical-warning">
                <h4>⚠️ Critical Accessory Alert</h4>
                <p>Some critical accessories for filter operation may not be available for the selected dates. These can be rented or leased if needed.</p>
                ${outOfServiceCritical.length > 0 ? `
                    <h5>Out of Service:</h5>
                    <ul>
                        ${outOfServiceCritical.map(acc => `<li>${acc.name}</li>`).join('')}
                    </ul>
                ` : ''}
                ${insufficientCritical.length > 0 ? `
                    <h5>Insufficient Quantity:</h5>
                    <ul>
                        ${insufficientCritical.map(acc => `<li>${acc.name} (Available: ${acc.availableQuantity}, Required: ${acc.requiredPerBooking})</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `;
    }
    
    const container = document.getElementById('accessorySelectionContainer');
    if (!container) return;
    
    container.innerHTML = `
        <h4>Available Accessories for Selected Dates</h4>
        ${warningHTML}
        <div class="available-accessories">
            ${availableAccessories.map(accessory => {
                const isOutOfService = accessory.isOutOfServiceDuringPeriod || false;
                const availableQty = Math.max(0, accessory.availableQuantity); // Ensure non-negative
                const isDisabled = availableQty === 0 || isOutOfService;
                const allocatedDisplay = accessory.allocatedCount > 0 ? ` (${accessory.allocatedCount} allocated)` : '';
                
                return `
                    <div class="available-accessory ${isOutOfService ? 'out-of-service' : ''} ${isDisabled ? 'disabled' : ''} ${accessory.isCritical ? 'critical-accessory' : ''}" data-accessory-id="${accessory.id}">
                        <div class="accessory-info">
                            <div class="accessory-info-name">
                                ${accessory.name} ${accessory.isCritical ? '<span class="critical-tag">Critical</span>' : ''}
                                ${isOutOfService ? ' 🔧' : ''}
                            </div>
                            <div class="accessory-info-available">
                                ${isOutOfService ? 
                                    `<span class="out-of-service-text">OUT OF SERVICE (${new Date(accessory.outOfService.startDate).toLocaleDateString()} - ${new Date(accessory.outOfService.endDate).toLocaleDateString()})</span>` :
                                    `Available: ${availableQty}/${accessory.quantity}${accessory.unit ? ` ${accessory.unit}` : ''}${allocatedDisplay}`
                                }
                            </div>
                            ${isOutOfService && accessory.outOfService.reason ? 
                                `<div class="service-reason">Reason: ${accessory.outOfService.reason}</div>` : 
                                ''
                            }
                            ${accessory.isCritical ? 
                                `<div class="critical-required">Required per booking: ${accessory.requiredPerBooking}</div>` : ''
                            }
                        </div>
                        <div class="accessory-input">
                            <input type="number" 
                                   min="0" 
                                   max="${availableQty}" 
                                   value="0" 
                                   step="1"
                                   id="qty-${accessory.id}"
                                   ${isDisabled ? 'disabled' : ''}
                                   onchange="updateAccessorySelection(${accessory.id})"
                                   oninput="validateNumberInput(this)">
                            <button onclick="quickSelectAccessory(${accessory.id}, ${Math.min(1, availableQty)})"
                                    ${isDisabled ? 'disabled' : ''}
                                    title="${isDisabled ? 'Not available' : `Add ${Math.min(1, availableQty)} unit${Math.min(1, availableQty) !== 1 ? 's' : ''}`}">
                                Add
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="selected-accessories" id="selectedAccessoriesDisplay"></div>
    `;
    
    updateSelectedAccessoriesDisplay();
}

// Helper function to validate number inputs in real-time
function validateNumberInput(input) {
    const min = parseInt(input.getAttribute('min')) || 0;
    const max = parseInt(input.getAttribute('max')) || 0;
    let value = parseInt(input.value) || 0;
    
    // Ensure value is within bounds
    if (value < min) {
        input.value = min;
    } else if (value > max && max > 0) {
        input.value = max;
    }
    
    // Remove any non-numeric characters (except for the initial input)
    if (isNaN(value) || value < 0) {
        input.value = min;
    }
    
    // Prevent negative values by handling keydown events
    input.addEventListener('keydown', function(e) {
        // Allow: backspace, delete, tab, escape, enter, home, end, left, right, up, down
        if ([46, 8, 9, 27, 13, 110, 35, 36, 37, 39, 38, 40].indexOf(e.keyCode) !== -1 ||
            // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            (e.keyCode === 65 && e.ctrlKey === true) ||
            (e.keyCode === 67 && e.ctrlKey === true) ||
            (e.keyCode === 86 && e.ctrlKey === true) ||
            (e.keyCode === 88 && e.ctrlKey === true)) {
            return;
        }
        // Ensure that it is a number and stop the keypress
        if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
            e.preventDefault();
        }
        // Prevent minus key (45) and plus key (43)
        if (e.keyCode === 45 || e.keyCode === 43) {
            e.preventDefault();
        }
    });
    
    // Also handle paste events to validate pasted content
    input.addEventListener('paste', function(e) {
        setTimeout(() => {
            validateNumberInput(input);
        }, 1);
    });
}

function updateAccessorySelection(accessoryId) {
    const input = document.getElementById(`qty-${accessoryId}`);
    const quantity = Math.max(0, parseInt(input.value) || 0); // Ensure non-negative
    
    // Find the available accessory data to check constraints
    const availableAccessories = document.querySelectorAll('[data-accessory-id]');
    let maxAvailable = 0;
    
    for (const element of availableAccessories) {
        if (parseInt(element.dataset.accessoryId) === accessoryId) {
            const maxInput = element.querySelector('input[type="number"]');
            maxAvailable = parseInt(maxInput.getAttribute('max')) || 0;
            break;
        }
    }
    
    // Validate quantity doesn't exceed available
    const validatedQuantity = Math.min(quantity, Math.max(0, maxAvailable));
    
    // Update input field with validated value
    if (validatedQuantity !== quantity) {
        input.value = validatedQuantity;
        if (maxAvailable <= 0) {
            alert('This accessory is not available for the selected dates.');
        } else {
            alert(`Maximum available quantity is ${maxAvailable}. Quantity adjusted.`);
        }
    }
    
    // Remove existing selection for this accessory
    selectedAccessories = selectedAccessories.filter(sel => sel.id !== accessoryId);
    
    // Add new selection if quantity > 0
    if (validatedQuantity > 0) {
        const accessory = accessories.find(acc => acc.id === accessoryId);
        if (accessory) {
            selectedAccessories.push({
                id: accessoryId,
                name: accessory.name,
                quantity: validatedQuantity,
                unit: accessory.unit || ''
            });
        }
    }
    
    updateSelectedAccessoriesDisplay();
}

function quickSelectAccessory(accessoryId, quantity) {
    const input = document.getElementById(`qty-${accessoryId}`);
    const maxAllowed = parseInt(input.getAttribute('max')) || 0;
    const safeQuantity = Math.min(Math.max(0, quantity), maxAllowed);
    input.value = safeQuantity;
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
                <span>${accessory.name} - ${accessory.quantity}${accessory.unit ? ` ${accessory.unit}` : ''}</span>
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
            <label>Schedule Bookings (From Today - Next 4 Weeks)</label>
            ${isUnlocked ? '<p class="booking-instructions">Click and drag to select date ranges from today forward, then enter job location and select accessories below</p>' : ''}
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
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    // Add day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Start from the beginning of the current week (Sunday)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    
    const weeks = [];
    
    // Generate 6 weeks to ensure we show at least 4 weeks from today
    for (let w = 0; w < 6; w++) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + (w * 7) + d);
            week.push(date);
        }
        weeks.push(week);
    }
    
    // Filter to only show weeks that contain dates from today forward
    const relevantWeeks = weeks.filter(week => 
        week.some(date => date >= today)
    ).slice(0, 4); // Limit to 4 weeks
    
    calendar.innerHTML = `
        <div class="calendar-header">
            ${dayHeaders.map(day => `<div class="day-header">${day}</div>`).join('')}
        </div>
        ${relevantWeeks.map(week => `
            <div class="week">
                ${week.map(date => {
                    const dateStr = date.toISOString().split('T')[0];
                    const isBooked = selectedFilter.bookings?.some(b => b.date === dateStr);
                    const isPending = pendingBookings.some(b => b.dates.includes(dateStr));
                    const isSelected = currentBookingDates.includes(dateStr);
                    const isPast = date < today;
                    
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
                const accessoryText = accessoryCount > 0 ? ` (${accessoryCount} accessory type${accessoryCount !== 1 ? 's' : ''})` : '';
                
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
    
    // Group bookings by consecutive dates and same location/type
    const groupedBookings = groupConsecutiveBookings(bookings);
    
    return groupedBookings.map((group, groupIndex) => {
        const isService = group.type === 'service';
        const hasAccessories = group.accessories && group.accessories.length > 0;
        
        // Format date range
        let dateDisplay;
        if (group.dates.length === 1) {
            dateDisplay = new Date(group.dates[0]).toLocaleDateString();
        } else {
            const sortedDates = group.dates.sort();
            const startDate = new Date(sortedDates[0]).toLocaleDateString();
            const endDate = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString();
            dateDisplay = `${startDate} - ${endDate}`;
        }
        
        // Create unique ID for this booking group
        const bookingId = `booking-${groupIndex}`;
        
        return `
            <div class="booking-item-container ${isService ? 'service-booking' : ''}">
                <div class="booking-item-header ${hasAccessories ? 'clickable' : ''}" ${hasAccessories ? `onclick="toggleBookingDetails('${bookingId}')"` : ''}>
                    <div class="booking-main-info">
                        <div class="booking-date-range">${dateDisplay}</div>
                        <div class="booking-location">${group.location} ${isService ? '🔧' : ''}</div>
                        ${hasAccessories ? `
                            <div class="booking-accessories-summary">
                                ${group.accessories.length} accessory type${group.accessories.length !== 1 ? 's' : ''}${group.dates.length > 1 ? ' (daily)' : ''}
                                <span class="expand-icon" id="${bookingId}-icon">▼</span>
                            </div>
                        ` : ''}
                    </div>
                    ${isUnlocked ? `
                        <div class="booking-actions">
                            <button class="btn-cancel-booking" onclick="event.stopPropagation(); confirmCancelEntireBooking('${group.dates.join(',')}', '${group.location}')" title="Cancel entire booking">
                                Cancel Booking
                            </button>
                            <div class="booking-actions-dropdown">
                                <button class="booking-menu-btn" onclick="event.stopPropagation(); toggleBookingMenu('${bookingId}')">
                                    <span>⋮</span>
                                </button>
                                <div class="booking-menu" id="${bookingId}-menu" style="display: none;">
                                    <button class="menu-item edit" onclick="event.stopPropagation(); editBookingLocation('${group.dates.join(',')}', '${group.location}')">
                                        <span class="menu-icon">✏️</span>
                                        Edit Location
                                    </button>
                                    ${hasAccessories ? `
                                        <button class="menu-item edit" onclick="event.stopPropagation(); editBookingAccessories('${group.dates.join(',')}', '${bookingId}')">
                                            <span class="menu-icon">🔧</span>
                                            Manage Accessories
                                        </button>
                                        <div class="menu-divider"></div>
                                    ` : ''}
                                    ${group.dates.length === 1 ? `
                                        <button class="menu-item delete" onclick="event.stopPropagation(); confirmRemoveBooking('${group.dates[0]}')">
                                            <span class="menu-icon">🗑️</span>
                                            Remove This Day
                                        </button>
                                    ` : `
                                        <div class="menu-section">
                                            <div class="menu-label">Remove individual days:</div>
                                            ${group.dates.map(date => `
                                                <button class="menu-item" onclick="event.stopPropagation(); confirmRemoveBooking('${date}')">
                                                    <span class="menu-icon">×</span>
                                                    ${new Date(date).toLocaleDateString()}
                                                </button>
                                            `).join('')}
                                        </div>
                                        <div class="menu-divider"></div>
                                        <button class="menu-item delete" onclick="event.stopPropagation(); confirmCancelEntireBooking('${group.dates.join(',')}', '${group.location}')">
                                            <span class="menu-icon">🗑️</span>
                                            Cancel Entire Booking
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                ${hasAccessories ? `
                    <div class="booking-details" id="${bookingId}" style="display: none;">
                        <div class="accessories-list">
                            <div class="accessories-header">
                                <h5>Accessories for this booking:</h5>
                                ${isUnlocked ? `
                                    <button class="btn-edit-accessories" onclick="editBookingAccessories('${group.dates.join(',')}', '${bookingId}')">
                                        Edit Accessories
                                    </button>
                                ` : ''}
                            </div>
                            <div class="accessories-items" id="${bookingId}-accessories">
                                ${group.accessories.map((accessory, accIndex) => {
                                    // Format quantity with proper spacing and handling of units
                                    let quantityDisplay = accessory.quantity;
                                    if (accessory.unit && accessory.unit.trim()) {
                                        quantityDisplay += ` ${accessory.unit.trim()}`;
                                    }
                                    
                                    // Add "per day" indicator for multi-day bookings
                                    if (group.dates.length > 1) {
                                        quantityDisplay += ' per day';
                                    }
                                    
                                    return `
                                        <div class="accessory-detail-item" data-accessory-index="${accIndex}">
                                            <span class="accessory-name">${accessory.name}</span>
                                            <span class="accessory-quantity">${quantityDisplay}</span>
                                            ${isUnlocked ? `
                                                <button class="remove-accessory-btn" onclick="removeAccessoryFromBooking('${group.dates.join(',')}', ${accessory.id || `'${accessory.name}'`})" title="Remove this accessory">
                                                    ×
                                                </button>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function groupConsecutiveBookings(bookings) {
    if (!bookings || bookings.length === 0) return [];
    
    const sortedBookings = [...bookings].sort((a, b) => new Date(a.date) - new Date(b.date));
    const groups = [];
    let currentGroup = null;
    
    sortedBookings.forEach(booking => {
        const bookingDate = new Date(booking.date);
        
        if (!currentGroup) {
            currentGroup = {
                dates: [booking.date],
                location: booking.location,
                type: booking.type || 'booking',
                accessories: [...(booking.accessories || [])],
                dailyAccessories: booking.accessories || [] // Store daily quantities
            };
        } else {
            const lastDate = new Date(currentGroup.dates[currentGroup.dates.length - 1]);
            const dayDiff = (bookingDate - lastDate) / (1000 * 60 * 60 * 24);
            
            // If consecutive dates and same location/type, extend group
            if (dayDiff <= 1 && currentGroup.location === booking.location && currentGroup.type === booking.type) {
                currentGroup.dates.push(booking.date);
                
                // For display purposes, use the daily accessories from the first booking
                // This shows what's used per day, not the total across all days
                if (booking.accessories && currentGroup.dailyAccessories.length === 0) {
                    currentGroup.dailyAccessories = [...booking.accessories];
                }
                
                // Keep the original accessories structure for compatibility
                // but use daily quantities for display
                currentGroup.accessories = [...currentGroup.dailyAccessories];
            } else {
                // Close current group and start new one
                groups.push(currentGroup);
                currentGroup = {
                    dates: [booking.date],
                    location: booking.location,
                    type: booking.type || 'booking',
                    accessories: [...(booking.accessories || [])],
                    dailyAccessories: booking.accessories || []
                };
            }
        }
    });
    
    if (currentGroup) {
        groups.push(currentGroup);
    }
    
    return groups;
}

function toggleBookingDetails(bookingId) {
    const detailsElement = document.getElementById(bookingId);
    const iconElement = document.getElementById(`${bookingId}-icon`);
    
    if (detailsElement.style.display === 'none' || !detailsElement.style.display) {
        detailsElement.style.display = 'block';
        iconElement.textContent = '▲';
    } else {
        detailsElement.style.display = 'none';
        iconElement.textContent = '▼';
    }
}

function toggleBookingMenu(bookingId) {
    // Close any other open menus first
    document.querySelectorAll('.booking-menu').forEach(menu => {
        if (menu.id !== `${bookingId}-menu`) {
            menu.style.display = 'none';
        }
    });
    
    const menuElement = document.getElementById(`${bookingId}-menu`);
    if (menuElement.style.display === 'none' || !menuElement.style.display) {
        menuElement.style.display = 'block';
    } else {
        menuElement.style.display = 'none';
    }
}

function removeAllBookingDates(dateString) {
    const dates = dateString.split(',');
    dates.forEach(date => {
        selectedFilter.bookings = selectedFilter.bookings.filter(b => b.date !== date);
    });
    
    updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
        // Refresh the modal content
        openFilterModal(selectedFilter.id);
    });
}

// Close booking menus when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.booking-actions-dropdown')) {
        document.querySelectorAll('.booking-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

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
    
    // Validate pending bookings and their accessory allocations
    if (pendingBookings.length > 0) {
        const validationErrors = [];
        
        pendingBookings.forEach((booking, index) => {
            if (booking.accessories && booking.accessories.length > 0) {
                booking.accessories.forEach(accessory => {
                    if (accessory.quantity <= 0) {
                        validationErrors.push(`Booking ${index + 1}: Invalid quantity for ${accessory.name}`);
                    }
                    
                    // Find the original accessory to check total quantity
                    const originalAccessory = accessories.find(acc => acc.id === accessory.id);
                    if (originalAccessory && accessory.quantity > originalAccessory.quantity) {
                        validationErrors.push(`Booking ${index + 1}: Requested ${accessory.quantity} of ${accessory.name}, but only ${originalAccessory.quantity} available in total`);
                    }
                });
            }
        });
        
        if (validationErrors.length > 0) {
            alert('Validation Errors:\n\n' + validationErrors.join('\n\n') + '\n\nPlease fix these issues before saving.');
            return;
        }
    }
    
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
        selectedAccessories = [];
        closeModal();
    }).catch(error => {
        alert('Error saving changes: ' + error.message);
        console.error('Save error:', error);
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
    const waEmailBtn = document.getElementById('waEmailBtn');
    const nswEmailBtn = document.getElementById('nswEmailBtn');
    
    if (isUnlocked) {
        lockIcon.textContent = '🔓';
        lockText.textContent = 'Unlocked';
        waEmailBtn.style.display = 'none';
        nswEmailBtn.style.display = 'none';
        resetInactivityTimer();
    } else {
        lockIcon.textContent = '🔒';
        lockText.textContent = 'Locked';
        waEmailBtn.style.display = 'flex';
        nswEmailBtn.style.display = 'flex';
        clearTimeout(inactivityTimer);
    }
});

// Email functionality
document.getElementById('waEmailBtn').addEventListener('click', () => openEmailModal('WA'));
document.getElementById('nswEmailBtn').addEventListener('click', () => openEmailModal('NSW'));
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

// Out of service modal event listeners
document.querySelector('.out-of-service-close').addEventListener('click', closeOutOfServiceModal);
document.getElementById('confirmOutOfServiceBtn').addEventListener('click', confirmOutOfService);
document.getElementById('cancelOutOfServiceBtn').addEventListener('click', closeOutOfServiceModal);

function openEmailModal(pool) {
    // Validate pool parameter
    if (!pool || !['WA', 'NSW'].includes(pool)) {
        console.error('Invalid pool parameter:', pool);
        pool = 'WA'; // Default fallback
    }
    
    const emailModal = document.getElementById('emailModal');
    const emailText = document.getElementById('emailText');
    const modalTitle = emailModal.querySelector('h2');
    
    // Update modal title to show which pool
    modalTitle.textContent = `Weekly Filter Status Report - ${pool} Pool`;
    
    // Generate email content
    const emailContent = generateWeeklyReport(pool);
    emailText.value = emailContent;
    
    emailModal.style.display = 'block';
}

function closeEmailModal() {
    document.getElementById('emailModal').style.display = 'none';
}

function getAllFilterBookings(filter) {
    if (!filter.bookings) return [];
    
    return filter.bookings.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function formatDateDDMMYYYY(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getBookingDateRanges(bookings) {
    if (bookings.length === 0) return 'Available';
    
    // Group consecutive dates
    const ranges = [];
    let currentRange = null;
    
    const sortedBookings = [...bookings].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sortedBookings.forEach(booking => {
        const bookingDate = new Date(booking.date);
        const isService = booking.type === 'service';
        const location = booking.location;
        
        if (!currentRange) {
            currentRange = {
                startDate: bookingDate,
                endDate: bookingDate,
                location: location,
                isService: isService,
                count: 1,
                accessories: booking.accessories || [],
                dailyAccessories: booking.accessories || [] // Store daily quantities for display
            };
        } else {
            const dayDiff = (bookingDate - currentRange.endDate) / (1000 * 60 * 60 * 24);
            
            // If consecutive dates and same location/type, extend range
            if (dayDiff <= 1 && currentRange.location === location && currentRange.isService === isService) {
                currentRange.endDate = bookingDate;
                currentRange.count++;
                
                // Keep daily accessories from first booking for display
                // Don't add up quantities across days for display purposes
                if (booking.accessories && currentRange.dailyAccessories.length === 0) {
                    currentRange.dailyAccessories = [...booking.accessories];
                }
                currentRange.accessories = [...currentRange.dailyAccessories];
            } else {
                // Close current range and start new one
                ranges.push(currentRange);
                currentRange = {
                    startDate: bookingDate,
                    endDate: bookingDate,
                    location: location,
                    isService: isService,
                    count: 1,
                    accessories: booking.accessories || [],
                    dailyAccessories: booking.accessories || []
                };
            }
        }
    });
    
    if (currentRange) {
        ranges.push(currentRange);
    }
    
    // Format ranges
    return ranges.map(range => {
        let dateStr;
        if (range.count === 1) {
            dateStr = formatDateDDMMYYYY(range.startDate);
        } else {
            dateStr = `${formatDateDDMMYYYY(range.startDate)}-${formatDateDDMMYYYY(range.endDate)}`;
        }
        
        const serviceText = range.isService ? ' (Service)' : '';
        let result = `${dateStr} ${range.location}${serviceText}`;
        
        // Add accessories if any
        if (range.accessories && range.accessories.length > 0) {
            const accessoryList = range.accessories.map(acc => {
                let quantityText = `${acc.quantity}${acc.unit ? ` ${acc.unit}` : ''}`;
                // Add "per day" for multi-day bookings
                if (range.count > 1) {
                    quantityText += ' per day';
                }
                return `${acc.name} (${quantityText})`;
            }).join(', ');
            result += ` - Accessories: ${accessoryList}`;
        }
        
        return result;
    }).join(', ');
}

// Helper function to format dates as DD/MM/YYYY
function formatDateDDMMYYYY(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function getNextWeekBookings(filter, startDate, endDate) {
    if (!filter.bookings) return [];
    
    return filter.bookings.filter(booking => {
        const bookingDate = new Date(booking.date);
        return bookingDate >= startDate && bookingDate <= endDate;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function generateWeeklyReport(pool) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const daysToEndOfWeek = 6 - dayOfWeek; // Days to Saturday
    const endOfCurrentWeek = new Date(today);
    endOfCurrentWeek.setDate(today.getDate() + daysToEndOfWeek);
    
    const endOfNextWeek = new Date(endOfCurrentWeek);
    endOfNextWeek.setDate(endOfCurrentWeek.getDate() + 7);
    
    // Validate pool parameter
    if (!pool || !['WA', 'NSW'].includes(pool)) {
        console.error('Invalid pool parameter:', pool);
        pool = 'WA'; // Default fallback
    }
    
    if (!filters || filters.length === 0) {
        return `Subject: Weekly Filter Status Report - ${pool} Pool - ${formatDateDDMMYYYY(today)}\n\nNo filters available in the system.`;
    }
    
    // Filter filters by pool
    const poolFilters = filters.filter(filter => {
        if (pool === 'WA') {
            return filter.id <= 3; // Filters 1, 2, 3 are WA pool
        } else if (pool === 'NSW') {
            return filter.id > 3; // Filter 4 is NSW pool
        }
        return true; // fallback to all filters
    });
    
    // Handle case where no filters exist for this pool
    if (poolFilters.length === 0) {
        const subject = `Weekly Filter Status Report - ${pool} Pool - ${formatDateDDMMYYYY(today)}`;
        return `Subject: ${subject}\n\nNo filters available in the ${pool} pool.`;
    }
    
    const subject = `Weekly Filter Status Report - ${pool} Pool - ${formatDateDDMMYYYY(today)}`;
    
    let emailBody = `Subject: ${subject}\n\n`;
    emailBody += `WEEKLY FILTER STATUS REPORT - ${pool} POOL\n`;
    emailBody += `Generated: ${formatDateDDMMYYYY(today)} at ${today.toLocaleTimeString()}\n`;
    emailBody += `Report Period: ${formatDateDDMMYYYY(today)} - ${formatDateDDMMYYYY(endOfNextWeek)}\n`;
    emailBody += `Pool: ${pool} (${pool === 'WA' ? 'Filters 1, 2, 3' : 'Filter 4'})\n`;
    emailBody += `${'='.repeat(60)}\n\n`;
    
    // Summary section (moved to top)
    const availableFilters = poolFilters.filter(filter => {
        const periodBookings = getNextWeekBookings(filter, today, endOfNextWeek);
        return periodBookings.length === 0;
    });
    
    const servicesDue = poolFilters.filter(filter => getServiceStatus(filter).isDue);
    
    // Helper function to add location suffix to filter names
    const getFilterNameWithLocation = (filter) => {
        const locationSuffix = filter.id <= 3 ? ' (WA)' : ' (NSW)';
        return filter.name + locationSuffix;
    };
    
    emailBody += `FILTER AVAILABILITY SUMMARY\n`;
    emailBody += `Available Operationally (${formatDateDDMMYYYY(today)} to ${formatDateDDMMYYYY(endOfNextWeek)}): ${availableFilters.map(f => getFilterNameWithLocation(f)).join(', ') || 'None'}\n`;
    emailBody += `Booked During Period: ${poolFilters.filter(f => !availableFilters.includes(f)).map(f => getFilterNameWithLocation(f)).join(', ') || 'None'}\n`;
    
    if (servicesDue.length > 0) {
        emailBody += `Services Due: ${servicesDue.map(f => getFilterNameWithLocation(f)).join(', ')}\n`;
    }
    
    emailBody += `\n`;
    
    // Filter status overview
    poolFilters.forEach((filter, index) => {
        const filterNameWithLocation = getFilterNameWithLocation(filter);
        emailBody += `FILTER ${filter.id}: ${filterNameWithLocation} (${filter.location})\n`;
        
        // Capabilities - one line
        const capability = getFilterCapability(filter);
        const uvStatus = filter.uvCapability ? 'UV' : 'No UV';
        const micronStatus = filter.tenMicronCapability ? '10μ' : '25μ';
        emailBody += `Capability: ${capability} (${uvStatus}, ${micronStatus})\n`;
        
        // Service status - concise
        const serviceStatus = getServiceStatus(filter);
        if (filter.lastServiceDate) {
            const nextServiceText = serviceStatus.nextServiceDate ? 
                formatDateDDMMYYYY(new Date(serviceStatus.nextServiceDate)) : 'Not scheduled';
            const overdueText = serviceStatus.isDue ? ' (OVERDUE)' : '';
            emailBody += `Service: Last ${formatDateDDMMYYYY(new Date(filter.lastServiceDate))}, Next ${nextServiceText}${overdueText}\n`;
        } else {
            emailBody += `Service: No history\n`;
        }
        
        // Bookings - show only future bookings
        const futureBookings = filter.bookings?.filter(b => new Date(b.date) >= today).sort((a, b) => new Date(a.date) - new Date(b.date)) || [];
        if (futureBookings.length > 0) {
            const bookingRanges = getBookingDateRanges(futureBookings);
            emailBody += `Bookings: ${bookingRanges}\n`;
        } else {
            emailBody += `Bookings: Available\n`;
        }
        
        // Notes - only if present
        if (filter.notes && filter.notes.trim()) {
            emailBody += `Notes: ${filter.notes.trim()}\n`;
        }
        
        emailBody += `\n`;
    });
    
    // Out of Service Accessories Section - filter by pool
    emailBody += `OUT OF SERVICE ACCESSORIES - ${pool} POOL\n`;
    const outOfServiceAccessories = accessories.filter(acc => {
        // Filter by pool first
        if (acc.pool !== pool) return false;
        
        if (!acc.outOfService || !acc.outOfService.isOutOfService) return false;
        
        const serviceStart = new Date(acc.outOfService.startDate);
        const serviceEnd = new Date(acc.outOfService.endDate);
        const periodEnd = new Date(endOfNextWeek);
        
        // Include if currently out of service or will be out of service within the period
        return serviceEnd >= today && serviceStart <= periodEnd;
    });
    
    if (outOfServiceAccessories.length > 0) {
        outOfServiceAccessories.forEach(accessory => {
            const startDate = formatDateDDMMYYYY(new Date(accessory.outOfService.startDate));
            const endDate = formatDateDDMMYYYY(new Date(accessory.outOfService.endDate));
            const reason = accessory.outOfService.reason ? ` (${accessory.outOfService.reason})` : '';
            
            emailBody += `${accessory.name} (${accessory.pool}): ${startDate} - ${endDate}${reason}\n`;
        });
    } else {
        emailBody += `All accessories operational\n`;
    }
    
    emailBody += `\n${'='.repeat(60)}\n`;
    emailBody += `Kind Regards, Kyden and Mat\n`;
    
    return emailBody;
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
    const outOfServiceModal = document.getElementById('outOfServiceModal');
    
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
    
    if (event.target === outOfServiceModal) {
        closeOutOfServiceModal();
    }
});

// Track activity
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('mousemove', resetInactivityTimer);

// Initialize
fetchFilters();
fetchAccessories();

// Enhanced booking management functions
function confirmCancelEntireBooking(dateString, location) {
    const dates = dateString.split(',');
    const dateDisplay = dates.length === 1 
        ? new Date(dates[0]).toLocaleDateString()
        : `${new Date(dates[0]).toLocaleDateString()} - ${new Date(dates[dates.length - 1]).toLocaleDateString()}`;
    
    const message = `Are you sure you want to cancel the entire booking?\n\n` +
                   `Location: ${location}\n` +
                   `Dates: ${dateDisplay}\n` +
                   `Days: ${dates.length}\n\n` +
                   `This will free up all accessories for these dates.`;
    
    if (confirm(message)) {
        cancelEntireBooking(dates);
    }
}

function confirmRemoveBooking(date) {
    const dateDisplay = new Date(date).toLocaleDateString();
    const booking = selectedFilter.bookings.find(b => b.date === date);
    const hasAccessories = booking && booking.accessories && booking.accessories.length > 0;
    
    let message = `Remove booking for ${dateDisplay}?`;
    if (hasAccessories) {
        message += `\n\nThis will also free up ${booking.accessories.length} accessories for this date.`;
    }
    
    if (confirm(message)) {
        removeBooking(date);
    }
}

function cancelEntireBooking(dates) {
    const removedCount = dates.length;
    let removedAccessories = 0;
    
    // Count accessories that will be freed
    dates.forEach(date => {
        const booking = selectedFilter.bookings.find(b => b.date === date);
        if (booking && booking.accessories) {
            removedAccessories += booking.accessories.length;
        }
    });
    
    // Remove all bookings for these dates
    dates.forEach(date => {
        selectedFilter.bookings = selectedFilter.bookings.filter(b => b.date !== date);
    });
    
    updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
        // Show success message
        const message = `Successfully cancelled booking!\n\n` +
                       `Removed: ${removedCount} day${removedCount !== 1 ? 's' : ''}\n` +
                       `Freed accessories: ${removedAccessories}`;
        alert(message);
        
        // Refresh the modal content
        openFilterModal(selectedFilter.id);
    }).catch(error => {
        alert('Error cancelling booking: ' + error.message);
    });
}

function editBookingLocation(dateString, currentLocation) {
    const dates = dateString.split(',');
    const dateDisplay = dates.length === 1 
        ? new Date(dates[0]).toLocaleDateString()
        : `${new Date(dates[0]).toLocaleDateString()} - ${new Date(dates[dates.length - 1]).toLocaleDateString()}`;
    
    const newLocation = prompt(`Edit location for booking:\n${dateDisplay}\n\nCurrent location:`, currentLocation);
    
    if (newLocation !== null && newLocation.trim() !== '' && newLocation.trim() !== currentLocation) {
        // Update all bookings for these dates
        dates.forEach(date => {
            const booking = selectedFilter.bookings.find(b => b.date === date);
            if (booking) {
                booking.location = newLocation.trim();
            }
        });
        
        updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
            alert(`Location updated to: ${newLocation.trim()}`);
            openFilterModal(selectedFilter.id);
        }).catch(error => {
            alert('Error updating location: ' + error.message);
        });
    }
}

function editBookingAccessories(dateString, bookingId) {
    const dates = dateString.split(',');
    const dateDisplay = dates.length === 1 
        ? new Date(dates[0]).toLocaleDateString()
        : `${new Date(dates[0]).toLocaleDateString()} - ${new Date(dates[dates.length - 1]).toLocaleDateString()}`;
    
    // Get current accessories for this booking group
    const currentAccessories = [];
    const firstBooking = selectedFilter.bookings.find(b => b.date === dates[0]);
    if (firstBooking && firstBooking.accessories) {
        currentAccessories.push(...firstBooking.accessories);
    }
    
    openAccessoryEditModal(dates, dateDisplay, currentAccessories, bookingId);
}

function removeAccessoryFromBooking(dateString, accessoryIdentifier) {
    const dates = dateString.split(',');
    const accessoryName = typeof accessoryIdentifier === 'string' ? accessoryIdentifier : 
                         accessories.find(acc => acc.id === accessoryIdentifier)?.name || 'Unknown';
    
    const message = `Remove "${accessoryName}" from this booking?\n\n` +
                   `This will free up the accessory for these dates:\n` +
                   `${dates.map(date => new Date(date).toLocaleDateString()).join(', ')}`;
    
    if (confirm(message)) {
        // Remove accessory from all bookings in this date range
        dates.forEach(date => {
            const booking = selectedFilter.bookings.find(b => b.date === date);
            if (booking && booking.accessories) {
                booking.accessories = booking.accessories.filter(acc => {
                    if (typeof accessoryIdentifier === 'string') {
                        return acc.name !== accessoryIdentifier;
                    } else {
                        return acc.id !== accessoryIdentifier;
                    }
                });
            }
        });
        
        updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
            alert(`"${accessoryName}" removed from booking`);
            openFilterModal(selectedFilter.id);
        }).catch(error => {
            alert('Error removing accessory: ' + error.message);
        });
    }
}

function openAccessoryEditModal(dates, dateDisplay, currentAccessories, bookingId) {
    // Create modal HTML
    const modalHTML = `
        <div id="accessoryEditModal" class="modal">
            <div class="modal-content">
                <span class="close accessory-edit-close">&times;</span>
                <h2>Edit Accessories</h2>
                <div class="accessory-edit-content">
                    <div class="booking-info">
                        <p><strong>Booking Dates:</strong> ${dateDisplay}</p>
                        <p><strong>Filter:</strong> ${selectedFilter.name}</p>
                    </div>
                    
                    <div class="current-accessories">
                        <h3>Current Accessories</h3>
                        <div id="currentAccessoriesList" class="current-accessories-list">
                            ${currentAccessories.length > 0 ? 
                                currentAccessories.map((acc, index) => `
                                    <div class="current-accessory-item" data-index="${index}">
                                        <span class="acc-name">${acc.name}</span>
                                        <div class="quantity-controls">
                                            <button class="quantity-btn" onclick="changeAccessoryQuantity(${index}, -1)">-</button>
                                            <input type="number" class="quantity-input" value="${acc.quantity}" min="0" 
                                                   onchange="updateAccessoryQuantity(${index}, this.value)"
                                                   data-accessory-id="${acc.id}">
                                            <button class="quantity-btn" onclick="changeAccessoryQuantity(${index}, 1)">+</button>
                                            <span class="acc-unit">${acc.unit || ''}</span>
                                        </div>
                                        <button class="remove-current-accessory" onclick="removeCurrentAccessory(${index})" title="Remove accessory">
                                            🗑️
                                        </button>
                                    </div>
                                `).join('') :
                                '<p class="no-accessories">No accessories currently assigned</p>'
                            }
                        </div>
                    </div>
                    
                    <div class="add-accessories">
                        <h3>Add More Accessories</h3>
                        <div id="availableAccessoriesForEdit" class="available-accessories-edit">
                            <!-- Will be populated by renderAvailableAccessoriesForEdit -->
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn-primary" onclick="saveAccessoryChanges('${dates.join(',')}', '${bookingId}')">Save Changes</button>
                        <button class="btn-secondary" onclick="closeAccessoryEditModal()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('accessoryEditModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    document.getElementById('accessoryEditModal').style.display = 'block';
    
    // Set up close handlers
    document.querySelector('.accessory-edit-close').addEventListener('click', closeAccessoryEditModal);
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('accessoryEditModal');
        if (event.target === modal) {
            closeAccessoryEditModal();
        }
    });
    
    // Store current state for editing
    window.editingAccessories = [...currentAccessories];
    window.editingDates = dates;
    
    // Load available accessories for adding
    renderAvailableAccessoriesForEdit(dates);
}

async function renderAvailableAccessoriesForEdit(dates) {
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    try {
        const availableAccessories = await fetchAvailableAccessories(selectedFilter.id, startDate, endDate);
        const container = document.getElementById('availableAccessoriesForEdit');
        
        container.innerHTML = availableAccessories.map(accessory => {
            const availableQty = Math.max(0, accessory.availableQuantity);
            const isDisabled = availableQty === 0 || (accessory.isOutOfServiceDuringPeriod || false);
            
            // Check if already in current selection
            const alreadySelected = window.editingAccessories.find(acc => acc.id === accessory.id);
            if (alreadySelected) {
                return ''; // Don't show accessories already selected
            }
            
            return `
                <div class="available-accessory-edit ${isDisabled ? 'disabled' : ''}" data-accessory-id="${accessory.id}">
                    <div class="accessory-info">
                        <div class="accessory-name">${accessory.name}</div>
                        <div class="accessory-available">Available: ${availableQty}/${accessory.quantity}</div>
                    </div>
                    <div class="add-accessory-controls">
                        <input type="number" class="add-quantity" min="0" max="${availableQty}" value="0" 
                               ${isDisabled ? 'disabled' : ''} 
                               id="add-qty-${accessory.id}">
                        <button class="btn-add-accessory" onclick="addAccessoryToEdit(${accessory.id})"
                                ${isDisabled ? 'disabled' : ''}>
                            Add
                        </button>
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join('');
        
        if (container.innerHTML === '') {
            container.innerHTML = '<p class="no-available">No additional accessories available for these dates</p>';
        }
    } catch (error) {
        console.error('Error loading available accessories:', error);
        document.getElementById('availableAccessoriesForEdit').innerHTML = 
            '<p class="error">Error loading available accessories</p>';
    }
}

// Accessory editing modal helper functions
function changeAccessoryQuantity(index, change) {
    const quantityInput = document.querySelector(`[data-index="${index}"] .quantity-input`);
    const currentQty = parseInt(quantityInput.value) || 0;
    const newQty = Math.max(0, currentQty + change);
    
    // Check max available (need to validate against original accessory limits)
    const accessoryId = quantityInput.dataset.accessoryId;
    const originalAccessory = accessories.find(acc => acc.id == accessoryId);
    if (originalAccessory && newQty > originalAccessory.quantity) {
        alert(`Cannot exceed total available quantity of ${originalAccessory.quantity}`);
        return;
    }
    
    quantityInput.value = newQty;
    updateAccessoryQuantity(index, newQty);
}

function updateAccessoryQuantity(index, newValue) {
    const quantity = Math.max(0, parseInt(newValue) || 0);
    
    if (window.editingAccessories && window.editingAccessories[index]) {
        window.editingAccessories[index].quantity = quantity;
        
        // Update the input field to ensure consistency
        const quantityInput = document.querySelector(`[data-index="${index}"] .quantity-input`);
        if (quantityInput) {
            quantityInput.value = quantity;
        }
        
        // If quantity is 0, could auto-remove, but let's keep it visible with 0
        if (quantity === 0) {
            const item = document.querySelector(`[data-index="${index}"]`);
            if (item) {
                item.classList.add('zero-quantity');
            }
        } else {
            const item = document.querySelector(`[data-index="${index}"]`);
            if (item) {
                item.classList.remove('zero-quantity');
            }
        }
    }
}

function removeCurrentAccessory(index) {
    if (window.editingAccessories && window.editingAccessories[index]) {
        const accessoryName = window.editingAccessories[index].name;
        
        if (confirm(`Remove "${accessoryName}" from this booking?`)) {
            // Remove from editing array
            window.editingAccessories.splice(index, 1);
            
            // Re-render the current accessories list
            renderCurrentAccessoriesList();
            
            // Re-render available accessories (since this one is now available again)
            renderAvailableAccessoriesForEdit(window.editingDates);
        }
    }
}

function addAccessoryToEdit(accessoryId) {
    const quantityInput = document.getElementById(`add-qty-${accessoryId}`);
    const quantity = parseInt(quantityInput.value) || 0;
    
    if (quantity <= 0) {
        alert('Please enter a quantity greater than 0');
        return;
    }
    
    const originalAccessory = accessories.find(acc => acc.id === accessoryId);
    if (!originalAccessory) {
        alert('Accessory not found');
        return;
    }
    
    // Add to editing accessories
    if (!window.editingAccessories) {
        window.editingAccessories = [];
    }
    
    window.editingAccessories.push({
        id: accessoryId,
        name: originalAccessory.name,
        quantity: quantity,
        unit: originalAccessory.unit || ''
    });
    
    // Re-render both lists
    renderCurrentAccessoriesList();
    renderAvailableAccessoriesForEdit(window.editingDates);
}

function renderCurrentAccessoriesList() {
    const container = document.getElementById('currentAccessoriesList');
    if (!container || !window.editingAccessories) return;
    
    if (window.editingAccessories.length === 0) {
        container.innerHTML = '<p class="no-accessories">No accessories currently assigned</p>';
        return;
    }
    
    container.innerHTML = window.editingAccessories.map((acc, index) => `
        <div class="current-accessory-item ${acc.quantity === 0 ? 'zero-quantity' : ''}" data-index="${index}">
            <span class="acc-name">${acc.name}</span>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="changeAccessoryQuantity(${index}, -1)">-</button>
                <input type="number" class="quantity-input" value="${acc.quantity}" min="0" 
                       onchange="updateAccessoryQuantity(${index}, this.value)"
                       data-accessory-id="${acc.id}">
                <button class="quantity-btn" onclick="changeAccessoryQuantity(${index}, 1)">+</button>
                <span class="acc-unit">${acc.unit || ''}</span>
            </div>
            <button class="remove-current-accessory" onclick="removeCurrentAccessory(${index})" title="Remove accessory">
                🗑️
            </button>
        </div>
    `).join('');
}

function saveAccessoryChanges(dateString, bookingId) {
    const dates = dateString.split(',');
    
    if (!window.editingAccessories) {
        alert('No changes to save');
        return;
    }
    
    // Filter out zero-quantity accessories
    const validAccessories = window.editingAccessories.filter(acc => acc.quantity > 0);
    
    // Validate quantities don't exceed available inventory
    const validationErrors = [];
    validAccessories.forEach(acc => {
        const originalAccessory = accessories.find(orig => orig.id === acc.id);
        if (originalAccessory && acc.quantity > originalAccessory.quantity) {
            validationErrors.push(`${acc.name}: Requested ${acc.quantity}, but only ${originalAccessory.quantity} available in total`);
        }
    });
    
    if (validationErrors.length > 0) {
        alert('Validation Errors:\n\n' + validationErrors.join('\n'));
        return;
    }
    
    // Update all bookings for these dates
    dates.forEach(date => {
        const booking = selectedFilter.bookings.find(b => b.date === date);
        if (booking) {
            booking.accessories = [...validAccessories];
        }
    });
    
    // Save to server
    updateFilter(selectedFilter.id, { bookings: selectedFilter.bookings }).then(() => {
        const accessoryCount = validAccessories.length;
        alert(`Successfully updated accessories!\n\nAssigned ${accessoryCount} accessory type${accessoryCount !== 1 ? 's' : ''} to this booking.`);
        
        closeAccessoryEditModal();
        openFilterModal(selectedFilter.id);
    }).catch(error => {
        alert('Error saving changes: ' + error.message);
    });
}

function closeAccessoryEditModal() {
    const modal = document.getElementById('accessoryEditModal');
    if (modal) {
        modal.remove();
    }
    
    // Clean up global variables
    if (window.editingAccessories) {
        delete window.editingAccessories;
    }
    if (window.editingDates) {
        delete window.editingDates;
    }
}

// Add this new function after the getServiceStatus function

function getFutureBookingRanges(filter) {
    const today = new Date().toISOString().split('T')[0];
    const futureBookings = (filter.bookings || []).filter(b => b.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    if (futureBookings.length === 0) return [];
    const ranges = [];
    let currentStart = futureBookings[0].date;
    let currentEnd = futureBookings[0].date;
    for (let i = 1; i < futureBookings.length; i++) {
        const prevDate = new Date(currentEnd);
        const thisDate = new Date(futureBookings[i].date);
        const dayDiff = (thisDate - prevDate) / (1000 * 60 * 60 * 24);
        if (dayDiff === 1) {
            currentEnd = futureBookings[i].date;
        } else {
            ranges.push({start: currentStart, end: currentEnd});
            currentStart = futureBookings[i].date;
            currentEnd = futureBookings[i].date;
        }
    }
    ranges.push({start: currentStart, end: currentEnd});
    return ranges.map(range => {
        const startDate = new Date(range.start);
        const endDate = new Date(range.end);
        if (range.start === range.end) {
            return formatDateDDMMYYYY(startDate);
        } else {
            return `${formatDateDDMMYYYY(startDate)} - ${formatDateDDMMYYYY(endDate)}`;
        }
    });
}