// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const saveTab = document.getElementById('save-tab');
const searchTab = document.getElementById('search-tab');
const selectedTextEl = document.getElementById('selected-text');
const pageTitleEl = document.getElementById('page-title');
const pageUrlEl = document.getElementById('page-url');
const tagsInput = document.getElementById('tags-input');
const saveBtn = document.getElementById('save-btn');
const confirmationEl = document.getElementById('confirmation');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const showAllBtn = document.getElementById('show-all-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const noteModal = document.getElementById('note-modal');
const modalContent = document.getElementById('modal-note-content');
const closeModalBtn = document.querySelector('.close-btn');
const copyNoteBtn = document.getElementById('copy-note-btn');
const exportNoteBtn = document.getElementById('export-note-btn');
const openUrlBtn = document.getElementById('open-url-btn');
const deleteNoteBtn = document.getElementById('delete-note-btn');
const exportAllBtn = document.getElementById('export-all-btn');

let currentSelection = '';
let currentPageTitle = '';
let currentPageUrl = '';
let currentNoteId = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await getSelectionFromPage();
  setupEventListeners();
}

// Get selected text from current tab
async function getSelectionFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      selectedTextEl.innerHTML = '<em>No active tab found</em>';
      saveBtn.disabled = true;
      return;
    }
    
    // Set page info
    currentPageTitle = tab.title || 'Unknown Page';
    currentPageUrl = tab.url || '';
    
    pageTitleEl.textContent = currentPageTitle;
    pageTitleEl.title = currentPageTitle;
    pageUrlEl.textContent = truncateUrl(currentPageUrl);
    pageUrlEl.title = currentPageUrl;
    
    // Check if we can access this page (can't access chrome:// pages, etc.)
    const restrictedUrls = [
      'chrome://',
      'chrome-extension://',
      'https://chrome.google.com',
      'https://chromewebstore.google.com',
      'edge://',
      'about:',
      'view-source:',
      'data:',
      'blob:',
      'file://'
    ];
    
    const isRestricted = !tab.url || restrictedUrls.some(prefix => tab.url.startsWith(prefix));
    
    if (isRestricted) {
      selectedTextEl.innerHTML = '<em>Cannot access this page. Try on a regular webpage.</em>';
      saveBtn.disabled = true;
      return;
    }
    
    // Execute script to get selection
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim()
    });
    
    if (results && results[0] && results[0].result) {
      currentSelection = results[0].result;
      selectedTextEl.innerHTML = '';
      selectedTextEl.textContent = currentSelection;
      saveBtn.disabled = false;
    } else {
      selectedTextEl.innerHTML = '<em>Highlight text on the page, then open this popup</em>';
      saveBtn.disabled = true;
    }
  } catch (error) {
    console.error('Error getting selection:', error);
    selectedTextEl.innerHTML = '<em>Cannot access this page. Try on a regular webpage.</em>';
    saveBtn.disabled = true;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
  
  // Save note
  saveBtn.addEventListener('click', saveNote);
  
  // Search
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // Show all notes
  showAllBtn.addEventListener('click', showAllNotes);
  
  // Clear all notes
  clearAllBtn.addEventListener('click', clearAllNotes);
  
  // Modal controls
  closeModalBtn.addEventListener('click', closeModal);
  noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) closeModal();
  });
  
  copyNoteBtn.addEventListener('click', copyCurrentNote);
  exportNoteBtn.addEventListener('click', exportCurrentNote);
  openUrlBtn.addEventListener('click', openCurrentNoteUrl);
  deleteNoteBtn.addEventListener('click', deleteCurrentNote);
  
  // Export all notes
  exportAllBtn.addEventListener('click', exportAllNotes);
}

// Switch tabs
function switchTab(tabId) {
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  if (tabId === 'save') {
    saveTab.classList.add('active');
    searchTab.classList.remove('active');
  } else {
    saveTab.classList.remove('active');
    searchTab.classList.add('active');
    showAllNotes();
  }
}

// Save note to storage
async function saveNote() {
  if (!currentSelection) return;
  
  const note = {
    id: Date.now().toString(),
    text: currentSelection,
    pageTitle: currentPageTitle,
    pageUrl: currentPageUrl,
    tags: tagsInput.value.split(',').map(t => t.trim()).filter(t => t),
    createdAt: new Date().toISOString()
  };
  
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    notes.unshift(note);
    await chrome.storage.local.set({ notes });
    
    // Show confirmation
    showConfirmation();
    
    // Clear inputs
    tagsInput.value = '';
    
  } catch (error) {
    console.error('Error saving note:', error);
    alert('Failed to save note. Please try again.');
  }
}

// Show saved confirmation
function showConfirmation() {
  confirmationEl.classList.remove('hidden');
  setTimeout(() => {
    confirmationEl.classList.add('hidden');
  }, 2000);
}

// Perform search
async function performSearch() {
  const query = searchInput.value.trim().toLowerCase();
  
  if (!query) {
    searchResults.innerHTML = '<p class="placeholder-text">Enter a keyword to search your notes</p>';
    return;
  }
  
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    
    const results = notes.filter(note => {
      const textMatch = note.text.toLowerCase().includes(query);
      const titleMatch = note.pageTitle.toLowerCase().includes(query);
      const urlMatch = note.pageUrl.toLowerCase().includes(query);
      const tagMatch = note.tags.some(tag => tag.toLowerCase().includes(query));
      return textMatch || titleMatch || urlMatch || tagMatch;
    });
    
    displayNotes(results);
  } catch (error) {
    console.error('Error searching notes:', error);
  }
}

