import * as Wizarr from "../../services/wizarr.js";
import { showNotification, showConfirmModal } from "../utils.js";

let currentUrl = '';
let currentKey = '';
let currentServerId = '';
let libraries = [];

/**
 * Initializes the Wizarr service view.
 * @param {string} url - Wizarr URL
 * @param {string} key - API Key
 */
export async function initWizarr(url, key) {
    currentUrl = url;
    currentKey = key;
    
    if (!url || !key) {
        showError("Please configure Wizarr in settings.");
        return;
    }
    
    // Setup event listeners (only once)
    setupEventListeners();
    
    // Load all data in parallel
    // We use allSettled so one failure doesn't block others (e.g. invites might fail but libraries load)
    await Promise.allSettled([
        loadServers(),
        loadLibraries(),
        loadInvitations()
    ]);
}

function showError(message) {
    const container = document.getElementById('wizarr-content');
    if (container) {
        container.replaceChildren();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-banner';
        errorDiv.textContent = message;
        container.appendChild(errorDiv);
    }
}

function setupEventListeners() {
    // Server selector
    const serverSelect = document.getElementById('wizarr-server-select');
    if (serverSelect && !serverSelect.dataset.listenerAttached) {
        serverSelect.addEventListener('change', async (e) => {
            currentServerId = e.target.value;
        });
        serverSelect.dataset.listenerAttached = 'true';
    }
    
    // Open Modal Button
    const openModalBtn = document.getElementById('wizarr-open-modal-btn');
    if (openModalBtn && !openModalBtn.dataset.listenerAttached) {
        openModalBtn.addEventListener('click', openModal);
        openModalBtn.dataset.listenerAttached = 'true';
    }
    
    // Close Modal Button
    const closeModalBtn = document.getElementById('wizarr-modal-close');
    if (closeModalBtn && !closeModalBtn.dataset.listenerAttached) {
        closeModalBtn.addEventListener('click', closeModal);
        closeModalBtn.dataset.listenerAttached = 'true';
    }
    
    // Cancel Button
    const cancelBtn = document.getElementById('wizarr-cancel-btn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }
    
    // Modal Backdrop Click
    const backdrop = document.querySelector('.wizarr-modal-backdrop');
    if (backdrop && !backdrop.dataset.listenerAttached) {
        backdrop.addEventListener('click', closeModal);
        backdrop.dataset.listenerAttached = 'true';
    }
    
    // Create invite form
    const createForm = document.getElementById('wizarr-create-form');
    if (createForm && !createForm.dataset.listenerAttached) {
        createForm.addEventListener('submit', handleCreateInvite);
        createForm.dataset.listenerAttached = 'true';
    }
    
    // Library preset buttons
    const presetBtns = document.querySelectorAll('.wizarr-preset-btn');
    presetBtns.forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', () => handleLibraryPreset(btn.dataset.preset));
            btn.dataset.listenerAttached = 'true';
        }
    });
}

function handleLibraryPreset(preset) {
    const checkboxes = document.querySelectorAll('#wizarr-libraries-list input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        const libName = (cb.dataset.libraryName || '').toLowerCase();
        
        switch (preset) {
            case 'all':
                cb.checked = true;
                break;
            case 'none':
                cb.checked = false;
                break;
            case 'movies-series':
                // Check if library name contains movie/film or series/serien
                const isMovieOrSeries = 
                    libName.includes('film') || 
                    libName.includes('movie') || 
                    libName.includes('serie') || 
                    libName.includes('tv') ||
                    libName.includes('show');
                cb.checked = isMovieOrSeries;
                break;
        }
    });
}

