//Chat (Send button)

async function sendQuestion() {
    const input = document.getElementById('question');
    const question = input.value.trim();
    if (!question) return;

    const chat = document.getElementById('chat');

    appendMessage(chat, 'user-message', question);
    input.value = '';

    const loading = appendMessage(chat, 'ai-message loading-message', 'Thinking...');
    setButtons(true);

    // Collect selected files from sidebar checkboxes
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const selectedFiles = Array.from(checkboxes).map(cb => cb.value);

    try {
        const res  = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                question,
                files: selectedFiles  // Send selected files to backend
            }),
        });
        const data = await res.json();
        loading.remove();
        renderAskResponse(chat, data);
    } catch {
        loading.className = 'ai-message';
        loading.innerText = 'Error: could not reach the server.';
    } finally {
        setButtons(false);
    }
}

// Generate Report

async function generateReport() {
    // Collect selected files from sidebar checkboxes
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const files = Array.from(checkboxes).map(cb => cb.value);

    if (files.length === 0) {
        alert('Select one or more files from the sidebar, then click Generate Report.');
        return;
    }

    const chat = document.getElementById('chat');

    appendMessage(chat, 'user-message', 'Generate report for: ' + files.join(', '));

    const segmentEstimate = files.length > 1 ? 'comparing ' + files.length + ' files' : '1 file';
    const loading = appendMessage(
        chat, 'ai-message loading-message',
        `Generating report (${segmentEstimate}) — large documents may take several minutes...`
    );
    setButtons(true);

    try {
        const res  = await fetch('/generate-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files }),
        });
        const data = await res.json();
        loading.remove();

        // Error responses from the backend are short Markdown strings
        const isError = !data.report ||
            data.report.startsWith('No chunks found') ||
            data.report.startsWith('No files specified') ||
            data.report.startsWith('No matching');

        if (isError) {
            appendMessage(chat, 'ai-message report-message', data.report || 'No report returned.', true);
        } else {
            renderReportResponse(chat, data.report, files);
        }
    } catch {
        loading.className = 'ai-message';
        loading.innerText = 'Error: could not generate report.';
    } finally {
        setButtons(false);
    }
}

function openComparativeModal() {
    const modal = document.getElementById('comparativeModal');
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const files = Array.from(checkboxes).map(cb => cb.value);

    if (files.length < 2) {
        alert('Select at least 2 files to compare.');
        return;
    }

    const filesList = document.getElementById('comparativeFilesList');
    filesList.textContent = 'Comparing: ' + files.join(', ');

    const textarea = document.getElementById('comparativeQuery');
    textarea.value = '';
    textarea.focus();

    modal.style.display = 'flex';
}

function closeComparativeModal() {
    const modal = document.getElementById('comparativeModal');
    modal.style.display = 'none';
}

async function submitComparativeReport() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const files = Array.from(checkboxes).map(cb => cb.value);
    const query = document.getElementById('comparativeQuery').value.trim();

    if (!query) {
        alert('Please enter a comparison query.');
        return;
    }

    closeComparativeModal();

    const chat = document.getElementById('chat');
    appendMessage(chat, 'user-message', `Compare ${files.join(', ')}: ${query}`);

    const loading = appendMessage(
        chat, 'ai-message loading-message',
        `Generating comparative analysis across ${files.length} file(s)...`
    );
    setButtons(true);

    try {
        const res = await fetch('/generate-comparative-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files, query }),
        });
        const data = await res.json();
        loading.remove();

        const isError = !data.report ||
            data.report.startsWith('**Error**') ||
            data.report.startsWith('**No');

        if (isError) {
            appendMessage(chat, 'ai-message report-message', data.report || 'Comparison failed.', true);
        } else {
            renderReportResponse(chat, data.report, files);
        }
    } catch {
        loading.className = 'ai-message';
        loading.innerText = 'Error: could not generate comparative report.';
    } finally {
        setButtons(false);
    }
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modal = document.getElementById('comparativeModal');
    if (event.target === modal) {
        closeComparativeModal();
    }
});

// File Upload

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select at least one file.');
        return;
    }

    const btn = document.querySelector('#uploadBtn');
    btn.disabled = true;
    
    const totalFiles = fileInput.files.length;
    const progressDisplay = document.getElementById('uploadProgressDisplay') || createProgressDisplay();

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('files', file);
    }

    try {
        btn.innerText = 'Uploading...';
        progressDisplay.style.display = 'block';
        updateProgressDisplay(progressDisplay, 0, totalFiles, '0 / ' + totalFiles + ' files processed...');

        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json();

        // Display results for each file
        if (data.results && data.results.length > 0) {
            let summary = 'Upload complete!\n\n';
            let totalChunks = 0;
            
            data.results.forEach((result, index) => {
                summary += `${result.filename}: ${result.chunks} segments\n`;
                totalChunks += result.chunks;
            });
            
            summary += `\nTotal: ${totalChunks} segments across ${totalFiles} file(s)`;
            
            updateProgressDisplay(progressDisplay, totalFiles, totalFiles, summary);
            setTimeout(() => {
                progressDisplay.style.display = 'none';
                fileInput.value = '';
                loadFiles();
                alert(summary);
            }, 1500);
        } else {
            fileInput.value = '';
            loadFiles();
            alert('Upload completed successfully.');
        }
    } catch {
        alert('Upload failed.');
        progressDisplay.style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Upload PDF';
    }
}

