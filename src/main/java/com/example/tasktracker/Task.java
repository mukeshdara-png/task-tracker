package com.example.tasktracker;

import java.time.Instant;
import java.util.UUID;

public record Task(UUID id, String title, boolean completed, Instant createdAt) {
}