function openModal() {
    const modal = document.getElementById('wizarr-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeModal() {
    const modal = document.getElementById('wizarr-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    // Reset form
    const form = document.getElementById('wizarr-create-form');
    if (form) {
        form.reset();
    }
}

async function loadServers() {
    const serverSelect = document.getElementById('wizarr-server-select');
    if (!serverSelect) return;
    
    serverSelect.replaceChildren();
    const loadingOpt = document.createElement('option');
    loadingOpt.value = '';
    loadingOpt.textContent = 'Loading...';
    serverSelect.appendChild(loadingOpt);
    serverSelect.disabled = true;
    
    try {
        const servers = await Wizarr.getServers(currentUrl, currentKey);
        
        serverSelect.replaceChildren();

        if (servers.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No servers configured';
            serverSelect.appendChild(opt);
        } else {
            servers.forEach((server, index) => {
                const opt = document.createElement('option');
                opt.value = server.id;
                opt.textContent = `${server.name} (${server.server_type || 'Unknown'})`;
                serverSelect.appendChild(opt);
                
                // Auto-select first server
                if (index === 0) {
                    currentServerId = server.id;
                }
            });
        }
        
        serverSelect.disabled = false;
    } catch (error) {
        console.error('Failed to load servers:', error);
            serverSelect.replaceChildren();
        const failOpt = document.createElement('option');
        failOpt.value = '';
        failOpt.textContent = 'Failed to load';
        serverSelect.appendChild(failOpt);
    }
}

async function loadLibraries() {
    const container = document.getElementById('wizarr-libraries-list');
    if (!container) return;

    container.replaceChildren();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'wizarr-loading';
    loadingDiv.textContent = 'Loading libraries...';
    container.appendChild(loadingDiv);
    
    try {
        const response = await fetch(`${currentUrl}/api/libraries`, {
            headers: {
                'X-API-Key': currentKey,
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        libraries = Array.isArray(data.libraries) ? data.libraries : (Array.isArray(data) ? data : []);
        
        container.replaceChildren();

        if (libraries.length === 0) {
                    const emptyDiv = document.createElement('div');
            emptyDiv.className = 'wizarr-empty-state';
            emptyDiv.textContent = 'No libraries found';
            container.appendChild(emptyDiv);
            return;
        }
        
        libraries.forEach(lib => {
            const item = document.createElement('label');
            item.className = 'wizarr-library-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = lib.id || lib.key;
            checkbox.checked = true;
            checkbox.dataset.libraryName = lib.name || lib.title;
            
            const span = document.createElement('span');
            span.textContent = lib.name || lib.title || 'Unknown';
            
            item.appendChild(checkbox);
            item.appendChild(span);
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load libraries:', error);
            container.replaceChildren();
        const failDiv = document.createElement('div');
        failDiv.className = 'wizarr-empty-state';
        failDiv.textContent = 'Failed to load libraries';
        container.appendChild(failDiv);
    }
}

async function handleCreateInvite(e) {
    e.preventDefault();
    
    const createBtn = document.getElementById('wizarr-create-btn');
    const originalText = createBtn.textContent;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    
    try {
        const codeInput = document.getElementById('wizarr-invite-code');
        const expiresSelect = document.getElementById('wizarr-expires');
        const durationInput = document.getElementById('wizarr-duration');
        const unlimitedInput = document.getElementById('wizarr-unlimited');
        
        // Get selected libraries
        const selectedLibraries = [];
        const checkboxes = document.querySelectorAll('#wizarr-libraries-list input[type="checkbox"]:checked');
        checkboxes.forEach(cb => selectedLibraries.push(cb.value));
        
        const options = {
            server: currentServerId,
            code: codeInput.value.trim() || undefined,
            libraries: selectedLibraries,
            unlimited: unlimitedInput.checked,
            expiresInDays: expiresSelect.value ? parseInt(expiresSelect.value) : 0,
            durationDays: durationInput.value ? parseInt(durationInput.value) : null
        };
        
        const result = await Wizarr.createInvitation(currentUrl, currentKey, options);
        
        // Copy new invite link to clipboard
        if (result.invitation && result.invitation.code) {
            const inviteUrl = Wizarr.getInviteUrl(currentUrl, result.invitation.code);
            await navigator.clipboard.writeText(inviteUrl);
        }
        
        // Close modal and refresh list
        closeModal();
        await loadInvitations();
        
        // Show success notification with copied hint
        showNotification('Invitation created & copied!', 'success');
        
    } catch (error) {
        console.error('Failed to create invite:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = originalText;
    }
}

async function loadInvitations() {
    const container = document.getElementById('wizarr-invites-list');
    const countBadge = document.getElementById('wizarr-invites-count');
    
    if (!container) return;

    container.replaceChildren();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'wizarr-loading';
    loadingDiv.textContent = 'Loading invitations...';
    container.appendChild(loadingDiv);
    
    try {
        const response = await fetch(`${currentUrl}/api/invitations`, {
            headers: {
                'X-API-Key': currentKey,
                'accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        const allInvitations = Array.isArray(data.invitations) ? data.invitations : (Array.isArray(data) ? data : []);
        
        // Helper function to check if invitation is used (unlimited invites are never "used")
        const checkUsed = (inv) => {
            if (inv.unlimited) return false; // Unlimited can never be "used"
            return inv.status === 'used' || 
                   inv.used === true || 
                   (inv.used_by && inv.used_by.length > 0) ||
                   inv.used_at !== null;
        };
        
        // Sort by id descending (newest first)
        const invitations = allInvitations.sort((a, b) => (b.id || 0) - (a.id || 0));
        
        // Count only active (unused) for badge
        const activeCount = invitations.filter(inv => !checkUsed(inv)).length;
        if (countBadge) {
            countBadge.textContent = activeCount;
        }
        
        container.replaceChildren();

        if (invitations.length === 0) {
                    const emptyDiv = document.createElement('div');
            emptyDiv.className = 'wizarr-empty-state';
            emptyDiv.textContent = 'No invitations yet. Create one to get started!';
            container.appendChild(emptyDiv);
            return;
        }
        
        invitations.forEach(invite => {
            const isUsed = checkUsed(invite);
            const item = document.createElement('div');
            item.className = 'wizarr-invite-item' + (isUsed ? ' wizarr-invite-used' : '');
            
            // Left side: Code + Status inline
            const leftSide = document.createElement('div');
            leftSide.className = 'wizarr-invite-left';
            
            const codeRow = document.createElement('div');
            codeRow.className = 'wizarr-invite-row';
            
            const code = document.createElement('span');
            code.className = 'wizarr-invite-code';
            code.textContent = invite.code;
            code.title = 'Click to copy invite link';
            code.style.cursor = 'pointer';
            code.addEventListener('click', () => copyInviteLink(invite.code, code));
            
            // Status badge - Used vs Expired vs Active/Unlimited
            const statusSpan = document.createElement('span');
            
            // Check expiry
            const isExpired = invite.expires && new Date(invite.expires) < new Date();
            
            if (isUsed) {
                statusSpan.className = 'wizarr-status-badge used';
                statusSpan.textContent = 'Used';
            } else if (isExpired) {
                statusSpan.className = 'wizarr-status-badge expired';
                statusSpan.textContent = 'Expired';
            } else if (invite.unlimited) {
                statusSpan.className = 'wizarr-status-badge unlimited';
                statusSpan.textContent = 'âˆž';
            } else {
                statusSpan.className = 'wizarr-status-badge active';
                statusSpan.textContent = 'Active';
            }
            
            codeRow.appendChild(code);
            codeRow.appendChild(statusSpan);
            leftSide.appendChild(codeRow);
            
            // Expiry info if present
            if (invite.expires) {
                const expirySpan = document.createElement('span');
                expirySpan.className = 'wizarr-invite-expiry';
                expirySpan.textContent = `Expires ${new Date(invite.expires).toLocaleDateString()}`;
                leftSide.appendChild(expirySpan);
            }
            
            // Right side: Actions
            const actions = document.createElement('div');
            actions.className = 'wizarr-invite-actions';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'wizarr-copy-btn';
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
            copyBtn.addEventListener('click', () => copyInviteLink(invite.code, copyBtn));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'wizarr-delete-btn';
            deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            deleteBtn.title = 'Delete invitation';
            deleteBtn.addEventListener('click', () => deleteInvite(invite.id));
            
            actions.appendChild(copyBtn);
            actions.appendChild(deleteBtn);
            
            item.appendChild(leftSide);
            item.appendChild(actions);
            container.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load invitations:', error);
            container.replaceChildren();
        const failDiv = document.createElement('div');
        failDiv.className = 'wizarr-empty-state';
        failDiv.textContent = 'Failed to load invitations';
        container.appendChild(failDiv);
    }
}

async function copyInviteLink(code, element) {
    const inviteUrl = Wizarr.getInviteUrl(currentUrl, code);
    const originalText = element.textContent;
    
    try {
        await navigator.clipboard.writeText(inviteUrl);
        element.classList.add('wizarr-copied');
        element.textContent = 'âœ“ Copied!';
        
        setTimeout(() => {
            element.classList.remove('wizarr-copied');
            element.textContent = originalText;
        }, 1500);
    } catch (error) {
        console.error('Failed to copy:', error);
    }
}

async function deleteInvite(inviteId) {
    const confirmed = await showConfirmModal(
        'Delete Invitation', 
        'Are you sure you want to delete this invitation?', 
        'Delete', 
        '#d03142' // Wizarr Brand Color
    );
    
    if (!confirmed) return;
    
    try {
        const success = await Wizarr.deleteInvitation(currentUrl, currentKey, inviteId);
        if (success) {
            await loadInvitations();
            showNotification('Invitation deleted', 'success');
        } else {
            showNotification('Failed to delete', 'error');
        }
    } catch (error) {
        console.error('Failed to delete:', error);
        showNotification('Failed to delete', 'error');
    }
}

