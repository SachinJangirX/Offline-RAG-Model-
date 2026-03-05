// ─── Chat (Send button) ───────────────────────────────────────────────────────

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

// ─── Generate Report (Generate Report button) ─────────────────────────────────

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
            appendMessage(chat, 'ai-message report-message', data.report, true);
        }
    } catch {
        loading.className = 'ai-message';
        loading.innerText = 'Error: could not generate report.';
    } finally {
        setButtons(false);
    }
}

// ─── File Upload ──────────────────────────────────────────────────────────────

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

// ─── File Delete ──────────────────────────────────────────────────────────────

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

// ─── Rebuild Index ────────────────────────────────────────────────────────────

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

// ─── Select All Toggle ────────────────────────────────────────────────────────

function toggleSelectAll(master) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = master.checked;
    });
}

// ─── Markdown renderer (offline, no CDN) ─────────────────────────────────────
// Handles: headings, tables, bold, italic, bullet lists, blockquotes, <hr>

function renderMarkdown(text) {
    const lines   = text.split('\n');
    const html    = [];
    let inTable   = false;
    let inList    = false;

    const escapeHtml = s =>
        s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const inlineFormat = s =>
        escapeHtml(s)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`(.+?)`/g,       '<code>$1</code>');

    const closeList  = () => { if (inList)  { html.push('</ul>');   inList  = false; } };
    const closeTable = () => { if (inTable) { html.push('</tbody></table>'); inTable = false; } };

    let tableHeaderDone = false;

    for (let i = 0; i < lines.length; i++) {
        const raw  = lines[i];
        const line = raw.trimEnd();

        // Horizontal rule
        if (/^-{3,}$/.test(line.trim())) {
            closeList(); closeTable();
            html.push('<hr>');
            continue;
        }

        // Headings
        const hMatch = line.match(/^(#{1,4})\s+(.*)/);
        if (hMatch) {
            closeList(); closeTable();
            const level = hMatch[1].length;
            html.push(`<h${level}>${inlineFormat(hMatch[2])}</h${level}>`);
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            closeList(); closeTable();
            html.push(`<blockquote>${inlineFormat(line.slice(2))}</blockquote>`);
            continue;
        }

        // Table row  (line contains at least two | characters)
        if (line.includes('|') && (line.match(/\|/g) || []).length >= 2) {
            closeList();

            const cells = line.split('|').slice(1, -1).map(c => c.trim());

            // Separator row (e.g. |---|---|)
            if (cells.every(c => /^[-: ]+$/.test(c))) {
                html.push('<tbody>');
                tableHeaderDone = true;
                continue;
            }

            if (!inTable) {
                html.push('<div class="table-wrap"><table>');
                inTable = true;
                tableHeaderDone = false;
            }

            const tag = tableHeaderDone ? 'td' : 'th';
            html.push('<tr>' + cells.map(c => `<${tag}>${inlineFormat(c)}</${tag}>`).join('') + '</tr>');

            if (!tableHeaderDone) {
                html.push('<thead></thead>');   // close header implicitly on next separator row
            }
            continue;
        }

        // Close table if we've left it
        if (inTable && !line.includes('|')) {
            closeTable();
            tableHeaderDone = false;
        }

        // Bullet list
        const liMatch = line.match(/^[-*]\s+(.*)/);
        if (liMatch) {
            closeTable();
            if (!inList) { html.push('<ul>'); inList = true; }
            html.push(`<li>${inlineFormat(liMatch[1])}</li>`);
            continue;
        }

        // Close list
        if (inList && line.trim() === '') {
            closeList();
        }

        // Blank line → paragraph break
        if (line.trim() === '') {
            closeList(); closeTable();
            html.push('<br>');
            continue;
        }

        // Normal paragraph line
        closeTable();
        html.push(`<p>${inlineFormat(line)}</p>`);
    }

    closeList();
    closeTable();
    return html.join('\n');
}

// ─── Structured ask-response renderer ─────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
    document.getElementById('deleteBtn').addEventListener('click', deleteFile);
});
