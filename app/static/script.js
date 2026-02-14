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

    await fetch("/upload", {
        method: "POST",
        body: formData,
    });

    alert(files.length + " Document(s) Indexed successfully!");
}

async function deleteFile() {

    const filename = document.getElementById("deleteFileName").value;

    if(!filename){
        alert("Please enter the filename to delete!!!");
        return;
    }

    const response = await fetch("/delete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ filename: filename })
    });

    const data = await response.json();

    alert(data.message);
}

document.addEventListener("DOMContentLoaded", function () {

    const deleteBtn = document.getElementById("deleteBtn");

    if(deleteBtn){
        deleteBtn.addEventListener("click", deleteFile);
    }

});