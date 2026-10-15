
const authSection = document.querySelector("#authSection");
const appSection = document.querySelector("#appSection");

const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authMessage = document.querySelector("#authMessage");

const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");

const userEmail = document.querySelector("#userEmail");
const logoutButton = document.querySelector("#logoutButton");

const noteForm = document.querySelector("#noteForm");
const noteTitle = document.querySelector("#noteTitle");
const noteContent = document.querySelector("#noteContent");
const editorHeading = document.querySelector("#editorHeading");
const cancelEdit = document.querySelector("#cancelEdit");

// null means we are creating a new note.
// A note ID means we are editing an existing note.
let editingNoteId = null;
const saveButton = document.querySelector("#saveButton");
const noteMessage = document.querySelector("#noteMessage");
const notesList = document.querySelector("#notesList");

// Show the login form
function showLoginForm() {
    loginForm.hidden = false;
    registerForm.hidden = true;
    authMessage.textContent = "";
}

// Show the registration form
function showRegisterForm() {
    loginForm.hidden = true;
    registerForm.hidden = false;
    authMessage.textContent = "";
}

showLogin.addEventListener("click", showLoginForm);
showRegister.addEventListener("click", showRegisterForm);

// Send requests to our backend
async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...options.headers
        },
        credentials: "same-origin"
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
    }

    return data;
}

// Display the logged-in user's dashboard
function showDashboard(user) {
    authSection.hidden = true;
    appSection.hidden = false;
    userEmail.textContent = user.email;
}

// Display the authentication page
function showAuthentication() {
    appSection.hidden = true;
    authSection.hidden = false;
    notesList.replaceChildren();
    showLoginForm();
}

// Register
registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#registerEmail").value;
    const password = document.querySelector("#registerPassword").value;

    try {
        const data = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        registerForm.reset();
        showDashboard(data.user);
        await loadNotes();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

// Login
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#loginEmail").value;
    const password = document.querySelector("#loginPassword").value;

    try {
        const data = await apiRequest("/api/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });

        loginForm.reset();
        showDashboard(data.user);
        await loadNotes();
    } catch (error) {
        authMessage.textContent = error.message;
    }
});

// Logout
logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
        await apiRequest("/api/logout", {
            method: "POST"
        });

        showAuthentication();
    } catch (error) {
        alert(error.message);
    } finally {
        logoutButton.disabled = false;
    }
});

// Load notes belonging to the logged-in user
async function loadNotes() {
    try {
        const notes = await apiRequest("/api/notes");

        notesList.replaceChildren();

        if (notes.length === 0) {
            const message = document.createElement("p");
            message.textContent = "You haven't created any notes yet.";
            notesList.append(message);
            return;
        }

        notes.forEach(displayNote);
    } catch (error) {
        noteMessage.textContent = error.message;
    }
}

// Display a note with Edit and Delete buttons
function displayNote(note) {
    const article = document.createElement("article");
    article.classList.add("note");

    const heading = document.createElement("h3");
    heading.textContent = note.title;

    const paragraph = document.createElement("p");
    paragraph.textContent = note.content;

    const actions = document.createElement("div");
    actions.classList.add("note-actions");

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";

    editButton.addEventListener("click", () => {
        editingNoteId = note.id;

        noteTitle.value = note.title;
        noteContent.value = note.content;

        editorHeading.textContent = "Edit note";
        saveButton.textContent = "Update Note";
        cancelEdit.hidden = false;

        noteMessage.textContent = "";

        noteTitle.focus();
        noteForm.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.classList.add("delete-button");

    deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
            `Delete "${note.title}"? This cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        deleteButton.disabled = true;

        try {
            await apiRequest(`/api/notes/${note.id}`, {
                method: "DELETE"
            });

            // If this note was being edited, reset the editor.
            if (editingNoteId === note.id) {
                resetNoteEditor();
            }

            noteMessage.textContent = "Note deleted successfully.";
            await loadNotes();
        } catch (error) {
            noteMessage.textContent = error.message;
            deleteButton.disabled = false;
        }
    });

    actions.append(editButton, deleteButton);
    article.append(heading, paragraph, actions);
    notesList.append(article);
}

// Return the editor to new-note mode
function resetNoteEditor() {
    editingNoteId = null;

    noteForm.reset();

    editorHeading.textContent = "Create a note";
    saveButton.textContent = "Save Note";
    cancelEdit.hidden = true;
}

cancelEdit.addEventListener("click", () => {
    resetNoteEditor();
    noteMessage.textContent = "";
});

// Create a new note or update an existing note
noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = noteTitle.value.trim();
    const content = noteContent.value.trim();

    if (!title || !content) {
        noteMessage.textContent =
            "Enter a title and some content.";
        return;
    }

    saveButton.disabled = true;
    noteMessage.textContent = "";

    // Decide which API endpoint and HTTP method to use.
    const isEditing = editingNoteId !== null;

    const url = isEditing
        ? `/api/notes/${editingNoteId}`
        : "/api/notes";

    const method = isEditing ? "PUT" : "POST";

    try {
        await apiRequest(url, {
            method,
            body: JSON.stringify({ title, content })
        });

        resetNoteEditor();

        noteMessage.textContent = isEditing
            ? "Note updated successfully."
            : "Note saved successfully.";

        await loadNotes();
    } catch (error) {
        noteMessage.textContent = error.message;
    } finally {
        saveButton.disabled = false;
    }
});

// Restore the session when the page opens or refreshes
async function initializeApp() {
    try {
        const data = await apiRequest("/api/me");
        showDashboard(data.user);
        await loadNotes();
    } catch {
        showAuthentication();
    }
}

initializeApp();
