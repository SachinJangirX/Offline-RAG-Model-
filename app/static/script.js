async function sendQuestion() {

    const questionInput = document.getElementById("question");
    const question = questionInput.value;

    if(!question){
        alert("Please enter a question!!!");
        return;
    }

    const chat = document.getElementById("chat");

    const userDiv = document.createElement("div");
    userDiv.className = "user-message";
    userDiv.innerText = "You: " + question;
    chat.appendChild(userDiv);

    questionInput.value = "";

    const response = await fetch("/ask", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: question }),
    });

    const data = await response.json();

    const aiDiv = document.createElement("div");
    aiDiv.className = "ai-message";
    aiDiv.innerText = "AI: " + data.answer;
    chat.appendChild(aiDiv);

    chat.scrollTop = chat.scrollHeight;
}

async function uploadFile() {

    const fileInput = document.getElementById("fileInput");
    const files = fileInput.files;

    if (files.length === 0){
        alert("Please select atleast one file to upload!!!");
        return;
    }

    const formData = new FormData();

    for(let i=0; i<files.length; i++){
        formData.append("files", fileInput.files[i]);
    }

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData,
        });

        await response.json();

        alert("Files uploaded successfully!");

        fileInput.value = "";

        loadFiles();
    } catch (error) {
        console.error("Upload error:", error);
        alert("Error uploading files!");
    }
    
}

async function deleteFile() {

    const input = document.getElementById("deleteFileName");
    const filename = input.value.trim();

    if(!filename) {
        alert("Please enter a filename to delete!");
        return;
    }

    try {
        const response = await fetch("/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ filename: filename }),
        });

        const data = await response.json();

        alert(data.message);

        input.value = "";
        input.placeholder = "Enter exact file name ...";

        loadFiles();
    } catch (error) {
        console.error("Error deleting file:", error);
    }
}

async function loadFiles() {
    try {
        const response = await fetch("/files");

        if(!response.ok){
            console.error("Failed to fetch files");
            return;
        }

        const data = await response.json();

        const fileList = document.getElementById("fileList");

        if (!fileList) {
            console.error("File list div not found");
            return;
        }

        fileList.innerHTML = "";

        if(!data.files || data.files.length === 0){
            fileList.innerHTML = "<div class='no-files'>No files uploaded</div>";
            return;
        }

        data.files.forEach(file => {
            const div = document.createElement("div");
            div.className = "file-item";
            div.textContent = file;
            fileList.appendChild(div);
        });
    } catch (error) {
        console.error("Error loading files:", error);
    }
}

document.addEventListener("DOMContentLoaded", function () {

    loadFiles();

    const deleteBtn = document.getElementById("deleteBtn");

    if(deleteBtn){
        deleteBtn.addEventListener("click", deleteFile);
    }
});