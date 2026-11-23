const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#task-count");
const message = document.querySelector("#message");

async function request(path, options) {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options && options.headers),
        },
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail && detail.detail ? detail.detail : `Request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
}

function render(tasks) {
    taskList.replaceChildren();
    emptyState.hidden = tasks.length > 0;
    count.textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;

    for (const task of tasks) {
        const item = document.createElement("li");
        item.className = `task-item${task.completed ? " completed" : ""}`;

        const checkbox = document.createElement("button");
        checkbox.className = "task-check";
        checkbox.type = "button";
        checkbox.setAttribute("aria-label", `${task.completed ? "Mark incomplete" : "Mark complete"}: ${task.title}`);
        checkbox.setAttribute("aria-pressed", String(task.completed));
        checkbox.addEventListener("click", () => updateTask(task.id, !task.completed));

        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = task.title;

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-task";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.setAttribute("aria-label", `Delete: ${task.title}`);
        deleteButton.addEventListener("click", () => deleteTask(task.id));

        item.append(checkbox, title, deleteButton);
        taskList.append(item);
    }
}

async function refresh() {
    try {
        render(await request("/api/tasks"));
        message.textContent = "";
    } catch (error) {
        message.textContent = error.message;
    }
}

async function updateTask(id, completed) {
    try {
        await request(`/api/tasks/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ completed }),
        });
        await refresh();
    } catch (error) {
        message.textContent = error.message;
    }
}

async function deleteTask(id) {
    try {
        await request(`/api/tasks/${id}`, { method: "DELETE" });
        await refresh();
    } catch (error) {
        message.textContent = error.message;
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
        titleInput.focus();
        return;
    }

    try {
        await request("/api/tasks", {
            method: "POST",
            body: JSON.stringify({ title }),
        });
        titleInput.value = "";
        message.textContent = "";
        await refresh();
        titleInput.focus();
    } catch (error) {
        message.textContent = error.message;
    }
});

refresh();
