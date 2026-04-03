package com.example.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
public class SampleController {

    private final SampleService sampleService;

    public SampleController(SampleService sampleService) {
        this.sampleService = sampleService;
    }

    /**
     * Create a new reference.
     */
    @PostMapping("/reference")
    public ResponseEntity<?> createReference(
            @RequestParam String reference,
            @RequestParam String token,
            @RequestParam String objet,
            @RequestParam(required = false) Boolean isCanceled) {

        if (reference == null || reference.isEmpty()) {
            return ResponseEntity.badRequest().body("Reference is required");
        }

        return ResponseEntity.ok(sampleService.create(reference, token));
    }
}