// Create progress display element
function createProgressDisplay() {
    const display = document.createElement('div');
    display.id = 'uploadProgressDisplay';
    display.className = 'upload-progress-container';
    display.innerHTML = `
        <div class="progress-bar-wrapper">
            <div class="progress-bar-bg">
                <div class="progress-bar-fill"></div>
            </div>
            <div class="progress-text"></div>
        </div>
    `;
    const uploadSection = document.querySelector('.sidebar-section');
    uploadSection.appendChild(display);
    return display;
}

// Update progress display
function updateProgressDisplay(display, current, total, message) {
    const percentage = total > 0 ? (current / total) * 100 : 0;
    const progressBar = display.querySelector('.progress-bar-fill');
    const progressText = display.querySelector('.progress-text');
    
    progressBar.style.width = percentage + '%';
    progressText.textContent = message;
}

// File Delete
async function deleteFile() {
    const input    = document.getElementById('deleteFileName');
    const filename = input.value.trim();

    if (!filename) {
        alert('Click a filename in the list below to select it first.');
        return;
    }
    if (!confirm(`Delete "${filename}" permanently?`)) return;

    try {
        await fetch('/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename }),
        });
        input.value = '';
        loadFiles();
    } catch {
        alert('Delete failed.');
    }
}

// Rebuild Index
async function rebuildIndex() {
    const btn = document.getElementById('rebuildBtn');
    if (!confirm('Re-ingest all uploaded PDFs with the new chunk settings?\nThis may take a minute.')) return;

    btn.disabled  = true;
    btn.innerText = 'Rebuilding...';

    try {
        const res  = await fetch('/rebuild', { method: 'POST' });
        const data = await res.json();

        const summary = data.rebuilt
            .map(r => `  ${r.file}: ${r.chunks} chunks`)
            .join('\n');

        alert(`${data.message}\n\n${summary}`);
    } catch {
        alert('Rebuild failed — check the server console.');
    } finally {
        btn.disabled  = false;
        btn.innerText = 'Rebuild Index';
    }
}



async function loadFiles() {
    try {
        const res  = await fetch('/files');
        const data = await res.json();
        const list = document.getElementById('fileList');

        list.innerHTML = '';
        if (!data.files || data.files.length === 0) {
            list.innerHTML = "<div class='no-files'>No files uploaded</div>";
            updateComparativeButtonVisibility();
            return;
        }

        data.files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';

            // Checkbox for selecting files for report generation
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox';
            checkbox.value = file;
            checkbox.title = 'Select for report';
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                updateComparativeButtonVisibility();
            });

            // File info container
            const infoDiv = document.createElement('div');
            infoDiv.className = 'file-item-info';

            // Filename label
            const name = document.createElement('span');
            name.className = 'file-item-name';
            name.textContent = file;
            name.title = 'Click to select for deletion';
            name.addEventListener('click', () => {
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                document.getElementById('deleteFileName').value = file;
            });

            // Chunk count display
            const chunkCount = data.chunk_counts ? data.chunk_counts[file] || 0 : 0;
            const countSpan = document.createElement('span');
            countSpan.className = 'file-item-count';
            countSpan.textContent = chunkCount + ' segment' + (chunkCount !== 1 ? 's' : '');

            infoDiv.appendChild(name);
            infoDiv.appendChild(countSpan);

            div.appendChild(checkbox);
            div.appendChild(infoDiv);
            list.appendChild(div);
        });

        updateComparativeButtonVisibility();
    } catch {
        console.error('Could not load file list.');
    }
}

function updateComparativeButtonVisibility() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    const selectedCount = checkboxes.length;
    const comparativeBtn = document.getElementById('comparativeReportBtn');

    if (selectedCount >= 2) {
        comparativeBtn.style.display = 'inline-block';
    } else {
        comparativeBtn.style.display = 'none';
    }
}

//Select All Toggle
function toggleSelectAll(master) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = master.checked;
    });
}

