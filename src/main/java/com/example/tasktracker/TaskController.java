package com.example.tasktracker;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final ConcurrentMap<UUID, Task> tasks = new ConcurrentHashMap<>();

    @GetMapping
    public List<Task> list() {
        return tasks.values().stream()
                .sorted(Comparator.comparing(Task::createdAt).thenComparing(Task::id))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Task create(@Valid @RequestBody CreateTask request) {
        Task task = new Task(UUID.randomUUID(), request.title().trim(), false, Instant.now());
        tasks.put(task.id(), task);
        return task;
    }

    @PatchMapping("/{id}")
    public Task update(@PathVariable UUID id, @Valid @RequestBody UpdateTask request) {
        Task updated = tasks.computeIfPresent(id,
                (key, existing) -> new Task(existing.id(), existing.title(), request.completed(), existing.createdAt()));
        if (updated == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
        }
        return updated;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        if (tasks.remove(id) == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found");
        }
    }

    public record CreateTask(@NotBlank @Size(max = 160) String title) {
    }

    public record UpdateTask(@NotNull Boolean completed) {
    }
}
