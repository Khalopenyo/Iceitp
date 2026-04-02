# Research Summary

**Analysis Date:** 2026-04-02
**Context:** Brownfield scientific conference platform, single-conference scope, evolving an existing Go/React codebase into a complete organizer/participant product.

## Stack Additions

- Keep the current `Go + Gin + GORM + Postgres` backend and `React + Vite` frontend.
- Add a mailer abstraction plus secure reset-token persistence for password recovery.
- Add a storage abstraction and attachment metadata model before implementing chat file uploads.
- Extend consent persistence with versioned, auditable acceptance records.
- Move conference/about/branding content toward structured backend-managed fields instead of hard-coded frontend text.

## Table Stakes To Cover In Requirements

- auditable consent capture
- online/offline participant branching
- predefined section selection and talk-topic capture
- admin editing of final program placement
- secure password reset
- conference schedule with room or external join-link behavior
- chat with attachments and moderation controls
- responsive, branded public and participant-facing pages
- personalized conference documents and post-event materials

## Strong Existing Differentiators

- QR check-in
- document generation
- venue map support
- antiplagiat-related submission flow
- unified admin console foundation

These should be preserved and integrated into the roadmap rather than treated as optional leftovers.

## What Not To Build In V1

- multi-tenant SaaS administration
- embedded video conferencing
- fully automatic, no-review schedule generation
- large social/gamification layers
- CMS-level content management

## Watch Out For

- consent without versioning or clear separation of processing vs publication permission
- online/offline mode implemented as a label rather than a different user journey
- password reset that leaks account existence or stores reusable raw tokens
- chat attachments without allowlists, auth checks, or safe storage keys
- generating the official program directly from participant-entered raw data
- piling more logic into `Admin.jsx`, `Dashboard.jsx`, `Chat.jsx`, and oversized backend handlers

## Suggested Build Order

1. Registration/access foundations: consent, attendance format, profile fields
2. Program-management foundations: admin editing, schedule data, online join-link support
3. Account recovery: secure password reset
4. Communication: chat attachments and moderation-safe file handling
5. Public presentation: branded pages and responsive cleanup
6. Final document consistency checks against the authoritative program data

## Source Notes

- Federal Law No. 152-FZ "On Personal Data": `https://www.kremlin.ru/acts/bank/24154`
- Roskomnadzor personal-data guidance: `https://42.rkn.gov.ru/p32026/p32474/`, `https://82.rkn.gov.ru/directions/pers/p15375/`, `https://42.rkn.gov.ru/p32466/p32470/`
- OWASP forgot-password and file-upload guidance: `https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html`, `https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html`
- Product-expectation references: `https://sessionize.com/`, `https://www.conftool.net/en/administrator-documentation/virtual-conferences.html`, `https://sched.com/hybrid-and-virtual-conferences/`, `https://conference-service.com/`

## Bottom Line

The product does not need a new stack. It needs the current platform completed around a few missing operational foundations: consent, hybrid attendance logic, editable structured program data, password recovery, safe file sharing in chat, and branded responsive experience.
