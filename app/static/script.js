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

    try {
        const res  = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question }),
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

// Generate Report (Generate Report button)

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

// File Upload

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select at least one file.');
        return;
    }

    const btn = document.querySelector('#uploadBtn');
    btn.disabled = true;
    btn.innerText = 'Uploading...';

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('files', file);
    }

    try {
        await fetch('/upload', { method: 'POST', body: formData });
        fileInput.value = '';
        loadFiles();
    } catch {
        alert('Upload failed.');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Upload PDF';
    }
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

// Rebuild Index ────────────────────────────────────────────────────────────

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
            return;
        }

        data.files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';

            // Filename label — click to select for deletion
            const name = document.createElement('span');
            name.className = 'file-item-name';
            name.textContent = file;
            name.title = 'Click to select for deletion';
            name.addEventListener('click', () => {
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                document.getElementById('deleteFileName').value = file;
            });

            // Checkbox for selecting files for report generation
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-checkbox';
            checkbox.value = file;
            checkbox.title = 'Select for report';
            checkbox.addEventListener('click', (e) => e.stopPropagation());

            div.appendChild(checkbox);
            div.appendChild(name);
            list.appendChild(div);
        });
    } catch {
        console.error('Could not load file list.');
    }
}

//Select All Toggle

function toggleSelectAll(master) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = master.checked;
    });
}

//Markdown renderer (offline, no CDN)
// Handles: headings, tables, bold, italic, bullet lists, blockquotes, <hr>

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

//Structured ask-response renderer
// Builds: [warning banner?] + answer body + footer (sources + confidence badge)

function renderAskResponse(container, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-message ask-response';

    // Warning banner — shown when the pipeline sets a warning flag
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

    // Footer: sources on the left, confidence badge on the right
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
}

//Init

document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    document.getElementById('deleteBtn').addEventListener('click', deleteFile);
});