// Show all notes
async function showAllNotes() {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    displayNotes(notes);
  } catch (error) {
    console.error('Error loading notes:', error);
  }
}

// Display notes in search results
function displayNotes(notes) {
  if (notes.length === 0) {
    searchResults.innerHTML = `
      <div class="no-results">
        <p>No notes found</p>
      </div>
    `;
    return;
  }
  
  searchResults.innerHTML = notes.map(note => `
    <div class="note-card" data-id="${note.id}">
      <div class="note-card-title">${escapeHtml(note.pageTitle)}</div>
      <div class="note-card-text">${escapeHtml(note.text)}</div>
      ${note.tags.length > 0 ? `
        <div class="note-card-tags">
          ${note.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      <div class="note-card-meta">
        <span>${formatDate(note.createdAt)}</span>
      </div>
    </div>
  `).join('');
  
  // Add click handlers to note cards
  document.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNoteModal(card.dataset.id));
  });
}

// Open note detail modal
async function openNoteModal(noteId) {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    const note = notes.find(n => n.id === noteId);
    
    if (!note) return;
    
    currentNoteId = noteId;
    
    modalContent.innerHTML = `
      <div class="note-text">${escapeHtml(note.text)}</div>
      <div class="note-source">
        <strong>Source:</strong> ${escapeHtml(note.pageTitle)}<br>
        <a href="${escapeHtml(note.pageUrl)}" target="_blank">${escapeHtml(truncateUrl(note.pageUrl))}</a>
      </div>
      ${note.tags.length > 0 ? `
        <div class="note-card-tags" style="margin-top: 8px;">
          ${note.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      <div style="margin-top: 8px; font-size: 11px; color: #999;">
        Saved: ${formatDate(note.createdAt)}
      </div>
    `;
    
    noteModal.classList.remove('hidden');
  } catch (error) {
    console.error('Error opening note:', error);
  }
}

// Close modal
function closeModal() {
  noteModal.classList.add('hidden');
  currentNoteId = null;
}

// Copy current note text
async function copyCurrentNote() {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    const note = notes.find(n => n.id === currentNoteId);
    
    if (note) {
      await navigator.clipboard.writeText(note.text);
      copyNoteBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyNoteBtn.textContent = 'Copy Text';
      }, 1500);
    }
  } catch (error) {
    console.error('Error copying note:', error);
  }
}

// Open source URL
async function openCurrentNoteUrl() {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    const note = notes.find(n => n.id === currentNoteId);
    
    if (note && note.pageUrl) {
      chrome.tabs.create({ url: note.pageUrl });
    }
  } catch (error) {
    console.error('Error opening URL:', error);
  }
}

// Delete current note
async function deleteCurrentNote() {
  if (!confirm('Are you sure you want to delete this note?')) return;
  
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    const updatedNotes = notes.filter(n => n.id !== currentNoteId);
    await chrome.storage.local.set({ notes: updatedNotes });
    
    closeModal();
    
    // Refresh the search results
    if (searchInput.value.trim()) {
      performSearch();
    } else {
      showAllNotes();
    }
  } catch (error) {
    console.error('Error deleting note:', error);
  }
}

// Clear all notes
async function clearAllNotes() {
  if (!confirm('Are you sure you want to delete ALL notes? This cannot be undone.')) return;
  
  try {
    await chrome.storage.local.set({ notes: [] });
    searchResults.innerHTML = '<p class="placeholder-text">Enter a keyword to search your notes</p>';
  } catch (error) {
    console.error('Error clearing notes:', error);
  }
}

// Export current note
async function exportCurrentNote() {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    const note = notes.find(n => n.id === currentNoteId);
    
    if (note) {
      const exportData = formatNoteForExport(note);
      downloadFile(exportData, `note-${note.id}.txt`, 'text/plain');
    }
  } catch (error) {
    console.error('Error exporting note:', error);
  }
}

// Export all notes
async function exportAllNotes() {
  try {
    const { notes = [] } = await chrome.storage.local.get('notes');
    
    if (notes.length === 0) {
      alert('No notes to export.');
      return;
    }
    
    const exportData = notes.map(note => formatNoteForExport(note)).join('\n\n' + '='.repeat(50) + '\n\n');
    downloadFile(exportData, `quick-notes-export-${Date.now()}.txt`, 'text/plain');
  } catch (error) {
    console.error('Error exporting notes:', error);
  }
}

// Format a single note for export
function formatNoteForExport(note) {
  const lines = [
    `Title: ${note.pageTitle}`,
    `URL: ${note.pageUrl}`,
    `Date: ${new Date(note.createdAt).toLocaleString()}`,
    note.tags.length > 0 ? `Tags: ${note.tags.join(', ')}` : null,
    '',
    note.text
  ].filter(line => line !== null);
  
  return lines.join('\n');
}

// Download file helper
function downloadFile(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Utility functions
function truncateUrl(url) {
  if (!url) return '-';
  if (url.length > 40) {
    return url.substring(0, 40) + '...';
  }
  return url;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