function renderMarkdown(text) {
    text = text.replace(/\n{3,}/g, '\n\n');  //remove blank lines from LLM output

    const lines = text.split('\n');

    let html = [];
    let inList = false;
    let inTable = false;

    const closeList = () => {
        if(inList) {
            html.push('</ul>');
            inList = false;
        }
    };

    const closeTable = () => {
        if(inTable) {
            html.push('</tbody></table>');
            inTable = false;
        }
    };

    const inlineFormat = (str) => {
        return str
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    };

    for(let i =0; i<lines.length; i++){
        let line = lines[i].trim();

        // blank line 
        if(line === ''){
            closeList();
            closeTable();
            continue;
        }

        // plain section titles
        if(/^[A-Z][A-Za-z ]{3,40}$/.test(line)){
            closeList();
            closeTable();
            html.push(`<h2>${inlineFormat(line)}</h2>`);
            continue;
        }

        // markdown headings
        const hMatch = line.match(/^(#{1,4})\s+(.*)$/);
        if(hMatch){
            closeList();
            closeTable();
            const level = hMatch[1].length;
            html.push(`<h${level}>${inlineFormat(hMatch[2].trim())}</h${level}>`);
            continue;
        }

        // table detection 
        if(line.includes('|')){
            const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
            if(!inTable){
                closeList();
                html.push('<table><tbody>');
                inTable = true;
            }

            html.push('<tr>' + cells.map(c => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>');
            continue;
        }

        // detect repeated sentences -> bullet list 
        if(/^[A-Z].+\.$/.test(line) && lines[i+1] && /^[A-Z].+\.$/.test(lines[i+1].trim())){
            closeTable();

            if(!inList){
                html.push('<ul>');
                inList = true;
            }

            html.push(`<li>${inlineFormat(line)}</li>`);
            continue;
        }

        // regular paragraph 
        closeList();
        closeTable();
        html.push(`<p>${inlineFormat(line)}</p>`);
    }

    closeList();
    closeTable();
    return html.join('\n');
}

function renderReportResponse(container, markdownReport, files) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message report-message report-panel';

    const header = document.createElement('div');
    header.className = 'report-header';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'report-title-block';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'report-eyebrow';
    eyebrow.textContent = 'Operational Intelligence Brief';

    const title = document.createElement('h2');
    title.className = 'report-title';
    title.textContent = 'Generated Document Assessment';

    titleBlock.appendChild(eyebrow);
    titleBlock.appendChild(title);

    const stamp = document.createElement('div');
    stamp.className = 'report-stamp';
    stamp.textContent = new Date().toLocaleString();

    header.appendChild(titleBlock);
    header.appendChild(stamp);

    const meta = document.createElement('div');
    meta.className = 'report-meta';

    const fileCount = document.createElement('span');
    fileCount.className = 'report-pill';
    fileCount.textContent = files.length + (files.length === 1 ? ' source file' : ' source files');

    const selected = document.createElement('span');
    selected.className = 'report-files';
    selected.textContent = 'Scope: ' + files.join(', ');

    meta.appendChild(fileCount);
    meta.appendChild(selected);

    const body = document.createElement('div');
    body.className = 'report-body';
    body.innerHTML = renderMarkdown(markdownReport);

    wrapper.appendChild(header);
    wrapper.appendChild(meta);
    wrapper.appendChild(body);

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return wrapper;
}

function renderAskResponse(container, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message ask-response';

    // Warning banner
    if (data.warning) {
        const banner = document.createElement('div');
        banner.className = 'warning-banner';
        banner.textContent = '\u26a0\ufe0f ' + data.warning;
        wrapper.appendChild(banner);
    }

    // Answer body
    const body = document.createElement('div');
    body.className = 'answer-body';
    body.innerText  = data.answer || '(no answer returned)';
    wrapper.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'answer-footer';

    const sourcesEl = document.createElement('span');
    sourcesEl.className  = 'sources-footer';
    const srcList = (data.sources && data.sources.length > 0)
        ? data.sources.join(', ')
        : 'no sources';
    sourcesEl.textContent = 'Sources: ' + srcList;

    const badgeEl = document.createElement('span');
    const pct     = Math.round((data.confidence || 0) * 100);
    let   badgeCls = 'confidence-badge';
    if      (pct >= 70) badgeCls += ' confidence-high';
    else if (pct >= 40) badgeCls += ' confidence-medium';
    else                badgeCls += ' confidence-low';
    badgeEl.className   = badgeCls;
    badgeEl.textContent = pct + '% confidence';

    footer.appendChild(sourcesEl);
    footer.appendChild(badgeEl);
    wrapper.appendChild(footer);

    container.appendChild(wrapper);
    container.scrollTop = container.scrollHeight;
    return wrapper;
}

//Helpers
function appendMessage(container, className, text, asMarkdown = false) {
    const div     = document.createElement('div');
    div.className = className;
    if (asMarkdown) {
        div.innerHTML = renderMarkdown(text);
    } else {
        div.innerText = text;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function setButtons(disabled) {
    document.getElementById('sendBtn').disabled          = disabled;
    document.getElementById('generateReportBtn').disabled = disabled;
    document.getElementById('comparativeReportBtn').disabled = disabled;
}

//Init
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    document.getElementById('deleteBtn').addEventListener('click', deleteFile);
});
